import {WorkflowError,normalizeWorkspace,nextRecurringDate} from "./supplier-workflows.mjs";
import {SOURCE_PROJECT} from "./supplier-transfer.mjs";
const fail=(status,message)=>{throw new WorkflowError(status,message);};
const id=(v,label)=>typeof v==="string"&&/^[-a-zA-Z0-9_:]{1,100}$/.test(v)?v:fail(400,label+" is invalid.");
const money=(v,label,min=0,max=100000000)=>Number.isSafeInteger(v)&&v>=min&&v<=max?v:fail(400,label+" is invalid.");
export function normalizeEnquiryEvent(value){
 const common=["id","action","supplierId","sourceSupplierId","enquiryId","actorRole","actorIdentityId","createdAt"],specific={
  sale:["sourceSaleId","reference","grossCents","currency","royaltyBps","acceptedQuoteId","collected"],
  recurring_service:["sourceServiceId","reference","title","feeCents","currency","royaltyBps","acceptedQuoteId","startsOn","cadence"],
  recurring_payment:["sourceSaleId","sourceServiceId","reference","periodStart","collected"],
  purchase_match:["sourceSaleId","sourcePurchaseId","grossCents","currency"],
 };
 if(!value||typeof value!=="object"||Array.isArray(value)||!specific[value.action])fail(400,"Unknown enquiry ledger event.");
 const allowed=new Set([...common,...specific[value.action]]);
 if([...allowed].some(key=>value[key]===undefined))fail(400,'The enquiry ledger event is incomplete.');
 if(Object.keys(value).some(key=>!allowed.has(key)))fail(400,"Enquiry ledger events cannot include member data or extra fields.");
 const result={};for(const key of allowed)if(value[key]!==undefined)result[key]=value[key];
 for(const key of ["id","supplierId","sourceSupplierId","enquiryId",...["sourceSaleId","sourceServiceId","sourcePurchaseId","acceptedQuoteId"].filter(k=>value[k]!==undefined)])id(value[key],key);
 if(!["supplier","admin"].includes(value.actorRole)||typeof value.actorIdentityId!=="string"||!value.actorIdentityId||value.actorIdentityId.length>200)fail(400,"Invalid source actor.");
 if(typeof value.createdAt!=="string"||!Number.isFinite(Date.parse(value.createdAt)))fail(400,"Invalid receipt time.");
 if(value.currency!==undefined&&!["CAD","USD"].includes(value.currency))fail(400,"Invalid receipt currency.");
 if(value.grossCents!==undefined)money(value.grossCents,"Gross amount",1);
 if(value.feeCents!==undefined)money(value.feeCents,"Service fee",1);
 if(value.royaltyBps!==undefined)money(value.royaltyBps,"Royalty rate",0,10000);
 if(value.reference!==undefined&&(typeof value.reference!=="string"||value.reference.trim().length<3||value.reference.length>100))fail(400,"Invalid customer receipt reference.");
 if(["sale","recurring_payment"].includes(value.action)&&value.collected!==true)fail(400,"Confirm an actual customer payment.");
 if(value.action==="recurring_service"){
  if(!["monthly","yearly"].includes(value.cadence)||typeof value.title!=="string"||!value.title.trim()||value.title.length>150)fail(400,"Invalid recurring service.");
  if(typeof value.startsOn!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(value.startsOn)||new Date(value.startsOn+"T00:00:00Z").toISOString().slice(0,10)!==value.startsOn)fail(400,"Invalid service start date.");
 }
 if(value.action==="recurring_payment"&&(typeof value.periodStart!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(value.periodStart)))fail(400,"Invalid receipt period.");
 return result;
}
export function applyEnquiryEvent(previous,previousWorkspace,value,context={}){
 const event=normalizeEnquiryEvent(value),state=structuredClone(previous),workspace=normalizeWorkspace(previousWorkspace);
 if(typeof context.fingerprint!=="string"||!/^[a-f0-9]{64}$/.test(context.fingerprint))fail(400,"A verified event fingerprint is required.");
 const prior=workspace.integrationReceipts.find(r=>r.id===event.id&&r.sourceProject===SOURCE_PROJECT);
 if(prior){if(prior.fingerprint!==context.fingerprint)fail(409,"This event ID already contains different data.");return {state,workspace,receipt:prior.receipt,idempotent:true};}
 const supplier=state.suppliers.find(s=>s.id===event.supplierId&&!s.sample);if(!supplier)fail(404,"Supplier not found.");
 if(supplier.sourceSupplierId&&supplier.sourceSupplierId!==event.sourceSupplierId)fail(403,"The source supplier binding differs.");
 if(event.actorRole==="supplier"&&(!supplier.userId||supplier.userId!==event.actorIdentityId))fail(403,"The source supplier identity differs.");
 if(["recurring_payment","purchase_match"].includes(event.action)&&event.actorRole!=="admin")fail(403,"Source administrator verification is required.");
 const now=context.now||new Date().toISOString();if(Date.parse(event.createdAt)>Date.parse(now)+300000)fail(400,"Receipt time is in the future.");
 let entity="",record;
 const common={supplierId:supplier.id,source:"ccon",sourceProject:SOURCE_PROJECT,sourceSupplierId:event.sourceSupplierId,sourceEnquiryId:event.enquiryId,createdAt:event.createdAt};
 if(event.action==="sale"){
  if(workspace.royalties.some(r=>r.id==="ccon-"+event.sourceSaleId||r.supplierId===supplier.id&&(r.reference===event.reference||r.sourceEnquiryId===event.enquiryId&&!r.recurringId)))fail(409,"This customer receipt or one-time enquiry is already recorded.");
  record={...common,id:"ccon-"+event.sourceSaleId,sourceSaleId:event.sourceSaleId,reference:event.reference,grossCents:event.grossCents,currency:event.currency,royaltyBps:event.royaltyBps,royaltyCents:Math.round(event.grossCents*event.royaltyBps/10000),status:"reported",dueAt:new Date(Date.parse(event.createdAt)+30*86400000).toISOString(),terms:{source:"accepted-ccon-quote",acceptedQuoteId:event.acceptedQuoteId,currency:event.currency,royaltyBps:event.royaltyBps}};
  workspace.royalties.push(record);entity="sale";
 }else if(event.action==="recurring_service"){
  if(workspace.recurring.some(r=>r.id==="ccon-"+event.sourceServiceId||r.supplierId===supplier.id&&(r.reference===event.reference||r.sourceEnquiryId===event.enquiryId)))fail(409,"This enquiry already has a recurring service.");
  record={...common,id:"ccon-"+event.sourceServiceId,sourceServiceId:event.sourceServiceId,reference:event.reference,title:event.title,feeCents:event.feeCents,cadence:event.cadence,startsOn:event.startsOn,nextDueOn:event.startsOn,status:"active",terms:{source:"accepted-ccon-quote",acceptedQuoteId:event.acceptedQuoteId,currency:event.currency,royaltyBps:event.royaltyBps}};
  workspace.recurring.push(record);entity="recurring";
 }else if(event.action==="recurring_payment"){
  const service=workspace.recurring.find(r=>r.id==="ccon-"+event.sourceServiceId&&r.supplierId===supplier.id&&r.sourceEnquiryId===event.enquiryId);
  if(!service||service.nextDueOn!==event.periodStart||service.nextDueOn>event.createdAt.slice(0,10)||(service.sourceNextDueAt&&Date.parse(service.sourceNextDueAt)>Date.parse(event.createdAt))||(service.status==="ended"&&service.nextDueOn>service.endedAt?.slice(0,10)))fail(409,"The actual recurring receipt period changed or is not due.");
  if(workspace.royalties.some(r=>r.id==="ccon-"+event.sourceSaleId||r.supplierId===supplier.id&&(r.reference===event.reference||r.recurringId===service.id&&r.periodStart===event.periodStart)))fail(409,"This recurring receipt or period is already recorded.");
  const terms=service.terms;
  record={...common,id:"ccon-"+event.sourceSaleId,sourceSaleId:event.sourceSaleId,reference:event.reference,grossCents:service.feeCents,currency:terms.currency,royaltyBps:terms.royaltyBps,royaltyCents:Math.round(service.feeCents*terms.royaltyBps/10000),recurringId:service.id,periodStart:event.periodStart,status:"reported",dueAt:new Date(Date.parse(event.createdAt)+30*86400000).toISOString(),terms:structuredClone(terms)};
  workspace.royalties.push(record);service.nextDueOn=nextRecurringDate(service.nextDueOn,service.cadence,service.startsOn);if(service.sourceNextDueAt)service.sourceNextDueAt=service.nextDueOn+service.sourceNextDueAt.slice(10);entity="sale";
 }else{
  const sale=workspace.royalties.find(r=>r.id==="ccon-"+event.sourceSaleId&&r.supplierId===supplier.id&&r.sourceEnquiryId===event.enquiryId);
  if(!sale||sale.status==="refunded"||sale.grossCents!==event.grossCents||sale.currency!==event.currency)fail(409,"The private purchase report does not match this unrefunded source sale.");
  record={sourcePurchaseId:event.sourcePurchaseId,sourceSaleId:event.sourceSaleId,enquiryId:event.enquiryId};entity="purchase_match";
 }
 const receipt={eventId:event.id,entity,record:structuredClone(record),...(entity==="sale"&&record.recurringId?{service:structuredClone(workspace.recurring.find(r=>r.id===record.recurringId))}:{})};
 workspace.integrationReceipts.push({id:event.id,supplierId:supplier.id,sourceProject:SOURCE_PROJECT,fingerprint:context.fingerprint,receivedAt:now,receipt});
 workspace.audit.push({id:"source-event-"+event.id,supplierId:supplier.id,action:"supplier.enquiry."+event.action,actorId:event.actorIdentityId,actorRole:event.actorRole==="admin"?"owner":"supplier",at:now,sourceEnquiryId:event.enquiryId});
 return {state,workspace,receipt,idempotent:false};
}
