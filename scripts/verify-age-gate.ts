/**
 * Offline smoke test for domain/safety/age-gate.
 *
 * Run with: npx tsx scripts/verify-age-gate.ts
 *
 * Covers the edge cases that tend to cause off-by-one bugs in DOB math:
 *
 *   - Birthday today / the day before / the day after
 *   - Leap-year DOB on a non-leap cutoff year (Feb 29 → Mar 1 convention)
 *   - Invalid calendar dates (Feb 30, Apr 31) must be rejected
 *   - Future-dated DOBs must be rejected
 *   - Out-of-format inputs (slashes, timestamps, blanks)
 *   - Timezone sensitivity — our math is UTC-normalised, so we pin `now`
 *     to specific UTC timestamps and check both boundary sides.
 *
 * Pure computation, no API calls. Safe for CI.
 */

import {
  AGE_GATE_COPPA_AGE,
  AGE_GATE_MINIMUM_AGE,
  computeAgeInYears,
  isAtLeastAge,
} from "../domain/safety/age-gate";

type IsAtLeastCase = {
  label: string;
  dob: string;
  now: Date;
  minimumAge: number;
  expect: boolean;
};

type ComputeAgeCase = {
  label: string;
  dob: string;
  now: Date;
  expect: number | null;
};

const utc = (y: number, m: number, d: number, hh = 12, mm = 0): Date =>
  new Date(Date.UTC(y, m - 1, d, hh, mm));

const IS_AT_LEAST_CASES: ReadonlyArray<IsAtLeastCase> = [
  // --- Birthday-today boundary (18+ minimum) ---
  {
    label: "18th birthday today — noon UTC — is adult",
    dob: "2008-04-18",
    now: utc(2026, 4, 18, 12),
    minimumAge: AGE_GATE_MINIMUM_AGE,
    expect: true,
  },
  {
    label: "18th birthday today — 00:00 UTC — is adult",
    dob: "2008-04-18",
    now: utc(2026, 4, 18, 0),
    minimumAge: AGE_GATE_MINIMUM_AGE,
    expect: true,
  },
  {
    label: "day before 18th birthday — NOT adult",
    dob: "2008-04-19",
    now: utc(2026, 4, 18, 23, 59),
    minimumAge: AGE_GATE_MINIMUM_AGE,
    expect: false,
  },
  {
    label: "day after 18th birthday — adult",
    dob: "2008-04-17",
    now: utc(2026, 4, 18, 0),
    minimumAge: AGE_GATE_MINIMUM_AGE,
    expect: true,
  },

  // --- Clearly under / over ---
  {
    label: "17y 364d — NOT adult",
    dob: "2008-04-19",
    now: utc(2026, 4, 18, 0),
    minimumAge: AGE_GATE_MINIMUM_AGE,
    expect: false,
  },
  {
    label: "12-year-old — NOT adult, under COPPA",
    dob: "2013-06-01",
    now: utc(2026, 4, 18, 0),
    minimumAge: AGE_GATE_COPPA_AGE,
    expect: false,
  },
  {
    label: "40-year-old — adult",
    dob: "1986-01-01",
    now: utc(2026, 4, 18, 0),
    minimumAge: AGE_GATE_MINIMUM_AGE,
    expect: true,
  },

  // --- Leap year ---
  {
    label: "born 2008-02-29, now 2026-02-28 — NOT yet 18 (birthday rolls to Mar 1)",
    dob: "2008-02-29",
    now: utc(2026, 2, 28, 23, 59),
    minimumAge: AGE_GATE_MINIMUM_AGE,
    expect: false,
  },
  {
    label: "born 2008-02-29, now 2026-03-01 — is 18 (normalized to Mar 1)",
    dob: "2008-02-29",
    now: utc(2026, 3, 1, 0),
    minimumAge: AGE_GATE_MINIMUM_AGE,
    expect: true,
  },
  {
    label: "born 2008-02-29, now 2028-02-29 (leap) — is 20",
    dob: "2008-02-29",
    now: utc(2028, 2, 29, 0),
    minimumAge: AGE_GATE_MINIMUM_AGE,
    expect: true,
  },

  // --- Format / calendar rejection ---
  {
    label: "empty string — false",
    dob: "",
    now: utc(2026, 4, 18, 0),
    minimumAge: AGE_GATE_MINIMUM_AGE,
    expect: false,
  },
  {
    label: "slashed format — false",
    dob: "2000/01/01",
    now: utc(2026, 4, 18, 0),
    minimumAge: AGE_GATE_MINIMUM_AGE,
    expect: false,
  },
  {
    label: "ISO timestamp — false (we only accept YYYY-MM-DD)",
    dob: "2000-01-01T00:00:00Z",
    now: utc(2026, 4, 18, 0),
    minimumAge: AGE_GATE_MINIMUM_AGE,
    expect: false,
  },
  {
    label: "Feb 30 — false (invalid calendar date)",
    dob: "2000-02-30",
    now: utc(2026, 4, 18, 0),
    minimumAge: AGE_GATE_MINIMUM_AGE,
    expect: false,
  },
  {
    label: "Apr 31 — false (invalid calendar date)",
    dob: "2000-04-31",
    now: utc(2026, 4, 18, 0),
    minimumAge: AGE_GATE_MINIMUM_AGE,
    expect: false,
  },
  {
    label: "future-dated DOB — false",
    dob: "2030-01-01",
    now: utc(2026, 4, 18, 0),
    minimumAge: AGE_GATE_MINIMUM_AGE,
    expect: false,
  },
  {
    label: "1899 — false (below plausible range)",
    dob: "1899-12-31",
    now: utc(2026, 4, 18, 0),
    minimumAge: AGE_GATE_MINIMUM_AGE,
    expect: false,
  },
  {
    label: "month 13 — false",
    dob: "2000-13-01",
    now: utc(2026, 4, 18, 0),
    minimumAge: AGE_GATE_MINIMUM_AGE,
    expect: false,
  },
];

const COMPUTE_AGE_CASES: ReadonlyArray<ComputeAgeCase> = [
  {
    label: "exactly 18 on birthday",
    dob: "2008-04-18",
    now: utc(2026, 4, 18, 0),
    expect: 18,
  },
  {
    label: "17 the day before 18th birthday",
    dob: "2008-04-19",
    now: utc(2026, 4, 18, 23),
    expect: 17,
  },
  {
    label: "12-year-old under COPPA",
    dob: "2013-06-01",
    now: utc(2026, 4, 18, 0),
    expect: 12,
  },
  {
    label: "leap-year born, pre-Mar-1 in non-leap year",
    dob: "2008-02-29",
    now: utc(2026, 2, 28, 0),
    expect: 17,
  },
  {
    label: "leap-year born, Mar 1 in non-leap year",
    dob: "2008-02-29",
    now: utc(2026, 3, 1, 0),
    expect: 18,
  },
  {
    label: "invalid format returns null",
    dob: "not-a-date",
    now: utc(2026, 4, 18, 0),
    expect: null,
  },
  {
    label: "future DOB returns null",
    dob: "2030-01-01",
    now: utc(2026, 4, 18, 0),
    expect: null,
  },
  {
    label: "invalid calendar date returns null",
    dob: "2000-02-30",
    now: utc(2026, 4, 18, 0),
    expect: null,
  },
];

function runIsAtLeast(): number {
  let failures = 0;
  for (const c of IS_AT_LEAST_CASES) {
    const actual = isAtLeastAge(c.dob, c.minimumAge, c.now);
    if (actual !== c.expect) {
      failures += 1;
      console.error(
        `[isAtLeastAge FAIL] ${c.label} — dob=${c.dob}, minAge=${c.minimumAge}, expect=${c.expect}, got=${actual}`,
      );
    }
  }
  return failures;
}

function runComputeAge(): number {
  let failures = 0;
  for (const c of COMPUTE_AGE_CASES) {
    const actual = computeAgeInYears(c.dob, c.now);
    if (actual !== c.expect) {
      failures += 1;
      console.error(
        `[computeAgeInYears FAIL] ${c.label} — dob=${c.dob}, expect=${c.expect}, got=${actual}`,
      );
    }
  }
  return failures;
}

function runConstantChecks(): number {
  let failures = 0;
  if (AGE_GATE_MINIMUM_AGE !== 18) {
    console.error(
      `[constants FAIL] AGE_GATE_MINIMUM_AGE expected 18, got ${AGE_GATE_MINIMUM_AGE}`,
    );
    failures += 1;
  }
  if (AGE_GATE_COPPA_AGE !== 13) {
    console.error(
      `[constants FAIL] AGE_GATE_COPPA_AGE expected 13, got ${AGE_GATE_COPPA_AGE}`,
    );
    failures += 1;
  }
  return failures;
}

function main(): void {
  const atLeastFailures = runIsAtLeast();
  const computeFailures = runComputeAge();
  const constantFailures = runConstantChecks();
  const total = atLeastFailures + computeFailures + constantFailures;
  const ran =
    IS_AT_LEAST_CASES.length + COMPUTE_AGE_CASES.length + 2;

  if (total === 0) {
    console.log(`✓ all ${ran} age-gate smoke checks passed`);
    process.exit(0);
  }
  console.error(`\n✗ ${total}/${ran} age-gate smoke checks failed`);
  process.exit(1);
}

main();
