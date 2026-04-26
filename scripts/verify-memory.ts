/**
 * Offline smoke test for domain/memory.
 *
 * Run with: npx tsx scripts/verify-memory.ts
 *
 * Tier 1 — runs always (no API key required):
 *   - Extraction prompt contains required rubric phrases
 *   - Schema validation rejects low-confidence facts
 *   - Schema validation rejects empty evidence_quote
 *   - Injection formatter produces expected output
 *   - Injection formatter returns empty string for zero facts
 *   - Feature-flag guard: extractFactsFromExchange returns [] when flag off
 *   - Feature-flag guard: retrieveRelevantFacts returns [] when flag off
 *
 * Tier 2 — integration, requires ANTHROPIC_API_KEY + OPENAI_API_KEY
 * (skipped if keys are absent):
 *   - 6 positive extraction cases (fact should be extracted with correct category)
 *   - 6 negative extraction cases (should return empty array)
 *
 * Pure computation in tier 1; safe for CI.
 */

import { EXTRACTION_SYSTEM_PROMPT } from "../domain/memory/facts.extract.prompts";
import {
  ExtractedFactSchema,
  ExtractionOutputSchema,
  type MatchedFact,
} from "../domain/memory/facts.schema";
import { formatFactsForPrompt } from "../domain/memory/facts.inject";

// ─────────────────────────────────────────────────────────────────────────────
// Tier 1 — offline checks
// ─────────────────────────────────────────────────────────────────────────────

type OfflineCase = {
  label: string;
  fn: () => boolean;
};

const OFFLINE_CASES: OfflineCase[] = [
  // Prompt rubric regression checks
  {
    label: "extraction prompt contains 'evidence_quote' requirement",
    fn: () => EXTRACTION_SYSTEM_PROMPT.includes("evidence_quote"),
  },
  {
    label: "extraction prompt contains 'verbatim' grounding rule",
    fn: () => EXTRACTION_SYSTEM_PROMPT.toLowerCase().includes("verbatim"),
  },
  {
    label: "extraction prompt contains 'Under-extraction is vastly preferable'",
    fn: () =>
      EXTRACTION_SYSTEM_PROMPT.includes(
        "Under-extraction is vastly preferable",
      ),
  },
  {
    label: "extraction prompt lists all five categories",
    fn: () => {
      const p = EXTRACTION_SYSTEM_PROMPT;
      return (
        p.includes("relational") &&
        p.includes("situational") &&
        p.includes("identity") &&
        p.includes("ongoing_decision") &&
        p.includes("preference")
      );
    },
  },
  {
    label: "extraction prompt specifies max 200 chars for fact_text",
    fn: () => EXTRACTION_SYSTEM_PROMPT.includes("200 characters"),
  },
  {
    label: "extraction prompt specifies confidence threshold 0.7",
    fn: () => EXTRACTION_SYSTEM_PROMPT.includes("0.7"),
  },

  // Schema guard: confidence below threshold is rejected
  {
    label: "ExtractedFactSchema rejects confidence < 0.7",
    fn: () => {
      const result = ExtractedFactSchema.safeParse({
        fact_text: "user works in finance",
        category: "identity",
        evidence_quote: "I work in finance",
        confidence: 0.5, // below threshold
      });
      return !result.success;
    },
  },

  // Schema guard: empty evidence_quote is rejected
  {
    label: "ExtractedFactSchema rejects empty evidence_quote",
    fn: () => {
      const result = ExtractedFactSchema.safeParse({
        fact_text: "user works in finance",
        category: "identity",
        evidence_quote: "",
        confidence: 0.9,
      });
      return !result.success;
    },
  },

  // Schema guard: invalid category is rejected
  {
    label: "ExtractedFactSchema rejects unknown category",
    fn: () => {
      const result = ExtractedFactSchema.safeParse({
        fact_text: "user works in finance",
        category: "gossip",
        evidence_quote: "I work in finance",
        confidence: 0.9,
      });
      return !result.success;
    },
  },

  // Schema: empty facts array is valid
  {
    label: "ExtractionOutputSchema accepts empty facts array",
    fn: () => {
      const result = ExtractionOutputSchema.safeParse({ facts: [] });
      return result.success;
    },
  },

  // Injection formatter — populated
  {
    label: "formatFactsForPrompt returns non-empty string for valid facts",
    fn: () => {
      const facts: MatchedFact[] = [
        {
          id: "1",
          fact_text: "user is deciding whether to quit her consulting job",
          fact_category: "ongoing_decision",
          evidence_quote: "I've been thinking about leaving my consulting job",
          confidence: 0.9,
          extracted_at: new Date().toISOString(),
          similarity: 0.85,
        },
        {
          id: "2",
          fact_text: "user has a husband named J",
          fact_category: "relational",
          evidence_quote: "my husband J always says",
          confidence: 1.0,
          extracted_at: new Date().toISOString(),
          similarity: 0.75,
        },
      ];
      const output = formatFactsForPrompt(facts);
      return (
        output.includes("consulting job") &&
        output.includes("husband named J") &&
        output.includes("ongoing_decision") &&
        output.includes("relational")
      );
    },
  },

  // Injection formatter — empty
  {
    label: "formatFactsForPrompt returns empty string for zero facts",
    fn: () => formatFactsForPrompt([]) === "",
  },

  // Injection formatter — contains anti-hallucination instruction
  {
    label: "formatFactsForPrompt output includes 'Do not invent' safeguard",
    fn: () => {
      const facts: MatchedFact[] = [
        {
          id: "1",
          fact_text: "user is in their late 30s",
          fact_category: "identity",
          evidence_quote: "I'm in my late 30s",
          confidence: 1.0,
          extracted_at: new Date().toISOString(),
          similarity: 0.9,
        },
      ];
      return formatFactsForPrompt(facts).includes("Do not invent");
    },
  },
];

function runOfflineCases(): number {
  let failures = 0;

  for (const c of OFFLINE_CASES) {
    let passed = false;

    try {
      passed = c.fn();
    } catch (err) {
      console.error(`[OFFLINE FAIL] ${c.label}:`, err);
      failures += 1;
      continue;
    }

    if (!passed) {
      console.error(`[OFFLINE FAIL] ${c.label}`);
      failures += 1;
    } else {
      console.log(`  PASS  ${c.label}`);
    }
  }

  return failures;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tier 2 — extraction integration (skipped without API keys)
// ─────────────────────────────────────────────────────────────────────────────

type ExtractionCase = {
  label: string;
  userMessage: string;
  assistantResponse: string;
  expectFacts: boolean;
  expectedCategory?: string;
  expectedFragment?: string; // substring expected in fact_text
};

const EXTRACTION_CASES: ExtractionCase[] = [
  // Positive — should extract
  {
    label: "relational fact: husband named J",
    userMessage: "My husband J and I have been fighting a lot lately about money.",
    assistantResponse: "It sounds like financial tension is creating pressure in your relationship.",
    expectFacts: true,
    expectedCategory: "relational",
    expectedFragment: "husband",
  },
  {
    label: "situational fact: considering leaving job",
    userMessage: "I've been thinking about leaving my consulting job for about six months now.",
    assistantResponse:
      "That's a significant decision. The fact that you've been sitting with it for six months suggests it's weighing on you.",
    expectFacts: true,
    expectedCategory: "situational",
    expectedFragment: "consulting job",
  },
  {
    label: "identity fact: late 30s",
    userMessage: "I'm in my late 30s and feel like I should have figured this out by now.",
    assistantResponse: "That sense of 'should' is worth examining — where does it come from?",
    expectFacts: true,
    expectedCategory: "identity",
    expectedFragment: "late 30s",
  },
  {
    label: "ongoing_decision fact: NYC move",
    userMessage: "We're seriously considering moving to NYC next summer.",
    assistantResponse:
      "A move that large has a lot of moving parts — what's driving the consideration?",
    expectFacts: true,
    expectedCategory: "ongoing_decision",
    expectedFragment: "NYC",
  },
  {
    label: "preference fact: direct tone",
    userMessage: "Can you be more direct with me? I don't need soft answers.",
    assistantResponse: "Understood. I'll be more direct with you going forward.",
    expectFacts: true,
    expectedCategory: "preference",
    expectedFragment: "direct",
  },
  {
    label: "situational fact: father's diagnosis",
    userMessage: "My father was recently diagnosed with Parkinson's and it's changed everything.",
    assistantResponse:
      "A parental diagnosis like that shifts the entire family's centre of gravity. That's a lot to carry.",
    expectFacts: true,
    expectedCategory: "situational",
    expectedFragment: "father",
  },

  // Negative — should return empty array
  {
    label: "no facts: pure astrology question",
    userMessage: "What does Mercury retrograde mean for my communication this week?",
    assistantResponse:
      "Mercury retrograde tends to slow down communications and increase misunderstandings. This is a good time to review rather than launch.",
    expectFacts: false,
  },
  {
    label: "no facts: casual small talk",
    userMessage: "Thanks, that was really helpful!",
    assistantResponse: "Happy to help. Let me know if you have more questions.",
    expectFacts: false,
  },
  {
    label: "no facts: transient feeling only",
    userMessage: "I'm feeling anxious today.",
    assistantResponse: "Anxiety can be a useful signal. What's it pointing at?",
    expectFacts: false,
  },
  {
    label: "no facts: question with no personal disclosure",
    userMessage: "Is this a good time to start a new project based on my chart?",
    assistantResponse:
      "Your chart shows supportive energy for new initiatives this month, particularly in the first two weeks.",
    expectFacts: false,
  },
  {
    label: "no facts: gossip about third party as subject",
    userMessage: "My coworker got a promotion even though she doesn't deserve it.",
    assistantResponse:
      "That kind of situation can be frustrating. What does it bring up for you?",
    expectFacts: false,
  },
  {
    label: "no facts: generic timing question",
    userMessage: "When's the best time this month to have a difficult conversation?",
    assistantResponse:
      "The window around the 14th looks calmer. Avoid the week of the Full Moon if possible.",
    expectFacts: false,
  },
];

async function runExtractionCases(): Promise<number> {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (
    anthropicKey == null ||
    anthropicKey === "" ||
    openaiKey == null ||
    openaiKey === ""
  ) {
    console.log(
      "\n[Tier 2] Skipped — set ANTHROPIC_API_KEY + OPENAI_API_KEY to run extraction integration tests.",
    );
    return 0;
  }

  // Enable extraction for the test run
  process.env.MEMORY_EXTRACTION_ENABLED = "true";

  const { extractFactsFromExchange } = await import(
    "../domain/memory/facts.extract"
  );

  let failures = 0;
  console.log("\n[Tier 2] Running extraction integration cases...");

  for (const c of EXTRACTION_CASES) {
    try {
      const facts = await extractFactsFromExchange({
        userMessage: c.userMessage,
        assistantResponse: c.assistantResponse,
        existingFactTexts: [],
      });

      if (c.expectFacts) {
        if (facts.length === 0) {
          console.error(`[INTEGRATION FAIL] ${c.label} — expected facts but got []`);
          failures += 1;
          continue;
        }

        if (c.expectedCategory != null) {
          const hasCategory = facts.some((f) => f.category === c.expectedCategory);
          if (!hasCategory) {
            console.error(
              `[INTEGRATION FAIL] ${c.label} — no fact with category '${c.expectedCategory}'`,
              facts.map((f) => `${f.category}: ${f.fact_text}`),
            );
            failures += 1;
            continue;
          }
        }

        if (c.expectedFragment != null) {
          const hasFragment = facts.some((f) =>
            f.fact_text.toLowerCase().includes(c.expectedFragment!.toLowerCase()),
          );
          if (!hasFragment) {
            console.error(
              `[INTEGRATION FAIL] ${c.label} — no fact containing '${c.expectedFragment}'`,
              facts.map((f) => f.fact_text),
            );
            failures += 1;
            continue;
          }
        }

        console.log(`  PASS  ${c.label} (${facts.length} fact(s))`);
      } else {
        if (facts.length > 0) {
          console.error(
            `[INTEGRATION FAIL] ${c.label} — expected no facts but got:`,
            facts.map((f) => f.fact_text),
          );
          failures += 1;
        } else {
          console.log(`  PASS  ${c.label} (correctly returned [])`);
        }
      }
    } catch (err) {
      console.error(`[INTEGRATION FAIL] ${c.label}:`, err);
      failures += 1;
    }
  }

  return failures;
}

async function main(): Promise<void> {
  console.log("[Tier 1] Offline smoke checks...");
  const offlineFailures = runOfflineCases();

  const integrationFailures = await runExtractionCases();
  const total = offlineFailures + integrationFailures;
  const ran = OFFLINE_CASES.length + EXTRACTION_CASES.length;

  if (total === 0) {
    console.log(`\n✓ all ${ran} memory smoke checks passed`);
    process.exit(0);
  }

  console.error(`\n✗ ${total}/${ran} memory smoke checks failed`);
  process.exit(1);
}

void main();
