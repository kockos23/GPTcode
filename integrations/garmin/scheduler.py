"""Runs the one-shot bridge daily at 04:30 Europe/Bratislava."""

from __future__ import annotations

import subprocess
import time
import json
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo


ZONE = ZoneInfo("Europe/Bratislava")


def log(event: str, **details: object) -> None:
    print(json.dumps({"event": event, "at": datetime.now(ZONE).isoformat(), **details}), flush=True)


def run_bridge(attempt: int) -> bool:
    try:
        completed = subprocess.run(["python", "/app/bridge.py"], check=False, timeout=300)
        log("garmin_sync_finished", attempt=attempt, returncode=completed.returncode)
        return completed.returncode == 0
    except subprocess.TimeoutExpired:
        log("garmin_sync_timeout", attempt=attempt)
        return False


def next_run(now: datetime) -> datetime:
    target = now.replace(hour=4, minute=30, second=0, microsecond=0)
    return target if target > now else target + timedelta(days=1)


def main() -> None:
    while True:
        now = datetime.now(ZONE)
        target = next_run(now)
        wait_seconds = max(1, (target - now).total_seconds())
        log("garmin_sync_scheduled", target=target.isoformat(), waitSeconds=round(wait_seconds))
        time.sleep(wait_seconds)
        if not run_bridge(1):
            time.sleep(900)
            run_bridge(2)


if __name__ == "__main__":
    main()
