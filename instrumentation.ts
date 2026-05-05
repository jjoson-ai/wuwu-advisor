/**
 * Next.js 15 App Router instrumentation hook.
 *
 * Per Sentry's official Next.js 15 integration guide, the runtime-specific
 * configs (sentry.server.config.ts, sentry.edge.config.ts) must be loaded
 * lazily via the `register()` export — NOT at module load — so that each
 * runtime gets the right SDK initialization. The previous shape (a top-level
 * `Sentry.init` call here) ran the *web* SDK init in both Node and Edge
 * environments, which silently dropped some server-side error capture.
 *
 * `onRequestError` forwards Server Component, route-handler, middleware,
 * and proxy request errors into Sentry's `captureRequestError` pipeline.
 * Without this export, errors from those surfaces are not reliably reported.
 *
 * Reference: Sentry Next.js docs (App Router instrumentation section).
 */

import * as Sentry from "@sentry/nextjs";

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
