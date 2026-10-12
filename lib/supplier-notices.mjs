import {normalizeWorkspace,WorkflowError} from "./supplier-workflows.mjs";
export function queueSupplierNotice(workspaceValue,state,action,input,now=new Date().toISOString()){
 const workspace=normalizeWorkspace(workspaceValue);
 if(!["supplier.review","supplier.account","supplier.message"].includes(action))return workspace;
 const supplier=state.suppliers.find(s=>s.id===input.supplierId);if(!supplier||supplier.sample)return workspace;
 const reason=action==="supplier.review"?input.reason||"":action==="supplier.account"?input.reason||"":input.body||"";
 const subject=action==="supplier.review"?"Supplier application: "+supplier.status.replaceAll("_"," "):action==="supplier.account"?"Supplier account update":"New message from the network team";
 workspace.notices.push({id:crypto.randomUUID(),supplierId:supplier.id,to:supplier.email,subject,body:supplier.name+"\n\n"+subject+"\n\n"+reason+(input.dueAt?"\nInformation deadline: "+input.dueAt:"")+"\n\nSign in to the CCSAS Supplier Portal with your own ChatGPT account to view the update.",status:"queued",createdAt:now});
 return workspace;
}
export async function deliverSupplierNotices(deps,actor){
 if(!actor.owner)throw new WorkflowError(403,"Only the owner can send supplier notifications.");
 let sent=0,pending=0;
 const row=await deps.load(),notices=row.workspace.notices.filter(n=>["queued","pending_setup"].includes(n.status)).slice(0,5);
 for(const n of notices){
  let status="pending_setup";
  if(deps.config.RESEND_API_KEY&&deps.config.SAS_MAIL_FROM){
   let result;try{result=await (deps.fetch||fetch)("https://api.resend.com/emails",{method:"POST",redirect:"error",signal:AbortSignal.timeout(10000),headers:{Authorization:"Bearer "+deps.config.RESEND_API_KEY,"Content-Type":"application/json","Idempotency-Key":"supplier-notice-"+n.id},body:JSON.stringify({from:deps.config.SAS_MAIL_FROM,to:[n.to],subject:n.subject,text:n.body})});}catch{result=null;}
   if(result?.ok)status="sent";else status="queued";
  }
  const current=await deps.load(),workspace=normalizeWorkspace(current.workspace),notice=workspace.notices.find(r=>r.id===n.id);if(!notice||notice.status==="sent")continue;
  notice.status=status;notice.attemptedAt=new Date().toISOString();if(status==="sent")notice.sentAt=notice.attemptedAt;
  await deps.save(current.state,current.version,workspace,current.workspace);if(status==="sent")sent++;else pending++;
 }
 return {sent,pending};
}
