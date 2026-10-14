import SignOut from '../sign-out';
import SASClient from "../sas-client";
import {requireChatGPTUser} from "../chatgpt-auth";
import {network} from "../../lib/sas-db";
export const dynamic="force-dynamic";
export default async function SupplierPage({searchParams}:{searchParams:Promise<{app?:string;payment?:string}>}){
 const query=await searchParams,sourceAppId=query.app==="owners"?"owners":undefined,params=new URLSearchParams();
 if(sourceAppId)params.set("app",sourceAppId);if(query.payment&&/^[-a-zA-Z0-9]+$/.test(query.payment))params.set("payment",query.payment);
 const user=await requireChatGPTUser("/supplier"+(params.size?"?"+params:""));
 let owner=false;try{owner=(await network()).ownerId===user.userId;}catch{}
 return <><SignOut/><SASClient supplierOnly ownerPreview={owner} sourceAppId={sourceAppId} displayName={user.displayName}/></>;
}

