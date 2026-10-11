import {getChatGPTUser} from "../../chatgpt-auth";
import {network,hashKey,database} from "../../../lib/sas-db";
import {eligibleAds,deliveryAd,type Country,type Audience} from "../../../lib/sas-model";
export async function GET(request:Request){try{
  const q=new URL(request.url).searchParams,row=await network(undefined,"none"),app=row.state.apps.find(a=>a.id===q.get("app"));
  if(!app)return Response.json({error:"Application not found."},{status:404});
  const preview=q.get("preview")==="1",user=await getChatGPTUser(),key=request.headers.get("X-SAS-App-Key");
  if(preview){if(!user||user.userId!==row.ownerId)return Response.json({error:"Only the owner can preview sample ads."},{status:403});}
  else if(!key||!app.integrationHash||await hashKey(key)!==app.integrationHash)return Response.json({error:"An application connection key is required."},{status:401});
  const country=q.get("country");if(country&&!['CA','US'].includes(country))return Response.json({error:"Country must be CA or US."},{status:400});
  const audience=q.get("audience")??"owner";if(!['owner','admin','staff'].includes(audience))return Response.json({error:"Invalid audience."},{status:400});
  const ads=eligibleAds(row.state,{appId:app.id,country:country as Country|undefined,audience:audience as Audience,placement:q.get("placement")??undefined,region:q.get("region")??undefined,hubId:q.get("hub")??undefined,preview}).map(c=>deliveryAd(c,row.state));
  if(!preview)await database().prepare("INSERT INTO sas_connections (app_id,last_seen) VALUES (?,?) ON CONFLICT(app_id) DO UPDATE SET last_seen=excluded.last_seen").bind(app.id,new Date().toISOString()).run();
  return Response.json({app:app.id,ads,settings:{speed:row.state.settings.speed,maxCopy:row.state.settings.maxCopy},preview},{headers:{"Cache-Control":"no-store"}});
}catch(error){console.error("SAS feed",error);return Response.json({ads:[],error:"Advertising temporarily unavailable."},{status:503});}}
