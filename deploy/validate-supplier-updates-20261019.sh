#!/usr/bin/env bash
set -euo pipefail
umask 077

readonly sas_root=/opt/ccsas
readonly sas_checkout=/opt/ccsas-validation-20261019
readonly sas_target=ce84680c59140d45ca018208c1bde0c8f6e0c2bd
readonly sas_candidate_tag=ccsas-supplier-updates:20261019-ce84680
readonly sas_compose=/opt/ccsas/deploy/compose.yaml

sas_fail() {
    printf '%s\n' "$*" >&2
    exit 1
}

[ "$(id -u)" -eq 0 ] || sas_fail "Run this on the SAS VPS as root."
[ "$(hostname -s)" = srv1177396 ] || sas_fail "This is not the checked SAS VPS."
cd "$sas_root"
git diff --quiet && git diff --cached --quiet || sas_fail "The SAS checkout has tracked changes; stopped."
[ -f /etc/ccsas/app.env ] && [ ! -L /etc/ccsas/app.env ] || sas_fail "Expected the protected SAS environment file."
[ -f /var/lib/ccsas/ccsas.sqlite ] || sas_fail "The checked SAS database is missing."
[ ! -e "$sas_checkout" ] || sas_fail "The validation directory already exists; inspect it before retrying."
git cat-file -e "$sas_target^{commit}"
command -v docker >/dev/null
command -v sha256sum >/dev/null

sas_source=$(git rev-parse HEAD)
sas_branch=$(git branch --show-current)
sas_container=$(docker compose -f "$sas_compose" ps -q app)
[ -n "$sas_container" ] || sas_fail "The running SAS app was not found."
sas_running_image=$(docker inspect --format '{{.Image}}' "$sas_container")
sas_running_tag=$(docker inspect --format '{{.Config.Image}}' "$sas_container")
[ "$(docker inspect --format '{{.State.Running}}' "$sas_container")" = true ] || sas_fail "The SAS app is not running."

mkdir -p /root/ccsas-backups
sas_report=$(mktemp -d /root/ccsas-backups/supplier-validation-20261019-XXXXXX)
printf '%s\n' "$sas_source" > "$sas_report/source-commit.txt"
printf '%s\n' "$sas_branch" > "$sas_report/source-branch.txt"
printf '%s\n' "$sas_running_image" > "$sas_report/running-image.txt"
printf '%s\n' "$sas_running_tag" > "$sas_report/running-tag.txt"
sha256sum /etc/ccsas/app.env > "$sas_report/settings.sha256"

git -c core.hooksPath=/dev/null worktree add --detach "$sas_checkout" "$sas_target"
chmod 700 "$sas_checkout"
[ "$(git -C "$sas_checkout" rev-parse HEAD)" = "$sas_target" ]
[ ! -e "$sas_checkout/.env" ] || sas_fail "The validation checkout unexpectedly contains an environment file."

docker build --progress=plain --tag "$sas_candidate_tag" \
    --file "$sas_checkout/deploy/Dockerfile" "$sas_checkout" 2>&1 | tee "$sas_report/build.log"

[ "$(git rev-parse HEAD)" = "$sas_source" ] || sas_fail "The live source changed during validation."
[ "$(git branch --show-current)" = "$sas_branch" ] || sas_fail "The live branch changed during validation."
git diff --quiet && git diff --cached --quiet || sas_fail "The live checkout changed during validation."
[ "$(docker compose -f "$sas_compose" ps -q app)" = "$sas_container" ] || sas_fail "The live container changed during validation."
[ "$(docker inspect --format '{{.Image}}' "$sas_container")" = "$sas_running_image" ]
[ "$(docker inspect --format '{{.State.Running}}' "$sas_container")" = true ]
sha256sum --check --quiet "$sas_report/settings.sha256"

docker compose -f "$sas_compose" exec -T app node --input-type=module <<'JS' | tee "$sas_report/ad-copy-audit.json"
import {DatabaseSync} from "node:sqlite";
const db=new DatabaseSync("/data/ccsas.sqlite",{readOnly:true});
try {
  const row=db.prepare("SELECT data,version FROM sas_networks WHERE id=?").get("main");
  if(!row)throw Error("SAS network not found");
  const state=JSON.parse(row.data),suppliers=new Map(state.suppliers.map(s=>[s.id,s]));
  const real=state.campaigns.filter(c=>!c.sample&&!suppliers.get(c.supplierId)?.sample);
  const overlong=real.filter(c=>Array.from(c.text||"").length>100);
  const date=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Toronto",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  console.log(JSON.stringify({
    realCampaigns:real.length,
    messagesOver100Characters:overlong.length,
    currentPublishedMessagesOver100:overlong.filter(c=>c.status==="published"&&c.start<=date&&c.end>=date).length,
    suppliersNeedingAShortDisplayName:state.suppliers.filter(s=>!s.sample&&Array.from(s.advertisingName?.trim()||s.name?.trim()||"").length>40).length,
    overlongMessages:overlong.slice(0,20).map(c=>({id:c.id,characters:Array.from(c.text||"").length,status:c.status})),
    additionalOverlongMessages:Math.max(0,overlong.length-20)
  },null,2));
} finally { db.close(); }
JS

docker image inspect "$sas_candidate_tag" --format '{{.Id}}' > "$sas_report/candidate-image.txt"
printf '%s\n' "$sas_target" > "$sas_report/candidate-commit.txt"
printf '%s\n' 'SAS validation build completed.'
printf 'Candidate commit: %s\n' "$sas_target"
printf 'Candidate image: %s\n' "$(cat "$sas_report/candidate-image.txt")"
printf 'Live source: %s\n' "$sas_source"
printf 'Live branch: %s\n' "$sas_branch"
printf 'Live image: %s\n' "$sas_running_image"
printf 'Live image tag: %s\n' "$sas_running_tag"
printf 'Validation report: %s\n' "$sas_report"
