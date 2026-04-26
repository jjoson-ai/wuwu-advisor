/**
 * Offline red-team for domain/safety/prompt-rules.
 *
 * Run with: npx tsx scripts/verify-prompt-rules.ts
 *
 * Verifies two things:
 *
 * 1. `isLifeStakesQuestion` fires on irreversible life-decision framings
 *    (leave partner, quit job, break up, divorce, cut off family, major
 *    move, sell home, have/end a pregnancy, disclose affair/diagnosis,
 *    come out). These trigger deterministic Decision Coach reinforcement
 *    in Ask + Ask-follow-up prompts.
 *
 * 2. `isLifeStakesQuestion` does NOT fire on benign Ask questions so we
 *    don't slather the Decision Coach template onto ordinary timing,
 *    sizing, or curiosity questions and kill voice.
 *
 * Also sanity-checks that FINANCIAL_SAFETY_RULES and
 * LIFE_DECISION_COACH_RULES are non-empty — a refactor that clears them
 * would silently ship a regression here.
 *
 * Pure regex, no API calls, runs in <100ms. Safe for CI.
 */

import {
  CULT_PHRASE_RULES,
  FINANCIAL_SAFETY_RULES,
  LIFE_DECISION_COACH_RULES,
  VOICE_DISCIPLINE_RULES,
  countHedges,
  findUnglossedJargon,
  isLifeStakesQuestion,
} from "../domain/safety/prompt-rules";

type Case = {
  label: string;
  text: string;
  expect: boolean;
};

const POSITIVE_CASES: ReadonlyArray<Case> = [
  // Relationship exits
  {
    label: "leave my husband",
    text: "Should I leave my husband? Things haven't felt right since his job change.",
    expect: true,
  },
  {
    label: "leave him (partner)",
    text: "I've been sitting on this for a year — should I finally leave him?",
    expect: true,
  },
  {
    label: "break up",
    text: "I want to break up with my boyfriend before our lease renews.",
    expect: true,
  },
  {
    label: "breaking up (-ing form)",
    text: "Breaking up with him feels impossible right now. Is this the week?",
    expect: true,
  },
  {
    label: "divorce",
    text: "Is this the right year to file for divorce?",
    expect: true,
  },
  {
    label: "end my marriage",
    text: "Should I end my marriage or try counseling one more time?",
    expect: true,
  },

  // Career exits
  {
    label: "quit my job",
    text: "Should I quit my job and go independent this quarter?",
    expect: true,
  },
  {
    label: "quitting my career",
    text: "Quitting my career in law has been on my mind for months.",
    expect: true,
  },

  // Family cutoff
  {
    label: "cut off my mother",
    text: "I'm thinking about cutting off my mother after what she said at Thanksgiving.",
    expect: true,
  },

  // Major moves
  {
    label: "move across country",
    text: "Should I move across the country for this offer, or stay in my city?",
    expect: true,
  },
  {
    label: "relocating",
    text: "Relocating to Portugal for two years — is the timing right?",
    expect: true,
  },
  {
    label: "sell my house",
    text: "Thinking about selling my house and renting for a while.",
    expect: true,
  },

  // Reproductive
  {
    label: "have a baby",
    text: "Is this the year to have a baby, or wait another cycle?",
    expect: true,
  },
  {
    label: "get pregnant",
    text: "We're trying to get pregnant this spring.",
    expect: true,
  },
  {
    label: "end my pregnancy",
    text: "I need to decide whether to end my pregnancy before the end of the month.",
    expect: true,
  },
  {
    label: "abortion",
    text: "Is an abortion the right call for me right now?",
    expect: true,
  },

  // Disclosure
  {
    label: "come out to",
    text: "Should I come out to my parents at Christmas?",
    expect: true,
  },
  {
    label: "tell my affair",
    text: "Should I tell my husband about the affair before our anniversary?",
    expect: true,
  },
  {
    label: "tell my diagnosis",
    text: "Should I tell my boss about my diagnosis before the performance review?",
    expect: true,
  },
];

const NEGATIVE_CASES: ReadonlyArray<Case> = [
  {
    label: "normal timing question",
    text: "Is this a good week to launch my product?",
    expect: false,
  },
  {
    label: "normal sizing question",
    text: "How much should I allocate to the new hire budget this quarter?",
    expect: false,
  },
  {
    label: "conversation question",
    text: "How should I open the conversation with my cofounder about runway?",
    expect: false,
  },
  {
    label: "daily mood question",
    text: "What's the vibe of today for focused writing?",
    expect: false,
  },
  {
    label: "career growth question (no quit)",
    text: "Should I push for a promotion this cycle or wait for the next review?",
    expect: false,
  },
  {
    label: "relationship question (non-exit)",
    text: "How should I bring up the vacation budget with my partner without it becoming a fight?",
    expect: false,
  },
  {
    label: "money posture question",
    text: "Should I be more conservative with spending until Mercury clears retrograde?",
    expect: false,
  },
  {
    label: "health pacing",
    text: "Is this a rest week or a push week for training?",
    expect: false,
  },
  {
    label: "travel (not relocating)",
    text: "Should I take the trip to Lisbon next month or push it to spring?",
    expect: false,
  },
  {
    label: "buy decision (financial, not life)",
    text: "Should I buy the new laptop now or wait until the fall release?",
    expect: false,
  },
  {
    label: "parenting small question",
    text: "How do I handle my kid's bedtime resistance this week?",
    expect: false,
  },
  {
    label: "mention of divorce in past (historical)",
    text: "My divorce was final three years ago — how should I think about dating again?",
    expect: true, // intentional: bare 'divorce' word fires. Coach mode is still the right voice for the surrounding question.
  },
];

function runOne(c: Case): { pass: boolean; got: boolean } {
  const got = isLifeStakesQuestion(c.text);
  return { pass: got === c.expect, got };
}

function runSection(
  cases: ReadonlyArray<Case>,
  label: string,
): number {
  console.log(`\n== ${label} (${cases.length} cases) ==`);
  let failures = 0;

  for (const c of cases) {
    const r = runOne(c);
    if (r.pass) {
      console.log(`  PASS  ${c.label}  (got ${r.got})`);
    } else {
      failures += 1;
      console.log(
        `  FAIL  ${c.label}  (got ${r.got}, expected ${c.expect}) — ${c.text}`,
      );
    }
  }

  return failures;
}

function runSanityChecks(): number {
  console.log(`\n== Rule content sanity ==`);
  let failures = 0;

  if (FINANCIAL_SAFETY_RULES.length === 0) {
    console.log("  FAIL  FINANCIAL_SAFETY_RULES is empty");
    failures += 1;
  } else {
    console.log(
      `  PASS  FINANCIAL_SAFETY_RULES has ${FINANCIAL_SAFETY_RULES.length} rules`,
    );
  }

  if (LIFE_DECISION_COACH_RULES.length === 0) {
    console.log("  FAIL  LIFE_DECISION_COACH_RULES is empty");
    failures += 1;
  } else {
    console.log(
      `  PASS  LIFE_DECISION_COACH_RULES has ${LIFE_DECISION_COACH_RULES.length} rules`,
    );
  }

  // Must forbid the specific things 1.9 calls out: named instruments, tickers,
  // dollar amounts, specific brokerages, transaction timing. Check a few key
  // phrases survive any future refactor.
  const financialJoined = FINANCIAL_SAFETY_RULES.join(" ").toLowerCase();
  const requiredFinancialPhrases = [
    "ticker",
    "dollar",
    "brokerage",
    "mood",
  ];
  for (const phrase of requiredFinancialPhrases) {
    if (financialJoined.includes(phrase)) {
      console.log(`  PASS  FINANCIAL_SAFETY_RULES mentions "${phrase}"`);
    } else {
      console.log(
        `  FAIL  FINANCIAL_SAFETY_RULES does not mention "${phrase}" — regression risk`,
      );
      failures += 1;
    }
  }

  const coachJoined = LIFE_DECISION_COACH_RULES.join(" ").toLowerCase();
  const requiredCoachPhrases = [
    "decision coach",
    "i won't decide this for you",
    "three questions",
    "professional",
  ];
  for (const phrase of requiredCoachPhrases) {
    if (coachJoined.includes(phrase)) {
      console.log(`  PASS  LIFE_DECISION_COACH_RULES mentions "${phrase}"`);
    } else {
      console.log(
        `  FAIL  LIFE_DECISION_COACH_RULES does not mention "${phrase}" — regression risk`,
      );
      failures += 1;
    }
  }

  if (CULT_PHRASE_RULES.length === 0) {
    console.log("  FAIL  CULT_PHRASE_RULES is empty");
    failures += 1;
  } else {
    console.log(
      `  PASS  CULT_PHRASE_RULES has ${CULT_PHRASE_RULES.length} rules`,
    );
  }

  const cultJoined = CULT_PHRASE_RULES.join(" ").toLowerCase();
  const requiredCultPhrases = [
    "destined to",
    "fated",
    "meant to be",
    "cosmos",
    "written in the stars",
  ];
  for (const phrase of requiredCultPhrases) {
    if (cultJoined.includes(phrase)) {
      console.log(`  PASS  CULT_PHRASE_RULES mentions "${phrase}"`);
    } else {
      console.log(
        `  FAIL  CULT_PHRASE_RULES does not mention "${phrase}" — regression risk`,
      );
      failures += 1;
    }
  }

  return failures;
}

// ─── F-11 / F-12 — voice discipline (hedge cap + jargon pairing) ─────────────

type VoiceCase = {
  label: string;
  text: string;
  expectHedges?: number;
  expectUnglossedJargon?: ReadonlyArray<string>;
};

const VOICE_CASES: ReadonlyArray<VoiceCase> = [
  // Hedge counter — F-11
  {
    label: "no hedges",
    text: "Today's energy points to clarity in conversation. Speak directly when the window opens.",
    expectHedges: 0,
  },
  {
    label: "single hedge — acceptable",
    text: "You might find Friday afternoon more productive than morning. Lean in then.",
    expectHedges: 1,
  },
  {
    label: "two hedges — warn",
    text: "You might find Friday productive, and there's a chance the evening lands softer.",
    expectHedges: 2,
  },
  {
    label: "three hedges — block-worthy",
    text: "You could maybe see this clear up, perhaps by next week, though it's possible the timing slips.",
    expectHedges: 3,
  },
  {
    label: "multi-word hedge phrase",
    text: "It's possible that the call comes Tuesday afternoon.",
    expectHedges: 1,
  },

  // Jargon pairing — F-12
  {
    label: "no jargon",
    text: "Today's energy is steady. Lean into careful work and shorter conversations.",
    expectUnglossedJargon: [],
  },
  {
    label: "jargon with em-dash gloss — acceptable",
    text: "Mercury squaring Saturn — a friction angle that often correlates with communication delays.",
    expectUnglossedJargon: [],
  },
  {
    label: "jargon with parenthetical gloss — acceptable",
    text: "A Saturn-Pluto square (a 90° tension that asks for restructuring) is in orb this week.",
    expectUnglossedJargon: [],
  },
  {
    label: "un-glossed transit at end",
    text: "Things lift after Saturday's transit completes.",
    expectUnglossedJargon: ["transit"],
  },
  {
    label: "un-glossed retrograde",
    text: "The retrograde shifts the conversation pace for the next two weeks.",
    expectUnglossedJargon: ["retrograde"],
  },
];

function runVoiceCases(): number {
  console.log("\n== F-11 / F-12 voice discipline ==");
  let failures = 0;
  for (const c of VOICE_CASES) {
    if (c.expectHedges !== undefined) {
      const got = countHedges(c.text);
      if (got === c.expectHedges) {
        console.log(`  PASS  ${c.label}: countHedges = ${got}`);
      } else {
        console.log(
          `  FAIL  ${c.label}: countHedges = ${got}, expected ${c.expectHedges}`,
        );
        failures += 1;
      }
    }
    if (c.expectUnglossedJargon !== undefined) {
      const got = findUnglossedJargon(c.text);
      const want = c.expectUnglossedJargon;
      const same =
        got.length === want.length &&
        got.every((term, i) => term === want[i]);
      if (same) {
        console.log(
          `  PASS  ${c.label}: findUnglossedJargon = [${got.join(", ")}]`,
        );
      } else {
        console.log(
          `  FAIL  ${c.label}: findUnglossedJargon = [${got.join(", ")}], expected [${want.join(", ")}]`,
        );
        failures += 1;
      }
    }
  }

  // Sanity: voice-discipline rule set is wired
  if (VOICE_DISCIPLINE_RULES.length === 0) {
    console.log("  FAIL  VOICE_DISCIPLINE_RULES is empty");
    failures += 1;
  } else {
    console.log(
      `  PASS  VOICE_DISCIPLINE_RULES has ${VOICE_DISCIPLINE_RULES.length} rules`,
    );
  }
  const voiceJoined = VOICE_DISCIPLINE_RULES.join(" ").toLowerCase();
  for (const phrase of ["one hedge", "plain-english gloss", "first use"]) {
    if (voiceJoined.includes(phrase)) {
      console.log(`  PASS  VOICE_DISCIPLINE_RULES mentions "${phrase}"`);
    } else {
      console.log(
        `  FAIL  VOICE_DISCIPLINE_RULES does not mention "${phrase}" — regression risk`,
      );
      failures += 1;
    }
  }

  return failures;
}

function main() {
  let total = 0;
  let failures = 0;

  total += POSITIVE_CASES.length;
  failures += runSection(POSITIVE_CASES, "Life-stakes positives (should fire)");

  total += NEGATIVE_CASES.length;
  failures += runSection(
    NEGATIVE_CASES,
    "Benign negatives (should NOT fire — except where noted)",
  );

  // sanity checks count each phrase as its own assertion
  const sanityFailures = runSanityChecks();
  failures += sanityFailures;

  // F-11 / F-12 voice discipline checks
  total += VOICE_CASES.length;
  failures += runVoiceCases();

  console.log(
    failures === 0
      ? `\n✓ All ${total} case(s) + sanity checks passed`
      : `\n✗ ${failures} failure(s) across ${total} case(s) + sanity checks`,
  );

  process.exit(failures === 0 ? 0 : 1);
}

main();
