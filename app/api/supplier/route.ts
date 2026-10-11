import {getChatGPTUser} from "../../chatgpt-auth";
import {network,saveNetwork,supplierSummaries} from "../../../lib/sas-db";
import {publicState,Network} from "../../../lib/sas-model";
import {applyAction} from "../../../lib/sas-actions";
import {ownsSupplier,scopeWorkspace,executeSupplierWorkflow,workflowActions,type Workspace} from "../../../lib/supplier-workflows.mjs";
import {z} from "zod";
function scope(state:Network,userId:string,email:string){
  const suppliers=state.suppliers.filter(s=>ownsSupplier(s,{userId,email,owner:false}));
  return publicState({...state,suppliers,campaigns:state.campaigns.filter(c=>suppliers.some(s=>s.id===c.supplierId)),payments:state.payments.filter(p=>suppliers.some(s=>s.id===p.supplierId)),activity:[]});
}
async function payload(state:Network,workspace:Workspace,version:number,user:{userId:string;email:string;displayName:string}){
  const scoped=scope(state,user.userId,user.email);
  return {state:scoped,workspace:scopeWorkspace(workspace,state,{...user,owner:false}),version,summary:await supplierSummaries(scoped.campaigns.map(c=>c.id)),user:user.displayName,email:user.email};
}
export async function GET(){try{
  const user=await getChatGPTUser();if(!user)return Response.json({error:"Sign in to access your supplier account."},{status:401});
  const row=await network();return Response.json(await payload(row.state,row.workspace,row.version,user),{headers:{"Cache-Control":"no-store"}});
}catch{return Response.json({error:"The supplier portal could not load. Please try again."},{status:503});}}
export async function POST(request:Request){try{
  const origin=request.headers.get("origin");if(origin&&origin!==new URL(request.url).origin)return Response.json({error:"Invalid request origin."},{status:403});
  const user=await getChatGPTUser();if(!user)return Response.json({error:"Sign in before submitting."},{status:401});
  const {action,input,version}=z.object({action:z.string(),input:z.unknown(),version:z.number().int().nonnegative()}).parse(await request.json()),row=await network();
  if(version!==row.version)return Response.json({error:"The network has changed. Refresh before submitting."},{status:409});
  const actor={userId:user.userId,email:user.email,owner:false};
  let next=row.state,workspace=row.workspace;
  if(workflowActions.includes(action))({state:next,workspace}=executeSupplierWorkflow(row.state,row.workspace,action,input,actor));
  else{
    next=applyAction(row.state,action,input,actor);
    if(action==="save_supplier"){
      const supplier=next.suppliers.find(s=>ownsSupplier(s,actor));
      if(supplier)({state:next,workspace}=executeSupplierWorkflow(next,workspace,"supplier.accept_policy",{supplierId:supplier.id,accepted:true,version:next.settings.policyVersion,text:next.settings.policy},actor));
    }
  }
  await saveNetwork(next,row.version,workspace,row.workspace);
  return Response.json(await payload(next,workspace,row.version+1,user),{headers:{"Cache-Control":"no-store"}});
}catch(error){return Response.json({error:error instanceof Error?error.message:"Submission could not be saved."},{status:typeof (error as {status?:unknown})?.status==="number"?(error as {status:number}).status:400});}}
