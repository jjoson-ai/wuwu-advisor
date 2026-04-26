"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Renders the "Login" button in the header for anonymous visitors,
 * but hides it when the user is already on /login (avoids the
 * "why is the login button still here?" UX trap flagged in the
 * 2026-04-26 UX review).
 */
export function HeaderLoginLink() {
  const pathname = usePathname();

  if (pathname === "/login") {
    return null;
  }

  return (
    <Link className="button secondary" href="/login">
      Login
    </Link>
  );
}
