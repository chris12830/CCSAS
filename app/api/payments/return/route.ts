import {getChatGPTUser} from '../../../chatgpt-auth';
import {network} from '../../../../lib/sas-db';
import {applicationOrigin} from '../../../../lib/vps-origin';
import {ownsSupplier} from '../../../../lib/supplier-workflows.mjs';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store','Referrer-Policy':'no-referrer'};
const failure=(message:string,status:number)=>Response.json({error:message},{status,headers});
const redirect=(destination:URL)=>new Response(null,{status:303,headers:{...headers,Location:destination.href}});

// Navigation only: a return URL never establishes identity or confirms payment.
export async function GET(request:Request){
 try{
  const origin=applicationOrigin(),query=new URL(request.url).searchParams,paymentId=query.get('payment');
  if(query.getAll('payment').length!==1||!paymentId||!/^[-a-zA-Z0-9]{1,150}$/.test(paymentId))return failure('A valid payment reference is required.',400);
  const params=new URLSearchParams({payment:paymentId});
  if(query.get('cancelled')==='1')params.set('cancelled','1');
  const user=await getChatGPTUser();
  if(!user){const login=new URL('/login',origin);login.searchParams.set('return_to','/api/payments/return?'+params);return redirect(login);}
  const row=await network(),actor={...user,owner:row.ownerId===user.userId};
  const payment=row.workspace.checkouts.find(p=>p.id===paymentId),supplier=row.state.suppliers.find(s=>s.id===payment?.supplierId);
  if(!payment||!supplier||!actor.owner&&!ownsSupplier(supplier,actor))return failure('This checkout is not available to the signed-in account.',403);
  const destination=new URL(actor.owner?'/':'/supplier',origin);
  if(actor.owner){destination.searchParams.set('view','workspace');destination.searchParams.set('supplier',supplier.id);}
  for(const [key,value] of params)destination.searchParams.set(key,value);
  return redirect(destination);
 }catch{return failure('The payment return could not load. Open Billing to check the existing payment.',503);}
}
