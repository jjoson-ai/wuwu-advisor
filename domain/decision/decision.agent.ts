import { toJSONSchema } from "zod";

import type { AstrologyContext } from "@/domain/astrology/context";
import type { DailyBriefingInput } from "@/domain/astrology/schemas";
import type {
  ChineseAstrologyContext,
  ChineseAstrologySignal,
} from "@/domain/chinese_astrology/context";
import type { DecisionType } from "@/domain/decision/decision.classifier";
import type { DecisionFeasibility } from "@/domain/decision/decision.feasibility";
import type { DecisionHorizon } from "@/domain/decision/decision.horizon";
import type { DecisionIntent } from "@/domain/decision/decision.intent";
import {
  DecisionGuidanceSchema,
  normalizeDecisionGuidanceOutput,
  type DecisionGuidance,
} from "@/domain/decision/decision.types";
import type { NumerologyContext } from "@/domain/numerology/context";
import { assertNoForbiddenInternalTermsInUserOutput } from "@/lib/output-safety";

type DecisionAgentInput = {
  question: string;
  decisionType: DecisionType;
  decisionHorizon: DecisionHorizon;
  decisionIntent: DecisionIntent;
  decisionFeasibility: DecisionFeasibility;
  contextEmphasis: {
    primary: string[];
    secondary: string[];
    guidance: string;
  };
  briefingInput: DailyBriefingInput;
  astrologyContext: AstrologyContext;
  numerologyContext: NumerologyContext;
  chineseAstrologyContext: ChineseAstrologyContext;
  chineseAstrologySignal: ChineseAstrologySignal;
  latestBriefing: unknown | null;
  latestForecast: unknown | null;
  latestBlueprint: unknown | null;
};

function getDecisionTypeInstructions(decisionType: DecisionType) {
  switch (decisionType) {
    case "business_product":
      return "This is a business or product question. Emphasize testing before launching, keeping moves reversible, gathering evidence, controlling scope, and avoiding full rollout before validation. Prefer go_small over wait when a small paid experiment, narrow rollout, pricing test, or reversible validation step is wiser than a full launch. Name what to test first, what evidence to gather before scaling, what success metric or milestone should unlock the next step, what should remain flexible, and what should not change simultaneously. Use operator language such as one variable at a time, keep the rest of the funnel or onboarding unchanged during the first test, limited test period, clear unlock criteria, and explicit rollback conditions.";
    case "career":
      return "This is a career question. Emphasize whether the next best move is to prepare, ask, position, negotiate, increase visibility, or wait. Make it clear whether timing, leverage, conversation setup, or proof of value matters most.";
    case "money_investing":
      return "This is a money or investing question. Emphasize size, exposure, downside, commit versus hold versus delay, and what level of clarity is still missing. Be concrete about tranche logic, first entry posture, cap or exposure posture, partial entry, staged commitment, review-first posture, what would justify adding more, what would invalidate the position, and what level of clarity is required before full commitment. Reduce vague caution language and prefer explicit sizing logic.";
    case "relationships":
      return "This is a relationship question. Emphasize timing of discussion, emotional posture, clarity versus space, and partner, family, or friend dynamics. Be concrete about best setup for the conversation, what to say first, what not to push for immediately, and whether the goal right now is clarity, reassurance, timing, or space.";
    case "health_wellbeing":
      return "This is a health or wellbeing question. Emphasize body load, recovery, stress, sustainable pacing, and safe disclaimer-aware practical behavior. Do not give medical advice or diagnosis.";
    case "personal_life":
      return "This is a personal life question. Emphasize timing, boundaries, commitments, tradeoffs, and emotional clarity.";
    default:
      return "The decision type is unclear. Give useful but general guidance and avoid false specificity.";
  }
}

function getDecisionIntentInstructions(decisionIntent: DecisionIntent) {
  switch (decisionIntent) {
    case "timing_decision":
      return "This is primarily a timing question. Explicitly answer when: now, later this week, later this month, this quarter, or not yet. If you cannot responsibly name a precise window, say what condition, milestone, proof point, or emotional setup should happen first.";
    case "sizing_decision":
      return "This is primarily a sizing question. Explicitly answer size posture: full, partial, staged, capped, or avoid full commitment. Make it clear what level of exposure is too much right now and why.";
    case "conversation_decision":
      return "This is primarily a conversation question. Explicitly answer best setup, best opening posture, whether to lead with reassurance, clarity, or space, and what not to force in the first exchange.";
    case "strategy_decision":
      return "This is primarily a strategy question. Emphasize sequencing, testing, evidence, approach, and conditions for commitment. Do not let short-term daily mood dominate the answer.";
    case "whether_decision":
      return "This is primarily a whether-question. Resolve the stance clearly as go, wait, go_small, avoid, or unclear, and make sure the answer feels decisively responsive to the core yes/no form.";
    case "mixed":
      return "The question has multiple strong intents. Answer the main decision directly, then make sure the response still covers the strongest timing, sizing, or conversation need without becoming long.";
    default:
      return "The question intent is unclear. Give the clearest useful answer you can, but avoid false precision.";
  }
}

function getDecisionFeasibilityInstructions(
  decisionFeasibility: DecisionFeasibility,
) {
  if (decisionFeasibility === "feasibility_sensitive") {
    return "This question has meaningful external feasibility or prerequisite constraints. Do not treat it as only a timing or posture question. First acknowledge that baseline feasibility, eligibility, approval, qualification, or logistics may need to be confirmed before timing advice matters. Do not invent legal, political, immigration, or regulatory facts. Speak in general prerequisite terms such as verify baseline eligibility, confirm required conditions, gather the missing feasibility facts, or test viability before committing.";
  }

  return "This question does not appear primarily constrained by external eligibility or prerequisite checks. Answer it normally.";
}

function buildDecisionSystemPrompt(
  input: DailyBriefingInput,
  decisionType: DecisionType,
  decisionHorizon: DecisionHorizon,
  decisionIntent: DecisionIntent,
  decisionFeasibility: DecisionFeasibility,
) {
  return [
    "Return exactly one JSON object and nothing else.",
    "Do not write markdown, commentary, or extra keys.",
    "You are giving one structured piece of decision guidance for one user question.",
    "This is not chat and not a multi-turn conversation.",
    "Answer the actual question directly.",
    "Be grounded, practical, human, and concise.",
    "Avoid vague horoscope filler, doom language, and overclaiming certainty.",
    "Never mention internal scores, routing metadata, debug fields, hidden system variables, or internal classifier names.",
    "Reject generic phrasing such as 'today is a good day' or 'you may feel'.",
    "Instead describe the specific tradeoff, action, or timing posture at stake.",
    "Use the user's stable profile plus current context when relevant.",
    "Prefer actionable posture: go, wait, go_small, avoid, or unclear.",
    "You must take a stance.",
    "Do not present multiple equal options.",
    "Do not hedge excessively.",
    "The answer should sound like the domain of the actual question, not only like the day's general pacing theme.",
    "Adjust how much weight you give to daily versus medium-horizon versus stable profile context based on the decision horizon.",
    "For medium_term and strategic questions, treat latest Forecast, Birth Blueprint, and stable profile context as the main frame. Daily Briefing and current-day astrology should be tertiary background only, not the main reason for the answer, unless the question is explicitly about a near-immediate step.",
    "When helpful, name the smallest reversible step, what to test first, what to delay, what evidence to gather, or what kind of commitment size fits the signal.",
    "The recommendation.headline should feel like the practical first move, not just a mood summary.",
    "Use go_small more often when a reversible experiment, staged move, capped risk, or first conversation is better than either full commitment or full delay.",
    "Use wait when timing or clarity is truly weak, not as a default substitute for a smaller practical move.",
    "Use go when enough support exists for a clear forward move. Use avoid only when negative signals are meaningfully stronger. Use unclear when the question is underspecified or the context does not support a sharper answer.",
    "Use supporting_signals and watch_out_for to show reasoning without writing a giant essay.",
    "supporting_signals should feel synthesized and user-facing, not like a source dump. Group related cues together, prefer interpreted signals over raw modality labels, and write them as conditions that favor or limit action rather than as modality-by-modality traces. Favor grouped reasoning like longer-cycle signals favor steady building over aggressive expansion, profile supports innovation but the current phase rewards validation before scale, or this is better approached as a staged commitment than a full commitment.",
    "Do not write items like 'Moon in Taurus says...' or 'Chinese astrology says...' unless absolutely necessary. Instead write the interpreted meaning, such as steadier pacing, stronger need for evidence, higher emotional sensitivity, or better conditions for a soft opening.",
    "what_to_watch_out_for should name concrete overreaches, pressure points, or mistakes in execution, not generic caution.",
    "If the signals conflict or are weak, say unclear or wait rather than forcing certainty.",
    "If the question is feasibility-sensitive, separate external constraints from internal readiness. First verify feasibility or prerequisites, then give posture, sequencing, or the smallest sensible next step.",
    "For strategic questions, daily mood should stay in the background unless it meaningfully affects the immediate execution step. Do not let today's Moon, daily pacing, or brief caution become the main reason for a strategic answer.",
    "For medium_term questions, current-day signals can refine the immediate first step but should not drive the overall recommendation.",
    "For medium_term or strategic business_product questions, favor operator logic over mood language: test one variable at a time, hold the rest of the funnel constant, define the success metric before rollout, set a limited test period, and name the metric that unlocks the next expansion step.",
    "For medium_term money_investing questions, favor sizing logic over mood language: staged entry, capped first exposure, what would justify adding more, and what would invalidate adding more.",
    "For immediate relationship questions, daily emotional timing can matter strongly and should shape how to open the conversation.",
    "Satisfy the form of the question, not just the topic. If the user is asking when, answer when. If the user is asking how big, answer size. If the user is asking how to bring something up, answer opening posture and setup.",
    "Do not hide the direct answer inside supporting context. recommendation.headline and timing_posture must make the answer easy to find.",
    "Confidence must be calibrated conservatively. High should be rare.",
    "Use high only when the question is specific, the context layers align, and the recommended move is clear and reasonably reversible.",
    "Use medium for most cases involving interpretation, timing, medium-horizon judgment, or partial uncertainty.",
    "Use low when the question is vague, the context layers conflict, or the decision is highly irreversible without enough evidence.",
    "If the answer depends mostly on short-term context for a larger strategic decision, confidence should usually stay medium or low.",
    `Decision type: ${decisionType}.`,
    `Decision horizon: ${decisionHorizon}.`,
    `Decision intent: ${decisionIntent}.`,
    `Decision feasibility: ${decisionFeasibility}.`,
    getDecisionTypeInstructions(decisionType),
    getDecisionIntentInstructions(decisionIntent),
    getDecisionFeasibilityInstructions(decisionFeasibility),
    `Tone preference: ${input.tone_preference}.`,
    "Every value must be valid JSON and strings except the fixed object structure and stance/confidence enums.",
  ].join("\n\n");
}

function buildDecisionUserPrompt(input: DecisionAgentInput) {
  return JSON.stringify(
    {
      question: input.question,
      decision_type: input.decisionType,
      decision_horizon: input.decisionHorizon,
      decision_intent: input.decisionIntent,
      decision_feasibility: input.decisionFeasibility,
      context_emphasis: input.contextEmphasis,
      display_name: input.briefingInput.display_name,
      astrology_context: input.astrologyContext,
      numerology_context: input.numerologyContext,
      chinese_astrology: {
        context: input.chineseAstrologyContext,
        signal: input.chineseAstrologySignal,
      },
      latest_briefing: input.latestBriefing,
      latest_forecast: input.latestForecast,
      latest_blueprint: input.latestBlueprint,
    },
    null,
    2,
  );
}

export function buildDecisionAgentRequest(input: DecisionAgentInput) {
  return {
    systemPrompt: buildDecisionSystemPrompt(
      input.briefingInput,
      input.decisionType,
      input.decisionHorizon,
      input.decisionIntent,
      input.decisionFeasibility,
    ),
    userPrompt: buildDecisionUserPrompt(input),
    outputSchema: DecisionGuidanceSchema,
    schemaName: "DecisionGuidance",
    structuredOutput: {
      name: "decision_guidance_output",
      schema: toJSONSchema(DecisionGuidanceSchema),
      strict: true,
    },
  };
}

export function validateDecisionGuidanceOutput(parsedJson: unknown): DecisionGuidance {
  const output = DecisionGuidanceSchema.parse(
    normalizeDecisionGuidanceOutput(parsedJson),
  );
  assertNoForbiddenInternalTermsInUserOutput(output, "Ask output");
  return output;
}
