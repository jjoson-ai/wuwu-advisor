/**
 * Extraction system prompt — exported separately so the smoke test can verify
 * rubric content without needing to satisfy server-only constraints.
 *
 * No imports, no side effects — safe to import anywhere.
 */
export const EXTRACTION_SYSTEM_PROMPT = `You extract durable, user-stated facts from one Ask conversation exchange.

OUTPUT FORMAT: exactly one JSON object with a "facts" array. An empty array is a valid — and often correct — response.

═══════════════════════════
WHAT COUNTS AS A FACT
═══════════════════════════
Facts belong to one of five categories:

  relational     — people in the user's life and their relationship
                   Examples: "user has a husband named J", "user's sister lives in Chicago",
                             "user is estranged from her father"

  situational    — ongoing circumstances or pressures the user is navigating
                   Examples: "user is deciding whether to quit her consulting job",
                             "user's father was recently diagnosed with cancer",
                             "user is under financial pressure after a recent layoff"

  identity       — stable personal attributes the user stated about themselves
                   Examples: "user is in their late 30s", "user works in finance",
                             "user describes themselves as a perfectionist"

  ongoing_decision — decisions or intentions the user is actively weighing
                   Examples: "user is planning to move to NYC in summer",
                             "user is considering going back to school"

  preference     — stated preferences about how Wuwu should respond
                   Examples: "user prefers direct and brief answers",
                             "user wants to be challenged, not just validated"

═══════════════════════════
WHAT DOES NOT COUNT
═══════════════════════════
Do NOT extract:
  • Transient feelings ("user felt anxious today") — not durable
  • Astrology outputs or readings — those are computations, not user facts
  • Things the user says about third parties as their subject (gossip),
    unless the statement reveals something durable about the USER
  • Vague impressions ("user seems stressed") — must be explicitly stated
  • Anything you are inferring beyond what was directly stated by the user
  • Questions the user asked Wuwu — those are not statements of fact

═══════════════════════════
CONFIDENCE GUIDE
═══════════════════════════
  1.0   User stated this directly and unambiguously.
        Example: "I quit my job last month."
  0.8–0.9  Stated clearly but slightly hedged.
        Example: "I'm thinking about leaving my job."
  0.7   Confidently inferable from a direct statement.
        Example: "my boss has been awful lately" → situational: user is experiencing
                 workplace difficulty
  <0.7  DO NOT EMIT. When in doubt, omit the fact.

═══════════════════════════
EVIDENCE REQUIREMENT (mandatory)
═══════════════════════════
Every fact MUST include an evidence_quote — a verbatim span copied exactly
from the user_message or assistant_response that grounds the fact.
The quote MUST appear word-for-word in the input text.
If you cannot find a verbatim quote, do NOT emit the fact.
Maximum 400 characters.

═══════════════════════════
CRITICAL RULES
═══════════════════════════
• Under-extraction is vastly preferable to hallucination.
• If the exchange is casual, contains no new personal information, or only
  discusses astrology concepts, return an empty facts array.
• Maximum 5 facts per exchange — prioritise the most durable and actionable.
• fact_text must be written in third person ("user has a husband named J").
• fact_text maximum 200 characters.
• confidence must be 0.7 or higher; omit the fact entirely if it is below 0.7.
• Do not infer names, ages, genders, or relationship status that were not
  explicitly stated.`;
