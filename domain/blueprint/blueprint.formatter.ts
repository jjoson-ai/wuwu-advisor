import {
  BlueprintBaziDebugSchema,
  BlueprintSchema,
} from "@/domain/blueprint/blueprint.types";
import type {
  FormattedBlueprint,
  UserBlueprintRow,
} from "@/domain/blueprint/blueprint.types";
import { sanitizeForbiddenInternalTermsInUserOutput } from "@/lib/output-safety";

export function formatBlueprintForPage(
  row: UserBlueprintRow,
): FormattedBlueprint {
  const blueprint = BlueprintSchema.parse(row.blueprint_json);
  const safeBlueprint = sanitizeForbiddenInternalTermsInUserOutput(blueprint);

  return {
    id: row.id,
    bazi_debug:
      row.bazi_debug_json == null
        ? null
        : BlueprintBaziDebugSchema.parse(row.bazi_debug_json),
    generation_access_level: row.generation_access_level,
    created_at: row.created_at,
    updated_at: row.updated_at,
    ...safeBlueprint,
  };
}
