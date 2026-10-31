#!/usr/bin/env bash
set -euo pipefail

required=(CONVEX_SITE_URL N8N_BASE_URL N8N_API_KEY N8N_INTEGRATION_SECRET)
for name in "${required[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    echo "FAIL $name is missing" >&2
    exit 1
  fi
done

for name in CONVEX_SITE_URL N8N_BASE_URL; do
  if [[ ! "${!name}" =~ ^https://[^/[:space:]]+/?$ ]]; then
    echo "FAIL $name is not an absolute HTTPS origin" >&2
    exit 1
  fi
done

for command in curl jq; do
  command -v "$command" >/dev/null || { echo "FAIL $command is required" >&2; exit 1; }
done

temporary_directory="$(mktemp -d /tmp/wof-finance-preflight.XXXXXX)"
trap 'rm -rf "$temporary_directory"' EXIT

http_code() {
  local output="$1"
  shift
  curl --silent --show-error --max-time 30 --output "$output" --write-out '%{http_code}' "$@"
}

unauthorized_health="$(http_code "$temporary_directory/health-unauthorized.json" "$CONVEX_SITE_URL/integrations/n8n/health")"
[[ "$unauthorized_health" == "401" ]] || { echo "FAIL unauthenticated health expected 401, got $unauthorized_health" >&2; exit 1; }

unauthorized_billdu="$(http_code "$temporary_directory/billdu-unauthorized.json" --request POST --header 'content-type: application/json' --data '{"page":1,"limit":1}' "$CONVEX_SITE_URL/integrations/n8n/billdu/documents")"
[[ "$unauthorized_billdu" == "401" ]] || { echo "FAIL unauthenticated Billdu expected 401, got $unauthorized_billdu" >&2; exit 1; }

health_code="$(http_code "$temporary_directory/health.json" --header "Authorization: Bearer $N8N_INTEGRATION_SECRET" "$CONVEX_SITE_URL/integrations/n8n/health")"
[[ "$health_code" == "200" || "$health_code" == "503" ]] || { echo "FAIL authenticated health expected 200 or 503, got $health_code" >&2; exit 1; }
jq -e '(.ok | type)=="boolean" and (.checkedAt | type)=="number" and (.issues | type)=="array"' "$temporary_directory/health.json" >/dev/null || { echo "FAIL health response schema" >&2; exit 1; }

workflows_code="$(http_code "$temporary_directory/workflows.json" --header "X-N8N-API-KEY: $N8N_API_KEY" "$N8N_BASE_URL/api/v1/workflows?limit=100")"
[[ "$workflows_code" == "200" ]] || { echo "FAIL n8n workflow list expected 200, got $workflows_code" >&2; exit 1; }

active_ids=(976VfstjatIijTZx kGkyEMhtp7qdGtFI ajAP0czttC0c9syg JcLXUmhJ0Kevytvi 9Ynr2a9IaT5m0UJy cmGxWnoZh613XRWTF7o09)
inactive_ids=(Rog0Z5TIQ6qSpzFX OXvMtU4eUHGuGqw2 kp5UV1ZLKe5XjPWP R0bTgnf4bcPX41tG GYjLHpte4wi3g06L 2YGEEBjYBn8aNBsY)

for id in "${active_ids[@]}"; do
  jq -e --arg id "$id" '.data | any(.id==$id and .active==true)' "$temporary_directory/workflows.json" >/dev/null || { echo "FAIL expected active workflow $id" >&2; exit 1; }
done
for id in "${inactive_ids[@]}"; do
  jq -e --arg id "$id" '.data | any(.id==$id and .active==false)' "$temporary_directory/workflows.json" >/dev/null || { echo "FAIL expected inactive workflow $id" >&2; exit 1; }
done

for id in ajAP0czttC0c9syg JcLXUmhJ0Kevytvi 9Ynr2a9IaT5m0UJy Rog0Z5TIQ6qSpzFX OXvMtU4eUHGuGqw2 kp5UV1ZLKe5XjPWP R0bTgnf4bcPX41tG GYjLHpte4wi3g06L 2YGEEBjYBn8aNBsY; do
  detail_code="$(http_code "$temporary_directory/workflow-$id.json" --header "X-N8N-API-KEY: $N8N_API_KEY" "$N8N_BASE_URL/api/v1/workflows/$id")"
  [[ "$detail_code" == "200" ]] || { echo "FAIL workflow $id expected 200, got $detail_code" >&2; exit 1; }
  if grep -q 'REPLACE_WITH_' "$temporary_directory/workflow-$id.json"; then
    echo "FAIL workflow $id contains a placeholder" >&2
    exit 1
  fi
  jq -e '.settings.errorWorkflow=="cmGxWnoZh613XRWTF7o09"' "$temporary_directory/workflow-$id.json" >/dev/null || { echo "FAIL workflow $id has no SARA error workflow" >&2; exit 1; }
done

issue_count="$(jq '.issues | length' "$temporary_directory/health.json")"
echo "PASS finance cutover preflight; health_http=$health_code; health_issues=$issue_count"
