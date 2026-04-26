import "server-only";

import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { embedText } from "@/domain/memory/facts.embed";
import type { MatchedFact } from "@/domain/memory/facts.schema";

const RETRIEVAL_THRESHOLD = 0.65; // minimum cosine similarity to be injected
const RETRIEVAL_TOP_K = 8; // maximum facts injected per Ask turn

/**
 * Retrieves the most semantically relevant stored facts for a user given a
 * query string (the user's new question).
 *
 * Returns an empty array when:
 *  - MEMORY_INJECTION_ENABLED is not "true"
 *  - OPENAI_API_KEY is not set (no embeddings possible)
 *  - The user has no stored facts
 *  - No facts meet the similarity threshold
 *
 * Never throws — fails silently so a missing or broken memory system
 * doesn't block Ask generation.
 */
export async function retrieveRelevantFacts(
  userId: string,
  queryText: string,
): Promise<MatchedFact[]> {
  const injectionEnabled = process.env.MEMORY_INJECTION_ENABLED === "true";

  if (!injectionEnabled) return [];

  try {
    const queryEmbedding = await embedText(queryText);

    if (queryEmbedding === null) return [];

    const supabase = getSupabaseAdminClient();

    const { data, error } = await supabase.rpc("match_user_facts", {
      query_embedding: queryEmbedding,
      user_id_param: userId,
      match_threshold: RETRIEVAL_THRESHOLD,
      match_count: RETRIEVAL_TOP_K,
    });

    if (error !== null) {
      console.error("[memory:retrieve] match_user_facts RPC error:", error.message);
      return [];
    }

    if (data == null || data.length === 0) return [];

    // Update last_referenced_at for retrieved facts (fire-and-forget; non-critical).
    const retrievedIds = (data as MatchedFact[]).map((r) => r.id);
    void supabase
      .from("user_facts")
      .update({ last_referenced_at: new Date().toISOString() })
      .in("id", retrievedIds);

    return data as MatchedFact[];
  } catch (err) {
    console.error("[memory:retrieve] retrieveRelevantFacts failed:", err);
    return [];
  }
}
