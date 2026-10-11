import {env} from "cloudflare:workers";
import {initialNetwork, Network} from "./sas-model";
import {emptyWorkspace,workspaceCollections,type Workspace} from "./supplier-workflows.mjs";
export function database(){if(!env.DB)throw new Error("Advertising storage is temporarily unavailable.");return env.DB;}
export class ConcurrentChange extends Error {status=409;}
export async function network(userId?:string){
  const db=database();
  if(userId)await db.prepare("INSERT OR IGNORE INTO sas_networks (id,owner_id,data,version,updated_at) VALUES (?,?,?,?,?)").bind("main",userId,JSON.stringify(initialNetwork()),0,new Date().toISOString()).run();
  // D1 batch executes in a transaction: state and workspace share one version.
  const results=await db.batch([
    db.prepare("SELECT owner_id,data,version FROM sas_networks WHERE id=?").bind("main"),
    db.prepare("SELECT app_id,last_seen FROM sas_connections"),
    db.prepare("SELECT collection,data FROM sas_supplier_records ORDER BY rowid")
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
  const db=database(),token=crypto.randomUUID(),at=new Date().toISOString();
  const statements=[db.prepare("UPDATE sas_networks SET data=?,version=version+1,updated_at=?,write_token=? WHERE id=? AND version=?").bind(JSON.stringify(state),at,token,"main",version)];
  if(workspace)for(const collection of workspaceCollections){
    const previous=new Map((previousWorkspace?.[collection]??[]).map(row=>[row.id,JSON.stringify(row)]));
    for(const row of workspace[collection]){
      const data=JSON.stringify(row);if(previous.get(row.id)===data)continue;
      if(collection==="acceptances"&&previous.has(row.id))throw new Error("Accepted agreement records are immutable.");
      statements.push(db.prepare(`INSERT INTO sas_supplier_records (collection,id,supplier_id,data,updated_at)
        SELECT ?,?,?,?,? WHERE EXISTS (SELECT 1 FROM sas_networks WHERE id='main' AND version=? AND write_token=?)
        ON CONFLICT(collection,id) DO UPDATE SET supplier_id=excluded.supplier_id,data=excluded.data,updated_at=excluded.updated_at`)
        .bind(collection,row.id,row.supplierId??"",data,at,version+1,token));
    }
    // No deletes: closure retains consent, finance and support history.
  }
  const result=await db.batch(statements);
  if(result[0].meta.changes!==1)throw new ConcurrentChange("Another change was saved first. Refresh and try again.");
}
export async function hashKey(value:string){return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value)))).map(v=>v.toString(16).padStart(2,"0")).join("");}
export async function summaries(){return (await database().prepare("SELECT app_id AS appId, SUM(CASE WHEN kind='impression' THEN 1 ELSE 0 END) AS impressions,SUM(CASE WHEN kind='click' THEN 1 ELSE 0 END) AS clicks FROM sas_events GROUP BY app_id").all()).results;}
export async function supplierSummaries(ids:string[]){
  if(!ids.length)return [];
  return (await database().prepare(`SELECT campaign_id AS campaignId,app_id AS appId,SUM(CASE WHEN kind='impression' THEN 1 ELSE 0 END) AS impressions,SUM(CASE WHEN kind='click' THEN 1 ELSE 0 END) AS clicks FROM sas_events WHERE campaign_id IN (${ids.map(()=>"?").join(",")}) GROUP BY campaign_id,app_id`).bind(...ids).all()).results;
}
