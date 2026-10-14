import {applicationOrigin} from '../../../lib/vps-origin';
import {env} from "../../../lib/vps-runtime";
import {getChatGPTUser} from "../../chatgpt-auth";
import {network,saveNetwork} from "../../../lib/sas-db";
import {deliverSupplierNotices} from "../../../lib/supplier-notices.mjs";
export async function POST(request:Request){try{if(request.headers.get("Origin")!==applicationOrigin())return Response.json({error:"Invalid request origin."},{status:403});const user=await getChatGPTUser(),row=await network();if(!user||user.userId!==row.ownerId)return Response.json({error:"Owner access required."},{status:403});return Response.json(await deliverSupplierNotices({load:()=>network(),save:saveNetwork,config:env},{userId:user.userId,email:user.email,owner:true}));}catch{return Response.json({error:"Notification delivery could not finish. Retry the queued notices."},{status:503});}}


