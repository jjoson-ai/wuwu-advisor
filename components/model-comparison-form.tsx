"use client";

import { useState } from "react";

type ReportType = "daily" | "blueprint";

type ComparisonResponse = {
  document?: string;
  document_html?: string;
  generated_at?: string;
  error?: string;
};

export function ModelComparisonForm() {
  const [reportType, setReportType] = useState<ReportType>("daily");
  const [includeScorers, setIncludeScorers] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [documentText, setDocumentText] = useState<string | null>(null);
  const [documentHtml, setDocumentHtml] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);

  function createDocumentHtmlUrl() {
    if (documentHtml === null) {
      return null;
    }

    return URL.createObjectURL(
      new Blob([documentHtml], {
        type: "text/html;charset=utf-8",
      }),
    );
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/generate-model-comparison", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          reportType,
          includeScorers,
        }),
      });

      const payload = (await response.json()) as ComparisonResponse;

      if (!response.ok) {
        throw new Error(payload.error || "Unable to generate comparison document.");
      }

      setDocumentText(payload.document ?? null);
      setDocumentHtml(payload.document_html ?? null);
      setGeneratedAt(payload.generated_at ?? null);
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "Unable to generate comparison document.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleOpenPrintableView() {
    const url = createDocumentHtmlUrl();

    if (url === null) {
      return;
    }

    const nextWindow = window.open(url, "_blank");

    if (nextWindow === null) {
      URL.revokeObjectURL(url);
      return;
    }

    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  function handleDownloadHtml() {
    const url = createDocumentHtmlUrl();

    if (url === null) {
      return;
    }

    const link = document.createElement("a");
    link.href = url;
    link.download = `astrologer-on-demand-${reportType}-comparison.html`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  return (
    <div className="stack">
      <form className="card stack" onSubmit={handleSubmit}>
        <label className="field">
          <span>Report type</span>
          <select
            name="reportType"
            onChange={(event) => setReportType(event.target.value as ReportType)}
            value={reportType}
          >
            <option value="daily">Daily Briefing</option>
            <option value="blueprint">Your Birth Blueprint</option>
          </select>
        </label>

        <label
          className="row"
          style={{ alignItems: "center", gap: "0.5rem", margin: 0 }}
        >
          <input
            checked={includeScorers}
            name="includeScorers"
            onChange={(event) => setIncludeScorers(event.target.checked)}
            type="checkbox"
          />
          <span>Run optional scorer models</span>
        </label>

        <p className="muted" style={{ margin: 0 }}>
          Fixed comparison set: OpenAI `gpt-5.4`; Claude `claude-opus-4-6`,
          `claude-sonnet-4-6`. Optional scorers: OpenAI `gpt-5.4`, Gemini
          `gemini-3.1-pro-preview`.
        </p>

        <button className="button" disabled={isSubmitting} type="submit">
          {isSubmitting ? "Generating comparison..." : "Generate comparison document"}
        </button>

        {error === null ? null : (
          <p className="muted" style={{ margin: 0 }}>
            {error}
          </p>
        )}
      </form>

      {documentText === null ? null : (
        <div className="card stack">
          <div className="stack" style={{ gap: "0.35rem" }}>
            <p className="muted" style={{ margin: 0 }}>
              Internal comparison document
            </p>
            <h2 style={{ margin: 0 }}>Generated output</h2>
            <p className="muted" style={{ margin: 0 }}>
              {generatedAt == null
                ? "Timestamp unavailable"
                : `Generated ${new Date(generatedAt).toLocaleString()}`}
            </p>
          </div>

          <div className="row">
            <button
              className="button secondary"
              onClick={handleOpenPrintableView}
              type="button"
            >
              Open printable view
            </button>
            <button
              className="button secondary"
              onClick={handleDownloadHtml}
              type="button"
            >
              Download HTML
            </button>
          </div>

          <p className="muted" style={{ margin: 0 }}>
            The printable view is the reliable export path for human review. Use the
            browser print dialog there if you want a PDF copy.
          </p>

          <pre
            style={{
              margin: 0,
              padding: "1rem",
              background: "var(--surface-muted)",
              borderRadius: "0.75rem",
              overflowX: "auto",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              fontSize: "0.95rem",
              lineHeight: 1.5,
            }}
          >
            {documentText}
          </pre>
        </div>
      )}
    </div>
  );
}
