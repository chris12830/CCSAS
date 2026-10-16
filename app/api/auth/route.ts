import {cookies} from 'next/headers';
import {getDatabase} from '../../../lib/vps-database.mjs';
import {authenticate,acceptInvite,createSession,revokeSession,sessionCookie,validOrigin,rateLimit,safeReturnPath} from '../../../lib/vps-auth.mjs';
export const runtime='nodejs';
export async function POST(request:Request){
 if(!validOrigin(request,process.env.SAS_BASE_URL))return Response.json({error:'Invalid request origin.'},{status:403});
 const db=getDatabase();
 try{
  if(Number(request.headers.get('content-length'))>16384)return Response.json({error:'Request too large.'},{status:413});
  const reader=request.body?.getReader();let text='',size=0;const decoder=new TextDecoder();if(reader)for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>16384){await reader.cancel();return Response.json({error:'Request too large.'},{status:413});}text+=decoder.decode(value,{stream:true});}
  const body=JSON.parse(text+decoder.decode());
  const cookieStore=await cookies(),old=cookieStore.get(sessionCookie)?.value;
  if(body.operation==='logout'){revokeSession(db,old);cookieStore.set(sessionCookie,'',{httpOnly:true,secure:true,sameSite:'lax',path:'/',maxAge:0});return Response.json({redirect:'/login'},{headers:{'Cache-Control':'no-store'}});}
  let user;if(body.operation==='register'){if(!rateLimit(db,'register:global',50))throw new Error('Too many attempts. Try again in 15 minutes.');user=await acceptInvite(db,body);}else if(body.operation==='login'){user=await authenticate(db,body.email,body.password);}else return Response.json({error:'Unknown operation.'},{status:400});
  // Keep the session on the top-level GET back from Stripe. POSTs still require our exact origin.
  revokeSession(db,old);const token=createSession(db,user.userId);cookieStore.set(sessionCookie,token,{httpOnly:true,secure:true,sameSite:'lax',path:'/',maxAge:43200});
  const target=safeReturnPath(body.returnTo);return Response.json({redirect:user.role==='owner'&&target==='/supplier'?'/':user.role!=='owner'&&target==='/'?'/supplier':target},{headers:{'Cache-Control':'no-store'}});
 }catch(error){const message=error instanceof Error?error.message:'';const safe=['A valid email is required.','Too many attempts. Try again in 15 minutes.','Email or password is incorrect.','A valid invitation and name are required.','Invitation is invalid or expired.','Use a password of 12 to 256 characters.'].includes(message)?message:'Sign in or activation could not finish. Contact the network owner.';return Response.json({error:safe},{status:400,headers:{'Cache-Control':'no-store'}});}
}


