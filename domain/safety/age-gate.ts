/**
 * Age-gate math and policy constants.
 *
 * Wuwu Advisor is an adults-only service. Two legal regimes drive the
 * cutoff:
 *
 *   1. COPPA (US federal) — flat-forbids collecting data from users under
 *      13 without verifiable parental consent. We do not pursue parental
 *      consent, so we flat-block under-13.
 *
 *   2. California SB 243 (Companion Chatbot Act, eff. 2026) — imposes
 *      additional engineering obligations for minors (AI-disclosure
 *      cadence, content restrictions, mandatory break reminders) in the
 *      13-17 band. We sidestep those obligations entirely by admitting
 *      only users 18 and older.
 *
 * Secondary rationale: Wuwu gives advice on relationships, finances, and
 * major life decisions. The 18+ threshold aligns with contract-law
 * majority in almost every US state, simplifies the defensive story
 * against "AI advised a minor" lawsuits, and matches the roadmap's
 * preferred framing ("18+ is cleaner given financial/relationship
 * scope").
 *
 * App Store rating is 17+ (Apple's maximum). In-app gate is stricter
 * (18+). This mismatch is intentional and is a documented pattern for
 * apps that want to be stricter than their storefront rating.
 */

export const AGE_GATE_MINIMUM_AGE = 18;
export const AGE_GATE_COPPA_AGE = 13;

/**
 * Accepts an ISO-8601 date string (YYYY-MM-DD) as produced by
 * `<input type="date">` and returns true iff the user is at least
 * `minimumAge` years old as of `now`.
 *
 * Compared in UTC to avoid ambiguity at midnight boundaries. This
 * produces a consistent, documentable decision — marginal users on the
 * wrong side of a timezone boundary may need to retry a few hours later,
 * which is acceptable for a compliance gate.
 *
 * Leap-year handling: someone born 2008-02-29 has their 18th birthday
 * computed as 2026-02-29, which JavaScript normalizes to 2026-03-01
 * (since 2026 is not a leap year). This matches the "day-after-Feb-28"
 * convention used by most jurisdictions.
 *
 * Invalid input (non-parseable, future dates, absurdly old dates) returns
 * `false` — we refuse to guess for the user's benefit.
 */
export function isAtLeastAge(
  dobISO: string,
  minimumAge: number,
  now: Date = new Date(),
): boolean {
  const parsed = parseDobStrict(dobISO, now);
  if (parsed === null) return false;

  const { year, month, day } = parsed;
  const cutoffMs = Date.UTC(year + minimumAge, month - 1, day);
  return now.getTime() >= cutoffMs;
}

/**
 * Computes age in completed years as of `now`. Returns `null` for
 * un-parseable or out-of-range input. Month/day boundaries follow the
 * same UTC convention as `isAtLeastAge`.
 *
 * Primarily useful for defense-in-depth logging (e.g., "onboarding DOB
 * implies age 12, rejecting"), not for the primary gate decision —
 * prefer `isAtLeastAge` when you only need a threshold answer.
 */
export function computeAgeInYears(
  dobISO: string,
  now: Date = new Date(),
): number | null {
  const parsed = parseDobStrict(dobISO, now);
  if (parsed === null) return null;

  const { year, month, day } = parsed;
  const nowYear = now.getUTCFullYear();
  const nowMonth = now.getUTCMonth() + 1;
  const nowDay = now.getUTCDate();

  let age = nowYear - year;
  if (nowMonth < month || (nowMonth === month && nowDay < day)) {
    age -= 1;
  }
  return age;
}

type ParsedDob = { year: number; month: number; day: number };

function parseDobStrict(dobISO: string, now: Date): ParsedDob | null {
  if (typeof dobISO !== "string") return null;

  // Must match the exact YYYY-MM-DD format produced by <input type="date">.
  // We refuse timestamps, slashed dates, or locale-formatted variants so
  // the client can't slip a broader parse past us.
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dobISO);
  if (match === null) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (year < 1900 || year > now.getUTCFullYear()) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;

  // Validate the calendar: new Date(Date.UTC(...)) silently rolls over
  // (e.g., Feb 30 becomes Mar 2). Round-trip check to reject invalid
  // calendar dates.
  const roundTrip = new Date(Date.UTC(year, month - 1, day));
  if (
    roundTrip.getUTCFullYear() !== year ||
    roundTrip.getUTCMonth() + 1 !== month ||
    roundTrip.getUTCDate() !== day
  ) {
    return null;
  }

  // Reject future-dated DOBs.
  if (roundTrip.getTime() > now.getTime()) return null;

  return { year, month, day };
}
