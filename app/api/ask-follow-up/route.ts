import { NextResponse } from "next/server";

import {
  buildDecisionSafetyResponse,
  classifyDecisionSafety,
} from "@/domain/decision/decision.safety";
import {
  buildFollowUpRequest,
  generateFollowUpSuggestions,
} from "@/domain/decision/decision.followup.agent";
import {
  getConversationDataForUser,
  insertAskTurn,
} from "@/domain/decision/decision.service";
import { buildCareModePayload } from "@/domain/safety/care-mode";
import {
  type CrisisDetectionResult,
  detectCrisisInput,
  detectCrisisOutput,
} from "@/domain/safety/crisis-detection";
import {
  logCareModeShown,
  logCrisisDetected,
} from "@/domain/safety/crisis-log";
import { markCrisisTriggered } from "@/domain/safety/crisis-window";
import {
  buildOutputSafetyBlockPayload,
  classifyOutputSafety,
  type SafetyClassifyContext,
} from "@/domain/safety/output-safety";
import {
  logOutputSafetyBlocked,
  logOutputSafetyFlagged,
} from "@/domain/safety/output-safety-log";
import { runExtractionPipeline } from "@/domain/memory/facts.store";
import { retrieveRelevantFacts } from "@/domain/memory/facts.retrieve";
import { formatFactsForPrompt } from "@/domain/memory/facts.inject";
import { getRequestAuth } from "@/lib/auth";
import { getRequestAccessState } from "@/lib/debug-access";
import { generateTextStream } from "@/lib/llm";
import { logLlmCost } from "@/lib/cost-events.server";
import { getModelForPass } from "@/lib/model-routing";
import { createSSEStream } from "@/lib/generation-stream";
import { getRequestPlatform } from "@/lib/product-events";

const MAX_FOLLOW_UP_TURNS = 10;
const FREE_FOLLOW_UP_LIMIT = 1;

export async function POST(request: Request) {
  try {
    const { user, accessToken } = await getRequestAuth(request);

    if (user === null) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const body = (await request.json()) as {
      conversationId?: unknown;
      message?: unknown;
    };
    const conversationId =
      typeof body.conversationId === "string" ? body.conversationId.trim() : "";
    const message =
      typeof body.message === "string" ? body.message.trim() : "";

    if (conversationId === "" || message === "") {
      return NextResponse.json(
        { error: "conversationId and message are required." },
        { status: 400 },
      );
    }

    const platform = getRequestPlatform(request);

    // Crisis detection — INPUT layer. Runs BEFORE the existing decision-safety
    // classifier because Care Mode is a distinct, narrower response than the
    // harm_to_others / illegal_wrongdoing flows.
    const inputCrisis = detectCrisisInput(message);

    if (inputCrisis.triggered) {
      // Fire-and-forget logging + 24hr window mark. Don't await — we want
      // the Care Mode response to be as fast as possible.
      void logCrisisDetected({
        userId: user.id,
        feature: "ask",
        platform,
        detection: inputCrisis,
        requestId: conversationId,
      });
      void logCareModeShown({
        userId: user.id,
        feature: "ask",
        platform,
        requestId: conversationId,
      });
      void markCrisisTriggered(user.id);

      return NextResponse.json({
        care_mode: buildCareModePayload(inputCrisis.severity),
      });
    }

    const safetyCategory = classifyDecisionSafety(message);

    if (safetyCategory !== "normal") {
      return NextResponse.json({
        safety: buildDecisionSafetyResponse(safetyCategory),
      });
    }

    const conversationData = await getConversationDataForUser(
      user.id,
      conversationId,
      accessToken,
    );

    if (conversationData === null) {
      return NextResponse.json(
        { error: "Conversation not found." },
        { status: 404 },
      );
    }

    if (conversationData.turns.length >= MAX_FOLLOW_UP_TURNS) {
      return NextResponse.json(
        {
          error:
            "This conversation has reached its limit. Start a new question to continue.",
          at_limit: true,
        },
        { status: 400 },
      );
    }

    const accessState = getRequestAccessState(user, request);
    const canFollowUpUnlimited = accessState.featureAccess.canAskUnlimited;

    if (
      canFollowUpUnlimited === false &&
      conversationData.turns.length >= FREE_FOLLOW_UP_LIMIT
    ) {
      return NextResponse.json(
        {
          error:
            "Upgrade to Pro to continue this conversation with unlimited follow-ups.",
          upgrade_required: true,
        },
        { status: 403 },
      );
    }

    const nextTurnNumber = conversationData.turns.length + 1;
    const model = getModelForPass("synthesize");
    const { send, close, response: sseResponse } = createSSEStream();

    void (async () => {
      try {
        send({ type: "stage", label: "Crafting your response" });

        // Retrieve relevant facts in parallel — zero latency impact vs. a
        // serial call because memory retrieval overlaps with the stage message.
        const relevantFacts = await retrieveRelevantFacts(user.id, message);
        const rememberedFacts = formatFactsForPrompt(relevantFacts);

        const { systemPrompt, userPrompt } = buildFollowUpRequest({
          originalQuestion: conversationData.initialGuidance.question_text,
          initialGuidance: conversationData.initialGuidance.guidance_json,
          priorTurns: conversationData.turns,
          newMessage: message,
          rememberedFacts: rememberedFacts !== "" ? rememberedFacts : null,
        });

        let fullResponse = "";
        let outputCrisis: CrisisDetectionResult | null = null;

        const streamResult = await generateTextStream({
          provider: model.provider,
          model: model.model,
          systemPrompt,
          userPrompt,
          maxOutputTokens: 800,
          onChunk: (text) => {
            // Once crisis is detected in the accumulated response, stop
            // forwarding further chunks to the client. We let the server
            // keep consuming the stream (we've already committed the
            // API call) but nothing more flows to the UI.
            if (outputCrisis !== null) return;

            fullResponse += text;
            const detection = detectCrisisOutput(fullResponse);

            if (detection.triggered) {
              outputCrisis = detection;
              return;
            }

            send({ type: "chunk", text });
          },
        });

        // Log stream cost immediately after completion.
        logLlmCost({
          meta: streamResult,
          feature: "ask_follow_up",
          passLabel: "stream",
          model: model.model,
          userId: user.id,
          tier: accessState.featureAccess.canAskUnlimited ? "pro" : "free",
          requestId: conversationId,
        });

        // Cast through the explicit type because TS flow analysis still
        // narrows outputCrisis to null — the assignment happens inside the
        // stream callback which TS cannot observe.
        const crisisResult = outputCrisis as CrisisDetectionResult | null;

        if (crisisResult !== null) {
          void logCrisisDetected({
            userId: user.id,
            feature: "ask",
            platform,
            detection: crisisResult,
            requestId: conversationId,
          });
          void logCareModeShown({
            userId: user.id,
            feature: "ask",
            platform,
            requestId: conversationId,
          });
          void markCrisisTriggered(user.id);

          send({
            type: "done",
            payload: {
              care_mode: buildCareModePayload(crisisResult.severity),
            },
          });
          return;
        }

        // Output safety classifier — 1.8. Runs on the fully-streamed text.
        // On flag: send safety_block as the final `done` payload; the
        // client form discards the previously-streamed partial text. Turn
        // is NOT saved.
        const safetyCtx: SafetyClassifyContext = {
          userId: user.id,
          tier: accessState.featureAccess.canAskUnlimited ? "pro" : "free",
          feature: "ask_follow_up",
          requestId: conversationId,
        };
        const outputSafety = await classifyOutputSafety(fullResponse, safetyCtx);

        if (outputSafety.verdict === "unsafe" && outputSafety.category !== null) {
          void logOutputSafetyFlagged({
            userId: user.id,
            feature: "ask",
            platform,
            requestId: conversationId,
            result: outputSafety,
            modelUsed: model.model,
          });
          void logOutputSafetyBlocked({
            userId: user.id,
            feature: "ask",
            platform,
            requestId: conversationId,
            result: outputSafety,
            modelUsed: model.model,
          });

          send({
            type: "done",
            payload: {
              safety_block: buildOutputSafetyBlockPayload(outputSafety.category),
            },
          });
          return;
        }

        const suggestedFollowups = await generateFollowUpSuggestions({
          originalQuestion: conversationData.initialGuidance.question_text,
          priorTurns: conversationData.turns,
          latestExchange: {
            userMessage: message,
            assistantResponse: fullResponse,
          },
        });

        const saveResult = await insertAskTurn({
          userId: user.id,
          conversationId,
          turnNumber: nextTurnNumber,
          userMessage: message,
          assistantResponse: fullResponse,
          suggestedFollowups,
          modelUsed: model.model,
          accessToken,
        });

        if (saveResult.success === false) {
          throw new Error(saveResult.message);
        }

        // Fire-and-forget extraction for this follow-up turn.
        void runExtractionPipeline({
          userId: user.id,
          conversationId: conversationId,
          userMessage: message,
          assistantResponse: fullResponse,
        });

        send({
          type: "done",
          payload: {
            turnId: saveResult.turn.id,
            suggestedFollowups,
          },
        });
      } catch (error) {
        const msg =
          error instanceof Error ? error.message : "Unable to generate follow-up.";
        send({ type: "error", message: msg });
      } finally {
        close();
      }
    })();

    return sseResponse;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to generate follow-up.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
