#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"
env_file=".env.garmin"
compose_file="compose.example.yml"

fail() { printf 'ERROR: %s\n' "$1" >&2; exit 1; }
pass() { printf 'OK: %s\n' "$1"; }
value() { sed -n "s/^$1=//p" "$env_file" | tail -n 1 | tr -d '\r'; }

command -v docker >/dev/null 2>&1 || fail "Docker nie je nainštalovaný."
docker compose version >/dev/null 2>&1 || fail "Docker Compose plugin nie je dostupný."
pass "Docker a Compose sú dostupné."

[[ -f "$env_file" ]] || fail "Chýba $env_file; skopíruj .env.garmin.example."
permissions="$(stat -c '%a' "$env_file" 2>/dev/null || stat -f '%Lp' "$env_file")"
[[ "$permissions" == "600" ]] || fail "$env_file musí mať práva 600, teraz má $permissions."
pass "$env_file má bezpečné práva 600."

webhook_url="$(value GARMIN_DAILY_WEBHOOK_URL)"
webhook_secret="$(value GARMIN_DAILY_WEBHOOK_SECRET)"
[[ "$webhook_url" == https://* ]] || fail "GARMIN_DAILY_WEBHOOK_URL musí byť HTTPS URL."
[[ "$webhook_url" != *YOUR_N8N_HOST* && "$webhook_url" != *REPLACE* ]] || fail "Webhook URL stále obsahuje placeholder."
[[ ${#webhook_secret} -ge 32 ]] || fail "GARMIN_DAILY_WEBHOOK_SECRET musí mať aspoň 32 znakov."
[[ "$webhook_secret" != *replace* ]] || fail "Webhook secret stále obsahuje placeholder."
pass "Webhook URL a secret sú nastavené; hodnoty sa nevypísali."

docker compose --env-file "$env_file" -f "$compose_file" config --quiet
pass "Compose konfigurácia je platná."

if docker volume inspect garmin_garmin_tokens >/dev/null 2>&1; then
  pass "Garmin token volume existuje."
else
  printf 'INFO: Garmin token volume ešte neexistuje; vytvorí ho bootstrap.\n'
fi

printf 'PREFLIGHT_OK\n'
