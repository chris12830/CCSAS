import {env} from "cloudflare:workers";
import {getChatGPTUser} from "../../chatgpt-auth";
import {network,saveNetwork} from "../../../lib/sas-db";
import {scopeWorkspace,ownsSupplier} from "../../../lib/supplier-workflows.mjs";
const response=(value:unknown,status=200)=>Response.json(value,{status,headers:{"Cache-Control":"private, no-store"}});
export async function GET(){try{const user=await getChatGPTUser();if(!user)return response({error:"Sign in to view supplier help."},401);const row=await network(),owner=row.ownerId===user.userId;if(!owner&&!row.state.suppliers.some(s=>ownsSupplier(s,{userId:user.userId,email:user.email,owner:false})))return response({error:"Supplier access required."},403);return response(scopeWorkspace(row.workspace,row.state,{userId:user.userId,email:user.email,owner}).library.map(({fileKey,...r})=>({...r,url:fileKey?"/api/library/"+encodeURIComponent(r.id)+"/file":r.url})));}catch{return response({error:"Help resources are unavailable."},503);}}
export async function POST(request:Request){try{
 if(request.headers.get("Origin")!==new URL(request.url).origin)return response({error:"Invalid request origin."},403);
 const user=await getChatGPTUser(),row=await network();if(!user||row.ownerId!==user.userId)return response({error:"Only the network owner can publish supplier help."},403);
 if(!env.BUCKET)return response({error:"Supplier help file storage is not configured."},503);
 if(Number(request.headers.get("Content-Length"))>26*1024*1024)return response({error:"Upload a file up to 25 MB."},413);
 let size=0;const reader=request.body?.getReader();if(!reader)return response({error:"Upload form required."},400);
 const stream=new ReadableStream<Uint8Array>({async pull(controller){const chunk=await reader.read();if(chunk.done){controller.close();return;}size+=chunk.value.byteLength;if(size>26*1024*1024){await reader.cancel();controller.error(new Error("Upload too large."));return;}controller.enqueue(chunk.value);},async cancel(){await reader.cancel();}});
 const bounded=new Request(request.url,{method:"POST",headers:request.headers,body:stream,duplex:"half"} as RequestInit),form=await bounded.formData(),id=String(form.get("id")||crypto.randomUUID()),existing=row.workspace.library.find(r=>r.id===id);
 if(form.get("id")&&!existing)return response({error:"Help resource not found."},404);
 const title=String(form.get("title")||"").trim(),summary=String(form.get("summary")||"").trim(),kind=String(form.get("kind")||"document"),status=String(form.get("status")||"draft");
 if(title.length<2||title.length>150||summary.length<1||summary.length>2000||!["document","video"].includes(kind)||!["draft","published","archived"].includes(status))return response({error:"Complete the resource title, summary, kind and publication status."},400);
 const file=form.get("file"),link=String(form.get("url")||"").trim();let fileKey=existing?.fileKey||"",url=existing?.url||"",mime=existing?.mime||"",fileName=existing?.fileName||"",fileSize=existing?.fileSize||0,uploaded="";
 if(file instanceof File&&file.size){
  if(file.size>(kind==="video"?25:15)*1024*1024)return response({error:"Documents are limited to 15 MB and videos to 25 MB."},413);
  const bytes=new Uint8Array(await file.arrayBuffer()),ext=file.name.split(".").pop()?.toLowerCase(),starts=(values:number[])=>values.every((v,i)=>bytes[i]===v);
  mime=kind==="video"&&ext==="mp4"&&String.fromCharCode(...bytes.slice(4,8))==="ftyp"?"video/mp4":kind==="video"&&ext==="webm"&&starts([26,69,223,163])?"video/webm":kind==="document"&&ext==="pdf"&&starts([37,80,68,70,45])?"application/pdf":kind==="document"&&ext==="docx"&&starts([80,75,3,4])?"application/vnd.openxmlformats-officedocument.wordprocessingml.document":kind==="document"&&ext==="png"&&starts([137,80,78,71,13,10,26,10])?"image/png":kind==="document"&&["jpg","jpeg"].includes(ext||"")&&starts([255,216,255])?"image/jpeg":kind==="document"&&ext==="txt"&&!bytes.includes(0)?"text/plain":"";
  if(!mime)return response({error:"Upload a valid PDF, DOCX, PNG, JPG, TXT, MP4 or WebM file."},400);
  if(link)return response({error:"Choose an uploaded file or an HTTPS link."},400);
  fileName=file.name.replace(/[^\w .()-]/g,"_").slice(0,200);fileSize=file.size;fileKey="supplier-help/"+crypto.randomUUID();uploaded=fileKey;url="";
  await env.BUCKET.put(fileKey,bytes,{httpMetadata:{contentType:mime}});
 }else if(link){const parsed=new URL(link);if(parsed.protocol!=="https:"||parsed.username||parsed.password)return response({error:"Use a secure resource link."},400);url=parsed.href;fileKey="";fileName="";fileSize=0;mime="";}
 if(!fileKey&&!url)return response({error:"Choose a file or HTTPS link."},400);
 if(existing&&existing.kind!==kind&&!uploaded&&!link)return response({error:"Choose a replacement file when changing resource type."},400);
 const next={...existing,id,supplierId:"",title,summary,kind,status,fileKey,url,mime,fileName,fileSize,createdAt:existing?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()};
 row.workspace.library=row.workspace.library.filter(r=>r.id!==id);row.workspace.library.push(next);
 row.workspace.audit.push({id:crypto.randomUUID(),supplierId:"",action:"supplier.library",target:id,actorId:user.userId,actorRole:"owner",at:new Date().toISOString()});
 try{await saveNetwork(row.state,row.version,row.workspace);}catch(e){if(uploaded)await env.BUCKET.delete(uploaded).catch(()=>{});throw e;}
 return response({saved:true});
}catch(e){return response({error:e instanceof Error?e.message:"Resource could not be saved."},typeof(e as {status?:unknown})?.status==="number"?(e as {status:number}).status:400);}}
