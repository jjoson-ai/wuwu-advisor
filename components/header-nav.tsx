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

const NAV_ITEMS: ReadonlyArray<{
  href: string;
  label: string;
  Icon: IconComponent;
}> = [
  { href: "/dashboard", label: "Today", Icon: SunIcon },
  { href: "/blueprint", label: "Blueprint", Icon: CompassIcon },
  { href: "/forecast", label: "Forecast", Icon: TrendingIcon },
  { href: "/decision", label: "Ask", Icon: MessageIcon },
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
