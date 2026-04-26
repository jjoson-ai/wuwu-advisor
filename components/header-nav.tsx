"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType, SVGProps } from "react";

import {
  CompassIcon,
  MessageIcon,
  SlidersIcon,
  SunIcon,
  TrendingIcon,
} from "@/components/icons";

type IconComponent = ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;

// UX audit F-10 (2026-04-26): "Forecast" overlaps semantically with "Today".
// Renamed to "10 days" so the timeframe is the legible cue. "Ask" mismatched
// its /decision route — renamed to "Decisions" so user expectation matches.
// Routes unchanged so no analytics IDs or marketing links break.
const NAV_ITEMS: ReadonlyArray<{
  href: string;
  label: string;
  Icon: IconComponent;
}> = [
  { href: "/dashboard", label: "Today", Icon: SunIcon },
  { href: "/blueprint", label: "Blueprint", Icon: CompassIcon },
  { href: "/forecast", label: "10 days", Icon: TrendingIcon },
  { href: "/decision", label: "Decisions", Icon: MessageIcon },
  { href: "/onboarding", label: "Settings", Icon: SlidersIcon },
];

function isActivePath(pathname: string, href: string) {
  if (href === "/dashboard") {
    return pathname === "/" || pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function HeaderNav() {
  const pathname = usePathname();

  return (
    <nav className="header-nav">
      {NAV_ITEMS.map(({ href, label, Icon }) => (
        <Link
          key={href}
          className={`header-link ${isActivePath(pathname, href) ? "active" : ""}`.trim()}
          href={href}
        >
          <Icon className="nav-icon" size={16} />
          {label}
        </Link>
      ))}
    </nav>
  );
}
