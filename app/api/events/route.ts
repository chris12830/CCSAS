import {network,database,hashKey} from "../../../lib/sas-db";
import {eligibleAds,Audience,Country} from "../../../lib/sas-model";
import {z} from "zod";
export async function POST(request:Request){try{
  const v=z.object({id:z.string().uuid(),appId:z.string(),campaignId:z.string(),kind:z.enum(["impression","click"]),country:z.enum(["CA","US"]),audience:z.enum(["owner","admin","staff"]).default("owner"),placement:z.string().default("Dashboard ticker"),region:z.string().default(""),hubId:z.string().default("")}).parse(await request.json());
  const row=await network(undefined,"none"),app=row.state.apps.find(a=>a.id===v.appId),key=request.headers.get("X-SAS-App-Key");
  if(!key||!app?.integrationHash||await hashKey(key)!==app.integrationHash)return Response.json({error:"Invalid application key."},{status:401});
  if(!eligibleAds(row.state,{appId:v.appId,country:v.country as Country,audience:v.audience as Audience,placement:v.placement,region:v.region,hubId:v.hubId}).some(c=>c.id===v.campaignId))return Response.json({error:"This campaign is not currently eligible."},{status:400});
  await database().prepare("INSERT OR IGNORE INTO sas_events (id,app_id,campaign_id,kind,created_at) VALUES (?,?,?,?,?)").bind(v.id,v.appId,v.campaignId,v.kind,new Date().toISOString()).run();
  return Response.json({recorded:true});
}catch{return Response.json({error:"The event could not be recorded."},{status:400});}}
