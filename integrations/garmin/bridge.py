"""One-shot, read-only Garmin Connect daily summary bridge.

Credentials and tokens are read only from environment/secret-mounted paths.
The script never modifies Garmin data and posts only bounded daily aggregates.
"""

from __future__ import annotations

import json
import os
from datetime import date, timedelta
from pathlib import Path
from urllib.request import Request, urlopen

from garminconnect import Garmin

from normalize import normalize_day


def required(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"Missing {name}")
    return value


def safe(call, fallback):
    try:
        return call()
    except Exception:
        return fallback


def main() -> None:
    webhook_url = required("GARMIN_DAILY_WEBHOOK_URL")
    webhook_secret = required("GARMIN_DAILY_WEBHOOK_SECRET")
    target = os.environ.get("GARMIN_TARGET_DATE") or (date.today() - timedelta(days=1)).isoformat()
    token_store = Path(os.environ.get("GARMIN_TOKEN_STORE", "/run/secrets/garmin_tokens"))

    if token_store.exists():
        # Unattended runs use only the persisted OAuth token store. Keeping the
        # account password out of the long-running container reduces exposure.
        client = Garmin("", "", return_on_mfa=True)
        client.login(str(token_store))
    else:
        username = required("GARMIN_CONNECT_USERNAME")
        password = required("GARMIN_CONNECT_PASSWORD")
        client = Garmin(username, password, return_on_mfa=True)
        result = client.login()
        if isinstance(result, tuple) and result and result[0] == "needs_mfa":
            raise RuntimeError("GARMIN_MFA_REQUIRED")
        token_store.mkdir(parents=True, exist_ok=True)
        client.garth.dump(str(token_store))

    stats = safe(lambda: client.get_stats(target), {})
    sleep = safe(lambda: client.get_sleep_data(target), {})
    stress = safe(lambda: client.get_stress_data(target), {})
    battery = safe(lambda: client.get_body_battery(target, target), [])
    activities = safe(lambda: client.get_activities_by_date(target, target), [])
    payload = normalize_day(target, stats, sleep, stress, battery, activities)
    request = Request(
        webhook_url,
        data=json.dumps(payload, separators=(",", ":")).encode(),
        headers={"Authorization": f"Bearer {webhook_secret}", "Content-Type": "application/json"},
        method="POST",
    )
    with urlopen(request, timeout=30) as response:
        if response.status < 200 or response.status >= 300:
            raise RuntimeError(f"Webhook returned HTTP {response.status}")
    print(json.dumps({"ok": True, "date": target, "quality": payload["quality"]}))


if __name__ == "__main__":
    main()
