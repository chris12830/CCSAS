import {normalizeWorkspace,WorkflowError} from "./supplier-workflows.mjs";

export function supplierInbox(workspace,supplierId,owner=false){
 const role=owner?"owner":"supplier";
 const newestFirst=(a,b)=>String(b.createdAt||"").localeCompare(String(a.createdAt||""))||String(b.id).localeCompare(String(a.id));
 const messages=(workspace.messages||[]).filter(m=>m.supplierId===supplierId&&m.senderRole!==role).sort(newestFirst);
 const notifications=owner?[]:(workspace.notices||[]).filter(n=>n.supplierId===supplierId&&n.kind!=="message"&&n.subject!=="New message from the network team").sort(newestFirst).map(n=>({
  ...n,detail:typeof n.detail==="string"?n.detail:String(n.body||"").split("\n\n").slice(2).filter(part=>!part.startsWith("Sign in ")).join("\n\n").trim()
 }));
 return {messages,notifications,unreadMessages:messages.filter(m=>!m.readAt).length,unreadNotifications:notifications.filter(n=>!n.readAt).length};
}

export function queueSupplierNotice(workspaceValue,state,action,input,now=new Date().toISOString()){
 const workspace=normalizeWorkspace(workspaceValue);
 const emailAction=["supplier.review","supplier.account","supplier.message"].includes(action);
 const inAppAction=["campaign_status","grant_complimentary","revoke_complimentary"].includes(action);
 if(!emailAction&&!inAppAction)return workspace;
 const campaign=action==="campaign_status"?state.campaigns?.find(c=>c.id===input.id):undefined;
 const supplierId=campaign?.supplierId||(action==="grant_complimentary"||action==="revoke_complimentary"?input.id:input.supplierId);
 const supplier=state.suppliers.find(s=>s.id===supplierId);if(!supplier||supplier.sample)return workspace;
 let kind="account",subject="Supplier account update",detail=input.reason||"",destination="account";
 if(action==="supplier.review"){
  kind="application";subject="Supplier application: "+supplier.status.replaceAll("_"," ");
  if(input.dueAt)detail+=(detail?"\n":"")+"Information deadline: "+input.dueAt;
 }else if(action==="supplier.account"){
  detail="Account status: "+(supplier.accountStatus||"active")+(detail?"\n"+detail:"");
 }else if(action==="supplier.message"){
  kind="message";subject="New message from the network team";detail=input.body||"";destination="messages";
 }else if(campaign){
  kind="campaign";subject="Campaign "+(campaign.status==="published"?"approved":campaign.status==="review"?"awaiting review":campaign.status);
  detail=campaign.name+"\n"+(campaign.status==="published"?"Your advertising campaign has been approved. Active advertising access and the campaign dates are also required for delivery.":campaign.status==="rejected"?"Your campaign was not approved. Contact the network team for details.":campaign.status==="paused"?"Delivery of this campaign has been paused.":"Your campaign is waiting for review.");
  destination="campaign";
 }else if(action==="grant_complimentary"){
  subject="Complimentary advertising access granted";detail="Advertising access is valid through "+supplier.paidUntil+"."+ (input.reason?"\n"+input.reason:"");destination="billing";
 }else if(action==="revoke_complimentary"){
  subject="Complimentary advertising access ended";detail="Your complimentary advertising access has ended. Open Billing or contact the network team to review your advertising access.";destination="billing";
 }
 workspace.notices.push({id:crypto.randomUUID(),supplierId:supplier.id,to:supplier.email,kind,subject,detail,destination,...(campaign?{campaignId:campaign.id}:{}),body:supplier.name+"\n\n"+subject+"\n\n"+detail+"\n\nSign in to the SAS Supplier Portal with your own supplier account to view the update.",status:emailAction?"queued":"in_app",inAppOnly:!emailAction,readAt:"",createdAt:now});
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
