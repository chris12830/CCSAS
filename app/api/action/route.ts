import {getChatGPTUser} from "../../chatgpt-auth";
import {network,saveNetwork,hashKey,summaries} from "../../../lib/sas-db";
import {publicState} from "../../../lib/sas-model";
import {applyAction} from "../../../lib/sas-actions";
import {z} from "zod";
import {executeSupplierWorkflow,workflowActions} from "../../../lib/supplier-workflows.mjs";
export async function POST(request:Request){
  try{
    const origin=request.headers.get("origin");if(origin&&origin!==new URL(request.url).origin)return Response.json({error:"Invalid request origin."},{status:403});
    const user=await getChatGPTUser();if(!user)return Response.json({error:"Sign in before saving."},{status:401});
    const {action,input,version}=z.object({action:z.string(),input:z.unknown(),version:z.number().int()}).parse(await request.json());
    const row=await network(),owner=row.ownerId===user.userId;if(!owner)return Response.json({error:"Use the supplier submission endpoint for your own account."},{status:403});
    if(version!==row.version)return Response.json({error:"Your network has changed. Refresh before saving."},{status:409});
    let next=row.state,workspace=row.workspace,key:string|undefined;
    if(action==="generate_key"){
      const {id}=z.object({id:z.string()}).parse(input),app=next.apps.find(a=>a.id===id);if(!app)throw new Error("Application not found.");
      key="sas_"+crypto.randomUUID().replaceAll("-","")+crypto.randomUUID().replaceAll("-","");app.integrationHash=await hashKey(key);
      next.activity.unshift({id:crypto.randomUUID(),text:`Connection key created for ${app.name}.`,date:new Date().toISOString()});
    }else if(workflowActions.includes(action))({state:next,workspace}=executeSupplierWorkflow(row.state,row.workspace,action,input,{userId:user.userId,email:user.email,owner}));
    else next=applyAction(row.state,action,input,{userId:user.userId,email:user.email,owner});
    await saveNetwork(next,row.version,workspace,row.workspace);
    return Response.json({state:publicState(next),version:row.version+1,workspace,summary:await summaries(),key});
  }catch(error){const message=error instanceof z.ZodError?error.issues.map(i=>i.message).join(" "):error instanceof Error?error.message:"Your change could not be saved.";
    console.error("SAS save",message);return Response.json({error:message},{status:typeof (error as {status?:unknown})?.status==="number"?(error as {status:number}).status:400});}
}
