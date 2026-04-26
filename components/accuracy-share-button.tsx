"use client";

import { useState } from "react";

type ShareStatus = "idle" | "loading" | "copied" | "error";

export function AccuracyShareButton() {
  const [status, setStatus] = useState<ShareStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleShare() {
    setStatus("loading");
    setErrorMessage(null);

    try {
      const response = await fetch("/api/create-accuracy-share", {
        method: "POST",
      });

      const data = (await response.json()) as { token?: string; error?: string };

      if (!response.ok || data.token == null) {
        setStatus("error");
        setErrorMessage(data.error ?? "Unable to create share link.");
        return;
      }

      const shareUrl = `${window.location.origin}/accuracy/share/${data.token}`;

      // Use Web Share API on mobile if available, otherwise copy to clipboard.
      if (
        typeof navigator.share === "function" &&
        navigator.canShare?.({ url: shareUrl })
      ) {
        await navigator.share({
          title: "My Wuwu accuracy read",
          text: "See how accurate Wuwu's daily briefings have been for me.",
          url: shareUrl,
        });
        setStatus("idle");
      } else {
        await navigator.clipboard.writeText(shareUrl);
        setStatus("copied");
        setTimeout(() => setStatus("idle"), 2500);
      }
    } catch (error) {
      // navigator.share throws AbortError on user dismiss — treat as idle.
      if (error instanceof Error && error.name === "AbortError") {
        setStatus("idle");
        return;
      }
      setStatus("error");
      setErrorMessage("Unable to create share link.");
    }
  }

  const label =
    status === "loading"
      ? "Creating link…"
      : status === "copied"
        ? "Link copied ✓"
        : "Share your accuracy";

  return (
    <div className="row" style={{ alignItems: "center", gap: "0.75rem" }}>
      <button
        className="button"
        onClick={handleShare}
        disabled={status === "loading"}
        type="button"
      >
        {label}
      </button>
      {status === "error" && errorMessage !== null ? (
        <p
          className="muted"
          style={{ margin: 0, color: "#b42318", fontSize: "0.9rem" }}
        >
          {errorMessage}
        </p>
      ) : status === "idle" ? (
        <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
          Generates a public link — no names attached.
        </p>
      ) : null}
    </div>
  );
}
