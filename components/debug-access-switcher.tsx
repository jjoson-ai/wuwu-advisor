"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import type { AccessLevel } from "@/lib/access";

const OPTIONS: Array<{ label: string; value: AccessLevel | "auto" }> = [
  { label: "Auto", value: "auto" },
  { label: "Free", value: "free" },
  { label: "Pro", value: "pro" },
  { label: "Internal", value: "internal" },
];

type DebugAccessSwitcherProps = {
  currentAccessLevel: AccessLevel;
};

export function DebugAccessSwitcher({
  currentAccessLevel,
}: DebugAccessSwitcherProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const redirectPath = `${pathname}${search === "" ? "" : `?${search}`}`;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.5rem",
        flexWrap: "wrap",
      }}
    >
      <span
        className="muted"
        style={{ fontSize: "0.85rem", whiteSpace: "nowrap" }}
      >
        Debug tier: <strong style={{ color: "var(--text)" }}>{currentAccessLevel}</strong>
      </span>
      {OPTIONS.map((option) => {
        const href = `/api/debug/access?level=${option.value}&redirect=${encodeURIComponent(
          redirectPath,
        )}`;

        return (
          <Link
            key={option.value}
            className="button secondary"
            href={href}
            style={{
              padding: "0.35rem 0.65rem",
              minHeight: "unset",
              fontSize: "0.8rem",
            }}
          >
            {option.label}
          </Link>
        );
      })}
    </div>
  );
}
