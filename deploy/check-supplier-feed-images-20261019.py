#!/usr/bin/env python3
"""Compare real feed eligibility in private, offline copies; leave production credentials intact."""
from pathlib import Path
import hashlib
import json
import os
import re
import secrets
import sqlite3
import subprocess
import sys
import time
import uuid

JS_BODY = r'''
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
const phase=__PHASE__,key=__KEY__;
const db=new DatabaseSync("/data/ccsas.sqlite",{readOnly:true});
let state;
try {state=JSON.parse(db.prepare("SELECT data FROM sas_networks WHERE id=?").get("main").data);}
finally {db.close();}
const hubs=[...new Set(state.campaigns.filter(c=>!c.sample&&c.hubId).map(c=>c.hubId))].sort();
const scopes=[{placement:"Dashboard ticker",hub:""}];
for(const hub of hubs)for(const placement of ["Resource hub ticker","Resource hub static"])scopes.push({placement,hub});
const checked=[];
const authURL="http://127.0.0.1:3100/api/feed?app=owners";
for(const headers of [{Host:"ccsas-feed-check.invalid"},{Host:"ccsas-feed-check.invalid","X-SAS-App-Key":key+"-invalid"}]){
    const response=await fetch(authURL,{headers,signal:AbortSignal.timeout(10000)});
    assert.equal(response.status,401,"The feed accepted a missing or invalid connection key.");
}
for(const country of ["CA","US"])for(const scope of scopes){
    const url=new URL("http://127.0.0.1:3100/api/feed");
    for(const [name,value] of Object.entries({app:"owners",audience:"owner",country,...scope}))if(value)url.searchParams.set(name,value);
    const response=await fetch(url,{headers:{"X-SAS-App-Key":key,Host:"ccsas-feed-check.invalid"},signal:AbortSignal.timeout(10000)});
    assert.equal(response.status,200,"CCON feed HTTP "+response.status);
    const data=await response.json();
    assert.ok(Array.isArray(data.ads),"The CCON feed did not contain an ad list.");
    if(phase==="candidate"){
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
assert.ok(checked.some(scope=>scope.ids.length>0),"The original snapshot has no eligible CCON ads to verify.");
console.log(JSON.stringify(checked));
'''

def docker(*args, text=None, timeout=120):
    return subprocess.run(
        ["docker", *args], input=text, text=True,
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True, timeout=timeout
    ).stdout.strip()

def clone_database(source_path, directory, key):
    directory.mkdir(mode=0o700)
    target_path=directory/"ccsas.sqlite"
    source=sqlite3.connect(source_path.resolve().as_uri()+"?mode=ro",uri=True,timeout=10)
    target=sqlite3.connect(target_path,timeout=10)
    try:
        source.backup(target,pages=256,sleep=0.05)
        row=target.execute("SELECT data FROM sas_networks WHERE id=?",("main",)).fetchone()
        if row is None:
            raise RuntimeError("The saved SAS network is missing.")
        state=json.loads(row[0])
        app=next((app for app in state["apps"] if app["id"]=="owners"),None)
        if app is None or not re.fullmatch(r"[a-f0-9]{64}",app.get("integrationHash") or ""):
            raise RuntimeError("The saved CCON connection hash is missing.")
        # Only the offline copy gets a temporary key. No environment file is loaded.
        app["integrationHash"]=hashlib.sha256(key.encode()).hexdigest()
        target.execute("UPDATE sas_networks SET data=? WHERE id=?",(json.dumps(state,ensure_ascii=True),"main"))
        target.commit()
        if target.execute("PRAGMA quick_check").fetchall()!=[("ok",)]:
            raise RuntimeError("The private database copy failed its integrity check.")
    finally:
        target.close()
        source.close()
    os.chown(directory,1000,1000)
    os.chmod(directory,0o700)
    os.chown(target_path,1000,1000)
    os.chmod(target_path,0o600)

def check_image(image,directory,phase,key,output_path):
    name="ccsas-feed-check-20261019-"+uuid.uuid4().hex[:12]
    container=docker(
        "create","--pull","never","--name",name,
        "--network","none","--read-only","--user","1000:1000",
        "--cap-drop","ALL","--security-opt","no-new-privileges:true",
        "--memory","512m","--cpus","0.5",
        "--tmpfs","/tmp:rw,size=128m,mode=1777",
        "--mount","type=bind,src="+str(directory)+",dst=/data",
        "--env","NODE_ENV=production","--env","HOSTNAME=127.0.0.1",
        "--env","PORT=3100","--env","SAS_DATA_DIR=/data",
        "--env","SAS_BASE_URL=https://ccsas-feed-check.invalid",
        image
    )
    if not re.fullmatch(r"[a-f0-9]{64}",container):
        raise RuntimeError("Docker did not return the private test container ID.")
    try:
        configuration=json.loads(docker("inspect",container))[0]
        if configuration["HostConfig"]["NetworkMode"]!="none" or configuration["HostConfig"].get("PortBindings"):
            raise RuntimeError("The test container is not isolated.")
        docker("start",container)
        for attempt in range(25):
            result=subprocess.run(
                ["docker","exec",container,"node","--input-type=module","--eval",
                 'try {const r=await fetch("http://127.0.0.1:3100/login",{signal:AbortSignal.timeout(1000)});process.exit(r.status===200?0:1);} catch {process.exit(1);}'],
                stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=5
            )
            if result.returncode==0:
                break
            time.sleep(1)
        else:
            raise RuntimeError("The private "+phase+" image did not become ready.")
        program=JS_BODY.replace("__PHASE__",json.dumps(phase)).replace("__KEY__",json.dumps(key))
        result=docker("exec","-i",container,"node","--input-type=module","-",text=program,timeout=180)
        data=json.loads(result)
        output_path.write_text(json.dumps(data,sort_keys=True,separators=(",",":"))+"\n")
        os.chmod(output_path,0o600)
        return data
    except subprocess.CalledProcessError as error:
        log=directory.parent/(phase+"-check-error.log")
        log.write_text(error.stderr or "Docker command failed without diagnostics.")
        os.chmod(log,0o600)
        raise
    finally:
        try:
            result=subprocess.run(["docker","logs",container],stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,timeout=20)
            log=directory.parent/(phase+"-runtime.log")
            log.write_text(result.stdout)
            os.chmod(log,0o600)
        finally:
            # Remove only the container created above, even if its checks failed.
            docker("rm","--force",container)

def main():
    if len(sys.argv)!=5 or os.geteuid()!=0:
        raise RuntimeError("Expected root: DATABASE ORIGINAL_IMAGE CANDIDATE_IMAGE REPORT_DIRECTORY")
    source=Path(sys.argv[1])
    images=[sys.argv[2],sys.argv[3]]
    report=Path(sys.argv[4])
    if source.is_symlink() or not source.is_file() or not source.resolve().is_relative_to(Path("/root/ccsas-backups")):
        raise RuntimeError("Expected a private deployment database backup.")
    if not report.is_absolute() or report.is_symlink() or report.exists() or not report.parent.resolve().is_relative_to(Path("/root/ccsas-backups")):
        raise RuntimeError("Expected a new report directory beside the private backup.")
    for image in images:
        if not re.fullmatch(r"sha256:[a-f0-9]{64}",image):
            raise RuntimeError("Expected a pinned image ID.")
        docker("image","inspect",image)
    report.mkdir(mode=0o700)
    key=secrets.token_urlsafe(48)
    results=[]
    for phase,image in zip(("original","candidate"),images):
        directory=report/phase
        clone_database(source,directory,key)
        results.append(check_image(image,directory,phase,key,report/(phase+".json")))
    if results[0]!=results[1]:
        raise RuntimeError("CCON ad membership differs between the original and candidate images.")
    distinct={campaign for scope in results[0] for campaign in scope["ids"]}
    print("Private feed checks passed:",len(results[0]),"country/placement scopes;",len(distinct),"eligible campaigns retained. Temporary keys were used only in offline copies.")

if __name__=="__main__":
    try:
        main()
    except subprocess.CalledProcessError as error:
        # Runtime diagnostics remain private; never print keys or ad bodies.
        print("Private image feed check failed. Inspect the private report. Docker exit code:",error.returncode,file=sys.stderr)
        sys.exit(1)
    except Exception as error:
        print("Private image feed check stopped:",str(error),file=sys.stderr)
        sys.exit(1)
