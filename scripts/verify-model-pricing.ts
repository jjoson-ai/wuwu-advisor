/**
 * Verifies that every model ID referenced by the runtime code has a
 * matching entry in bakeoff/config/model-pricing.json. Without this
 * check, a model rename/upgrade silently breaks cost telemetry.
 *
 * Run via: npm run verify:model-pricing
 *
 * Exits 0 on success, 1 on any missing pricing entry. Designed for CI.
 */
import {
  HAIKU_MODEL,
  SONNET_MODEL,
  OPUS_MODEL,
} from "@/lib/model-routing";
import modelPricing from "@/bakeoff/config/model-pricing.json";

const REFERENCED_MODELS: Array<{ name: string; id: string }> = [
  { name: "HAIKU_MODEL", id: HAIKU_MODEL },
  { name: "SONNET_MODEL", id: SONNET_MODEL },
  { name: "OPUS_MODEL", id: OPUS_MODEL },
];

function main() {
  const pricingTable = (modelPricing as { models?: Record<string, unknown> })
    .models;

  if (pricingTable == null) {
    console.error(
      "[verify-model-pricing] bakeoff/config/model-pricing.json has no top-level 'models' object.",
    );
    process.exit(1);
  }

  const missing: Array<{ name: string; id: string }> = [];
  for (const model of REFERENCED_MODELS) {
    if (!(model.id in pricingTable)) {
      missing.push(model);
    }
  }

  if (missing.length > 0) {
    console.error("[verify-model-pricing] Missing pricing entries:");
    for (const m of missing) {
      console.error(
        `  - ${m.name} = "${m.id}" — not found in model-pricing.json`,
      );
    }
    console.error(
      "\nFix: add the missing model(s) to bakeoff/config/model-pricing.json with input/output per-1M USD rates from https://www.anthropic.com/pricing.",
    );
    process.exit(1);
  }

  console.log(
    `[verify-model-pricing] OK — all ${REFERENCED_MODELS.length} referenced models have pricing entries.`,
  );
  process.exit(0);
}

main();
