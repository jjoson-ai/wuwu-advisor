import Link from "next/link";

import { APP_NAME } from "@/lib/config";

// UX audit C-03 (2026-04-26): "What Wuwu remembers about you" is a strong
// trust-building surface but was previously buried in Settings. Surfaced as
// a first-class footer link on every page so it's discoverable without
// digging. Listed alongside Privacy / Terms — separate from them, not
// nested.
export function Footer() {
  return (
    <footer className="footer-shell">
      <div className="container footer-bar">
        <p className="muted" style={{ margin: 0 }}>
          {APP_NAME}
        </p>
        <nav className="header-nav">
          <Link className="header-link" href="/pricing">
            Pricing
          </Link>
          <Link className="header-link" href="/privacy/facts">
            What Wuwu remembers about you
          </Link>
          <Link className="header-link" href="/privacy">
            Privacy Policy
          </Link>
          <Link className="header-link" href="/terms">
            Terms
          </Link>
        </nav>
      </div>
    </footer>
  );
}
