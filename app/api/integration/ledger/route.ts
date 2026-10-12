import {network,saveNetwork,hashKey} from "../../../../lib/sas-db";
import {normalizeEnquiryEvent,applyEnquiryEvent} from "../../../../lib/supplier-enquiry-ledger.mjs";
export async function POST(request:Request){
 try{
  if(Number(request.headers.get("Content-Length"))>10000)return Response.json({error:"Event too large."},{status:413});
  const text=await request.text();if(text.length>10000)return Response.json({error:"Event too large."},{status:413});
  const event=normalizeEnquiryEvent(JSON.parse(text)),key=request.headers.get("X-SAS-App-Key");
  for(let attempt=0;attempt<3;attempt++){
   const row=await network(),app=row.state.apps.find(a=>a.id==="owners");
   if(!app?.enabled||!key||!app.integrationHash||await hashKey(key)!==app.integrationHash)return Response.json({error:"Invalid application connection."},{status:401});
   const canonical=JSON.stringify(Object.fromEntries(Object.entries(event).sort(([a],[b])=>a.localeCompare(b)))),result=applyEnquiryEvent(row.state,row.workspace,event,{fingerprint:await hashKey(canonical)});
   if(!result.idempotent){try{await saveNetwork(result.state,row.version,result.workspace,row.workspace);}catch(e){if((e as {status?:number}).status===409&&attempt<2)continue;throw e;}}
   return Response.json({receipt:result.receipt,idempotent:result.idempotent},{headers:{"Cache-Control":"no-store"}});
  }
  return Response.json({error:"Concurrent ledger change. Retry the same event."},{status:409});
 }catch(e){return Response.json({error:e instanceof Error?e.message:"Ledger event failed."},{status:typeof (e as {status?:unknown})?.status==="number"?(e as {status:number}).status:400});}
}
