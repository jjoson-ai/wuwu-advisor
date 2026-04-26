"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import type { FactRow } from "@/domain/memory/facts.schema";

type PageState = "loading" | "ready" | "error";

function relativeDateLabel(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;

  const months = Math.floor(days / 30);

  if (months === 1) return "1 month ago";

  return `${months} months ago`;
}

const CATEGORY_LABELS: Record<string, string> = {
  relational: "relationship",
  situational: "situation",
  identity: "identity",
  ongoing_decision: "decision",
  preference: "preference",
};

export default function MemoryFactsPage() {
  const [state, setState] = useState<PageState>("loading");
  const [facts, setFacts] = useState<FactRow[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isDeletingAll, setIsDeletingAll] = useState(false);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>("");

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/privacy/facts");
        const json = (await res.json()) as { facts?: FactRow[]; error?: string };

        if (!res.ok) throw new Error(json.error ?? "Failed to load facts.");

        setFacts(json.facts ?? []);
        setState("ready");
      } catch (err) {
        console.error(err);
        setState("error");
      }
    })();
  }, []);

  async function handleDeleteOne(factId: string) {
    setDeletingId(factId);
    setStatusMessage("");

    try {
      const res = await fetch(`/api/privacy/facts/${factId}`, { method: "DELETE" });
      const json = (await res.json()) as { error?: string };

      if (!res.ok) throw new Error(json.error ?? "Unable to delete fact.");

      setFacts((prev) => prev.filter((f) => f.id !== factId));
      setStatusMessage("Fact deleted.");
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : "Unable to delete fact.");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleDeleteAll() {
    setIsDeletingAll(true);
    setConfirmDeleteAll(false);
    setStatusMessage("");

    try {
      const res = await fetch("/api/privacy/facts", { method: "DELETE" });
      const json = (await res.json()) as { error?: string };

      if (!res.ok) throw new Error(json.error ?? "Unable to delete all facts.");

      setFacts([]);
      setStatusMessage("All remembered facts deleted.");
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : "Unable to delete all facts.");
    } finally {
      setIsDeletingAll(false);
    }
  }

  return (
    <div
      className="stack"
      style={{
        maxWidth: "40rem",
        margin: "0 auto",
        padding: "2rem 1rem",
      }}
    >
      <div className="stack" style={{ gap: "0.4rem" }}>
        <Link className="muted" href="/onboarding" style={{ fontSize: "0.85rem" }}>
          ← Back to settings
        </Link>
        <h1 className="section-heading-serif">Things Wuwu remembers</h1>
        <p className="card-subtitle">
          Wuwu extracts durable facts from your Ask conversations to personalise
          future responses. You can delete any fact — once deleted, Wuwu will not
          re-extract it from the same conversation.
        </p>
      </div>

      {state === "loading" && (
        <p className="muted" style={{ margin: 0 }}>
          Loading…
        </p>
      )}

      {state === "error" && (
        <p className="muted" role="alert" style={{ margin: 0 }}>
          Unable to load your remembered facts. Please try again later.
        </p>
      )}

      {state === "ready" && facts.length === 0 && (
        <p className="muted" style={{ margin: 0 }}>
          No facts stored yet. Wuwu will remember things you share in Ask
          conversations.
        </p>
      )}

      {state === "ready" && facts.length > 0 && (
        <div className="stack" style={{ gap: "0.75rem" }}>
          {facts.map((fact) => (
            <div
              key={fact.id}
              className="card"
              style={{
                padding: "0.85rem 1rem",
                display: "grid",
                gridTemplateColumns: "1fr auto",
                gap: "0.5rem",
                alignItems: "start",
              }}
            >
              <div className="stack" style={{ gap: "0.25rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  <span
                    className="card-eyebrow"
                    style={{ fontSize: "0.7rem", textTransform: "uppercase" }}
                  >
                    {CATEGORY_LABELS[fact.fact_category] ?? fact.fact_category}
                  </span>
                  <span className="muted" style={{ fontSize: "0.75rem" }}>
                    · {relativeDateLabel(fact.extracted_at)}
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: "0.9rem" }}>{fact.fact_text}</p>
                <p
                  className="muted"
                  style={{ margin: 0, fontSize: "0.75rem", fontStyle: "italic" }}
                >
                  you said: &ldquo;{fact.evidence_quote}&rdquo;
                </p>
              </div>

              <button
                className="button secondary"
                disabled={deletingId === fact.id}
                onClick={() => {
                  void handleDeleteOne(fact.id);
                }}
                style={{ fontSize: "0.8rem", padding: "0.25rem 0.6rem", whiteSpace: "nowrap" }}
                type="button"
              >
                {deletingId === fact.id ? "Deleting…" : "Delete"}
              </button>
            </div>
          ))}

          <div className="stack" style={{ gap: "0.5rem", paddingTop: "0.5rem" }}>
            {confirmDeleteAll ? (
              <div className="stack" style={{ gap: "0.4rem" }}>
                <p className="muted" style={{ margin: 0, fontSize: "0.9rem" }}>
                  This will delete all remembered facts permanently. Once deleted,
                  Wuwu will not personalise responses using previous context until
                  new facts are extracted.
                </p>
                <div className="row">
                  <button
                    className="button danger"
                    disabled={isDeletingAll}
                    onClick={() => {
                      void handleDeleteAll();
                    }}
                    type="button"
                  >
                    {isDeletingAll ? "Deleting…" : "Yes, forget everything"}
                  </button>
                  <button
                    className="button secondary"
                    disabled={isDeletingAll}
                    onClick={() => setConfirmDeleteAll(false)}
                    type="button"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                className="button secondary"
                onClick={() => {
                  setConfirmDeleteAll(true);
                  setStatusMessage("");
                }}
                style={{ alignSelf: "flex-start" }}
                type="button"
              >
                Forget everything
              </button>
            )}
          </div>
        </div>
      )}

      {statusMessage !== "" && (
        <p
          className="muted"
          role="status"
          style={{ margin: 0, minHeight: "1.5rem" }}
        >
          {statusMessage}
        </p>
      )}
    </div>
  );
}
