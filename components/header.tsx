import Link from "next/link";

import { signOutAction } from "@/app/auth/actions";
import { DebugAccessSwitcher } from "@/components/debug-access-switcher";
import { HeaderLoginLink } from "@/components/header-login-link";
import { HeaderNav } from "@/components/header-nav";
import { Logo } from "@/components/icons";
import { SOSButton } from "@/components/sos-button";
import { isInCrisisWindow } from "@/domain/safety/crisis-window";
import { getCurrentUser } from "@/lib/auth";
import { PRODUCT_POSITIONING } from "@/lib/brand";
import { APP_NAME } from "@/lib/config";
import {
  getServerAccessState,
  isDebugAccessOverrideEnabled,
} from "@/lib/debug-access";

export async function Header() {
  const user = await getCurrentUser();
  const access = user === null ? null : await getServerAccessState(user);

  return (
    <header className="header-shell">
      <div className="container header-bar">
        <div className="header-topline">
          <Link className="header-brand" href="/">
            <span className="header-brand-mark">{PRODUCT_POSITIONING}</span>
            <Logo name={APP_NAME} size="md" />
          </Link>
          <div className="header-actions">
            {user !== null && isInCrisisWindow(user) ? <SOSButton /> : null}
            {user !== null && access !== null && isDebugAccessOverrideEnabled() ? (
              <DebugAccessSwitcher currentAccessLevel={access.accessLevel} />
            ) : null}
            {user === null ? (
              <HeaderLoginLink />
            ) : (
              <form action={signOutAction}>
                <button className="button secondary" type="submit">
                  Sign out
                </button>
              </form>
            )}
          </div>
        </div>

        {user !== null ? <HeaderNav /> : null}
      </div>
    </header>
  );
}
