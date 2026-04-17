import "server-only";

import { PostgrestError } from "@supabase/supabase-js";

import type {
  Blueprint,
  BlueprintBaziDebug,
  UserBlueprintRow,
} from "@/domain/blueprint/blueprint.types";
import type { AccessLevel } from "@/lib/access";
import { getSupabaseServerClient } from "@/lib/supabase/server";

function formatDbError(error: PostgrestError | null, fallback: string) {
  if (error === null) {
    return fallback;
  }

  const relationName =
    error.message.match(/'public\.([^']+)'/)?.[1] ??
    error.message.match(/relation "public\.([^"]+)"/)?.[1] ??
    null;

  if (error.code === "PGRST205" || error.message.includes("schema cache")) {
    const relationLabel = relationName ?? "the required tables";

    return `Supabase setup error: could not find public.${relationLabel} in the connected project. Rerun sql/001_init.sql in Supabase, verify public.user_blueprints exists, and confirm your local Supabase env values point to that same project.`;
  }

  return error.message || fallback;
}

export async function getBlueprintForUser(
  userId: string,
  accessToken?: string | null,
): Promise<UserBlueprintRow | null> {
  const supabase = await getSupabaseServerClient(accessToken ?? undefined);
  const result = await supabase
    .from("user_blueprints")
    .select("id, user_id, blueprint_json, bazi_debug_json, generation_access_level, created_at, updated_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (result.error !== null) {
    throw new Error(formatDbError(result.error, "Unable to load blueprint."));
  }

  return (result.data as UserBlueprintRow | null) ?? null;
}

export async function upsertBlueprint(params: {
  userId: string;
  accessToken?: string | null;
  blueprint: Blueprint;
  baziDebug?: BlueprintBaziDebug | null;
  generationAccessLevel: AccessLevel;
}) {
  const supabase = await getSupabaseServerClient(params.accessToken ?? undefined);
  const result = await supabase
    .from("user_blueprints")
    .upsert(
      {
        user_id: params.userId,
        blueprint_json: params.blueprint,
        bazi_debug_json: params.baziDebug ?? null,
        generation_access_level: params.generationAccessLevel,
      },
      { onConflict: "user_id" },
    )
    .select("id, user_id, blueprint_json, bazi_debug_json, generation_access_level, created_at, updated_at")
    .single();

  if (result.error !== null) {
    return {
      success: false as const,
      message: formatDbError(result.error, "Unable to save blueprint."),
    };
  }

  return {
    success: true as const,
    blueprint: result.data as UserBlueprintRow,
  };
}
