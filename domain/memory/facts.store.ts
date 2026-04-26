import "server-only";

import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { embedText } from "@/domain/memory/facts.embed";
import { extractFactsFromExchange } from "@/domain/memory/facts.extract";
import type { ExtractedFact, FactCategory, FactRow } from "@/domain/memory/facts.schema";

// Facts with cosine similarity >= this threshold to an existing live fact are
// treated as near-duplicates and skipped.
const DEDUP_THRESHOLD = 0.92;

// Facts with cosine similarity >= this threshold to a soft-deleted fact are
// treated as "the user rejected this" and skipped.
const REJECTION_THRESHOLD = 0.85;

/**
 * Runs the full extraction + store pipeline for one Ask exchange.
 *
 * Steps:
 *  1. Load the user's existing live fact texts (for the extractor's dedup hint).
 *  2. Call the Haiku extractor.
 *  3. For each candidate fact:
 *     a. Guard: evidence quote must appear verbatim in source text.
 *     b. Generate embedding.
 *     c. Guard: dedup check (cosine >= 0.92 to any live fact → skip).
 *     d. Guard: rejection check (cosine >= 0.85 to any deleted fact → skip).
 *     e. Insert.
 *
 * All errors are logged; never throws. Safe for fire-and-forget.
 */
export async function runExtractionPipeline(params: {
  userId: string;
  conversationId: string;
  userMessage: string;
  assistantResponse: string;
}): Promise<void> {
  try {
    const supabase = getSupabaseAdminClient();

    // Load existing live fact texts to pass to the extractor as context.
    const { data: existingRows } = await supabase
      .from("user_facts")
      .select("fact_text")
      .eq("user_id", params.userId)
      .is("user_deleted_at", null);

    const existingFactTexts = (existingRows ?? []).map((r) => r.fact_text as string);

    const facts = await extractFactsFromExchange({
      userMessage: params.userMessage,
      assistantResponse: params.assistantResponse,
      existingFactTexts,
    });

    if (facts.length === 0) return;

    const sourceText = params.userMessage + " " + params.assistantResponse;

    for (const fact of facts) {
      // Guard: evidence quote must appear verbatim in the source exchange.
      // Catches hallucinated quotes before they reach the DB.
      if (!sourceText.includes(fact.evidence_quote)) {
        console.warn(
          "[memory:store] Dropping fact — evidence_quote not found verbatim in source:",
          JSON.stringify(fact.fact_text),
        );
        continue;
      }

      // Generate embedding. A null embedding means the fact is stored without
      // a vector; it won't be retrieved by similarity search but is auditable.
      const embedding = await embedText(fact.fact_text);

      if (embedding !== null) {
        // Dedup + rejection check via the DB similarity function.
        const { data: similar } = await supabase.rpc("find_similar_user_facts", {
          query_embedding: embedding,
          user_id_param: params.userId,
          match_threshold: REJECTION_THRESHOLD, // use the lower threshold so we catch both
          match_count: 5,
        });

        if (similar != null && similar.length > 0) {
          type SimilarRow = { user_deleted_at: string | null; similarity: number; fact_text: string };
          const rows = similar as SimilarRow[];

          // Any live fact above the dedup threshold → skip
          const isDuplicate = rows.some(
            (r) => r.user_deleted_at === null && r.similarity >= DEDUP_THRESHOLD,
          );
          if (isDuplicate) continue;

          // Any deleted fact above the rejection threshold → skip
          const isRejected = rows.some(
            (r) => r.user_deleted_at !== null && r.similarity >= REJECTION_THRESHOLD,
          );
          if (isRejected) {
            console.info(
              "[memory:store] Skipping fact similar to user-deleted fact:",
              JSON.stringify(fact.fact_text),
            );
            continue;
          }
        }
      }

      await insertFact({
        userId: params.userId,
        conversationId: params.conversationId,
        fact,
        embedding,
      });
    }
  } catch (err) {
    console.error("[memory:store] runExtractionPipeline failed:", err);
  }
}

async function insertFact(params: {
  userId: string;
  conversationId: string;
  fact: ExtractedFact;
  embedding: number[] | null;
}): Promise<void> {
  const supabase = getSupabaseAdminClient();

  const { error } = await supabase.from("user_facts").insert({
    user_id: params.userId,
    source_conversation_id: params.conversationId,
    fact_text: params.fact.fact_text,
    fact_category: params.fact.category as FactCategory,
    evidence_quote: params.fact.evidence_quote,
    confidence: params.fact.confidence,
    // pgvector expects a string in the format `[x,y,z,...]`
    embedding: params.embedding !== null ? JSON.stringify(params.embedding) : null,
  });

  if (error !== null) {
    console.error("[memory:store] insertFact DB error:", error.message);
  }
}

/**
 * List all live (non-deleted) facts for a user.
 * Used by the privacy API route to render the plain-list view.
 */
export async function listFactsForUser(userId: string): Promise<FactRow[]> {
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from("user_facts")
    .select(
      "id, user_id, source_conversation_id, fact_text, fact_category, evidence_quote, confidence, extracted_at, last_referenced_at, superseded_by, user_deleted_at",
    )
    .eq("user_id", userId)
    .is("user_deleted_at", null)
    .order("extracted_at", { ascending: false });

  if (error !== null) {
    console.error("[memory:store] listFactsForUser error:", error.message);
    return [];
  }

  return (data ?? []) as FactRow[];
}

/**
 * Soft-delete a single fact. Returns true on success, false on error.
 * Double-checks ownership so the API route is safe without admin-level trust.
 */
export async function softDeleteFact(userId: string, factId: string): Promise<boolean> {
  const supabase = getSupabaseAdminClient();

  const { error } = await supabase
    .from("user_facts")
    .update({ user_deleted_at: new Date().toISOString() })
    .eq("id", factId)
    .eq("user_id", userId) // ownership guard
    .is("user_deleted_at", null);

  if (error !== null) {
    console.error("[memory:store] softDeleteFact error:", error.message);
    return false;
  }

  return true;
}

/**
 * Soft-delete all live facts for a user (user-initiated "forget everything").
 */
export async function softDeleteAllFactsForUser(userId: string): Promise<boolean> {
  const supabase = getSupabaseAdminClient();

  const { error } = await supabase
    .from("user_facts")
    .update({ user_deleted_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("user_deleted_at", null);

  if (error !== null) {
    console.error("[memory:store] softDeleteAllFactsForUser error:", error.message);
    return false;
  }

  return true;
}
