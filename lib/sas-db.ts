import {env} from "cloudflare:workers";
import {initialNetwork, Network} from "./sas-model";
export function database(){if(!env.DB)throw new Error("Advertising storage is temporarily unavailable.");return env.DB;}
export async function network(userId?:string){
  const db=database();
  if(userId)await db.prepare("INSERT OR IGNORE INTO sas_networks (id,owner_id,data,version,updated_at) VALUES (?,?,?,?,?)").bind("main",userId,JSON.stringify(initialNetwork()),0,new Date().toISOString()).run();
  const row=await db.prepare("SELECT owner_id,data,version FROM sas_networks WHERE id=?").bind("main").first<{owner_id:string;data:string;version:number}>();
  if(!row)throw new Error("The network owner must open SAS before it can serve ads.");
  const state=JSON.parse(row.data) as Network;
  // Provision DocTrain through runtime secrets. An owner-generated replacement
  // stored in D1 takes precedence, so replacing a key revokes this initial key.
  const doctrain=state.apps.find(a=>a.id==='doctrain');
  if(doctrain&&!doctrain.integrationHash&&env.SAS_DOCTRAIN_APP_KEY)
    doctrain.integrationHash=await hashKey(env.SAS_DOCTRAIN_APP_KEY);
  const connections=await db.prepare("SELECT app_id,last_seen FROM sas_connections").all<{app_id:string;last_seen:string}>();
  state.apps=state.apps.map(a=>({...a,lastSeen:connections.results.find(c=>c.app_id===a.id)?.last_seen}));
  return {ownerId:row.owner_id,state,version:row.version};
}
export async function saveNetwork(state:Network,version:number){
  const result=await database().prepare("UPDATE sas_networks SET data=?,version=version+1,updated_at=? WHERE id=? AND version=?").bind(JSON.stringify(state),new Date().toISOString(),"main",version).run();
  if(result.meta.changes!==1)throw new Error("Another change was saved first. Refresh and try again.");
}
export async function hashKey(value:string){return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value)))).map(v=>v.toString(16).padStart(2,"0")).join("");}
export async function summaries(){return (await database().prepare("SELECT app_id AS appId, SUM(CASE WHEN kind='impression' THEN 1 ELSE 0 END) AS impressions,SUM(CASE WHEN kind='click' THEN 1 ELSE 0 END) AS clicks FROM sas_events GROUP BY app_id").all()).results;}
