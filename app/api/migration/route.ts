import {getChatGPTUser} from "../../chatgpt-auth";
import {network,hashKey,saveNetwork} from "../../../lib/sas-db";
import {canonicalTransfer} from "../../../lib/supplier-transfer.mjs";
import {importSuppliers} from "../../../lib/supplier-migration.mjs";
export async function POST(request:Request){try{
 const origin=request.headers.get("origin");if(origin&&origin!==new URL(request.url).origin)return Response.json({error:"Invalid request origin."},{status:403});
 const user=await getChatGPTUser();if(!user)return Response.json({error:"Sign in as the CCSAS owner."},{status:401});
 const row=await network();if(row.ownerId!==user.userId)return Response.json({error:"Only the CCSAS owner can import suppliers."},{status:403});
 const raw=await request.text();if(raw.length>4*1024*1024)return Response.json({error:"Use a supplier export smaller than 4 MB."},{status:413});
 const body=JSON.parse(raw);if(body.version!==row.version)return Response.json({error:"The network has changed. Refresh before importing."},{status:409});
 const fingerprint=await hashKey(canonicalTransfer(body.transfer));
 const next=importSuppliers(row.state,row.workspace,body.transfer,{userId:user.userId,email:user.email,owner:true},{fingerprint});
 if(body.apply===true){
  if(body.transfer.data.onlinePayments.some((p:{status:string;livemode:number;applied_at?:string})=>["creating","open","processing","review_required"].includes(p.status)||p.livemode===1&&p.status==="paid"&&!p.applied_at))return Response.json({error:"Reconcile or expire pending source provider payments before applying this export."},{status:409});
  if(body.fingerprint!==fingerprint||body.transfer.frozen!==true)return Response.json({error:"Freeze source supplier writes, preview this exact export and confirm its fingerprint before importing."},{status:409});
  if(!next.report.idempotent)await saveNetwork(next.state,row.version,next.workspace,row.workspace);
 }
 return Response.json({report:next.report,applied:body.apply===true,version:row.version+(body.apply===true&&!next.report.idempotent?1:0)},{headers:{"Cache-Control":"no-store"}});
}catch(error){return Response.json({error:error instanceof Error?error.message:"Import could not be prepared."},{status:typeof (error as {status?:unknown})?.status==="number"?(error as {status:number}).status:400});}}
