import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import {supplierWritePlan} from "../lib/supplier-persistence.mjs";
import {emptyWorkspace} from "../lib/supplier-workflows.mjs";
function database(){
 const db=new DatabaseSync(":memory:");
 db.exec("CREATE TABLE sas_networks(id TEXT PRIMARY KEY,owner_id TEXT,data TEXT,version INTEGER,updated_at TEXT);");
 db.exec(readFileSync(new URL("../drizzle/0002_supplier_workspaces.sql",import.meta.url),"utf8").replaceAll("--> statement-breakpoint",""));
 db.prepare("INSERT INTO sas_networks(id,owner_id,data,version,updated_at) VALUES ('main','owner','{}',0,'initial')").run();
 return db;
}
function execute(db,plan){db.exec("BEGIN");try{const results=plan.map(p=>db.prepare(p.sql).run(...p.params));db.exec("COMMIT");return results;}catch(e){db.exec("ROLLBACK");throw e;}}
const at="2026-10-11T12:00:00Z";
test("CAS winner saves all supplier records and loser cannot contaminate that version",()=>{const db=database(),winner=emptyWorkspace(),loser=emptyWorkspace();winner.messages.push({id:"winner-message",supplierId:"a",body:"winner"});loser.messages.push({id:"loser-message",supplierId:"a",body:"loser"});
 execute(db,supplierWritePlan({state:{label:"winner"},version:0,workspace:winner,token:"winner",at}));
 const failed=execute(db,supplierWritePlan({state:{label:"loser"},version:0,workspace:loser,token:"loser",at}));
 assert.equal(failed[0].changes,0);assert.equal(db.prepare("SELECT count(*) AS n FROM sas_supplier_records").get().n,1);assert.equal(db.prepare("SELECT data FROM sas_networks").get().data,'{"label":"winner"}');db.close();});
test("a record constraint error rolls back both network version and record writes",()=>{const db=database(),workspace=emptyWorkspace();workspace.messages.push({id:"message",supplierId:"a",body:"test"});const plan=supplierWritePlan({state:{updated:true},version:0,workspace,token:"mutation",at});plan.push({sql:"INSERT INTO sas_supplier_records(collection,id,supplier_id,data,updated_at) VALUES ('messages',NULL,'a','{}','today')",params:[]});assert.throws(()=>execute(db,plan));assert.equal(db.prepare("SELECT version FROM sas_networks").get().version,0);assert.equal(db.prepare("SELECT count(*) AS n FROM sas_supplier_records").get().n,0);db.close();});
test("existing acceptance evidence cannot be rewritten and logical closure does not delete it",()=>{const original=emptyWorkspace();original.acceptances.push({id:"agreement",supplierId:"a",text:"Original policy",acceptedAt:at});const changed=JSON.parse(JSON.stringify(original));changed.acceptances[0].text="Changed policy";assert.throws(()=>supplierWritePlan({state:{},version:0,workspace:changed,previousWorkspace:original,token:"x",at}),/immutable/);const db=database();execute(db,supplierWritePlan({state:{},version:0,workspace:original,token:"first",at}));execute(db,supplierWritePlan({state:{closed:true},version:1,workspace:emptyWorkspace(),previousWorkspace:original,token:"closure",at}));assert.equal(db.prepare("SELECT count(*) AS n FROM sas_supplier_records").get().n,1);db.close();});
test("large imports are grouped into bounded JSON statements",()=>{const workspace=emptyWorkspace();for(let index=0;index<500;index++)workspace.sourceRecords.push({id:"record-"+index,supplierId:"a",record:{body:"original financial record"}});const plan=supplierWritePlan({state:{},version:0,workspace,token:"token",at});assert.equal(plan.length,2);const db=database();execute(db,plan);assert.equal(db.prepare("SELECT count(*) AS n FROM sas_supplier_records").get().n,500);db.close();});
