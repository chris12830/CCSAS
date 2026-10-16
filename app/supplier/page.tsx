import SignOut from '../sign-out';
import {redirect} from 'next/navigation';
import SASClient from "../sas-client";
import {requireChatGPTUser} from "../chatgpt-auth";
import {network} from "../../lib/sas-db";
export const dynamic="force-dynamic";
export default async function SupplierPage({searchParams}:{searchParams:Promise<{app?:string;payment?:string;cancelled?:string}>}){
 const query=await searchParams,sourceAppId=query.app==="owners"?"owners":undefined,params=new URLSearchParams();
 if(sourceAppId)params.set("app",sourceAppId);if(query.payment&&/^[-a-zA-Z0-9]+$/.test(query.payment))params.set("payment",query.payment);
 const user=await requireChatGPTUser("/supplier"+(params.size?"?"+params:""));
 let owner=false;try{owner=(await network()).ownerId===user.userId;}catch{}
 if(owner&&params.has('payment')){const checkout=new URLSearchParams({payment:params.get('payment')!});if(query.cancelled==='1')checkout.set('cancelled','1');redirect('/api/payments/return?'+checkout);}
 return <><SignOut/><SASClient supplierOnly ownerPreview={owner} sourceAppId={sourceAppId} displayName={user.displayName} accountEmail={user.email}/></>;
}


