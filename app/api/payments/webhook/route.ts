import {env} from "cloudflare:workers";
import {network,saveNetwork} from "../../../../lib/sas-db";
import {processSupplierPayment,verifyStripeSignature} from "../../../../lib/supplier-payments.mjs";
export async function POST(request:Request){
 try{
  if(Number(request.headers.get("Content-Length"))>65536)return Response.json({error:"Webhook too large."},{status:413});
  const body=await request.text();if(body.length>65536)return Response.json({error:"Webhook too large."},{status:413});
  if(!await verifyStripeSignature(body,request.headers.get("Stripe-Signature"),env.STRIPE_WEBHOOK_SECRET))return Response.json({error:"Invalid webhook signature."},{status:401});
  const event=JSON.parse(body) as {type:string;data:{object:{metadata?:{paymentId?:string}}}};
  if(!["checkout.session.completed","checkout.session.async_payment_succeeded","checkout.session.async_payment_failed","checkout.session.expired"].includes(event.type))return Response.json({received:true});
  const id=event.data?.object?.metadata?.paymentId;if(!id)return Response.json({received:true});
  const row=await network();if(!row.workspace.checkouts.some(p=>p.id===id))return Response.json({received:true});
  await processSupplierPayment({load:()=>network(),save:saveNetwork,config:env},{userId:"stripe:webhook",email:"processor@stripe",owner:true},"check",{paymentId:id});
  return Response.json({received:true});
 }catch{return Response.json({error:"Provider reconciliation is temporarily unavailable. Retry delivery."},{status:503});}
}
