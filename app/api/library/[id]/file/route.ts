import {env} from "cloudflare:workers";
import {getChatGPTUser} from "../../../../chatgpt-auth";
import {network} from "../../../../../lib/sas-db";
import {ownsSupplier} from "../../../../../lib/supplier-workflows.mjs";
export async function GET(request:Request){
 const user=await getChatGPTUser();if(!user)return Response.json({error:"Sign in to view the resource."},{status:401});
 const id=decodeURIComponent(new URL(request.url).pathname.split("/").at(-2)||""),row=await network(),owner=row.ownerId===user.userId;
 const resource=row.workspace.library.find(r=>r.id===id);
 if(!resource||!owner&&(resource.status!=="published"||!row.state.suppliers.some(s=>(!resource.supplierId||resource.supplierId===s.id)&&ownsSupplier(s,{userId:user.userId,email:user.email,owner:false}))))return Response.json({error:"Resource not available."},{status:404});
 if(!resource.fileKey||!env.BUCKET)return Response.json({error:"Resource file not available."},{status:404});
 const head=await env.BUCKET.head(resource.fileKey);if(!head)return Response.json({error:"Resource file not found."},{status:404});
 const range=request.headers.get("Range");let selected:{offset:number;length:number}|undefined;
 if(range){const m=/^bytes=(\d*)-(\d*)$/.exec(range);if(!m||!m[1]&&!m[2])return new Response(null,{status:416});const offset=m[1]?Number(m[1]):Math.max(0,head.size-Number(m[2])),end=m[1]?(m[2]?Math.min(Number(m[2]),head.size-1):head.size-1):head.size-1;if(!Number.isSafeInteger(offset)||offset<0||offset>=head.size||end<offset)return new Response(null,{status:416});selected={offset,length:end-offset+1};}
 const object=await env.BUCKET.get(resource.fileKey,selected?{range:selected}:undefined);if(!object)return Response.json({error:"Resource file not found."},{status:404});
 const headers=new Headers({"Content-Type":resource.mime||"application/octet-stream","Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Content-Security-Policy":"sandbox","Accept-Ranges":"bytes","Content-Length":String(selected?.length||head.size),"Content-Disposition":(resource.kind==="video"?"inline":"attachment")+'; filename="'+String(resource.fileName||"resource").replace(/[^\w .()-]/g,"_")+'"'});
 if(selected)headers.set("Content-Range","bytes "+selected.offset+"-"+(selected.offset+selected.length-1)+"/"+head.size);
 return new Response(object.body,{status:selected?206:200,headers});
}
