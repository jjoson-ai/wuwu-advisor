import Link from "next/link";

import { APP_NAME } from "@/lib/config";

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
