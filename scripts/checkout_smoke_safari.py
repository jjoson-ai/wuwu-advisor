#!/usr/bin/env python3
"""
Minimal hybrid smoke test for the web Pro checkout flow using Safari WebDriver.

Preconditions:
- Safari remote automation is enabled.
- `safaridriver --enable` has been run on this machine at least once.
- The app is running locally or at APP_URL / WUWU_BASE_URL.
- A dedicated free test user is already signed in in Safari for the target app origin.

Manual step:
- Stripe Checkout card entry remains manual. The script pauses at Checkout and
  resumes after the operator confirms the purchase flow is complete.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass


WEBDRIVER_ELEMENT_KEY = "element-6066-11e4-a52e-4f735466cecf"
DEFAULT_BASE_URL = os.environ.get("WUWU_BASE_URL") or os.environ.get("APP_URL") or "http://localhost:3000"
DEFAULT_DRIVER_PORT = int(os.environ.get("WUWU_SAFARI_DRIVER_PORT", "4444"))


class SmokeTestError(RuntimeError):
    pass


@dataclass
class WebDriverSession:
    server_url: str
    session_id: str

    def _request(self, method: str, path: str, payload: dict | None = None) -> dict:
        body = None if payload is None else json.dumps(payload).encode()
        request = urllib.request.Request(
            f"{self.server_url}{path}",
            data=body,
            headers={"Content-Type": "application/json"},
            method=method,
        )

        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                return json.loads(response.read().decode() or "{}")
        except urllib.error.HTTPError as error:
            raw = error.read().decode()
            try:
                payload = json.loads(raw)
            except json.JSONDecodeError:
                payload = {"value": {"message": raw}}
            raise SmokeTestError(
                f"WebDriver {method} {path} failed: {payload.get('value', {}).get('message', raw)}"
            ) from error

    def navigate(self, url: str) -> None:
        self._request("POST", f"/session/{self.session_id}/url", {"url": url})

    def get_url(self) -> str:
        payload = self._request("GET", f"/session/{self.session_id}/url")
        return payload["value"]

    def execute(self, script: str, args: list | None = None):
        payload = self._request(
            "POST",
            f"/session/{self.session_id}/execute/sync",
            {"script": script, "args": args or []},
        )
        return payload.get("value")

    def body_text(self) -> str:
        value = self.execute("return document.body ? document.body.innerText : '';")
        return value if isinstance(value, str) else ""

    def find_element(self, using: str, value: str) -> str | None:
        payload = self._request(
            "POST",
            f"/session/{self.session_id}/element",
            {"using": using, "value": value},
        )
        element = payload.get("value")
        if not isinstance(element, dict):
            return None
        return element.get(WEBDRIVER_ELEMENT_KEY)

    def click(self, element_id: str) -> None:
        self._request("POST", f"/session/{self.session_id}/element/{element_id}/click", {})

    def close(self) -> None:
        try:
            self._request("DELETE", f"/session/{self.session_id}")
        except Exception:
            pass


def start_safaridriver(port: int) -> subprocess.Popen[str]:
    process = subprocess.Popen(
        ["safaridriver", "-p", str(port)],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    time.sleep(2)
    return process


def create_session(server_url: str) -> WebDriverSession:
    request = urllib.request.Request(
        f"{server_url}/session",
        data=json.dumps({"capabilities": {"alwaysMatch": {"browserName": "safari"}}}).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            payload = json.loads(response.read().decode() or "{}")
    except urllib.error.HTTPError as error:
        raw = error.read().decode()
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            payload = {"value": {"message": raw}}
        raise SmokeTestError(
            f"Could not create Safari WebDriver session: {payload.get('value', {}).get('message', raw)}"
        ) from error

    session_id = payload.get("value", {}).get("sessionId") or payload.get("sessionId")

    if not isinstance(session_id, str) or session_id == "":
        raise SmokeTestError("Safari WebDriver did not return a session id.")

    return WebDriverSession(server_url=server_url, session_id=session_id)


def wait_for(condition, timeout: float, description: str, interval: float = 1.0):
    deadline = time.time() + timeout
    while time.time() < deadline:
        value = condition()
        if value:
            return value
        time.sleep(interval)
    raise SmokeTestError(f"Timed out waiting for {description}.")


def xpath_for_button(label: str) -> str:
    escaped = label.replace("'", "\\'")
    return f"//button[normalize-space()='{escaped}']"


def click_button(session: WebDriverSession, label: str) -> None:
    element_id = wait_for(
        lambda: session.find_element("xpath", xpath_for_button(label)),
        timeout=20,
        description=f"button '{label}'",
    )
    session.click(element_id)


def ensure_not_on_login(session: WebDriverSession) -> None:
    body = session.body_text()
    current_url = session.get_url()
    if "/login" in current_url or "Sign in to" in body:
        raise SmokeTestError(
            "Safari automation session is not signed in. Sign in manually in Safari for this app origin and rerun."
        )


def ensure_free_forecast_state(session: WebDriverSession, base_url: str) -> None:
    session.navigate(f"{base_url}/forecast")
    wait_for(lambda: "Forecast" in session.body_text(), 20, "Forecast page")
    ensure_not_on_login(session)

    body = session.body_text()

    if "Planning lens" in body:
        raise SmokeTestError(
            "The current user already has full Pro Forecast depth. Use a dedicated free test user."
        )

    if "Unlock Pro" in body:
        return

    if "Generate My Forecast" in body:
        print("Generating a free Forecast artifact first...")
        click_button(session, "Generate My Forecast")
        wait_for(
            lambda: "What’s unfolding this month" in session.body_text()
            or "What's unfolding this month" in session.body_text(),
            120,
            "free Forecast summary",
        )
        wait_for(lambda: "Unlock Pro" in session.body_text(), 30, "free locked Forecast card")
        return

    raise SmokeTestError(
        "Could not find a usable free Forecast state. Open /forecast manually and confirm the user is free."
    )


def verify_stripe_checkout_redirect(session: WebDriverSession, base_url: str) -> str:
    click_button(session, "Unlock Pro")

    def moved_off_app():
        current_url = session.get_url()
        return current_url if current_url.startswith(base_url) is False else None

    checkout_url = wait_for(
        moved_off_app,
        timeout=30,
        description="redirect to Stripe Checkout",
    )
    return checkout_url


def wait_for_return_to_app(session: WebDriverSession, base_url: str) -> str:
    def returned():
        current_url = session.get_url()
        return current_url if current_url.startswith(base_url) else None

    return wait_for(returned, timeout=300, description="return to the app after Checkout")


def verify_stale_after_upgrade(session: WebDriverSession) -> None:
    body = session.body_text()
    if "Refresh for your current tier" not in body and "Needs refresh" not in body:
        raise SmokeTestError(
            "Expected stale free Forecast messaging after upgrade, but it was not visible."
        )

    if "Unlock Pro" in body:
        raise SmokeTestError(
            "Upgrade CTA is still visible after checkout return. The app does not appear to be treating the user as Pro."
        )


def regenerate_and_verify_pro_depth(session: WebDriverSession) -> None:
    print("Regenerating Forecast to verify full Pro depth...")
    click_button(session, "Regenerate Forecast")
    wait_for(
        lambda: "Planning lens" in session.body_text(),
        timeout=180,
        description="full Pro Forecast detail after regeneration",
    )


def main() -> int:
    base_url = DEFAULT_BASE_URL.rstrip("/")
    server_url = f"http://127.0.0.1:{DEFAULT_DRIVER_PORT}"

    print(f"Using app origin: {base_url}")
    print("Assuming Safari remote automation is enabled and the free test user is already signed in.")

    driver = start_safaridriver(DEFAULT_DRIVER_PORT)
    session: WebDriverSession | None = None

    try:
        session = create_session(server_url)
        ensure_free_forecast_state(session, base_url)

        checkout_url = verify_stripe_checkout_redirect(session, base_url)
        print(f"Reached external checkout page: {checkout_url}")
        print("")
        print("Manual step required now:")
        print("- Complete the Stripe test purchase in Safari.")
        print("- Wait for the browser to return to the app.")
        input("Press Enter after the purchase flow has returned to the app...")

        returned_url = wait_for_return_to_app(session, base_url)
        print(f"Returned to app URL: {returned_url}")

        parsed = urllib.parse.urlparse(returned_url)
        query = urllib.parse.parse_qs(parsed.query)
        if query.get("upgraded") != ["1"]:
            print("Note: final URL did not contain upgraded=1. Continuing with UI assertions.")

        verify_stale_after_upgrade(session)
        print("Verified stale-after-upgrade behavior: free artifact did not simply unlock.")

        regenerate_and_verify_pro_depth(session)
        print("Verified Pro regeneration path: full Forecast detail is visible.")
        print("Smoke test passed.")
        return 0
    except SmokeTestError as error:
        print(f"Smoke test failed: {error}", file=sys.stderr)
        return 1
    finally:
        if session is not None:
            session.close()
        driver.terminate()
        try:
            driver.wait(timeout=3)
        except subprocess.TimeoutExpired:
            driver.kill()


if __name__ == "__main__":
    raise SystemExit(main())
