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
import { getRequestAuth } from "@/lib/auth";
import { getRequestAccessState } from "@/lib/debug-access";
import { generateTextStream } from "@/lib/llm";
import { getModelForPass } from "@/lib/model-routing";
import { createSSEStream } from "@/lib/generation-stream";

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

        const { systemPrompt, userPrompt } = buildFollowUpRequest({
          originalQuestion: conversationData.initialGuidance.question_text,
          initialGuidance: conversationData.initialGuidance.guidance_json,
          priorTurns: conversationData.turns,
          newMessage: message,
        });

        let fullResponse = "";

        await generateTextStream({
          provider: model.provider,
          model: model.model,
          systemPrompt,
          userPrompt,
          maxOutputTokens: 800,
          onChunk: (text) => {
            fullResponse += text;
            send({ type: "chunk", text });
          },
        });

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
