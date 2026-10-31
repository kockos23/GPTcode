#!/usr/bin/env bash
set -euo pipefail

for name in N8N_BASE_URL N8N_API_KEY; do
  [[ -n "${!name:-}" ]] || { echo "FAIL $name is missing" >&2; exit 1; }
done
[[ "$N8N_BASE_URL" =~ ^https://[^/[:space:]]+/?$ ]] || { echo "FAIL N8N_BASE_URL is not an HTTPS origin" >&2; exit 1; }
for command in curl jq; do command -v "$command" >/dev/null || { echo "FAIL $command is required" >&2; exit 1; }; done

temporary_directory="$(mktemp -d /tmp/wof-finance-audit.XXXXXX)"
trap 'rm -rf "$temporary_directory"' EXIT
api_header="X-N8N-API-KEY: $N8N_API_KEY"

curl --silent --show-error --fail-with-body --max-time 30 --header "$api_header" \
  "$N8N_BASE_URL/api/v1/workflows?limit=100" --output "$temporary_directory/workflows.json"

active_ids=(976VfstjatIijTZx kGkyEMhtp7qdGtFI ajAP0czttC0c9syg JcLXUmhJ0Kevytvi 9Ynr2a9IaT5m0UJy cmGxWnoZh613XRWTF7o09)
inactive_ids=(Rog0Z5TIQ6qSpzFX OXvMtU4eUHGuGqw2 kp5UV1ZLKe5XjPWP R0bTgnf4bcPX41tG GYjLHpte4wi3g06L 2YGEEBjYBn8aNBsY)

for id in "${active_ids[@]}"; do
  jq -e --arg id "$id" '.data | any(.id==$id and .active==true)' "$temporary_directory/workflows.json" >/dev/null || { echo "FAIL expected active workflow $id" >&2; exit 1; }
done
for id in "${inactive_ids[@]}"; do
  jq -e --arg id "$id" '.data | any(.id==$id and .active==false)' "$temporary_directory/workflows.json" >/dev/null || { echo "FAIL expected inactive workflow $id" >&2; exit 1; }
done

declare -A expected_schedule=(
  [JcLXUmhJ0Kevytvi]='15 7,17 * * *'
  [R0bTgnf4bcPX41tG]='18 7,17 * * *'
  [OXvMtU4eUHGuGqw2]='22 7,17 * * *'
  [kp5UV1ZLKe5XjPWP]='27 7,17 * * *'
  [Rog0Z5TIQ6qSpzFX]='30 7,17 * * *'
  [2YGEEBjYBn8aNBsY]='35 7,17 * * *'
)

audited_ids=(ajAP0czttC0c9syg JcLXUmhJ0Kevytvi 9Ynr2a9IaT5m0UJy Rog0Z5TIQ6qSpzFX OXvMtU4eUHGuGqw2 kp5UV1ZLKe5XjPWP R0bTgnf4bcPX41tG GYjLHpte4wi3g06L 2YGEEBjYBn8aNBsY)
for id in "${audited_ids[@]}"; do
  output="$temporary_directory/workflow-$id.json"
  curl --silent --show-error --fail-with-body --max-time 30 --header "$api_header" \
    "$N8N_BASE_URL/api/v1/workflows/$id" --output "$output"
  grep -q 'REPLACE_WITH_' "$output" && { echo "FAIL workflow $id contains a placeholder" >&2; exit 1; }
  jq -e '.settings.errorWorkflow=="cmGxWnoZh613XRWTF7o09"' "$output" >/dev/null || { echo "FAIL workflow $id has no SARA error workflow" >&2; exit 1; }
  jq -e '.settings.timezone=="Europe/Bratislava"' "$output" >/dev/null || { echo "FAIL workflow $id has wrong timezone" >&2; exit 1; }
  if [[ -n "${expected_schedule[$id]:-}" ]]; then
    jq -e --arg cron "${expected_schedule[$id]}" '[.nodes[] | select(.type|test("scheduleTrigger")) | .parameters.rule.interval[]?.expression] | any(.==$cron)' "$output" >/dev/null || { echo "FAIL workflow $id has unexpected schedule" >&2; exit 1; }
  fi
done

for id in ajAP0czttC0c9syg JcLXUmhJ0Kevytvi 9Ynr2a9IaT5m0UJy; do
  jq -e '.settings.saveDataSuccessExecution=="none" and .settings.saveDataErrorExecution=="all" and .settings.saveExecutionProgress==false and .settings.executionTimeout==900' "$temporary_directory/workflow-$id.json" >/dev/null || { echo "FAIL workflow $id has unsafe execution retention" >&2; exit 1; }
done

curl --silent --show-error --fail-with-body --max-time 30 --header "$api_header" \
  "$N8N_BASE_URL/api/v1/executions?status=error&limit=100&includeData=false" --output "$temporary_directory/errors.json"
active_json="$(printf '%s\n' "${active_ids[@]}" | jq -R . | jq -s .)"
cutoff="$(( $(date +%s) - 7 * 24 * 60 * 60 ))"
recent_errors="$(jq --argjson active "$active_json" --argjson cutoff "$cutoff" '[.data[] | select((.workflowId as $id | $active | index($id)) != null) | select((.startedAt | sub("\\.[0-9]+Z$"; "Z") | fromdateiso8601) >= $cutoff)] | length' "$temporary_directory/errors.json")"
[[ "$recent_errors" == "0" ]] || { echo "FAIL active finance/NORA workflows have $recent_errors errors in the last 7 days" >&2; exit 1; }

echo "PASS finance live audit; active=${#active_ids[@]}; inactive=${#inactive_ids[@]}; recent_errors=0"
