import { NativeModules } from "react-native";
import Constants from "expo-constants";

import { supabase } from "@/lib/supabase";
import {
  DEBUG_ACCESS_OVERRIDE_HEADER,
  getDebugAccessLevelOverride,
} from "@/lib/debug-access";
import { env } from "@/lib/env";

const PRODUCT_PLATFORM_HEADER = "x-wuwu-platform";
const DEFAULT_REQUEST_TIMEOUT_MS = 12_000;

type ApiRequestInit = RequestInit & {
  timeoutMs?: number;
};

export function getApiBaseUrl() {
  if (__DEV__ === false) {
    return env.apiBaseUrl;
  }

  try {
    const configuredUrl = new URL(env.apiBaseUrl);
    const isSpecialDevHost =
      configuredUrl.hostname === "localhost" ||
      configuredUrl.hostname === "127.0.0.1" ||
      configuredUrl.hostname === "10.0.2.2";

    if (isSpecialDevHost === false) {
      return env.apiBaseUrl;
    }

    const expoHostUri =
      Constants.expoConfig?.hostUri ??
      Constants.platform?.hostUri ??
      null;
    const scriptUrl = NativeModules?.SourceCode?.scriptURL;
    const hostSource =
      typeof expoHostUri === "string" && expoHostUri !== ""
        ? `http://${expoHostUri}`
        : scriptUrl;

    if (typeof hostSource !== "string" || hostSource === "") {
      return env.apiBaseUrl;
    }

    const metroUrl = new URL(hostSource);

    if (metroUrl.hostname === "") {
      return env.apiBaseUrl;
    }

    configuredUrl.hostname = metroUrl.hostname;

    return configuredUrl.toString().replace(/\/$/, "");
  } catch {
    return env.apiBaseUrl;
  }
}

export async function apiRequest<T>(
  path: string,
  init?: ApiRequestInit,
): Promise<T> {
  const { timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS, ...requestInit } = init ?? {};
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const headers = new Headers(requestInit.headers);

  if (session?.access_token) {
    headers.set("Authorization", `Bearer ${session.access_token}`);
  }

  const debugAccessLevelOverride = await getDebugAccessLevelOverride();

  if (debugAccessLevelOverride !== null) {
    headers.set(DEBUG_ACCESS_OVERRIDE_HEADER, debugAccessLevelOverride);
  }

  headers.set(PRODUCT_PLATFORM_HEADER, "mobile");

  if (requestInit.body != null && headers.has("Content-Type") === false) {
    headers.set("Content-Type", "application/json");
  }

  const apiBaseUrl = getApiBaseUrl();
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  let response: Response;

  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      ...requestInit,
      headers,
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timeout);

    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Network request timed out.");
    }

    throw error;
  }

  clearTimeout(timeout);

  const contentType = response.headers.get("Content-Type") ?? "";

  if (contentType.includes("text/event-stream")) {
    return consumeSSEStream<T>(response);
  }

  const payload = (await response.json()) as T & { error?: string };

  if (!response.ok) {
    throw new Error(payload.error || "Request failed.");
  }

  return payload;
}

async function consumeSSEStream<T>(response: Response): Promise<T> {
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}.`);
  }

  const blocks = text.split("\n\n");

  for (const block of blocks) {
    const line = block.trim();

    if (line === "" || line.startsWith("data:") === false) {
      continue;
    }

    const json = line.slice("data:".length).trim();
    let event: { type: string; payload?: unknown; message?: string };

    try {
      event = JSON.parse(json);
    } catch {
      continue;
    }

    if (event.type === "done") {
      return event.payload as T;
    }

    if (event.type === "error") {
      throw new Error(event.message ?? "Generation failed.");
    }
  }

  throw new Error("Generation stream closed without a result.");
}
