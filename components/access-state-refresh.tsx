"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

const MIN_HIDDEN_MS_BEFORE_REFRESH = 5_000;
const MIN_REFRESH_INTERVAL_MS = 5_000;

export function AccessStateRefresh() {
  const router = useRouter();
  const hiddenAtRef = useRef<number | null>(null);
  const lastRefreshAtRef = useRef(0);

  useEffect(() => {
    function refreshIfReturningFromBackground() {
      if (document.visibilityState !== "visible") {
        return;
      }

      const hiddenAt = hiddenAtRef.current;

      if (hiddenAt === null) {
        return;
      }

      const now = Date.now();

      if (now - hiddenAt < MIN_HIDDEN_MS_BEFORE_REFRESH) {
        hiddenAtRef.current = null;
        return;
      }

      if (now - lastRefreshAtRef.current < MIN_REFRESH_INTERVAL_MS) {
        hiddenAtRef.current = null;
        return;
      }

      hiddenAtRef.current = null;
      lastRefreshAtRef.current = now;
      router.refresh();
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") {
        hiddenAtRef.current = Date.now();
        return;
      }

      refreshIfReturningFromBackground();
    }

    function handleFocus() {
      refreshIfReturningFromBackground();
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleFocus);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleFocus);
    };
  }, [router]);

  return null;
}
