import {getChatGPTUser} from "../../chatgpt-auth";
import {network,saveNetwork} from "../../../lib/sas-db";
import {publicState,Network} from "../../../lib/sas-model";
import {applyAction} from "../../../lib/sas-actions";
import {z} from "zod";
function scope(state:Network,userId:string,email:string){
  const suppliers=state.suppliers.filter(s=>s.userId===userId||s.email.toLowerCase()===email.toLowerCase());
  return publicState({...state,suppliers,campaigns:state.campaigns.filter(c=>suppliers.some(s=>s.id===c.supplierId)),payments:state.payments.filter(p=>suppliers.some(s=>s.id===p.supplierId)),activity:[]});
}
export async function GET(){try{
  const user=await getChatGPTUser();if(!user)return Response.json({error:"Sign in to access your supplier account."},{status:401});
  const row=await network();return Response.json({state:scope(row.state,user.userId,user.email),version:row.version,user:user.displayName,email:user.email},{headers:{"Cache-Control":"no-store"}});
}catch{return Response.json({error:"The supplier portal could not load. Please try again."},{status:503});}}
export async function POST(request:Request){try{
  const origin=request.headers.get("origin");if(origin&&origin!==new URL(request.url).origin)return Response.json({error:"Invalid request origin."},{status:403});
  const user=await getChatGPTUser();if(!user)return Response.json({error:"Sign in before submitting."},{status:401});
    const {action,input,version}=z.object({action:z.string(),input:z.unknown(),version:z.number().int()}).parse(await request.json()),row=await network();if(version!==row.version)return Response.json({error:"The network has changed. Refresh before submitting."},{status:409});
  const next=applyAction(row.state,action,input,{userId:user.userId,email:user.email,owner:false});await saveNetwork(next,row.version);
  return Response.json({state:scope(next,user.userId,user.email),version:row.version+1});
}catch(error){return Response.json({error:error instanceof Error?error.message:"Submission could not be saved."},{status:400});}}
