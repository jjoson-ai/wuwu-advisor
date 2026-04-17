import type { Blueprint } from "@/domain/blueprint/blueprint.types";
import type { FinalSynthesisOutput } from "@/domain/astrology/schemas";
import type {
  ComparisonCandidateResult,
  ComparisonDocumentData,
} from "@/domain/evals/model-comparison.types";

function formatJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatLabel(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function renderTextBlockHtml(value: string) {
  return `<div class="text-block">${escapeHtml(value)}</div>`;
}

function renderReadableValueHtml(value: unknown): string {
  if (value == null) {
    return `<p class="muted">Unavailable</p>`;
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return `<p>${escapeHtml(String(value))}</p>`;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return `<p class="muted">None</p>`;
    }

    return `<ul>${value
      .map((item) => `<li>${renderReadableValueHtml(item)}</li>`)
      .join("")}</ul>`;
  }

  const entries = Object.entries(value);

  if (entries.length === 0) {
    return `<p class="muted">None</p>`;
  }

  return `
    <dl class="kv-list">
      ${entries
        .map(
          ([key, nestedValue]) => `
            <div class="kv-row">
              <dt>${escapeHtml(formatLabel(key))}</dt>
              <dd>${renderReadableValueHtml(nestedValue)}</dd>
            </div>
          `,
        )
        .join("")}
    </dl>
  `;
}

function formatLatency(latencyMs: number | null) {
  return latencyMs == null ? "Unavailable" : `${latencyMs} ms`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && Array.isArray(value) === false
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function renderSummaryPairsHtml(items: Array<{ label: string; value: string | null }>) {
  const visibleItems = items.filter((item) => item.value !== null);

  if (visibleItems.length === 0) {
    return `<p class="muted">Unavailable</p>`;
  }

  return `
    <dl class="summary-list">
      ${visibleItems
        .map(
          (item) => `
            <div class="summary-row">
              <dt>${escapeHtml(item.label)}</dt>
              <dd>${escapeHtml(item.value ?? "")}</dd>
            </div>
          `,
        )
        .join("")}
    </dl>
  `;
}

function joinSummary(parts: Array<string | null | undefined>, separator = " · ") {
  const visibleParts = parts.filter(
    (part): part is string => typeof part === "string" && part.trim() !== "",
  );

  return visibleParts.length === 0 ? null : visibleParts.join(separator);
}

function renderCondensedInputPacketHtml(document: ComparisonDocumentData) {
  const packet = asRecord(document.normalizedInputPacket);

  if (packet == null) {
    return renderReadableValueHtml(document.normalizedInputPacket);
  }

  if (document.reportType === "blueprint") {
    const natalContext =
      asRecord(asRecord(packet.stable_astrology)?.natal_context) ?? null;
    const numerology = asRecord(packet.core_numerology);
    const chineseContext =
      asRecord(asRecord(packet.chinese_astrology)?.context) ?? null;
    const bazi = asRecord(packet.bazi);
    const baziChart = asRecord(bazi?.chart);
    const humanDesign = asRecord(packet.human_design);

    return `
      <section class="subcard">
        <h3>Profile</h3>
        ${renderSummaryPairsHtml([
          { label: "Name", value: asString(packet.display_name) },
          {
            label: "Natal snapshot",
            value: joinSummary([
              joinSummary(
                [
                  asString(natalContext?.sun_sign)
                    ? `Sun ${asString(natalContext?.sun_sign)}`
                    : null,
                  asString(natalContext?.moon_sign)
                    ? `Moon ${asString(natalContext?.moon_sign)}`
                    : null,
                  asString(natalContext?.mercury_sign)
                    ? `Mercury ${asString(natalContext?.mercury_sign)}`
                    : null,
                  asString(natalContext?.venus_sign)
                    ? `Venus ${asString(natalContext?.venus_sign)}`
                    : null,
                  asString(natalContext?.mars_sign)
                    ? `Mars ${asString(natalContext?.mars_sign)}`
                    : null,
                ],
                ", ",
              ),
              asString(natalContext?.birth_time_confidence),
            ]),
          },
        ])}
      </section>
      <section class="subcard">
        <h3>Modalities In Play</h3>
        ${renderSummaryPairsHtml([
          {
            label: "Numerology",
            value: joinSummary([
              asString(numerology?.life_path_number)
                ? `Life path ${asString(numerology?.life_path_number)}`
                : numerology?.life_path_number != null
                  ? `Life path ${String(numerology.life_path_number)}`
                  : null,
              numerology?.birthday_number != null
                ? `Birthday ${String(numerology.birthday_number)}`
                : null,
              numerology?.attitude_number != null
                ? `Attitude ${String(numerology.attitude_number)}`
                : null,
              numerology?.name_number != null
                ? `Name ${String(numerology.name_number)}`
                : null,
            ]),
          },
          {
            label: "Chinese astrology",
            value: joinSummary([
              joinSummary(
                [
                  asString(chineseContext?.zodiac_animal),
                  asString(chineseContext?.element),
                  asString(chineseContext?.yin_yang),
                ],
                ", ",
              ),
            ]),
          },
          {
            label: "BaZi",
            value:
              asString(bazi?.status) === "available"
                ? joinSummary([
                    asString(baziChart?.day_master)
                      ? `Day master ${asString(baziChart?.day_master)}`
                      : null,
                    joinSummary(
                      [
                        asString(baziChart?.year_pillar),
                        asString(baziChart?.month_pillar),
                        asString(baziChart?.day_pillar),
                        asString(baziChart?.hour_pillar),
                      ],
                      " / ",
                    ),
                    asString(baziChart?.five_element_balance),
                  ])
                : joinSummary([
                    asString(bazi?.status),
                    asString(bazi?.gating_message),
                  ]),
          },
          {
            label: "Human Design",
            value: joinSummary([
              asString(humanDesign?.status),
              asString(humanDesign?.gating_message),
            ]),
          },
        ])}
      </section>
    `;
  }

  const briefingInput = asRecord(packet.briefing_input);
  const natalContext = asRecord(asRecord(packet.astrology_context)?.natal_context);
  const dailyContext = asRecord(asRecord(packet.astrology_context)?.daily_context);
  const numerologyContext = asRecord(packet.numerology_context);
  const numerologySignal = asRecord(packet.numerology_signal);
  const freeAstro = asRecord(packet.freeastro_daily_context);
  const currentPillars = asRecord(freeAstro?.chinese_current_pillars);
  const panchang = asRecord(freeAstro?.vedic_panchang);
  const rahuKalam = asRecord(panchang?.rahu_kalam);

  return `
    <section class="subcard">
      <h3>Profile And Date</h3>
      ${renderSummaryPairsHtml([
        { label: "Name", value: asString(briefingInput?.display_name) },
        {
          label: "Timing context",
          value: joinSummary([
            asString(briefingInput?.date),
            asString(briefingInput?.weekday),
            asString(briefingInput?.timezone),
            asString(briefingInput?.tone_preference),
          ]),
        },
        {
          label: "Birth context",
          value: joinSummary([
            asString(briefingInput?.birth_date),
            asString(briefingInput?.birth_time)
              ? `Birth time ${asString(briefingInput?.birth_time)}`
              : null,
            asString(briefingInput?.birth_city),
            asString(briefingInput?.birth_country),
            asString(briefingInput?.birth_time_confidence),
          ]),
        },
      ])}
    </section>
    <section class="subcard">
      <h3>Signals Used</h3>
      ${renderSummaryPairsHtml([
        {
          label: "Natal astrology",
          value: joinSummary(
            [
              asString(natalContext?.sun_sign)
                ? `Sun ${asString(natalContext?.sun_sign)}`
                : null,
              asString(natalContext?.moon_sign)
                ? `Moon ${asString(natalContext?.moon_sign)}`
                : null,
              asString(natalContext?.mercury_sign)
                ? `Mercury ${asString(natalContext?.mercury_sign)}`
                : null,
              asString(natalContext?.venus_sign)
                ? `Venus ${asString(natalContext?.venus_sign)}`
                : null,
              asString(natalContext?.mars_sign)
                ? `Mars ${asString(natalContext?.mars_sign)}`
                : null,
            ],
            ", ",
          ),
        },
        {
          label: "Current astrology",
          value: joinSummary(
            [
              asString(dailyContext?.current_sun_sign)
                ? `Current Sun ${asString(dailyContext?.current_sun_sign)}`
                : null,
              asString(dailyContext?.current_moon_sign)
                ? `Current Moon ${asString(dailyContext?.current_moon_sign)}`
                : null,
              asString(dailyContext?.timing_precision),
            ],
            ", ",
          ),
        },
        {
          label: "Numerology",
          value: joinSummary([
            numerologyContext?.personal_year != null
              ? `Personal year ${String(numerologyContext.personal_year)}`
              : null,
            numerologyContext?.personal_month != null
              ? `Personal month ${String(numerologyContext.personal_month)}`
              : null,
            numerologyContext?.personal_day != null
              ? `Personal day ${String(numerologyContext.personal_day)}`
              : null,
            asString(numerologySignal?.decision_bias),
            asString(numerologySignal?.timing_bias),
          ]),
        },
        {
          label: "FreeAstro timing",
          value: joinSummary([
            joinSummary(
              [
                asString(currentPillars?.day_master)
                  ? `Day master ${asString(currentPillars?.day_master)}`
                  : null,
                joinSummary(
                  [
                    asString(currentPillars?.year_pillar),
                    asString(currentPillars?.month_pillar),
                    asString(currentPillars?.day_pillar),
                    asString(currentPillars?.hour_pillar),
                  ],
                  " / ",
                ),
              ],
              " · ",
            ),
            joinSummary(
              [
                asString(panchang?.tithi),
                asString(panchang?.nakshatra),
                asString(panchang?.yoga),
                joinSummary(
                  [
                    asString(rahuKalam?.start),
                    asString(rahuKalam?.end),
                  ],
                  " to ",
                )
                  ? `Rahu Kalam ${joinSummary(
                      [asString(rahuKalam?.start), asString(rahuKalam?.end)],
                      " to ",
                    )}`
                  : null,
              ],
              " · ",
            ),
          ]),
        },
      ])}
    </section>
  `;
}

function renderHumanReadableCandidateHtml(result: ComparisonCandidateResult) {
  const stageIssues = result.stages.filter(
    (stage) => stage.error !== null || stage.validationError !== null,
  );

  return `
    <section class="card">
      <h3>${escapeHtml(result.provider)} · ${escapeHtml(result.model)}</h3>
      <p><strong>Status:</strong> ${escapeHtml(result.status)}</p>
      <p><strong>Total latency:</strong> ${escapeHtml(formatLatency(result.totalLatencyMs))}</p>
      ${
        result.error == null
          ? ""
          : `<p><strong>Error:</strong> ${escapeHtml(result.error)}</p>`
      }
      ${
        result.renderedPreview == null
          ? `<p class="muted">No rendered preview is available for this candidate.</p>`
          : `<h4>Rendered Preview</h4>${renderTextBlockHtml(result.renderedPreview)}`
      }
      ${
        stageIssues.length === 0
          ? ""
          : `
            <h4>Error Details</h4>
            <ul>
              ${stageIssues
                .map(
                  (stage) => `
                    <li>${escapeHtml(stage.stage)}: ${escapeHtml(
                      stage.error ?? stage.validationError ?? "Unknown error",
                    )}</li>
                  `,
                )
                .join("")}
            </ul>
          `
      }
    </section>
  `;
}

export function renderDailyEvalPreview(output: FinalSynthesisOutput) {
  return [
    `${output.date} · confidence ${output.confidence}`,
    "",
    `Summary: ${output.executive_summary}`,
    "",
    `Decision of the day: ${output.decision_of_day.scenario}`,
    `Do: ${output.decision_of_day.do}`,
    `Avoid: ${output.decision_of_day.avoid}`,
    `Why: ${output.decision_of_day.why}`,
    "",
    `Career: ${output.cards.career.headline}`,
    `Best move: ${output.cards.career.best_move}`,
    `Watch out: ${output.cards.career.watch_out}`,
    "",
    `Money: ${output.cards.money.headline}`,
    `Lean toward: ${output.cards.money.lean_toward}`,
    `Avoid: ${output.cards.money.avoid}`,
    `Risk level: ${output.cards.money.risk_level}`,
    "",
    `Relationships: ${output.cards.relationships.headline}`,
    `Best action: ${output.cards.relationships.best_action}`,
    `Avoid: ${output.cards.relationships.avoid}`,
    "",
    `Health: ${output.cards.health.headline}`,
    `Best use: ${output.cards.health.best_use}`,
    `Avoid: ${output.cards.health.avoid}`,
    "",
    `Personal growth: ${output.cards.personal_growth.headline}`,
    `Focus: ${output.cards.personal_growth.focus}`,
    `Good for: ${output.cards.personal_growth.good_for}`,
    `Not ideal for: ${output.cards.personal_growth.not_ideal_for}`,
    "",
    `Timing: best ${output.timing.best_window}; avoid ${output.timing.avoid_window}`,
    `Micro-claim: ${output.micro_claim.statement}`,
    `Track: ${output.micro_claim.track_prompt}`,
  ].join("\n");
}

export function renderBlueprintEvalPreview(output: Blueprint) {
  return [
    output.title,
    "",
    output.summary,
    "",
    `${output.core_pattern.headline}: ${output.core_pattern.description}`,
    "",
    `${output.communication_and_connection.headline}: ${output.communication_and_connection.description}`,
    "",
    `${output.work_and_money_style.headline}: ${output.work_and_money_style.description}`,
    "",
    `${output.energy_and_stress.headline}: ${output.energy_and_stress.description}`,
    "",
    `${output.growth_edge.headline}: ${output.growth_edge.description}`,
    "",
    `Guiding numbers: life path ${output.guiding_numbers.life_path}, birthday ${output.guiding_numbers.birthday}, attitude ${output.guiding_numbers.attitude}, name ${output.guiding_numbers.name_number}`,
    `Chinese signature: ${output.chinese_signature.animal}, ${output.chinese_signature.element}, ${output.chinese_signature.polarity}`,
    `BaZi signature: day master ${output.bazi_signature.day_master}, pillars ${output.bazi_signature.year_pillar} / ${output.bazi_signature.month_pillar} / ${output.bazi_signature.day_pillar} / ${output.bazi_signature.hour_pillar}`,
    `Human Design signature: ${output.human_design_signature.type}, ${output.human_design_signature.authority}, ${output.human_design_signature.profile}`,
  ].join("\n");
}

function formatCandidateSection(result: ComparisonCandidateResult) {
  const lines = [
    `### ${result.provider} · ${result.model}`,
    `- Status: ${result.status}`,
    `- Total latency: ${formatLatency(result.totalLatencyMs)}`,
  ];

  if (result.error !== null) {
    lines.push(`- Error: ${result.error}`);
  }

  lines.push("");

  if (result.renderedPreview !== null) {
    lines.push("#### Rendered Preview");
    lines.push("```text");
    lines.push(result.renderedPreview);
    lines.push("```");
    lines.push("");
  }

  if (result.finalOutput !== null) {
    lines.push("#### Final Output JSON");
    lines.push("```json");
    lines.push(formatJson(result.finalOutput));
    lines.push("```");
    lines.push("");
  }

  lines.push("#### Stage Details");

  for (const stage of result.stages) {
    lines.push(`##### ${stage.stage}`);
    lines.push(`- Latency: ${formatLatency(stage.latencyMs)}`);

    if (stage.error !== null) {
      lines.push(`- Error: ${stage.error}`);
    }

    if (stage.validationError !== null) {
      lines.push(`- Validation error: ${stage.validationError}`);
    }

    if (stage.validatedOutput !== null) {
      lines.push("```json");
      lines.push(formatJson(stage.validatedOutput));
      lines.push("```");
    } else if (stage.parsedJson !== null) {
      lines.push("```json");
      lines.push(formatJson(stage.parsedJson));
      lines.push("```");
    } else if (stage.rawText !== null) {
      lines.push("```text");
      lines.push(stage.rawText);
      lines.push("```");
    }

    lines.push("");
  }

  return lines.join("\n");
}

export function formatModelComparisonDocument(
  document: ComparisonDocumentData,
) {
  const lines = [
    `# Internal Model Comparison`,
    "",
    `- Report type: ${document.reportType}`,
    `- Generated at: ${document.generatedAt}`,
    `- Compared models: ${document.comparedModels
      .filter((model) => model.enabled)
      .map((model) => `${model.provider}:${model.model}`)
      .join(", ")}`,
    `- Scorers enabled: ${document.scorersEnabled ? "yes" : "no"}`,
    "",
    `## Normalized Input Packet`,
    "```json",
    formatJson(document.normalizedInputPacket),
    "```",
    "",
    `## Gating And Availability Notes`,
    ...(document.gatingNotes.length === 0
      ? ["- None"]
      : document.gatingNotes.map((line) => `- ${line}`)),
    "",
    `## Shared Prompt Context`,
  ];

  for (const prompt of document.sharedPromptContext) {
    lines.push(`### ${prompt.label}`);
    if (prompt.note != null) {
      lines.push(`- Note: ${prompt.note}`);
    }
    lines.push("#### System Prompt");
    lines.push("```text");
    lines.push(prompt.systemPrompt);
    lines.push("```");

    if (prompt.userPrompt !== null) {
      lines.push("");
      lines.push("#### User Prompt");
      lines.push("```text");
      lines.push(prompt.userPrompt);
      lines.push("```");
    }

    lines.push("");
  }

  lines.push("## Human Review Rubric");
  for (const line of document.rubricLines) {
    lines.push(`- ${line}`);
  }

  lines.push("");
  lines.push("## Candidate Outputs");

  for (const result of document.candidateResults) {
    lines.push(formatCandidateSection(result));
  }

  lines.push("");
  lines.push("## Scorer Outputs");

  if (document.scorerResults.length === 0) {
    lines.push("- Scoring was disabled for this run.");
  } else {
    for (const scorer of document.scorerResults) {
      lines.push(`### ${scorer.provider} · ${scorer.model}`);
      lines.push(`- Status: ${scorer.status}`);
      lines.push(`- Latency: ${formatLatency(scorer.latencyMs)}`);

      if (scorer.error !== null) {
        lines.push(`- Error: ${scorer.error}`);
      }

      if (scorer.validatedOutput !== null) {
        lines.push("```json");
        lines.push(formatJson(scorer.validatedOutput));
        lines.push("```");
      } else if (scorer.parsedJson !== null) {
        lines.push("```json");
        lines.push(formatJson(scorer.parsedJson));
        lines.push("```");
      } else if (scorer.rawText !== null) {
        lines.push("```text");
        lines.push(scorer.rawText);
        lines.push("```");
      }

      lines.push("");
    }
  }

  return lines.join("\n");
}

export function formatModelComparisonHtmlDocument(
  document: ComparisonDocumentData,
) {
  const comparedModels = document.comparedModels
    .filter((model) => model.enabled)
    .map((model) => `${model.provider}:${model.model}`)
    .join(", ");

  const promptSections = document.sharedPromptContext
    .map(
      (prompt) => `
        <section class="card">
          <h3>${escapeHtml(prompt.label)}</h3>
          ${
            prompt.note == null
              ? ""
              : `<p class="muted"><strong>Note:</strong> ${escapeHtml(prompt.note)}</p>`
          }
          <h4>System Prompt</h4>
          ${renderTextBlockHtml(prompt.systemPrompt)}
        </section>
      `,
    )
    .join("");

  const candidateSections = document.candidateResults
    .map((result) => renderHumanReadableCandidateHtml(result))
    .join("");

  const scorerSections =
    document.scorerResults.length === 0
      ? `<p>Scoring was disabled for this run.</p>`
      : document.scorerResults
          .map(
            (scorer) => `
              <section class="card">
                <h3>${escapeHtml(scorer.provider)} · ${escapeHtml(scorer.model)}</h3>
                <p><strong>Status:</strong> ${escapeHtml(scorer.status)}</p>
                <p><strong>Latency:</strong> ${escapeHtml(formatLatency(scorer.latencyMs))}</p>
                ${
                  scorer.error == null
                    ? ""
                    : `<p><strong>Error:</strong> ${escapeHtml(scorer.error)}</p>`
                }
                ${
                  scorer.validatedOutput != null
                    ? renderReadableValueHtml(scorer.validatedOutput)
                    : scorer.parsedJson != null
                      ? renderReadableValueHtml(scorer.parsedJson)
                      : scorer.rawText != null
                        ? renderTextBlockHtml(scorer.rawText)
                        : ""
                }
              </section>
            `,
          )
          .join("");

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Astrologer On Demand Internal Model Comparison</title>
    <style>
      @page {
        margin: 12mm;
      }
      body {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        line-height: 1.5;
        color: #111827;
        margin: 32px;
        background: #ffffff;
      }
      h1, h2, h3, h4, h5 {
        margin-bottom: 0.4rem;
      }
      .actions {
        display: flex;
        gap: 0.75rem;
        align-items: center;
        margin-bottom: 16px;
      }
      .actions button {
        border: 1px solid #9ca3af;
        border-radius: 999px;
        background: #ffffff;
        color: #111827;
        padding: 0.65rem 1rem;
        font: inherit;
        cursor: pointer;
      }
      .card {
        border: 1px solid #d1d5db;
        border-radius: 12px;
        padding: 16px;
        margin-bottom: 16px;
        background: #f9fafb;
      }
      .subcard {
        border-top: 1px solid #e5e7eb;
        padding-top: 12px;
        margin-top: 12px;
      }
      .muted {
        color: #6b7280;
      }
      .text-block {
        white-space: pre-wrap;
        word-break: break-word;
        background: #ffffff;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        padding: 12px;
      }
      .kv-list {
        margin: 0;
        display: grid;
        gap: 0.85rem;
      }
      .kv-row {
        display: grid;
        gap: 0.25rem;
        padding: 0.75rem 0;
        border-top: 1px solid #e5e7eb;
      }
      .kv-row:first-child {
        border-top: 0;
        padding-top: 0;
      }
      .kv-row:last-child {
        padding-bottom: 0;
      }
      .kv-row dt {
        font-weight: 600;
      }
      .kv-row dd {
        margin: 0;
      }
      .kv-row p {
        margin: 0;
      }
      ul {
        margin-top: 0;
      }
      @media print {
        body {
          margin: 0;
        }
        .actions {
          display: none;
        }
        .card,
        .subcard {
          break-inside: avoid;
          background: #ffffff;
        }
      }
    </style>
  </head>
  <body>
    <h1>Internal Model Comparison</h1>
    <div class="actions">
      <button onclick="window.print()">Print / Save PDF</button>
      <span class="muted">Use the browser print dialog to save a PDF copy.</span>
    </div>
    <div class="card">
      <p><strong>Report type:</strong> ${escapeHtml(document.reportType)}</p>
      <p><strong>Generated at:</strong> ${escapeHtml(document.generatedAt)}</p>
      <p><strong>Compared models:</strong> ${escapeHtml(comparedModels)}</p>
      <p><strong>Scorers enabled:</strong> ${document.scorersEnabled ? "yes" : "no"}</p>
    </div>

    <section class="card">
      <h2>Normalized Input Packet</h2>
      ${renderCondensedInputPacketHtml(document)}
    </section>

    <section class="card">
      <h2>Gating And Availability Notes</h2>
      <ul>
        ${
          document.gatingNotes.length === 0
            ? "<li>None</li>"
            : document.gatingNotes
                .map((line) => `<li>${escapeHtml(line)}</li>`)
                .join("")
        }
      </ul>
    </section>

    <section>
      <h2>Shared Prompt Context</h2>
      ${promptSections}
    </section>

    <section class="card">
      <h2>Human Review Rubric</h2>
      <ul>
        ${document.rubricLines.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}
      </ul>
    </section>

    <section>
      <h2>Candidate Outputs</h2>
      ${candidateSections}
    </section>

    <section>
      <h2>Scorer Outputs</h2>
      ${scorerSections}
    </section>
  </body>
</html>`;
}
