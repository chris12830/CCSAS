import {WorkflowError,normalizeWorkspace} from "./supplier-workflows.mjs";
import {sanitizeTransfer,SOURCE_PROJECT} from "./supplier-transfer.mjs";
const copy=value=>JSON.parse(JSON.stringify(value));
const sourceId=(value)=>{if(typeof value!=="string"||!value||value.length>100||!/^[-a-zA-Z0-9_]+$/.test(value))throw new WorkflowError(400,"Invalid source record identifier.");return "ccon-"+value;};
const safeUrl=value=>{try{const u=new URL(value);return ["http:","https:"].includes(u.protocol)?u.href:"";}catch{return "";}};
export function importSuppliers(previous,previousWorkspace,value,actor,context={}){
 if(!actor.owner)throw new WorkflowError(403,"Only the CCSAS owner can import supplier records.");
 const transfer=sanitizeTransfer(value),fingerprint=context.fingerprint;
 if(typeof fingerprint!=="string"||!/^[a-f0-9]{64}$/.test(fingerprint))throw new WorkflowError(400,"A verified export fingerprint is required.");
 const state=copy(previous),workspace=normalizeWorkspace(previousWorkspace),prior=workspace.imports.find(r=>r.sourceProject===SOURCE_PROJECT);
 if(prior){if(prior.fingerprint!==fingerprint)throw new WorkflowError(409,"A different CCON export was already imported. Reconcile changes explicitly; existing records will not be overwritten.");return {state,workspace,report:{idempotent:true,fingerprint,mappings:prior.mappings,counts:prior.counts,warnings:prior.warnings}};}
 const at=context.now||new Date().toISOString(),data=transfer.data,mappings=[],warnings=[],counts=Object.fromEntries(Object.entries(data).map(([key,rows])=>[key,rows.length]));
 const app=state.apps.find(a=>a.id==="owners");if(!app)throw new WorkflowError(409,"Configure the CCON application before importing.");
 app.hubIds=data.hubs.map(r=>r.id);app.placements=[...new Set([...app.placements,"Resource hub ticker","Resource hub static"])];
 for(const account of data.accounts){
  const source=data.suppliers.find(s=>s.owner_user_id===account.id),application=data.applications.find(r=>r.user_id===account.id),sub=data.subscriptions.find(s=>s.supplier_id===source?.id);
  const id=sourceId(source?.id??account.id);
  if(state.suppliers.some(s=>s.id===id||s.email.toLowerCase()===account.email.toLowerCase()||s.userId===account.identity_id))throw new WorkflowError(409,"Supplier identity conflicts with an existing CCSAS account: "+account.email);
  const packageId=sub?sourceId("plan-"+(source?.id??account.id)):"single";
  const amountCents=sub?(sub.billing_interval==="annual"?sub.membership_fee_cents:sub.monthly_fee_cents):0;
  if(sub){
   state.packages.push({id:packageId,name:sub.plan_name,description:"Preserved CCON contract. Renewal requires review of current supplier terms.",maxApps:1,cad:sub.currency==="CAD"?amountCents/100:0,usd:sub.currency==="USD"?amountCents/100:0,enabled:true,checkoutCad:sub.currency==="CAD"?safeUrl(sub.payment_url):"",checkoutUsd:sub.currency==="USD"?safeUrl(sub.payment_url):"",billingInterval:sub.billing_interval,royaltyBps:sub.royalty_bps,sourceCurrency:sub.currency});
   app.packages.push(packageId);
  }
  const hasConsent=!!(application?.policy_body&&application?.policy_revision&&application?.policy_accepted_at);
  if(account.status==="approved"&&!hasConsent)warnings.push(id+": original policy evidence is missing; approval is pending renewal.");
  const supplier={id,name:source?.name??application?.legal_name??account.organization??account.name,contact:account.name,email:account.email,userId:account.identity_id,website:safeUrl(source?.website??application?.website),category:source?.category??application?.category??"Software & services",
   countries:(source?.country_coverage??application?.country_coverage)==="both"?["CA","US"]:[(source?.country_coverage??application?.country_coverage??account.country)==="United States"?"US":"CA"],
   status:account.status==="approved"?(hasConsent?"approved":"pending"):account.status==="rejected"?"rejected":account.status==="more_info_requested"?"more_info_requested":"pending",
   accountStatus:account.supplier_account_status??"active",accountReason:account.supplier_account_reason??"",accountUpdatedAt:account.supplier_account_updated_at??"",packageId,currency:sub?.currency??(account.country==="United States"?"USD":"CAD"),
   billingStatus:sub?.status==="active"&&sub.paid_through?"active":"unpaid",paidUntil:sub?.paid_through?.slice(0,10)??"",paidThroughAt:sub?.paid_through??"",
   sample:false,policyAcceptedAt:hasConsent?application.policy_accepted_at:"",policyVersion:hasConsent?"ccon-"+application.policy_revision:"",policyText:hasConsent?application.policy_body:"",createdAt:account.created_at,sourceProject:SOURCE_PROJECT,sourceSupplierId:source?.id??"",sourceAccountId:account.id};
  state.suppliers.push(supplier);mappings.push({sourceAccountId:account.id,sourceSupplierId:source?.id??"",supplierId:id,identityId:account.identity_id});
  const terms=sub?.accepted_at?{packageId,name:sub.plan_name,currency:sub.currency,amountCents,royaltyBps:sub.royalty_bps,billingInterval:sub.billing_interval,acceptedAt:sub.accepted_at,acceptedBy:account.identity_id,source:"ccon",policyVersion:supplier.policyVersion}:undefined;
  workspace.profiles.push({id:"profile-"+id,supplierId:id,legalName:application?.legal_name??supplier.name,companyEmail:application?.company_email??account.email,companyPhone:application?.company_phone??"",representativePhone:application?.applicant_phone??"",description:source?.description??"",products:application?.products??"",services:application?.services??"",serviceRegions:application?.service_regions??"",criteriaRevision:application?.criteria_revision,criteriaSnapshot:application?.criteria_snapshot,criteriaAnswers:application?.criteria_answers,authorizedAt:application?.authorized_at,privacyAcceptedAt:application?.privacy_accepted_at,royaltyBps:sub?.royalty_bps??0,terms,createdAt:account.created_at,updatedAt:at});
  if(hasConsent)workspace.acceptances.push({id:"policy-"+id,supplierId:id,source:"ccon",version:String(application.policy_revision),text:application.policy_body,name:application.policy_accepted_by,email:application.policy_accepted_email,acceptedAt:application.policy_accepted_at,userId:account.identity_id});
  if(terms)workspace.acceptances.push({id:"terms-"+id,supplierId:id,source:"ccon-terms",version:sub.accepted_at,text:JSON.stringify(terms),terms,name:account.name,email:account.email,userId:account.identity_id,acceptedAt:sub.accepted_at});
  workspace.reviews.push({id:"review-"+id,supplierId:id,decision:supplier.status,reason:account.info_request??"Imported original CCON application status.",dueAt:account.info_due_at??"",reviewedAt:account.reviewed_at??account.created_at,source:"ccon"});
 }
 const mapping=(source)=>mappings.find(m=>m.sourceSupplierId===source);
 const byAccount=(id)=>mappings.find(m=>m.sourceAccountId===id);
 for(const row of data.recurring){const map=mapping(row.supplier_id);workspace.recurring.push({id:sourceId(row.id),supplierId:map.supplierId,reference:row.reference,title:row.title,feeCents:row.fee_cents,cadence:row.cadence,nextDueOn:row.next_due_on.slice(0,10),sourceNextDueAt:row.next_due_on.includes("T")?row.next_due_on:"",startsOn:row.starts_on.slice(0,10),status:row.status,createdAt:row.created_at,endedAt:row.ended_at,source:"ccon",sourceEnquiryId:row.enquiry_id,terms:{currency:row.currency,royaltyBps:row.royalty_bps,source:"ccon"}});}
 for(const row of data.sales){const map=mapping(row.supplier_id),refund=data.refunds.find(r=>r.sale_id===row.id);workspace.royalties.push({id:sourceId(row.id),supplierId:map.supplierId,reference:row.reference,grossCents:row.gross_cents,currency:row.currency,royaltyBps:row.royalty_bps,royaltyCents:row.royalty_cents,status:row.status,createdAt:row.created_at,settledAt:row.settled_at,dueAt:row.royalty_due_at??new Date(Date.parse(row.created_at)+30*86400000).toISOString(),recurringId:row.recurring_service_id?sourceId(row.recurring_service_id):"",periodStart:row.period_start,source:"ccon",sourceEnquiryId:row.enquiry_id,customerRefundReference:refund?.customer_reference,networkRefundReference:refund?.network_reference,refundVerifiedAt:refund?.verified_at});}
 for(const row of data.verifications){const map=mapping(row.supplier_id),billId=sourceId("invoice-"+row.id);workspace.invoices.push({id:billId,supplierId:map.supplierId,kind:row.kind,reference:row.reference,amountCents:row.amount_cents,currency:row.currency,status:"paid",createdAt:row.verified_at,paidAt:row.verified_at,source:"ccon",sourceTargetId:row.target_id});workspace.submissions.push({id:sourceId("receipt-"+row.id),supplierId:map.supplierId,invoiceId:billId,reference:row.reference,receiptReference:row.reference,amountCents:row.amount_cents,currency:row.currency,status:"verified",verifiedAt:row.verified_at,verifiedBy:row.verified_by,source:"ccon"});}
 for(const row of data.messages){const ticket=data.tickets.find(t=>t.id===row.ticket_id),map=byAccount(ticket.requester_id);workspace.messages.push({id:sourceId("message-"+row.id),supplierId:map.supplierId,senderRole:row.author_role==="supplier"?"supplier":"owner",senderId:row.author_id,body:"["+ticket.reference+" · "+ticket.subject+"] "+row.body,createdAt:row.created_at,readAt:"",source:"ccon",sourceTicketId:row.ticket_id});}
 for(const row of data.ads){
  const map=mapping(row.supplier_id),supplier=state.suppliers.find(s=>s.id===map.supplierId),sub=data.subscriptions.find(s=>s.supplier_id===row.supplier_id);
  const placement={ticker:"Dashboard ticker",hub_ticker:"Resource hub ticker",hub_static:"Resource hub static"}[row.placement];
  // Unfunded, expired or unsupported legacy placements remain preserved for review.
  const funded=row.payment_status==="paid"||(row.payment_status==="waived"&&row.fee_cents===0&&["ticker","hub_ticker"].includes(row.placement));
  const staticAllowed=row.placement!=="hub_static"||(row.ticker_speed==="normal"&&row.target_hub_id&&sub?.exclusive_category&&sub.billing_interval==="annual");
  const safe=!!placement&&funded&&staticAllowed&&row.expires_at&&row.expires_at>at&&safeUrl(row.destination_url)&&(!row.target_hub_id||app.hubIds.includes(row.target_hub_id));
  if(!safe)warnings.push("Campaign "+row.id+" remains paused until funding, placement and expiry are reviewed.");
  for(const country of supplier.countries)state.campaigns.push({id:sourceId(row.id)+"-"+country,supplierId:supplier.id,name:row.title,text:row.description,url:safeUrl(row.destination_url),country,currency:row.currency,appIds:["owners"],placement:placement??"Dashboard ticker",region:row.target_region??"",hubId:row.target_hub_id??"",tickerSpeed:row.ticker_speed==="delayed"?"premium":"normal",status:safe&&row.status==="approved"?"published":"paused",start:row.created_at.slice(0,10),end:row.expires_at?.slice(0,10)??at.slice(0,10),expiresAt:row.expires_at??"",createdAt:row.created_at,sample:false,sourceProject:SOURCE_PROJECT,sourceAdId:row.id});
 }
 for(const [entity,rows] of Object.entries(data))for(let index=0;index<rows.length;index++){
  const row=rows[index],sourceKey=String(row.id??row.supplier_id??row.user_id??row.sale_id??row.category??index),map=row.supplier_id?mapping(row.supplier_id):row.user_id?byAccount(row.user_id):entity==="accounts"?byAccount(row.id):entity==="suppliers"?mapping(row.id):entity==="tickets"?byAccount(row.requester_id):entity==="messages"?byAccount(data.tickets.find(t=>t.id===row.ticket_id)?.requester_id):entity==="refunds"?mapping(data.sales.find(s=>s.id===row.sale_id)?.supplier_id):undefined;
  workspace.sourceRecords.push({id:"ccon-source-"+entity+"-"+index,supplierId:map?.supplierId??"",sourceProject:SOURCE_PROJECT,entity,sourceId:sourceKey,record:copy(row),importedAt:at});
 }
 workspace.imports.push({id:"ccon-import-"+fingerprint,supplierId:"",sourceProject:SOURCE_PROJECT,fingerprint,exportedAt:transfer.exportedAt,frozen:transfer.frozen,importedAt:at,importedBy:actor.userId,mappings,counts,warnings});
 workspace.audit.push({id:"audit-import-"+fingerprint,supplierId:"",action:"supplier.import",actorId:actor.userId,actorRole:"owner",at,fingerprint,counts});
 return {state,workspace,report:{idempotent:false,fingerprint,mappings,counts,warnings,frozen:transfer.frozen}};
}
