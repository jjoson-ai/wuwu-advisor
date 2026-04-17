import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseCsv, toCsv } from "@/scripts/bakeoff/csv";
import type {
  BakeoffCandidateResult,
  JudgmentRow,
  RankedVariantRow,
} from "@/scripts/bakeoff/types";

const projectRoot = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));

const ACCEPTANCE_THRESHOLDS = {
  totalScore: 78,
  premiumFeel: 14,
  usefulness: 18,
  consistency: 12,
} as const;

function parseArgs() {
  const values = new Map<string, string>();

  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith("--") === false) {
      continue;
    }

    const [key, rawValue] = arg.slice(2).split("=", 2);
    values.set(key, rawValue ?? "true");
  }

  const runId = values.get("run-id");

  if (runId == null || runId.trim() === "") {
    throw new Error("Missing --run-id=<value>.");
  }

  return {
    runId,
  };
}

async function ensureDir(directoryPath: string) {
  await fs.mkdir(directoryPath, { recursive: true });
}

async function readJsonFile<T>(filePath: string) {
  return JSON.parse(await fs.readFile(filePath, "utf8")) as T;
}

function parseNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseRedFlags(value: string) {
  return value
    .split(/[|,;]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function average(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2));
}

function averageNullable(values: Array<number | null>) {
  const present = values.filter((value): value is number => value != null);
  return present.length === 0 ? null : Number((present.reduce((sum, value) => sum + value, 0) / present.length).toFixed(6));
}

function isAccepted(row: RankedVariantRow) {
  return (
    row.average_total_score >= ACCEPTANCE_THRESHOLDS.totalScore &&
    row.average_premium_feel >= ACCEPTANCE_THRESHOLDS.premiumFeel &&
    row.average_usefulness_actionability >= ACCEPTANCE_THRESHOLDS.usefulness &&
    row.average_consistency_schema_quality >= ACCEPTANCE_THRESHOLDS.consistency &&
    row.schema_break_rate === 0 &&
    row.internal_leakage_rate === 0
  );
}

function rankRows(rows: RankedVariantRow[]) {
  return [...rows].sort((left, right) => {
    if (right.average_total_score !== left.average_total_score) {
      return right.average_total_score - left.average_total_score;
    }

    if ((left.mean_estimated_cost_usd ?? Infinity) !== (right.mean_estimated_cost_usd ?? Infinity)) {
      return (left.mean_estimated_cost_usd ?? Infinity) - (right.mean_estimated_cost_usd ?? Infinity);
    }

    return (left.mean_latency_ms ?? Infinity) - (right.mean_latency_ms ?? Infinity);
  });
}

async function main() {
  const { runId } = parseArgs();
  const outputRoot = path.join(projectRoot, "bakeoff", "outputs", runId);
  const judgmentsRoot = path.join(projectRoot, "bakeoff", "judgments", runId);
  const reportsRoot = path.join(projectRoot, "bakeoff", "reports", runId);

  const results = await readJsonFile<BakeoffCandidateResult[]>(
    path.join(outputRoot, "results.json"),
  );
  const blindMap = parseCsv(
    await fs.readFile(path.join(outputRoot, "blind-map.csv"), "utf8"),
  );

  const judgmentFiles = (await fs.readdir(judgmentsRoot)).filter((file) => file.endsWith(".csv"));

  if (judgmentFiles.length === 0) {
    throw new Error(`No judgment CSV files found in ${judgmentsRoot}.`);
  }

  const judgmentRows = (
    await Promise.all(
      judgmentFiles.map(async (file) =>
        parseCsv(await fs.readFile(path.join(judgmentsRoot, file), "utf8")),
      ),
    )
  ).flat() as Array<Record<string, string>>;

  const parsedJudgments: JudgmentRow[] = judgmentRows.map((row) => ({
    judge_type: row.judge_type as JudgmentRow["judge_type"],
    run_id: row.run_id,
    surface: row.surface as JudgmentRow["surface"],
    tier: row.tier as JudgmentRow["tier"],
    case_id: row.case_id,
    blind_candidate_id: row.blind_candidate_id,
    usefulness_actionability: parseNumber(row.usefulness_actionability),
    premium_feel: parseNumber(row.premium_feel),
    specificity: parseNumber(row.specificity),
    consistency_schema_quality: parseNumber(row.consistency_schema_quality),
    latency_speed: parseNumber(row.latency_speed),
    cost: parseNumber(row.cost),
    red_flags: row.red_flags ?? "",
    comments: row.comments ?? "",
  }));

  const mergedRows = parsedJudgments
    .map((judgment) => {
      const blindEntry = blindMap.find(
        (entry) =>
          entry.run_id === judgment.run_id &&
          entry.surface === judgment.surface &&
          entry.tier === judgment.tier &&
          entry.case_id === judgment.case_id &&
          entry.blind_candidate_id === judgment.blind_candidate_id,
      );

      if (blindEntry == null) {
        return null;
      }

      const result = results.find(
        (entry) =>
          entry.run_id === judgment.run_id &&
          entry.surface === judgment.surface &&
          entry.tier === judgment.tier &&
          entry.case_id === judgment.case_id &&
          entry.variant_id === blindEntry.variant_id,
      );

      if (result == null) {
        return null;
      }

      const totalScore =
        judgment.usefulness_actionability +
        judgment.premium_feel +
        judgment.specificity +
        judgment.consistency_schema_quality +
        judgment.latency_speed +
        judgment.cost;

      return {
        ...judgment,
        variant_id: result.variant_id,
        variant_label: result.variant_label,
        total_score: totalScore,
        estimated_cost_usd: result.total_estimated_cost_usd,
        latency_ms: result.total_latency_ms,
        final_model: result.final_model,
        red_flag_list: parseRedFlags(judgment.red_flags),
      };
    })
    .filter(
      (
        value,
      ): value is NonNullable<typeof value> =>
        value !== null,
    );

  const aggregateRanking = (scopeLabel: string, scopeFilter: (row: typeof mergedRows[number]) => boolean) => {
    const scopedRows = mergedRows.filter(scopeFilter);
    const byVariant = new Map<string, typeof scopedRows>();

    for (const row of scopedRows) {
      const existing = byVariant.get(row.variant_id) ?? [];
      byVariant.set(row.variant_id, [...existing, row]);
    }

    return rankRows(
      Array.from(byVariant.entries()).map(([variantId, rows]) => ({
        scope_label: scopeLabel,
        variant_id: variantId as RankedVariantRow["variant_id"],
        variant_label: rows[0]?.variant_label ?? variantId,
        review_count: rows.length,
        average_total_score: average(rows.map((row) => row.total_score)),
        average_usefulness_actionability: average(rows.map((row) => row.usefulness_actionability)),
        average_premium_feel: average(rows.map((row) => row.premium_feel)),
        average_specificity: average(rows.map((row) => row.specificity)),
        average_consistency_schema_quality: average(rows.map((row) => row.consistency_schema_quality)),
        average_latency_speed: average(rows.map((row) => row.latency_speed)),
        average_cost: average(rows.map((row) => row.cost)),
        mean_estimated_cost_usd: averageNullable(rows.map((row) => row.estimated_cost_usd)),
        mean_latency_ms: averageNullable(rows.map((row) => row.latency_ms)),
        red_flag_rate: average(rows.map((row) => (row.red_flag_list.length > 0 ? 1 : 0))),
        generic_ai_rate: average(rows.map((row) => (row.red_flag_list.includes("generic_ai_coaching") ? 1 : 0))),
        mystical_cliche_rate: average(rows.map((row) => (row.red_flag_list.includes("mystical_cliche") ? 1 : 0))),
        schema_break_rate: average(rows.map((row) => (row.red_flag_list.includes("schema_drift") || row.red_flag_list.includes("malformed_structure") ? 1 : 0))),
        internal_leakage_rate: average(rows.map((row) => (row.red_flag_list.includes("internal_leakage") ? 1 : 0))),
      })),
    );
  };

  const surfaceScopes = Array.from(new Set(mergedRows.map((row) => row.surface)));
  const surfaceRankings = surfaceScopes.flatMap((surface) =>
    aggregateRanking(surface, (row) => row.surface === surface),
  );
  const tierScopes = Array.from(new Set(mergedRows.map((row) => row.tier)));
  const tierRankings = tierScopes.flatMap((tier) =>
    aggregateRanking(tier, (row) => row.tier === tier),
  );

  const matrixScopes = Array.from(
    new Set(mergedRows.map((row) => `${row.surface}:${row.tier}`)),
  ).map((key) => {
    const [surface, tier] = key.split(":");
    return { surface, tier };
  });

  const routingMatrix = matrixScopes.map(({ surface, tier }) => {
    const ranked = aggregateRanking(`${surface}:${tier}`, (row) => row.surface === surface && row.tier === tier);
    const acceptable = ranked.filter(isAccepted).sort((left, right) => {
      if ((left.mean_estimated_cost_usd ?? Infinity) !== (right.mean_estimated_cost_usd ?? Infinity)) {
        return (left.mean_estimated_cost_usd ?? Infinity) - (right.mean_estimated_cost_usd ?? Infinity);
      }

      return right.average_total_score - left.average_total_score;
    });
    const chosen = acceptable[0] ?? ranked[0] ?? null;
    const fallback =
      acceptable.filter((row) => row.variant_id !== chosen?.variant_id)[0] ??
      ranked.find((row) => row.variant_id !== chosen?.variant_id) ??
      null;

    return {
      surface,
      tier,
      primary_variant_id: chosen?.variant_id ?? "",
      primary_variant_label: chosen?.variant_label ?? "",
      primary_average_total_score: chosen?.average_total_score ?? "",
      primary_mean_estimated_cost_usd: chosen?.mean_estimated_cost_usd ?? "",
      fallback_variant_id: fallback?.variant_id ?? "",
      fallback_variant_label: fallback?.variant_label ?? "",
      fallback_average_total_score: fallback?.average_total_score ?? "",
      acceptance_status: chosen == null ? "no_data" : acceptable.length === 0 ? "manual_review_required" : "accepted",
    };
  });

  const noGoMiniRows = routingMatrix.filter((row) => {
    const ranked = aggregateRanking(`${row.surface}:${row.tier}`, (entry) => entry.surface === row.surface && entry.tier === row.tier);
    return ranked.some(
      (item) =>
        item.variant_id === "variant-c" &&
        isAccepted(item) === false,
    );
  });

  await ensureDir(reportsRoot);
  await writeFile(
    path.join(reportsRoot, "surface-ranking.csv"),
    toCsv(surfaceRankings.map((row) => ({
      scope_label: row.scope_label,
      variant_id: row.variant_id,
      variant_label: row.variant_label,
      review_count: row.review_count,
      average_total_score: row.average_total_score,
      average_usefulness_actionability: row.average_usefulness_actionability,
      average_premium_feel: row.average_premium_feel,
      average_specificity: row.average_specificity,
      average_consistency_schema_quality: row.average_consistency_schema_quality,
      average_latency_speed: row.average_latency_speed,
      average_cost: row.average_cost,
      mean_estimated_cost_usd: row.mean_estimated_cost_usd,
      mean_latency_ms: row.mean_latency_ms,
      red_flag_rate: row.red_flag_rate,
      generic_ai_rate: row.generic_ai_rate,
      mystical_cliche_rate: row.mystical_cliche_rate,
      schema_break_rate: row.schema_break_rate,
      internal_leakage_rate: row.internal_leakage_rate,
    }))),
  );
  await writeFile(
    path.join(reportsRoot, "tier-ranking.csv"),
    toCsv(tierRankings.map((row) => ({
      scope_label: row.scope_label,
      variant_id: row.variant_id,
      variant_label: row.variant_label,
      review_count: row.review_count,
      average_total_score: row.average_total_score,
      average_usefulness_actionability: row.average_usefulness_actionability,
      average_premium_feel: row.average_premium_feel,
      average_specificity: row.average_specificity,
      average_consistency_schema_quality: row.average_consistency_schema_quality,
      average_latency_speed: row.average_latency_speed,
      average_cost: row.average_cost,
      mean_estimated_cost_usd: row.mean_estimated_cost_usd,
      mean_latency_ms: row.mean_latency_ms,
      red_flag_rate: row.red_flag_rate,
      generic_ai_rate: row.generic_ai_rate,
      mystical_cliche_rate: row.mystical_cliche_rate,
      schema_break_rate: row.schema_break_rate,
      internal_leakage_rate: row.internal_leakage_rate,
    }))),
  );
  await writeFile(
    path.join(reportsRoot, "recommended-launch-routing.csv"),
    toCsv(routingMatrix),
  );
  await writeFile(
    path.join(reportsRoot, "no-go-mini-models.md"),
    `# No-go list for mini routing\n\n${
      noGoMiniRows.length === 0
        ? "No surface/tier scope failed the current acceptance thresholds for Variant C."
        : noGoMiniRows
            .map(
              (row) =>
                `- ${row.surface} / ${row.tier}: Variant C did not clear the acceptance thresholds, so mini should not be the launch default here.`,
            )
            .join("\n")
    }\n`,
  );

  const summary = [
    `# Bake-off Summary`,
    ``,
    `- Run ID: ${runId}`,
    `- Judgments loaded: ${mergedRows.length}`,
    `- Acceptance thresholds: total >= ${ACCEPTANCE_THRESHOLDS.totalScore}, premium feel >= ${ACCEPTANCE_THRESHOLDS.premiumFeel}, usefulness >= ${ACCEPTANCE_THRESHOLDS.usefulness}, consistency >= ${ACCEPTANCE_THRESHOLDS.consistency}, zero schema/internal-leak failures.`,
    ``,
    `## Per-surface leaders`,
    ...surfaceScopes.map((surface) => {
      const leader = aggregateRanking(surface, (row) => row.surface === surface)[0];
      return leader == null
        ? `- ${surface}: no judgments`
        : `- ${surface}: ${leader.variant_label} (avg ${leader.average_total_score}, cost ${leader.mean_estimated_cost_usd ?? "n/a"} USD, latency ${leader.mean_latency_ms ?? "n/a"} ms)`;
    }),
    ``,
    `## Per-tier leaders`,
    ...tierScopes.map((tier) => {
      const leader = aggregateRanking(tier, (row) => row.tier === tier)[0];
      return leader == null
        ? `- ${tier}: no judgments`
        : `- ${tier}: ${leader.variant_label} (avg ${leader.average_total_score}, cost ${leader.mean_estimated_cost_usd ?? "n/a"} USD, latency ${leader.mean_latency_ms ?? "n/a"} ms)`;
    }),
    ``,
    `## Recommended launch routing matrix`,
    ...routingMatrix.map(
      (row) =>
        `- ${row.surface} / ${row.tier}: primary ${row.primary_variant_label || "n/a"}; fallback ${row.fallback_variant_label || "n/a"}; status ${row.acceptance_status}.`,
    ),
    ``,
    `## Mini-model no-go list`,
    ...(noGoMiniRows.length === 0
      ? ["- No mini no-go scopes from the current judgments."]
      : noGoMiniRows.map(
          (row) =>
            `- ${row.surface} / ${row.tier}: keep Variant C out of the launch default set here.`,
        )),
    ``,
    `## Fallback rules`,
    `- Use the per-surface/tier primary variant from recommended-launch-routing.csv as the default.`,
    `- Use the per-surface/tier fallback variant from recommended-launch-routing.csv when the primary variant hits malformed structure, schema drift, or internal leakage.`,
    `- If neither primary nor fallback cleared acceptance, keep the current production control in place until more judgments are collected.`,
  ].join("\n");

  await writeFile(path.join(reportsRoot, "summary.md"), `${summary}\n`);

  console.log(`Bake-off report generated: ${reportsRoot}`);
}

async function writeFile(filePath: string, value: string) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, value, "utf8");
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
