import {env} from "../../../lib/vps-runtime";
import {getChatGPTUser} from "../../chatgpt-auth";
import {network,saveNetwork} from "../../../lib/sas-db";
import {processSupplierPayment} from "../../../lib/supplier-payments.mjs";
async function handle(request:Request){
 try{
  const user=await getChatGPTUser();if(!user)return Response.json({error:"Sign in to manage supplier payments."},{status:401});
  const origin=new URL(request.url).origin;
  if(request.method==="POST"&&request.headers.get("Origin")!==origin)return Response.json({error:"Invalid request origin."},{status:403});
  const row=await network(),actor={userId:user.userId,email:user.email,owner:row.ownerId===user.userId};
  const body=request.method==="GET"?{operation:new URL(request.url).searchParams.get("operation")||"list",input:{}}:await request.json() as {operation:string;input?:Record<string,unknown>};
  if(request.method==="GET"&&!["list","status"].includes(body.operation))return Response.json({error:"Use POST for payment changes."},{status:405});
  const result=await processSupplierPayment({load:()=>network(),save:saveNetwork,config:env},actor,body.operation,body.input,origin);
  return Response.json(result,{headers:{"Cache-Control":"no-store"}});
 }catch(e){return Response.json({error:e instanceof Error?e.message:"Payment action failed."},{status:typeof (e as {status?:unknown})?.status==="number"?(e as {status:number}).status:400});}
}
export const GET=handle;export const POST=handle;
