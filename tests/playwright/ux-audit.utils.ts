import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { BrowserContext, Page, TestInfo } from "@playwright/test";

export const AUTH_STATE_PATH = "playwright/.auth/free-user.json";
export const AUDIT_RUN_ID =
  process.env.WUWU_AUDIT_RUN_ID ??
  new Date().toISOString().replace(/[:.]/g, "-");

type VisibleSummary = {
  headings: string[];
  buttons: string[];
  links: string[];
  body: string[];
};

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function unique(values: string[]) {
  return [...new Set(values)];
}

export function getScenarioDirectory(testInfo: TestInfo, slug: string) {
  const directory = join(
    process.cwd(),
    "audit-artifacts",
    "ux-capture",
    AUDIT_RUN_ID,
    testInfo.project.name,
    slug,
  );

  mkdirSync(directory, { recursive: true });
  return directory;
}

export function getProjectDirectory(testInfo: TestInfo) {
  const directory = join(
    process.cwd(),
    "audit-artifacts",
    "ux-capture",
    AUDIT_RUN_ID,
    testInfo.project.name,
  );

  mkdirSync(directory, { recursive: true });
  return directory;
}

export function writeProjectStatus(
  testInfo: TestInfo,
  status: Record<string, unknown>,
) {
  const directory = getProjectDirectory(testInfo);

  writeFileSync(
    join(directory, "_status.json"),
    JSON.stringify(
      {
        runId: AUDIT_RUN_ID,
        project: testInfo.project.name,
        updatedAt: new Date().toISOString(),
        ...status,
      },
      null,
      2,
    ),
    "utf8",
  );
}

export async function collectVisibleSummary(page: Page): Promise<VisibleSummary> {
  return page.evaluate(() => {
    function isVisible(element: Element) {
      const htmlElement = element as HTMLElement;
      const style = window.getComputedStyle(htmlElement);
      const rect = htmlElement.getBoundingClientRect();

      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        style.opacity !== "0" &&
        rect.width > 0 &&
        rect.height > 0
      );
    }

    function collect(selector: string, limit: number) {
      const values = Array.from(document.querySelectorAll(selector))
        .filter(isVisible)
        .map((element) => {
          if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
            return element.value;
          }

          return element.textContent ?? "";
        })
        .map((value) => value.replace(/\s+/g, " ").trim())
        .filter((value) => value.length > 0);

      return [...new Set(values)].slice(0, limit);
    }

    return {
      headings: collect("h1, h2, h3, [role='heading']", 20),
      buttons: collect("button, a.button", 20),
      links: collect("a[href]:not(.button)", 20),
      body: collect("p, li, label, textarea, [data-audit-text]", 40),
    };
  });
}

export function writeSummaryArtifacts(
  directory: string,
  summary: VisibleSummary,
  meta: Record<string, unknown>,
) {
  const summaryText = [
    "Headings",
    ...summary.headings.map((item) => `- ${item}`),
    "",
    "Buttons / CTAs",
    ...summary.buttons.map((item) => `- ${item}`),
    "",
    "Links",
    ...summary.links.map((item) => `- ${item}`),
    "",
    "Visible copy",
    ...summary.body.map((item) => `- ${item}`),
    "",
  ].join("\n");

  writeFileSync(join(directory, "summary.txt"), summaryText, "utf8");
  writeFileSync(
    join(directory, "meta.json"),
    JSON.stringify(
      {
        ...meta,
        summary: {
          headings: unique(summary.headings.map(normalizeText)),
          buttons: unique(summary.buttons.map(normalizeText)),
          links: unique(summary.links.map(normalizeText)),
          body: unique(summary.body.map(normalizeText)),
        },
      },
      null,
      2,
    ),
    "utf8",
  );
}

export async function setDebugAccessLevel(
  page: Page,
  level: "free" | "pro" | "auto",
  redirectPath: string,
) {
  await page.goto(
    `/api/debug/access?level=${level}&redirect=${encodeURIComponent(redirectPath)}`,
    {
      waitUntil: "domcontentloaded",
    },
  );
}

export async function hasSupabaseSessionCookie(
  context: BrowserContext,
  baseURL: string,
) {
  const cookies = await context.cookies([baseURL]);

  return cookies.some((cookie) => /^sb-.*auth-token(?:\.\d+)?$/.test(cookie.name));
}
