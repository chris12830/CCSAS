import {env} from "cloudflare:workers";
import {initialNetwork, Network} from "./sas-model";
import {emptyWorkspace,workspaceCollections,type Workspace} from "./supplier-workflows.mjs";
import {supplierWritePlan} from "./supplier-persistence.mjs";
export function database(){if(!env.DB)throw new Error("Advertising storage is temporarily unavailable.");return env.DB;}
export class ConcurrentChange extends Error {status=409;}
export async function network(userId?:string,workspaceScope:"all"|"imports"|"none"="all"){
  const db=database();
  if(userId)await db.prepare("INSERT OR IGNORE INTO sas_networks (id,owner_id,data,version,updated_at) VALUES (?,?,?,?,?)").bind("main",userId,JSON.stringify(initialNetwork()),0,new Date().toISOString()).run();
  // D1 batch executes in a transaction: state and workspace share one version.
  const results=await db.batch([
    db.prepare("SELECT owner_id,data,version FROM sas_networks WHERE id=?").bind("main"),
    db.prepare("SELECT app_id,last_seen FROM sas_connections"),
    db.prepare("SELECT collection,data FROM sas_supplier_records"+(workspaceScope==="imports"?" WHERE collection='imports'":workspaceScope==="none"?" WHERE 0":"")+" ORDER BY rowid")
  ]);
  const row=results[0].results[0] as {owner_id:string;data:string;version:number}|undefined;
  if(!row)throw new Error("The network owner must open SAS before it can serve ads.");
  const state=JSON.parse(row.data) as Network,workspace=emptyWorkspace();
  for(const record of results[2].results as {collection:keyof Workspace;data:string}[])
    if(workspaceCollections.includes(record.collection))workspace[record.collection].push(JSON.parse(record.data));
  const connections=results[1].results as {app_id:string;last_seen:string}[];
  const keys:Record<string,string|undefined>={doctrain:env.SAS_DOCTRAIN_APP_KEY,owners:env.SAS_CCON_APP_KEY};
  for(const app of state.apps)if(!app.integrationHash&&keys[app.id])app.integrationHash=await hashKey(keys[app.id]!);
  state.apps=state.apps.map(a=>({...a,lastSeen:connections.find(c=>c.app_id===a.id)?.last_seen}));
  return {ownerId:row.owner_id,state,workspace,version:row.version};
}
export async function saveNetwork(state:Network,version:number,workspace?:Workspace,previousWorkspace?:Workspace){
 const db=database(),plan=supplierWritePlan({state,version,workspace,previousWorkspace,token:crypto.randomUUID(),at:new Date().toISOString()});
 const result=await db.batch(plan.map(item=>db.prepare(item.sql).bind(...item.params)));
 if(result[0].meta.changes!==1)throw new ConcurrentChange("Another change was saved first. Refresh and try again.");
}
export async function hashKey(value:string){return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value)))).map(v=>v.toString(16).padStart(2,"0")).join("");}
export async function summaries(){return (await database().prepare("SELECT app_id AS appId, SUM(CASE WHEN kind='impression' THEN 1 ELSE 0 END) AS impressions,SUM(CASE WHEN kind='click' THEN 1 ELSE 0 END) AS clicks FROM sas_events GROUP BY app_id").all()).results;}
export async function supplierSummaries(ids:string[]){
  if(!ids.length)return [];
  return (await database().prepare(`SELECT campaign_id AS campaignId,app_id AS appId,SUM(CASE WHEN kind='impression' THEN 1 ELSE 0 END) AS impressions,SUM(CASE WHEN kind='click' THEN 1 ELSE 0 END) AS clicks FROM sas_events WHERE campaign_id IN (${ids.map(()=>"?").join(",")}) GROUP BY campaign_id,app_id`).bind(...ids).all()).results;
}
