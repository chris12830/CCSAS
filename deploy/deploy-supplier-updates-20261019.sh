#!/usr/bin/env bash
set -eEuo pipefail
umask 077

readonly sas_root=/opt/ccsas
readonly sas_checkout=/opt/ccsas-validation-20261019
readonly sas_compose_file=/opt/ccsas/deploy/compose.yaml
readonly sas_database=/var/lib/ccsas/ccsas.sqlite
readonly sas_old_source=4e8849100727b73b89f53a065990e04bd37f4e6e
readonly sas_old_branch=feature/complimentary-supplier-access
readonly sas_target=ce84680c59140d45ca018208c1bde0c8f6e0c2bd
readonly sas_release=release/supplier-updates-20261019
readonly sas_candidate=ccsas-supplier-updates:20261019-ce84680
readonly sas_candidate_id=sha256:ba9c940b8bea5e753f8fa94593fb09a86101ef674bcb195cc2a576ff2aac6905
readonly sas_live_tag=ccsas-app:latest
sas_backup=
sas_changed=0

sas_fail() { printf '%s\n' "$*" >&2; return 1; }
sas_compose() { docker compose -f "$sas_compose_file" "$@"; }
sas_wait() {
    local sas_attempt
    for sas_attempt in $(seq 1 20); do
        if curl --fail --silent --max-time 2 -H 'Host: childcaresas.com' http://127.0.0.1:3100/login >/dev/null; then return 0; fi
        sleep 1
    done
    sas_fail "The SAS app did not become ready."
}
sas_fingerprint() {
    python3 - "$1" <<'PY'
from pathlib import Path
import hashlib,json,sqlite3,sys
db=sqlite3.connect(Path(sys.argv[1]).resolve().as_uri()+"?mode=ro",uri=True,timeout=10)
try:
    db.execute("BEGIN")
    payload=[]
    for table in ("sas_networks","sas_supplier_records","vps_users","vps_migrations"):
        cursor=db.execute('SELECT * FROM "'+table+'"')
        columns=[item[0] for item in cursor.description]
        rows=sorted((list(row) for row in cursor.fetchall()),key=lambda row:json.dumps(row,ensure_ascii=True))
        payload.append([table,columns,rows])
    print(hashlib.sha256(json.dumps(payload,ensure_ascii=True,separators=(",",":")).encode()).hexdigest())
finally:
    db.close()
PY
}
sas_other_containers() {
    python3 - <<'PY'
import json,subprocess
ids=subprocess.check_output(["docker","ps","--all","--quiet","--no-trunc"],text=True).split()
rows=json.loads(subprocess.check_output(["docker","inspect",*ids],text=True)) if ids else []
saved=[]
for row in rows:
    labels=row["Config"].get("Labels") or {}
    if labels.get("com.docker.compose.project")=="ccsas" and labels.get("com.docker.compose.service")=="app":
        continue
    saved.append({"id":row["Id"],"image":row["Image"],"running":row["State"]["Running"],"started":row["State"]["StartedAt"],"ports":row["NetworkSettings"].get("Ports")})
print(json.dumps(sorted(saved,key=lambda row:row["id"]),sort_keys=True,separators=(",",":")))
PY
}
sas_feed_check() {
    sas_compose exec -T app node --input-type=module - "$1" <<'JS'
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
const phase=process.argv[2],key=process.env.SAS_CCON_APP_KEY;
assert.ok(key,"The configured CCON connection key is unavailable.");
const db=new DatabaseSync("/data/ccsas.sqlite",{readOnly:true});
let state;
try {state=JSON.parse(db.prepare("SELECT data FROM sas_networks WHERE id=?").get("main").data);}
finally {db.close();}
const hubs=[...new Set(state.campaigns.filter(c=>!c.sample&&c.hubId).map(c=>c.hubId))].sort();
const scopes=[{placement:"Dashboard ticker",hub:""}];
for(const hub of hubs)for(const placement of ["Resource hub ticker","Resource hub static"])scopes.push({placement,hub});
const checked=[];
for(const country of ["CA","US"])for(const scope of scopes){
    const url=new URL("http://127.0.0.1:3100/api/feed");
    for(const [name,value] of Object.entries({app:"owners",audience:"owner",country,...scope}))if(value)url.searchParams.set(name,value);
    const response=await fetch(url,{headers:{"X-SAS-App-Key":key,Host:"childcaresas.com"},signal:AbortSignal.timeout(10000)});
    assert.equal(response.status,200,"CCON feed HTTP "+response.status);
    const data=await response.json();
    assert.ok(Array.isArray(data.ads),"The CCON feed did not contain an ad list.");
    if(phase==="after"){
        assert.equal(data.settings.maxCopy,100);
        assert.equal(data.settings.maxSupplierName,40);
        for(const ad of data.ads){
            assert.equal(typeof ad.text,"string");
            assert.ok(Array.from(ad.text).length<=100);
            assert.equal(typeof ad.supplier,"string");
            assert.ok(Array.from(ad.supplier).length<=40);
            assert.ok(!Object.hasOwn(ad,"name"),"An internal campaign title was exposed.");
        }
    }
    checked.push({country,...scope,ids:data.ads.map(ad=>ad.id).sort()});
}
console.log(JSON.stringify(checked));
JS
}
sas_public_check() {
    local sas_phase="$1" sas_currency sas_status
    for sas_currency in CAD USD; do
        curl --fail --silent --show-error --connect-timeout 5 --max-time 20 \
            "https://childcaresas.com/api/catalog?currency=$sas_currency" > "$sas_backup/catalog-$sas_phase-$sas_currency.json"
    done
    sas_status=$(curl --silent --show-error --connect-timeout 5 --max-time 10 \
        -H 'Host: childcaresas.com' --output /dev/null --write-out '%{http_code}' \
        http://127.0.0.1:3100/api/state) || return 1
    [ "$sas_status" = 401 ] || sas_fail "The owner API did not retain its sign-in requirement."
}
sas_restore() {
    local sas_restore_dir="$1" sas_restore_image sas_current_source sas_current_branch sas_current_container
    [ -d "$sas_restore_dir" ] && [ ! -L "$sas_restore_dir" ] && [ -f "$sas_restore_dir/BACKUP_READY" ] || return 1
    (cd "$sas_restore_dir" && sha256sum --check --status backup.sha256) || return 1
    [ "$(cat "$sas_restore_dir/old-source.txt")" = "$sas_old_source" ] || return 1
    [ "$(cat "$sas_restore_dir/old-branch.txt")" = "$sas_old_branch" ] || return 1
    sha256sum --check --status "$sas_restore_dir/settings.sha256" || return 1
    sha256sum --check --status "$sas_restore_dir/compose.sha256" || return 1
    cd "$sas_root" || return 1
    git diff --quiet && git diff --cached --quiet || return 1
    sas_current_source=$(git rev-parse HEAD) || return 1
    sas_current_branch=$(git branch --show-current) || return 1
    if [ "$sas_current_source" = "$sas_target" ] && [ "$sas_current_branch" = "$sas_release" ]; then
        [ "$(git rev-parse "$sas_old_branch")" = "$sas_old_source" ] || return 1
        git -c core.hooksPath=/dev/null switch "$sas_old_branch" || return 1
    elif [ "$sas_current_source" != "$sas_old_source" ] || [ "$sas_current_branch" != "$sas_old_branch" ]; then
        printf '%s\n' "Rollback stopped because the live source has a different release." >&2
        return 1
    fi
    sas_restore_image=$(cat "$sas_restore_dir/old-image.txt") || return 1
    if ! docker image inspect "$sas_restore_image" >/dev/null 2>&1; then
        docker image load --input "$sas_restore_dir/previous-image.tar" >/dev/null || return 1
    fi
    docker image tag "$sas_restore_image" "$sas_live_tag" || return 1
    sas_current_container=$(sas_compose ps --all --quiet app) || return 1
    if [ -z "$sas_current_container" ] || \
       [ "$(docker inspect --format '{{.Image}} {{.State.Running}}' "$sas_current_container")" != "$sas_restore_image true" ]; then
        sas_compose up --detach --no-deps --no-build --pull never --force-recreate app || return 1
    fi
    sas_wait || return 1
    [ "$(git rev-parse HEAD)" = "$sas_old_source" ] || return 1
    sas_current_container=$(sas_compose ps --quiet app) || return 1
    [ -n "$sas_current_container" ] || return 1
    [ "$(docker inspect --format '{{.Image}} {{.State.Running}}' "$sas_current_container")" = "$sas_restore_image true" ] || return 1
    sha256sum --check --status "$sas_restore_dir/settings.sha256" || return 1
    printf '%s\n' ROLLED_BACK > "$sas_restore_dir/deploy-status.txt"
    printf '%s\n' "SAS rolled back to the previous source and image. The current database and settings were retained."
}
sas_on_exit() {
    local sas_status="$1"
    trap - EXIT ERR INT TERM HUP
    if [ "$sas_status" -ne 0 ]; then
        if [ "$sas_changed" -eq 1 ]; then
            printf '%s\n' "Deployment checks failed; restoring the previous SAS release." >&2
            set +e
            if sas_restore "$sas_backup"; then
                printf '%s\n' "Automatic rollback completed." >&2
            else
                printf '%s\n' ROLLBACK_FAILED > "$sas_backup/deploy-status.txt"
                printf 'Automatic rollback could not finish. Inspect the private log and backup: %s\n' "$sas_backup" >&2
            fi
        elif [ -n "$sas_backup" ]; then
            printf '%s\n' STOPPED_BEFORE_RELEASE > "$sas_backup/deploy-status.txt"
        fi
    fi
    exit "$sas_status"
}

[ "$(id -u)" -eq 0 ] || sas_fail "Run this on the SAS VPS as root."
[ "$(hostname -s)" = srv1177396 ] || sas_fail "This is not the checked SAS VPS."
for sas_command in git docker python3 curl sha256sum tar gzip flock; do command -v "$sas_command" >/dev/null; done
exec 9>/run/lock/ccsas-supplier-updates-20261019.lock
flock --nonblock 9 || sas_fail "Another supplier update or rollback is already running."
cd "$sas_root"

if [ "$#" -gt 0 ]; then
    [ "$#" -eq 2 ] && [ "$1" = rollback ] || sas_fail "Expected: rollback BACKUP_DIRECTORY"
    sas_backup="$2"
    sas_restore "$sas_backup"
    exit 0
fi

trap 'sas_on_exit $?' EXIT
trap 'printf "SAS deployment check failed at line %s.\n" "$LINENO" >&2' ERR
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP

[ "$(git rev-parse HEAD)" = "$sas_old_source" ] || sas_fail "The live SAS source differs from the checked release."
[ "$(git branch --show-current)" = "$sas_old_branch" ] || sas_fail "The live SAS branch differs from the checked branch."
git diff --quiet && git diff --cached --quiet || sas_fail "The live SAS checkout has tracked changes."
if git show-ref --verify --quiet "refs/heads/$sas_release"; then sas_fail "The supplier release branch already exists; inspect its deployment status before retrying."; fi
[ "$(git -C "$sas_checkout" rev-parse HEAD)" = "$sas_target" ] || sas_fail "The validation source is not the checked candidate."
git -C "$sas_checkout" diff --quiet && git -C "$sas_checkout" diff --cached --quiet || sas_fail "The validation checkout has tracked changes."
[ -f /etc/ccsas/app.env ] && [ ! -L /etc/ccsas/app.env ] || sas_fail "Expected the protected environment file."
[ -f "$sas_database" ] && [ ! -L "$sas_database" ] || sas_fail "Expected the checked SAS database."
[ "$(docker image inspect "$sas_candidate" --format '{{.Id}}')" = "$sas_candidate_id" ] || sas_fail "The candidate image differs from the validated image."
case "$(sas_compose config --images)" in ccsas-app|ccsas-app:latest) ;; *) sas_fail "The Compose image mapping differs from the checked deployment." ;; esac

python3 - "$sas_old_source" "$sas_target" <<'PY'
import subprocess,sys
expected={
"app/api/feed/route.ts","app/globals.css","app/sas-client.tsx","app/supplier-workspace.tsx","docs/hostinger-vps.md",
"lib/sas-actions.ts","lib/sas-model.ts","lib/supplier-advertising.d.mts","lib/supplier-advertising.mjs",
"lib/supplier-notices.d.mts","lib/supplier-notices.mjs","lib/supplier-workflows.mjs","scripts/verify-sas.mjs",
"tests/sas.test.ts","tests/supplier-api.test.mjs","tests/supplier-notices.test.mjs","tests/supplier-workflows.test.mjs"}
actual=set(subprocess.check_output(["git","diff","--name-only",sys.argv[1],sys.argv[2]],text=True).splitlines())
if actual!=expected: raise SystemExit("The source changes differ from the reviewed supplier update.")
PY

sas_report=$(python3 - "$sas_target" "$sas_candidate_id" <<'PY'
from pathlib import Path
import sys
matches=[]
for path in Path("/root/ccsas-backups").glob("supplier-validation-20261019-*"):
    if not path.is_dir() or path.is_symlink(): continue
    try:
        if (path/"candidate-commit.txt").read_text().strip()==sys.argv[1] and (path/"candidate-image.txt").read_text().strip()==sys.argv[2]:
            matches.append(path)
    except FileNotFoundError:
        pass
if not matches: raise SystemExit("The completed candidate validation report was not found.")
print(max(matches,key=lambda path:path.stat().st_mtime))
PY
)
sha256sum --check --status "$sas_report/settings.sha256"
[ "$(cat "$sas_report/source-commit.txt")" = "$sas_old_source" ]
[ "$(cat "$sas_report/source-branch.txt")" = "$sas_old_branch" ]
sas_container=$(sas_compose ps --quiet app)
[ -n "$sas_container" ] || sas_fail "The running SAS app was not found."
sas_previous_image=$(docker inspect --format '{{.Image}}' "$sas_container")
[ "$sas_previous_image" = "$(cat "$sas_report/running-image.txt")" ] || sas_fail "The running SAS image changed since validation."
[ "$(docker inspect --format '{{.State.Running}}' "$sas_container")" = true ]
[ "$(docker image inspect "$sas_live_tag" --format '{{.Id}}')" = "$sas_previous_image" ] || sas_fail "The live image tag no longer matches the running release."

# Parse every embedded script before creating backups or changing a release.
python3 - "$0" <<'PY'
import ast,re,subprocess,sys
from pathlib import Path
code=Path(sys.argv[1]).read_text()
for body in re.findall(r"<<'PY'\n(.*?)\nPY(?:\n|$)",code,re.S):
    ast.parse(body,filename="embedded-deployment-check.py")
for body in re.findall(r"<<'JS'\n(.*?)\nJS(?:\n|$)",code,re.S):
    subprocess.run(["docker","compose","-f","/opt/ccsas/deploy/compose.yaml","exec","-T","app","node","--input-type=module","--check"],input=body,text=True,check=True)
print("Deployment script syntax checks passed.")
PY

python3 - "$sas_previous_image" <<'PY'
import json,shutil,subprocess,sys
image=json.loads(subprocess.check_output(["docker","image","inspect",sys.argv[1]],text=True))[0]
data=int(subprocess.check_output(["du","--summarize","--block-size=1","/var/lib/ccsas"],text=True).split()[0])
if shutil.disk_usage("/root").free < image["Size"]*2+data*2+1024**3:
    raise SystemExit("Insufficient free space for the fresh rollback backup.")
PY

sas_backup=$(mktemp -d /root/ccsas-backups/supplier-deploy-20261019-XXXXXX)
printf 'Backup: %s\n' "$sas_backup"
printf '%s\n' BACKING_UP > "$sas_backup/deploy-status.txt"
printf '%s\n' "$sas_old_source" > "$sas_backup/old-source.txt"
printf '%s\n' "$sas_old_branch" > "$sas_backup/old-branch.txt"
printf '%s\n' "$sas_previous_image" > "$sas_backup/old-image.txt"
printf '%s\n' "$sas_live_tag" > "$sas_backup/old-tag.txt"
sas_rollback_tag="ccsas-rollback:$(basename "$sas_backup")"
printf '%s\n' "$sas_rollback_tag" > "$sas_backup/rollback-tag.txt"
cp -p /etc/ccsas/app.env "$sas_backup/app.env"
cp -p "$sas_compose_file" "$sas_backup/compose.yaml"
cp -p "$(git rev-parse --git-path config)" "$sas_backup/git-config"
cp -- "$0" "$sas_backup/deploy-script.sh"
chmod 700 "$sas_backup/deploy-script.sh"
sha256sum /etc/ccsas/app.env > "$sas_backup/settings.sha256"
sha256sum "$sas_compose_file" > "$sas_backup/compose.sha256"
git archive "$sas_old_source" | gzip > "$sas_backup/source.tar.gz"
git bundle create "$sas_backup/repository.bundle" --all >/dev/null 2>&1
git bundle verify "$sas_backup/repository.bundle" >/dev/null 2>&1
tar --create --gzip --file "$sas_backup/data-files.tar.gz" --directory /var/lib/ccsas \
    --exclude='./ccsas.sqlite' --exclude='./ccsas.sqlite-wal' --exclude='./ccsas.sqlite-shm' .
gzip --test "$sas_backup/source.tar.gz" "$sas_backup/data-files.tar.gz"

python3 - "$sas_database" "$sas_backup/ccsas.sqlite" <<'PY'
from pathlib import Path
import os,sqlite3,sys
source=sqlite3.connect(Path(sys.argv[1]).resolve().as_uri()+"?mode=ro",uri=True,timeout=10)
target=sqlite3.connect(sys.argv[2],timeout=10)
try:
    source.backup(target,pages=256,sleep=0.05)
    if target.execute("PRAGMA quick_check").fetchall()!=[("ok",)]:
        raise SystemExit("The fresh database backup did not pass its integrity check.")
finally:
    target.close()
    source.close()
os.chmod(sys.argv[2],0o600)
print("Fresh SQLite backup integrity check passed.")
PY

python3 - "$sas_backup/ccsas.sqlite" <<'PY'
from pathlib import Path
import json,sqlite3,sys
db=sqlite3.connect(Path(sys.argv[1]).resolve().as_uri()+"?mode=ro",uri=True)
try:
    state=json.loads(db.execute("SELECT data FROM sas_networks WHERE id=?",("main",)).fetchone()[0])
    suppliers={s["id"]:s for s in state["suppliers"]}
    real=[c for c in state["campaigns"] if not c.get("sample") and not suppliers.get(c.get("supplierId"),{}).get("sample")]
    overlong=[c for c in real if len(c.get("text") or "")>100]
    print("Fresh advertising audit:",len(real),"real campaigns;",len(overlong),"messages over 100 characters.")
    if overlong: raise SystemExit("Stored overlong advertising needs review before deployment.")
finally:
    db.close()
PY

sas_fingerprint "$sas_backup/ccsas.sqlite" > "$sas_backup/protected-before.sha256"
sas_other_containers > "$sas_backup/other-containers-before.json"
sas_public_check before
sas_feed_check before > "$sas_backup/feeds-before.json"
docker image tag "$sas_previous_image" "$sas_rollback_tag"
docker image save --output "$sas_backup/previous-image.tar" "$sas_rollback_tag"
tar --list --file "$sas_backup/previous-image.tar" >/dev/null
(
    cd "$sas_backup"
    sha256sum app.env compose.yaml git-config deploy-script.sh settings.sha256 compose.sha256 \
        source.tar.gz repository.bundle data-files.tar.gz ccsas.sqlite previous-image.tar \
        old-source.txt old-branch.txt old-image.txt old-tag.txt rollback-tag.txt protected-before.sha256 \
        other-containers-before.json catalog-before-CAD.json catalog-before-USD.json feeds-before.json > backup.sha256
    sha256sum --check --status backup.sha256
)
touch "$sas_backup/BACKUP_READY"
printf 'bash %q rollback %q\n' "$sas_backup/deploy-script.sh" "$sas_backup" > "$sas_backup/rollback-command.txt"

# Recheck the live source, settings, data and containers after the online backup.
[ "$(git rev-parse HEAD)" = "$sas_old_source" ] && [ "$(git branch --show-current)" = "$sas_old_branch" ] || sas_fail "The live source changed during backup."
git diff --quiet && git diff --cached --quiet || sas_fail "The live checkout changed during backup."
[ "$(sas_compose ps --quiet app)" = "$sas_container" ]
[ "$(docker inspect --format '{{.Image}} {{.State.Running}}' "$sas_container")" = "$sas_previous_image true" ]
[ "$(docker image inspect "$sas_candidate" --format '{{.Id}}')" = "$sas_candidate_id" ]
[ "$(docker image inspect "$sas_live_tag" --format '{{.Id}}')" = "$sas_previous_image" ]
sha256sum --check --status "$sas_backup/settings.sha256"
sha256sum --check --status "$sas_backup/compose.sha256"
sas_fingerprint "$sas_database" > "$sas_backup/protected-current.sha256"
cmp --silent "$sas_backup/protected-before.sha256" "$sas_backup/protected-current.sha256"
sas_other_containers > "$sas_backup/other-containers-current.json"
cmp --silent "$sas_backup/other-containers-before.json" "$sas_backup/other-containers-current.json"

printf '%s\n' "Fresh backup verified; switching only the SAS app."
printf '%s\n' RELEASING > "$sas_backup/deploy-status.txt"
sas_changed=1
git -c core.hooksPath=/dev/null switch -c "$sas_release" "$sas_target"
docker image tag "$sas_candidate_id" "$sas_live_tag"
sas_compose up --detach --no-deps --no-build --pull never --force-recreate app
sas_wait
sas_new_container=$(sas_compose ps --quiet app)
[ -n "$sas_new_container" ]
[ "$(docker inspect --format '{{.Image}} {{.State.Running}}' "$sas_new_container")" = "$sas_candidate_id true" ]
sas_public_check after
sas_feed_check after > "$sas_backup/feeds-after.json"

python3 - "$sas_backup" <<'PY'
from pathlib import Path
import json,sys
path=Path(sys.argv[1])
for currency in ("CAD","USD"):
    before=json.loads((path/("catalog-before-"+currency+".json")).read_text())
    after=json.loads((path/("catalog-after-"+currency+".json")).read_text())
    if before!=after or after.get("packageStructure")!="shared-sas":
        raise SystemExit("The public package catalog changed unexpectedly.")
if json.loads((path/"feeds-before.json").read_text())!=json.loads((path/"feeds-after.json").read_text()):
    raise SystemExit("CCON feed membership changed unexpectedly during deployment.")
PY

sha256sum --check --status "$sas_backup/settings.sha256"
sha256sum --check --status "$sas_backup/compose.sha256"
sas_fingerprint "$sas_database" > "$sas_backup/protected-after.sha256"
cmp --silent "$sas_backup/protected-before.sha256" "$sas_backup/protected-after.sha256"
sas_other_containers > "$sas_backup/other-containers-after.json"
cmp --silent "$sas_backup/other-containers-before.json" "$sas_backup/other-containers-after.json"
[ "$(git rev-parse HEAD)" = "$sas_target" ] && [ "$(git branch --show-current)" = "$sas_release" ] || sas_fail "The deployed source differs from the candidate."
git diff --quiet && git diff --cached --quiet || sas_fail "The deployed checkout has tracked changes."
printf '%s\n' "$sas_target" > "$sas_backup/deployed-commit.txt"
printf '%s\n' "$sas_candidate_id" > "$sas_backup/deployed-image.txt"
printf '%s\n' DEPLOYED > "$sas_backup/deploy-status.txt"
sas_changed=0
printf '%s\n' "SAS deployment succeeded. The 100-character ad limit and Supplier Services notifications are live."
printf '%s\n' "Settings, supplier and financial records, CAD/USD catalogs, CCON ad membership and other containers verified."
printf 'Commit: %s\nImage: %s\nBackup: %s\n' "$sas_target" "$sas_candidate_id" "$sas_backup"
printf 'Rollback: %s\n' "$(cat "$sas_backup/rollback-command.txt")"
