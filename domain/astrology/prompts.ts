import type { AstrologyContext } from "@/domain/astrology/context";
import type {
  DailyBriefingInput,
  TimingOutput,
  WesternOutput,
} from "@/domain/astrology/schemas";
import type { ModalitySignal } from "@/domain/modality/modality.types";
import type { NumerologyContext } from "@/domain/numerology/context";
import type { FreeAstroDailyContext } from "@/lib/freeastroapi";

function getBirthTimeSpecificityRule(input: DailyBriefingInput) {
  if (input.birth_time === null || input.birth_time_confidence !== "exact") {
    return "Birth time is missing or not exact. Reduce certainty, avoid precise timing claims, avoid narrow transit-style statements, and prefer broad day-level guidance.";
  }

  return "Birth time is exact. You may use moderate specificity, but still stay practical and avoid overclaiming.";
}

function buildSharedSystemRules(input: DailyBriefingInput) {
  return [
    "You are writing a practical astrology briefing for a local MVP.",
    "Use a grounded, action-oriented tone.",
    "Do not use mystical filler, fate language, or theatrical phrasing.",
    "Do not use doom-heavy language.",
    "Do not give medical, legal, or financial guarantees.",
    "Keep guidance concise, specific, and easy to act on in real life.",
    "Prefer tradeoffs and contrasts over vague encouragement.",
    "Never mention internal scores, routing metadata, debug fields, hidden system variables, or internal classifier names.",
    "Reject generic phrasing such as 'today is a good day' or 'you may feel'.",
    "Instead, describe a specific tension, timing posture, or actionable tradeoff.",
    "Avoid generic coaching phrases like 'be disciplined', 'be careful', 'stay balanced', or 'don't rush' unless they are truly necessary and appear only once.",
    "Avoid corporate language such as prioritize, optimize, leverage, engage, align, or execute.",
    "Prefer natural phrasing such as focus on, stick to, better for, not for, keep things light, give people space, avoid forcing.",
    `Tone preference: ${input.tone_preference}.`,
    `Current date context: ${input.date} (${input.weekday}) in ${input.timezone}.`,
    getBirthTimeSpecificityRule(input),
    "Use deterministic astrology_context fields first: natal Sun sign, Sun longitude, Moon sign, Mercury sign, Venus sign, Mars sign, current Sun sign, current Moon sign, and cusp metadata.",
    "Treat real daily astro signals from astrology_context.daily_context as more important than weekday framing.",
    "If natal_context.near_sign_boundary is true, treat adjacent_sign as nearby boundary context only. Do not describe the user as equally both signs.",
    "Return valid JSON only. Do not include markdown, code fences, or commentary outside the JSON object.",
  ].join("\n");
}

function buildPromptPayload(
  input: DailyBriefingInput,
  astrologyContext: AstrologyContext,
) {
  return JSON.stringify(
    {
      briefing_input: input,
      astrology_context: astrologyContext,
    },
    null,
    2,
  );
}

function buildReadableFreeAstroContext(
  freeAstroDailyContext: FreeAstroDailyContext,
) {
  return {
    notes: freeAstroDailyContext.notes,
    chinese_current_pillars: freeAstroDailyContext.chinese_current_pillars,
    vedic_timing_clarity:
      freeAstroDailyContext.vedic_panchang === null
        ? null
        : {
            tithi: `${freeAstroDailyContext.vedic_panchang.tithi} (lunar day)`,
            nakshatra: `${freeAstroDailyContext.vedic_panchang.nakshatra} (lunar mansion / star field)`,
            yoga: `${freeAstroDailyContext.vedic_panchang.yoga} (a Vedic quality of the day)`,
            rahu_kalam:
              freeAstroDailyContext.vedic_panchang.rahu_kalam === null
                ? null
                : `Rahu Kalam (traditionally avoided for major starts): ${freeAstroDailyContext.vedic_panchang.rahu_kalam.start} to ${freeAstroDailyContext.vedic_panchang.rahu_kalam.end}`,
            abhijit_muhurta:
              freeAstroDailyContext.vedic_panchang.abhijit_muhurta === null
                ? null
                : `Abhijit Muhurta (a traditionally favorable midday window): ${freeAstroDailyContext.vedic_panchang.abhijit_muhurta.start} to ${freeAstroDailyContext.vedic_panchang.abhijit_muhurta.end}`,
          },
  };
}

export function westernSystemPrompt(input: DailyBriefingInput) {
  return [
    "Return exactly one JSON object and nothing else.",
    "Do not write commentary, explanations, markdown, bullet points, headings, or code fences.",
    "Do not add keys outside the required schema.",
    "Use short, practical, action-oriented strings with emotional or situational texture.",
    "No mystical filler. No doom-heavy language. No guarantees.",
    "Never mention internal scores, routing metadata, debug fields, hidden system variables, or internal classifier names.",
    getBirthTimeSpecificityRule(input),
    `Tone preference: ${input.tone_preference}.`,
    `Date context: ${input.date} (${input.weekday}) in ${input.timezone}.`,
    "Task: produce grounded Western guidance for the next 24h.",
    "Western owns emotional tone, relationship tone, communication style, and health or stress texture.",
    "Use astrology_context as your main source of specific signal. Treat sun_sign, sun_longitude_degrees, moon_sign, mercury_sign, venus_sign, mars_sign, current_sun_sign, current_moon_sign, and daily_context.day_signals as the main inputs. Respect listed limitations instead of inventing missing chart detail.",
    "Find one or two sharper tensions or opportunities in the day and make them concrete.",
    "Use mercury_sign for communication tone or thinking style when relevant, venus_sign for relationship tone, affection, or social ease, and mars_sign for drive, friction, stress, or assertiveness.",
    "Let current_moon_sign and daily day_signals shape what feels immediate today: mood, relationship weather, reactivity, softness, urgency, or social tone.",
    "Relationships should describe real human dynamics with partner, family, friends, or coworkers, not generic interpersonal advice and not work strategy.",
    "Energy should describe body load, stress tolerance, nervous system strain, recovery pattern, or emotional depletion, not career advice.",
    "Career should stay secondary and should describe work atmosphere, communication pattern, or task texture, not launch timing, money posture, or go-now versus wait decisions.",
    "Do not dominate money posture, deal posture, launch or delay decisions, or timing windows. Leave those to the timing generator.",
    "If Western and Timing could say the same thing, Western must express it through how it feels, how people respond, or how the body handles it.",
    "Avoid corporate filler and repeated caution language.",
    "Set confidence conservatively. If the guidance stays broad, prefer medium over high. If birth_time is missing, approximate, or unknown, do not make narrow or precise timing claims.",
    "Every non-enum field must be a plain JSON string.",
  ].join("\n\n");
}

export function timingSystemPrompt(input: DailyBriefingInput) {
  return [
    buildSharedSystemRules(input),
    "Task: Produce timing-oriented guidance focused on act / wait / avoid posture for today.",
    "Timing owns act versus wait posture, launch or delay decisions, commitment size, money posture, best window, avoid window, and pace readiness.",
    "Use astrology_context.daily_context.day_signals, current_moon_sign, current_sun_sign, and astrology_context.daily_context.timing_precision to shape timing posture honestly.",
    "Use freeastro_daily_context only as secondary timing support when available.",
    "Chinese current pillars should act as additional daily elemental weather, not the main driver.",
    "Vedic Panchang should mainly sharpen timing windows and pacing texture. Rahu Kalam can support avoid-window logic, while Abhijit Muhurta can support a better-window nuance when available.",
    "If you mention Vedic timing concepts, translate them into short plain English. Prefer phrasing like Tithi (lunar day), Nakshatra (lunar mansion / star field), Yoga (a Vedic quality of the day), Rahu Kalam (traditionally avoided for major starts), or Abhijit Muhurta (a traditionally favorable midday window).",
    "If FreeAstro data is absent or limited, ignore it rather than inventing missing timing systems.",
    "Use current momentum versus hesitation cues from the daily signals to decide whether today is better for acting now, acting smaller, slowing down, reviewing, or waiting.",
    "Treat weekday framing as minor support only if the real daily astro signals are thin.",
    "The decision_of_day should name one realistic scenario where the user must choose whether to move, pause, or decline.",
    "Timing should emphasize broad windows and practical sequencing, such as earlier vs later, deep work vs outreach, or tightening vs expanding.",
    "Do not repeat the same emotional framing used in Western guidance. Timing is about posture, sequencing, scale, and decision usefulness.",
    "Money risk should focus on spending, commitments, deals, negotiation posture, exposure, or whether to review, delay, hold, wait, or renegotiate.",
    "Clarity should focus on what kind of thinking is supported today, such as review versus commitment, outreach versus private work, or planning versus execution.",
    "Avoid generic emotional advice, generic relationship warmth, or broad health coaching unless directly needed to explain timing readiness.",
    "If Timing and Western could say the same thing, Timing must express it as whether to act now, later, smaller, slower, or not at all.",
    "If guidance is broad, keep confidence at medium instead of high.",
    "Timing windows must stay coarse and practical. If birth_time is not exact, avoid precise hour-by-hour claims and clearly keep timing at a broad-window level.",
    'Output shape: {"source":"timing","confidence":"low|medium|high","decision_of_day":{"scenario":"string","do":"string","avoid":"string","why":"string"},"timing":{"best_window":"string","avoid_window":"string"},"money_risk":{"lean_toward":"string","avoid":"string","risk_level":"low|medium|high"},"clarity":{"focus":"string","good_for":"string","not_ideal_for":"string"}}',
  ].join("\n\n");
}

export function synthesisSystemPrompt(input: DailyBriefingInput) {
  return [
    buildSharedSystemRules(input),
    "Task: Merge the western and timing outputs into one final daily briefing.",
    "Use astrology_context to preserve one concrete lens or tension in the final result instead of flattening everything into generic self-help language.",
    "Use numerology_context and numerology_signal as a secondary deterministic modality focused on rhythm, pacing, action bias, and whether the day leans toward acting, refining, reviewing, waiting, or holding.",
    "Use freeastro_daily_context as secondary timing support only. Chinese current pillars can reinforce the broad daily Chinese elemental weather, and Vedic Panchang can sharpen timing windows, pacing texture, or avoid windows when present.",
    "If you reference Vedic timing concepts in the final text, make them readable for English speakers with a short plain-English explanation instead of raw jargon alone.",
    "Numerology is not a second final writer. Treat it as compact signal input that can help sharpen timing, pacing, and decision posture.",
    "Use mercury_sign to sharpen communication tone, venus_sign to humanize relationships and social warmth, and mars_sign to clarify drive, irritation, courage, or conflict threshold.",
    "Let current_moon_sign and the real daily day_signals shape what feels especially live today. Treat weekday framing as minor context, not the main explanation.",
    "If numerology and astrology align, you may let that increase clarity or firmness. If they differ, resolve conservatively and prefer narrower, practical guidance over sweeping claims.",
    "If natal_context.near_sign_boundary is true, you may mention a pull toward adjacent_sign as boundary pressure or neighboring influence, but never describe the person as a dual sign.",
    "Preserve useful overlap, resolve contradictions conservatively, and keep the final summary practical.",
    "Your main job is deduplication. If multiple sections point to the same theme, compress that overlap into the executive_summary and do not repeat the same advice across cards.",
    "If the executive_summary already states the main thesis of the day, every card must translate that thesis into a different domain-specific action, tradeoff, or restraint instead of restating it.",
    "Reject generic phrasing such as 'today is a good day' or 'you may feel'.",
    "Instead describe the specific tension, action, timing, or restraint the signals support.",
    "Keep the tone human, grounded, and emotionally intelligent. It should sound like useful real-life guidance, not corporate coaching.",
    "Make every card answer a different question.",
    "career = work execution, priorities, project posture, and what kind of task or decision fits the day. It should answer: what should I focus on at work, and what work posture is better today than its opposite?",
    "money = spending, commitments, purchases, negotiations, financial caution, or financial opportunity. It must answer what kind of money behavior is favored today and what kind of financial move is not favored today, such as review, delay, keep spending small, renegotiate, or avoid quick commitments.",
    "relationships = real human contact with partner, family, friends, coworkers, or one important conversation. Let venus_sign and mercury_sign influence how warmth, receptivity, affection, listening, or directness show up. Use concrete phrasing like keep things light with friends, do not push a partner for clarity, give family space, or keep coworker communication simple.",
    "health = body load, stress tolerance, physical energy, emotional depletion, recovery, and nervous system regulation. Let mars_sign shape friction threshold, stress build-up, impatience, courage, or recovery needs. Go beyond generic pacing and say what kind of strain to watch for and what kind of restoration helps.",
    "personal_growth = mindset, reflection, emotional lesson, inner adjustment, or clarity. It should feel inward and should not sound like a second career card or productivity advice.",
    "If two cards sound interchangeable, rewrite them so they are distinct in subject, action, and tone.",
    "Use contrast where possible: better for X than Y, this is a day for X not Y, better to send than to decide, better to prepare than to promise, better to keep things light than to press for depth.",
    "Recommendations should be specific enough that a user could act on them today.",
    "Do not let every section repeat caution language. If caution is the main theme, say it once in the executive_summary and make the cards more targeted and varied.",
    "Relationships should not sound abstract. Prefer partner, family, friends, or coworkers over vague references to people.",
    "Health should not sound clinical or vague. It should feel embodied, including stress, body load, rest, regulation, depletion, or irritability when relevant.",
    "Personal growth should stay inward: reflection, mindset, emotional clarity, or inner adjustment. Do not let it become work strategy.",
    "If the same idea shows up in work, money, and relationships, compress it into the executive_summary and then give each card a different real-life expression of that theme.",
    "Money should be especially concrete. Avoid generic caution like be careful with money. Say whether today is better for reviewing, delaying, keeping spending small, waiting for better clarity, negotiating, or avoiding fast commitments.",
    "Lower confidence when the upstream signals are broad, repetitive, or low-specificity. Broad guidance should usually be medium, not high.",
    "The final date must match the provided input date exactly.",
    "If either upstream source has reduced confidence because birth time is not exact, keep the final confidence conservative.",
    'Output shape: {"date":"YYYY-MM-DD","confidence":"low|medium|high","executive_summary":"string","decision_of_day":{"scenario":"string","do":"string","avoid":"string","why":"string"},"cards":{"career":{"headline":"string","best_move":"string","watch_out":"string"},"money":{"headline":"string","lean_toward":"string","avoid":"string","risk_level":"low|medium|high"},"relationships":{"headline":"string","best_action":"string","avoid":"string"},"health":{"headline":"string","best_use":"string","avoid":"string"},"personal_growth":{"headline":"string","focus":"string","good_for":"string","not_ideal_for":"string"}},"timing":{"best_window":"string","avoid_window":"string"},"micro_claim":{"statement":"string","horizon":"24h","track_prompt":"string"}}',
  ].join("\n\n");
}

export function buildWesternUserPrompt(
  input: DailyBriefingInput,
  astrologyContext: AstrologyContext,
) {
  return buildPromptPayload(input, astrologyContext);
}

export function buildTimingUserPrompt(
  input: DailyBriefingInput,
  astrologyContext: AstrologyContext,
  freeAstroDailyContext: FreeAstroDailyContext,
) {
  return JSON.stringify(
    {
      briefing_input: input,
      astrology_context: astrologyContext,
      freeastro_daily_context: freeAstroDailyContext,
      freeastro_daily_context_readable: buildReadableFreeAstroContext(
        freeAstroDailyContext,
      ),
    },
    null,
    2,
  );
}

export function buildSynthesisUserPrompt(input: {
  briefingInput: DailyBriefingInput;
  astrologyContext: AstrologyContext;
  numerologyContext: NumerologyContext;
  numerologySignal: ModalitySignal;
  freeAstroDailyContext: FreeAstroDailyContext;
  westernModalitySignal: ModalitySignal;
  westernOutput: WesternOutput;
  timingOutput: TimingOutput;
}) {
  return JSON.stringify(
    {
      ...input,
      freeastro_daily_context_readable: buildReadableFreeAstroContext(
        input.freeAstroDailyContext,
      ),
    },
    null,
    2,
  );
}
