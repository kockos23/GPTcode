"""Runs the one-shot bridge daily at 04:30 Europe/Bratislava."""

from __future__ import annotations

import subprocess
import time
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo


ZONE = ZoneInfo("Europe/Bratislava")


def next_run(now: datetime) -> datetime:
    target = now.replace(hour=4, minute=30, second=0, microsecond=0)
    return target if target > now else target + timedelta(days=1)


while True:
    now = datetime.now(ZONE)
    target = next_run(now)
    time.sleep(max(1, (target - now).total_seconds()))
    completed = subprocess.run(["python", "/app/bridge.py"], check=False, timeout=300)
    if completed.returncode != 0:
        time.sleep(900)
        subprocess.run(["python", "/app/bridge.py"], check=False, timeout=300)
