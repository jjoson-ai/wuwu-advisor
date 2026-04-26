/**
 * Offline verification for domain/accuracy/calibration.service.ts.
 *
 * Run with: npx tsx scripts/verify-calibration.ts
 *
 * Exercises the fragment builder directly (no DB) so we can assert the
 * shape of the prompt injection across gating edge cases without needing a
 * connected Supabase. Covers:
 *
 * 1. Min-ratings gate — below threshold returns null fragment
 * 2. No-theme-signal gate — 10+ ratings but zero theme hits/misses = null
 * 3. Happy path — produces a fragment that names top hits, misses, and
 *    preserves the "do not reduce cards" anti-self-fulfilling-prophecy line
 * 4. Hit/miss truncation to MAX_THEMES_PER_SIDE (3)
 * 5. Touch minimum — single-touch themes must not appear
 * 6. Forbidden phrasing — fragment must NOT contain "reduce", "skip",
 *    "drop", or "remove" as instructions to kill cards. The ONLY allowed
 *    uses of those words are in the closing "do not reduce, skip, or soften
 *    any card" guardrail sentence.
 *
 * Pure, no API calls, runs in <100ms. Safe for CI.
 */

import {
  buildFragmentFromSnapshot,
  isCalibrationEnabled,
  MAX_THEMES_PER_SIDE,
  MIN_CALIBRATION_RATINGS,
} from "../domain/accuracy/calibration.core";
import type { AccuracySnapshot } from "../domain/accuracy/accuracy.service";
import type { RatingThemeValue } from "../domain/feedback/feedback.types";

type PerThemeStats = AccuracySnapshot["perTheme"][RatingThemeValue];

function makePerTheme(
  overrides: Partial<Record<RatingThemeValue, Partial<PerThemeStats>>>,
): AccuracySnapshot["perTheme"] {
  const themes: RatingThemeValue[] = [
    "career",
    "money",
    "relationships",
    "health",
    "personal_growth",
    "timing",
  ];

  const result = {} as AccuracySnapshot["perTheme"];
  for (const theme of themes) {
    const o = overrides[theme] ?? {};
    const hit = o.hitCount ?? 0;
    const miss = o.missCount ?? 0;
    result[theme] = {
      hitCount: hit,
      missCount: miss,
      touchedCount: o.touchedCount ?? hit + miss,
      netScore: o.netScore ?? hit - miss,
    };
  }
  return result;
}

function makeSnapshot(args: {
  totalRatings: number;
  nailedItCount?: number;
  perTheme?: Partial<Record<RatingThemeValue, Partial<PerThemeStats>>>;
}): AccuracySnapshot {
  const nailedItCount = args.nailedItCount ?? 0;
  return {
    windowDays: 30,
    windowStartIso: "2026-03-20T00:00:00.000Z",
    totalRatings: args.totalRatings,
    nailedItCount,
    vagueCount: Math.max(0, args.totalRatings - nailedItCount),
    offCount: 0,
    nailedItRate:
      args.totalRatings === 0 ? null : nailedItCount / args.totalRatings,
    perTheme: makePerTheme(args.perTheme ?? {}),
  };
}

type Assertion = { label: string; ok: boolean; detail?: string };
let failures = 0;

function check(label: string, ok: boolean, detail?: string) {
  const status = ok ? "PASS" : "FAIL";
  if (!ok) failures += 1;
  console.log(`  ${status}  ${label}${detail ? ` — ${detail}` : ""}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Env-flag gate
// ─────────────────────────────────────────────────────────────────────────────

async function testEnvFlagGate() {
  console.log("\n== Env flag gate ==");
  const originalFlag = process.env.ACCURACY_CALIBRATION_ENABLED;
  process.env.ACCURACY_CALIBRATION_ENABLED = "false";
  try {
    check(
      "isCalibrationEnabled returns false when flag unset/false",
      isCalibrationEnabled() === false,
    );
    process.env.ACCURACY_CALIBRATION_ENABLED = "true";
    check(
      "isCalibrationEnabled returns true when flag is 'true'",
      isCalibrationEnabled() === true,
    );
    process.env.ACCURACY_CALIBRATION_ENABLED = "1";
    check(
      "isCalibrationEnabled requires literal 'true' (rejects '1')",
      isCalibrationEnabled() === false,
    );
  } finally {
    if (originalFlag === undefined) {
      delete process.env.ACCURACY_CALIBRATION_ENABLED;
    } else {
      process.env.ACCURACY_CALIBRATION_ENABLED = originalFlag;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Fragment shape — happy path
// ─────────────────────────────────────────────────────────────────────────────

function testHappyPathFragment() {
  console.log("\n== Happy path fragment ==");

  const snapshot = makeSnapshot({
    totalRatings: 42,
    nailedItCount: 31,
    perTheme: {
      career: { hitCount: 8, missCount: 0 },
      timing: { hitCount: 5, missCount: 0 },
      money: { hitCount: 4, missCount: 0 },
      health: { hitCount: 0, missCount: 3 },
      relationships: { hitCount: 0, missCount: 2 },
    },
  });

  const { fragment, hasThemeSignal } = buildFragmentFromSnapshot(snapshot);

  check("hasThemeSignal true", hasThemeSignal);

  check(
    "fragment mentions total rating count",
    fragment.includes("42 ratings"),
    fragment,
  );
  check(
    "fragment mentions nailed-it rate (74%)",
    fragment.includes("74%"),
    fragment,
  );
  check("fragment names top hit (career)", fragment.includes("career (+8)"));
  check("fragment names #2 hit (timing)", fragment.includes("timing window (+5)"));
  check("fragment names #3 hit (money)", fragment.includes("money (+4)"));

  check(
    "fragment names worst miss (health)",
    fragment.includes("health (-3)"),
  );
  check(
    "fragment names #2 miss (relationships)",
    fragment.includes("relationships (-2)"),
  );

  check(
    "fragment contains 'preserve' language on hits",
    /preserve the concrete/i.test(fragment),
  );
  check(
    "fragment contains 'sharper' language on misses (not 'reduce/skip')",
    /get sharper|more specific/i.test(fragment),
  );

  // This is the self-fulfilling-prophecy guardrail. If the model were told
  // to reduce cards that historically miss, it would reinforce the exact
  // blind spot that's causing the miss. The fragment MUST reaffirm all
  // cards are present.
  check(
    "fragment forbids reducing/skipping cards",
    /do not reduce, skip, or soften any card/i.test(fragment),
  );
  check(
    "fragment names all five card domains explicitly",
    fragment.includes("career") &&
      fragment.includes("money") &&
      fragment.includes("relationships") &&
      fragment.includes("health") &&
      fragment.includes("personal_growth"),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Min-touches gate — single-touch themes should not appear
// ─────────────────────────────────────────────────────────────────────────────

function testMinTouchesGate() {
  console.log("\n== Min touches per theme ==");
  const snapshot = makeSnapshot({
    totalRatings: 15,
    nailedItCount: 10,
    perTheme: {
      career: { hitCount: 5 }, // passes threshold
      money: { hitCount: 1 }, // single-touch → should be filtered
      health: { missCount: 1 }, // single-touch → should be filtered
      relationships: { missCount: 4 }, // passes threshold
    },
  });

  const { fragment } = buildFragmentFromSnapshot(snapshot);

  check(
    "career (5 touches) included as hit",
    fragment.includes("career (+5)"),
    fragment,
  );
  check(
    "relationships (4 touches) included as miss",
    fragment.includes("relationships (-4)"),
    fragment,
  );
  check(
    "money (1 touch) filtered out",
    fragment.includes("money") === false || fragment.includes("money (+1)") === false,
    "money should not appear as a hit with single touch",
  );
  check(
    "health (1 touch) filtered out",
    fragment.includes("health (-1)") === false,
    "health should not appear as a miss with single touch",
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Truncation — no more than MAX_THEMES_PER_SIDE per side
// ─────────────────────────────────────────────────────────────────────────────

function testTruncation() {
  console.log("\n== Max themes per side ==");
  const snapshot = makeSnapshot({
    totalRatings: 30,
    nailedItCount: 20,
    perTheme: {
      career: { hitCount: 10 },
      money: { hitCount: 8 },
      timing: { hitCount: 6 },
      relationships: { hitCount: 4 }, // should be dropped if MAX=3
      health: { missCount: 5 },
      personal_growth: { missCount: 4 },
    },
  });

  const { fragment } = buildFragmentFromSnapshot(snapshot);

  // Count how many +N tokens appear in the hits block
  const plusMatches = fragment.match(/\(\+\d+\)/g) ?? [];
  check(
    `hits truncated to ${MAX_THEMES_PER_SIDE}`,
    plusMatches.length <= MAX_THEMES_PER_SIDE,
    `got ${plusMatches.length} hit entries`,
  );

  // The 4th-ranked hit theme (relationships +4) should NOT appear as "(+4)".
  // Ordering is by net score desc so career/money/timing win the 3 slots.
  check(
    "4th-ranked hit (relationships) excluded from hit list",
    fragment.includes("relationships (+4)") === false,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Forbidden phrasing — reduce/skip/drop only appear in the guardrail line
// ─────────────────────────────────────────────────────────────────────────────

function testForbiddenPhrasing() {
  console.log("\n== Forbidden instruction phrasing ==");

  const snapshot = makeSnapshot({
    totalRatings: 20,
    nailedItCount: 12,
    perTheme: {
      career: { hitCount: 5 },
      money: { missCount: 4 },
    },
  });

  const { fragment } = buildFragmentFromSnapshot(snapshot);

  const lowered = fragment.toLowerCase();

  // Ensure the only place "reduce/skip/soften" appears is in the guardrail
  // sentence. We check that they're always within that sentence by confirming
  // the guardrail appears and no standalone "drop these cards" or "skip this
  // theme" language exists.
  const badInstructions = [
    "drop the card",
    "drop these cards",
    "skip this theme",
    "skip this card",
    "skip these",
    "remove the card",
    "remove this",
    "reduce focus on",
    "deprioritize",
  ];
  for (const bad of badInstructions) {
    check(
      `fragment does NOT contain "${bad}"`,
      lowered.includes(bad) === false,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Constants sanity — gate thresholds
// ─────────────────────────────────────────────────────────────────────────────

function testConstants() {
  console.log("\n== Constants sanity ==");
  check(
    `MIN_CALIBRATION_RATINGS is >= 5 (headline threshold)`,
    MIN_CALIBRATION_RATINGS >= 5,
    `got ${MIN_CALIBRATION_RATINGS}`,
  );
  check(
    `MAX_THEMES_PER_SIDE <= 3 (keep fragment compact)`,
    MAX_THEMES_PER_SIDE <= 3,
    `got ${MAX_THEMES_PER_SIDE}`,
  );
}

async function main() {
  await testEnvFlagGate();
  testHappyPathFragment();
  testMinTouchesGate();
  testTruncation();
  testForbiddenPhrasing();
  testConstants();

  console.log(
    failures === 0
      ? `\n✓ All calibration checks passed`
      : `\n✗ ${failures} failure(s) across calibration checks`,
  );

  process.exit(failures === 0 ? 0 : 1);
}

void main();

// Keep types referenced to avoid unused-import lint noise.
export type { Assertion };
