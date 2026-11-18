"""Interactive one-time Garmin MFA bootstrap. Run only in an attached terminal."""

from __future__ import annotations

import getpass
import os
from pathlib import Path

from garminconnect import Garmin


def main() -> None:
    username = os.environ.get("GARMIN_CONNECT_USERNAME", "").strip() or input("Garmin Connect email: ").strip()
    password = os.environ.get("GARMIN_CONNECT_PASSWORD", "").strip() or getpass.getpass("Garmin Connect password: ")
    token_store = Path(os.environ.get("GARMIN_TOKEN_STORE", "/tokens"))
    client = Garmin(username, password, return_on_mfa=True)
    result = client.login()
    if isinstance(result, tuple) and result and result[0] == "needs_mfa":
        client.resume_login(result[1], input("Garmin MFA code: ").strip())
    token_store.mkdir(parents=True, exist_ok=True)
    client.garth.dump(str(token_store))
    os.chmod(token_store, 0o700)
    for child in token_store.iterdir():
        if child.is_file():
            os.chmod(child, 0o600)
    print("Garmin token store initialized. Credentials and tokens were not printed.")


if __name__ == "__main__":
    main()
