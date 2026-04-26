import type { AccuracySnapshot } from "@/domain/accuracy/accuracy.service";
import type { RatingThemeValue } from "@/domain/feedback/feedback.types";
import { RATING_THEME_OPTIONS } from "@/domain/feedback/feedback.types";

/**
 * 5.2 Phase C — pure helpers for calibration fragment building.
 *
 * Split out from calibration.service.ts so the verification script
 * (scripts/verify-calibration.ts) can test the fragment shape without
 * importing server-only Supabase code. `calibration.service.ts` re-exports
 * these for the runtime path.
 */

export const MIN_CALIBRATION_RATINGS = 10;

// Need at least this many hit-or-miss touches for a theme before we call it a
// pattern. A single hit or miss is anecdote, not signal.
export const MIN_TOUCHES_PER_THEME = 2;

export const MAX_THEMES_PER_SIDE = 3;

const THEME_LABELS: Record<RatingThemeValue, string> = {
  career: "career",
  money: "money",
  relationships: "relationships",
  health: "health",
  personal_growth: "personal growth",
  timing: "timing window",
};

function formatPct(rate: number | null): string {
  if (rate === null) return "—";
  return `${Math.round(rate * 100)}%`;
}

// Pure ranking helper — avoids a server-only import chain.
type PerThemeStats = AccuracySnapshot["perTheme"][RatingThemeValue];

function rankThemes(
  perTheme: Record<RatingThemeValue, PerThemeStats>,
): Array<{ theme: RatingThemeValue; stats: PerThemeStats }> {
  return RATING_THEME_OPTIONS.map((theme) => ({
    theme,
    stats: perTheme[theme],
  })).sort((a, b) => {
    if (b.stats.netScore !== a.stats.netScore) {
      return b.stats.netScore - a.stats.netScore;
    }
    if (b.stats.touchedCount !== a.stats.touchedCount) {
      return b.stats.touchedCount - a.stats.touchedCount;
    }
    return (
      RATING_THEME_OPTIONS.indexOf(a.theme) -
      RATING_THEME_OPTIONS.indexOf(b.theme)
    );
  });
}

export function buildFragmentFromSnapshot(
  snapshot: AccuracySnapshot,
): { fragment: string; hasThemeSignal: boolean } {
  const ranked = rankThemes(snapshot.perTheme);

  const hits = ranked
    .filter(
      (entry) =>
        entry.stats.netScore > 0 &&
        entry.stats.touchedCount >= MIN_TOUCHES_PER_THEME,
    )
    .slice(0, MAX_THEMES_PER_SIDE);

  // rankThemes returns descending by net score, so reversed gives us the
  // worst misses first.
  const misses = [...ranked]
    .reverse()
    .filter(
      (entry) =>
        entry.stats.netScore < 0 &&
        entry.stats.touchedCount >= MIN_TOUCHES_PER_THEME,
    )
    .slice(0, MAX_THEMES_PER_SIDE);

  const hasThemeSignal = hits.length > 0 || misses.length > 0;

  const lines: string[] = [];
  lines.push(
    `Per-user calibration signal (last 30 days, ${snapshot.totalRatings} ratings, ${formatPct(snapshot.nailedItRate)} 🎯 "nailed it" rate from this user).`,
  );

  if (hits.length > 0) {
    const formatted = hits
      .map(
        (entry) => `${THEME_LABELS[entry.theme]} (+${entry.stats.netScore})`,
      )
      .join(", ");
    lines.push(
      `Themes that consistently land for this user: ${formatted}. Preserve the concrete, specific framing on these cards.`,
    );
  }

  if (misses.length > 0) {
    const formatted = misses
      .map(
        (entry) => `${THEME_LABELS[entry.theme]} (${entry.stats.netScore})`,
      )
      .join(", ");
    lines.push(
      `Themes that consistently miss for this user: ${formatted}. On these cards, do not get vaguer or more cautious — get sharper. Name concrete behaviors, named contexts, or specific tradeoffs rather than broad qualities. The briefing missed because it was too generic, not because the theme is irrelevant.`,
    );
  }

  lines.push(
    "Do not reduce, skip, or soften any card. All five card domains (career, money, relationships, health, personal_growth) must still be present with equal weight — calibration tunes the tone and specificity, not which cards appear.",
  );

  return { fragment: lines.join(" "), hasThemeSignal };
}

export function isCalibrationEnabled(): boolean {
  return process.env.ACCURACY_CALIBRATION_ENABLED === "true";
}
