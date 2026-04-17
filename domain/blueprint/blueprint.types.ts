import { z } from "zod";
import type { AccessLevel } from "@/lib/access";

export const BlueprintSectionSchema = z.object({
  headline: z.string(),
  description: z.string(),
});

export const FreeBlueprintSchema = z.object({
  title: z.string(),
  summary: z.string(),
  guiding_numbers: z
    .object({
      life_path: z.string(),
      birthday: z.string(),
      attitude: z.string(),
      name_number: z.string(),
    })
    .default({
      life_path: "unknown",
      birthday: "unknown",
      attitude: "unknown",
      name_number: "unknown",
    }),
  chinese_signature: z
    .object({
      animal: z.string(),
      element: z.string(),
      polarity: z.string(),
    })
    .default({
      animal: "unknown",
      element: "unknown",
      polarity: "unknown",
    }),
  core_pattern: BlueprintSectionSchema,
  communication_and_connection: BlueprintSectionSchema,
});

export const BlueprintSchema = z.object({
  title: z.string(),
  summary: z.string(),
  bazi_signature: z
    .object({
      day_master: z.string(),
      year_pillar: z.string(),
      month_pillar: z.string(),
      day_pillar: z.string(),
      hour_pillar: z.string(),
    })
    .default({
      day_master: "unavailable",
      year_pillar: "unavailable",
      month_pillar: "unavailable",
      day_pillar: "unavailable",
      hour_pillar: "unavailable",
    }),
  human_design_signature: z
    .object({
      type: z.string(),
      authority: z.string(),
      profile: z.string(),
    })
    .default({
      type: "unavailable",
      authority: "unavailable",
      profile: "unavailable",
    }),
  guiding_numbers: z
    .object({
      life_path: z.string(),
      birthday: z.string(),
      attitude: z.string(),
      name_number: z.string(),
    })
    .default({
      life_path: "unknown",
      birthday: "unknown",
      attitude: "unknown",
      name_number: "unknown",
    }),
  chinese_signature: z
    .object({
      animal: z.string(),
      element: z.string(),
      polarity: z.string(),
    })
    .default({
      animal: "unknown",
      element: "unknown",
      polarity: "unknown",
    }),
  core_pattern: BlueprintSectionSchema,
  communication_and_connection: BlueprintSectionSchema,
  work_and_money_style: BlueprintSectionSchema,
  energy_and_stress: BlueprintSectionSchema,
  growth_edge: BlueprintSectionSchema,
});

export const BlueprintBaziDebugSchema = z.object({
  status: z.string(),
  gating_message: z.string(),
  limitations: z.array(z.string()).default([]),
  integration_boundary: z.object({
    provider: z.string(),
    ready: z.boolean(),
  }),
  updated_at: z.string(),
});

export type Blueprint = z.infer<typeof BlueprintSchema>;
export type FreeBlueprint = z.infer<typeof FreeBlueprintSchema>;
export type BlueprintBaziDebug = z.infer<typeof BlueprintBaziDebugSchema>;

const HIDDEN_BLUEPRINT_SECTION: Blueprint["core_pattern"] = {
  headline: "Locked on free tier",
  description: "Regenerate with fuller access to load this section.",
};

export function expandFreeBlueprintToBlueprint(
  blueprint: FreeBlueprint,
): Blueprint {
  return {
    ...blueprint,
    bazi_signature: {
      day_master: "unavailable",
      year_pillar: "unavailable",
      month_pillar: "unavailable",
      day_pillar: "unavailable",
      hour_pillar: "unavailable",
    },
    human_design_signature: {
      type: "unavailable",
      authority: "unavailable",
      profile: "unavailable",
    },
    work_and_money_style: HIDDEN_BLUEPRINT_SECTION,
    energy_and_stress: HIDDEN_BLUEPRINT_SECTION,
    growth_edge: HIDDEN_BLUEPRINT_SECTION,
  };
}

export type UserBlueprintRow = {
  id: string;
  user_id: string;
  blueprint_json: Blueprint;
  bazi_debug_json: BlueprintBaziDebug | null;
  generation_access_level: AccessLevel | null;
  created_at: string;
  updated_at: string;
};

export type FormattedBlueprint = Blueprint & {
  id: string;
  bazi_debug: BlueprintBaziDebug | null;
  generation_access_level: AccessLevel | null;
  created_at: string;
  updated_at: string;
};
