import {campaignPurchaseQuote} from "./supplier-catalog.mjs";
import {isSharedPackage,selectableSupplierPackages,supplierApprovalError} from "./supplier-packages.mjs";
import type {Workspace} from "./supplier-workflows.mjs";
import {z} from "zod";
import {type Network, type Supplier, type Campaign, type Country, type Audience, POLICY_VERSION, today, categories, placements} from "./sas-model";

const id=z.string().min(1).max(100), name=z.string().trim().min(2).max(150);
const countries=z.array(z.enum(["CA","US"])).min(1).max(2);
const url=z.string().trim().max(1000).refine(v=>{try{return ["http:","https:"].includes(new URL(v).protocol)}catch{return false}},"Enter a complete http or https website address.");
const optionalUrl=z.union([url,z.literal("")]);
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>!Number.isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v,"Enter a valid date.");
const supplierSchema=z.object({id:id.optional(),name,contact:name,email:z.string().trim().email().max(200),website:optionalUrl,category:z.string().trim().min(1).max(100),countries,packageId:id,currency:z.enum(["CAD","USD"]),accepted:z.boolean(),policyVersion:z.string().optional(),policyText:z.string().optional(),sample:z.boolean().optional()});
const campaignSchema=z.object({id:id.optional(),supplierId:id,name,text:z.string().trim().min(5).max(500),url,country:z.enum(["CA","US"]),currency:z.enum(["CAD","USD"]),appIds:z.array(id).min(1),placement:z.string().refine(v=>placements.includes(v)),region:z.string().trim().max(80),hubId:z.string().max(100).optional(),tickerSpeed:z.enum(["normal","premium"]).optional(),start:date,end:date,submit:z.boolean()});
export type Actor={userId:string;email:string;owner:boolean};
export function applyAction(previous:Network, action:string, input:unknown, actor:Actor,workspace?:Workspace):Network{
  const state=structuredClone(previous),now=new Date().toISOString();
  if(!actor.owner&&!["save_supplier","save_campaign"].includes(action))throw new Error("Only the network owner can perform this action.");
  let message="";
  switch(action){
    case "save_app":{
      const v=z.object({id:id.optional(),name,short:z.string().min(1).max(3),domain:z.string().trim().min(2).max(150),color:z.string().regex(/^#[0-9a-fA-F]{6}$/),enabled:z.boolean(),countries,hubIds:z.array(z.string().trim().min(1).max(100).regex(/^[a-z0-9][a-z0-9_-]*$/)).max(200).optional(),packages:z.array(id).min(1),audiences:z.array(z.enum(["owner","admin","staff"])).min(1),placements:z.array(z.string()).min(1)}).parse(input);
      if(v.packages.some(p=>!state.packages.some(x=>x.id===p))||v.placements.some(p=>!placements.includes(p)))throw new Error("Choose existing packages and placements.");
      const existing=state.apps.find(a=>a.id===v.id);
      if(v.id&&!existing)throw new Error("Application not found.");
      if(v.hubIds&&new Set(v.hubIds).size!==v.hubIds.length)throw new Error("Hub IDs must be unique.");
      if(existing&&v.hubIds&&state.campaigns.some(c=>c.appIds.includes(existing.id)&&c.hubId&&!v.hubIds!.includes(c.hubId)))throw new Error("Keep hub IDs referenced by existing campaigns. Reassign those campaigns before removing a hub ID.");
      const next={...existing,...v,id:v.id??crypto.randomUUID()};
      if(existing)state.apps=state.apps.map(a=>a.id===next.id?next:a);else state.apps.push(next);
      message=`${v.name} advertising settings saved.`;break;
    }
    case "save_package":{
      const v=z.object({id,name,description:z.string().trim().min(5).max(200),maxApps:z.number().int().min(1).max(99),cad:z.number().min(0).max(1000000),usd:z.number().min(0).max(1000000),enabled:z.boolean(),checkoutCad:optionalUrl,checkoutUsd:optionalUrl}).parse(input);
      if(!state.packages.some(p=>p.id===v.id))throw new Error("Package not found.");
      if(!isSharedPackage(state.packages.find(p=>p.id===v.id)!))throw new Error("Preserved contracts are managed separately from shared SAS packages.");
      state.packages=state.packages.map(p=>p.id===v.id?{...p,...v}:p); message=`${v.name} package updated.`;break;
    }
    case "save_supplier":{
      const v=supplierSchema.parse(input),existing=state.suppliers.find(s=>s.id===v.id);
      if(v.id&&!existing)throw new Error("Supplier not found.");
      if(!actor.owner&&existing&&(existing.userId?existing.userId!==actor.userId:existing.email.toLowerCase()!==actor.email.toLowerCase()))throw new Error("You cannot edit another supplier.");
      if(!actor.owner&&(v.accepted!==true||v.policyVersion!==state.settings.policyVersion||v.policyText!==state.settings.policy))throw new Error("Read and accept the current supplier policy. Reload if it has changed.");
      const email=actor.owner?v.email:actor.email;
      if(state.suppliers.some(s=>s.id!==v.id&&s.email.toLowerCase()===email.toLowerCase()))throw new Error("This email already has a supplier application.");
      if(!state.packages.some(p=>p.id===v.packageId&&p.enabled))throw new Error("Choose an available package.");
      const selectedPackage=state.packages.find(p=>p.id===v.packageId)!;
      if(selectedPackage.supplierId&&selectedPackage.supplierId!==existing?.id)throw new Error("This preserved contract belongs to another supplier.");
      if(!selectableSupplierPackages(state.packages,existing?.packageId).some(p=>p.id===v.packageId))throw new Error("Choose a shared SAS package. Existing CCON contracts are retained for their current suppliers.");
      const changedPackage=existing&&(existing.packageId!==v.packageId||existing.currency!==v.currency);
      const next:Supplier={...existing,id:v.id??crypto.randomUUID(),name:v.name,contact:v.contact,email,website:v.website,category:v.category,countries:v.countries,packageId:v.packageId,currency:v.currency,
        status:existing?.status??"pending",applicationRequired:existing?.applicationRequired??(!existing&&!(actor.owner&&v.sample===true)),billingStatus:changedPackage?"unpaid":existing?.billingStatus??"unpaid",paidUntil:changedPackage?"":existing?.paidUntil??"",sample:existing?.sample??(actor.owner&&v.sample===true),userId:existing?.userId??(!actor.owner?actor.userId:undefined),policyAcceptedAt:actor.owner?(existing?.policyAcceptedAt??""):(existing?.policyVersion===state.settings.policyVersion?existing.policyAcceptedAt:now),policyVersion:actor.owner?(existing?.policyVersion??""):state.settings.policyVersion,policyText:actor.owner?(existing?.policyText??""):state.settings.policy,createdAt:existing?.createdAt??now};
      if(existing)state.suppliers=state.suppliers.map(s=>s.id===next.id?next:s);else state.suppliers.push(next);
      message=`${next.name} supplier application ${existing?"updated":"received"}.`;break;
    }
    case "accept_representative_policy":{
      const v=z.object({id,representative:name,accepted:z.literal(true),policyVersion:z.string(),policyText:z.string()}).parse(input),s=state.suppliers.find(s=>s.id===v.id);
      if(!s)throw new Error("Supplier not found.");
      if(s.userId&&s.userId!==actor.userId)throw new Error("This supplier must accept policy through its own account.");
      if(v.policyVersion!==state.settings.policyVersion||v.policyText!==state.settings.policy)throw new Error("Policy changed. Refresh and review it again.");
      s.policyAcceptanceHistory??=[];
      s.policyAcceptanceHistory.push({at:now,version:v.policyVersion,text:v.policyText,representative:v.representative,actorId:actor.userId,actorEmail:actor.email});
      s.policyAcceptedAt=now;s.policyVersion=v.policyVersion;s.policyText=v.policyText;
      message=`Policy accepted by ${v.representative} as authorized representative of ${s.name}.`;break;
    }
    case "grant_complimentary":{
      const v=z.object({id,reason:z.string().trim().min(5).max(500),until:date}).parse(input),s=state.suppliers.find(s=>s.id===v.id);
      if(!s)throw new Error("Supplier not found.");
      const p=state.packages.find(p=>p.id===s.packageId);
      if(!p?.enabled||p.sourceAppId||s.sourceProject)throw new Error("Complimentary access is available only for direct SAS packages; preserved contracts require their existing workflow.");
      if(s.status!=="approved"||(s.accountStatus??"active")!=="active"||!s.policyAcceptedAt||!s.policyVersion||!s.policyText)throw new Error("Approve the supplier and record genuine policy acceptance first.");
      if(v.until<today())throw new Error("Choose today or a future expiry date.");
      if(s.billingStatus==="active"&&s.paidUntil>=today()&&s.accessKind!=="complimentary")throw new Error("Do not replace an active paid subscription with complimentary access.");
      s.complimentaryHistory??=[];
      s.complimentaryHistory.push({reason:v.reason,until:v.until,at:now,by:actor.userId});
      s.accessKind="complimentary";s.complimentaryReason=v.reason;s.complimentaryGrantedAt=now;s.complimentaryGrantedBy=actor.userId;
      s.billingStatus="active";s.paidUntil=v.until;s.paidThroughAt=undefined;
      message=`Complimentary access granted to ${s.name} through ${v.until}: ${v.reason}. No payment received or revenue recorded.`;break;
    }
    case "revoke_complimentary":{
      const v=z.object({id}).parse(input),s=state.suppliers.find(s=>s.id===v.id);
      if(!s||s.accessKind!=="complimentary")throw new Error("No complimentary access to revoke.");
      const grant=s.complimentaryHistory?.at(-1);if(grant)grant.revokedAt=now;
      s.accessKind=undefined;s.billingStatus="unpaid";s.paidUntil="";
      message=`Complimentary access revoked for ${s.name}. No payment records changed.`;break;
    }
    case "supplier_status":{
      const v=z.object({id,status:z.enum(["approved","pending","suspended","rejected"])}).parse(input),s=state.suppliers.find(s=>s.id===v.id);
      if(!s)throw new Error("Supplier not found.");
      if(v.status==="approved"){
        const error=supplierApprovalError(s,state.packages.find(p=>p.id===s.packageId),workspace?.profiles.find(p=>p.supplierId===s.id));
        if(error)throw Object.assign(new Error(error),{status:409});
      }
      s.status=v.status;message=`${s.name} ${v.status}.`;break;
    }
    case "save_campaign":{
      const v=campaignSchema.parse(input),s=state.suppliers.find(s=>s.id===v.supplierId),existing=state.campaigns.find(c=>c.id===v.id),p=state.packages.find(p=>p.id===s?.packageId);
      if(!s||!p)throw new Error("Select an existing supplier.");
      if(v.id&&!existing)throw new Error("Campaign not found.");
      if(existing&&existing.supplierId!==s.id)throw new Error("A campaign's supplier cannot be changed.");
      if(!actor.owner&&(s.userId?s.userId!==actor.userId:s.email.toLowerCase()!==actor.email.toLowerCase()))throw new Error("You cannot create campaigns for another supplier.");
      if(s.status==="suspended"||s.status==="rejected"||(s.accountStatus??"active")!=="active")throw new Error("This supplier account cannot submit campaigns.");
      const copyLimit=p.sourceAppId==="owners"?500:state.settings.maxCopy;if(v.text.length>copyLimit)throw new Error(`Ad copy is limited to ${copyLimit} characters.`);
      if(!s.countries.includes(v.country))throw new Error("This supplier does not serve the selected country.");
      if(p.sourceAppId==="owners"?v.currency!==p.sourceCurrency:((v.country==="CA"&&v.currency!=="CAD")||(v.country==="US"&&v.currency!=="USD")))throw new Error("Use CAD for Canada and USD for USA offers.");
      if(v.end<v.start)throw new Error("The campaign end date must follow its start date.");
      const appIds=[...new Set(v.appIds)];
      if(appIds.length>p.maxApps)throw new Error(`This package allows up to ${p.maxApps} applications.`);
      if(appIds.some(id=>!state.apps.some(a=>a.id===id&&a.enabled&&a.packages.includes(p.id)&&a.countries.includes(v.country)&&a.placements.includes(v.placement))))throw new Error("One or more applications do not allow this advertising placement or package.");
      if(v.hubId&&(appIds.length!==1||!state.apps.find(a=>a.id===appIds[0])?.hubIds?.includes(v.hubId)))throw new Error("Select a hub belonging to the selected application.");
      if(v.placement==="Dashboard ticker"&&v.hubId)throw new Error("Dashboard campaigns must not target a resource hub.");
      if(v.placement!=="Dashboard ticker"&&!v.hubId)throw new Error("Select the target resource hub.");
      const next:Campaign={...existing,id:v.id??crypto.randomUUID(),supplierId:s.id,name:v.name,text:v.text,url:v.url,country:v.country,currency:v.currency,appIds,placement:v.placement,region:v.region,hubId:v.hubId??"",tickerSpeed:v.tickerSpeed??"normal",start:v.start,end:v.end,status:v.submit?"review":"draft",sample:s.sample,createdAt:existing?.createdAt??now};
      const quote=campaignPurchaseQuote(state,next);
      if(quote){next.feeCents=quote.amountCents;next.paymentStatus=quote.free?"waived":"unpaid";if(existing?.feeCents===quote.amountCents&&existing.currency===quote.currency&&existing.paymentStatus==="paid")next.paymentStatus="paid";if(!quote.free&&!existing?.paidAt)next.expiresAt="";}
      if(existing)state.campaigns=state.campaigns.map(c=>c.id===next.id?next:c);else state.campaigns.push(next);
      message=`${next.name} ${v.submit?"submitted for review":"saved as a draft"}.`;break;
    }
    case "campaign_status":{
      const v=z.object({id,status:z.enum(["published","paused","rejected","review"])}).parse(input),c=state.campaigns.find(c=>c.id===v.id),s=state.suppliers.find(s=>s.id===c?.supplierId);
      if(!c||!s)throw new Error("Campaign not found.");
      if(v.status==="published"&&(s.status!=="approved"||c.text.length>state.settings.maxCopy))throw new Error("Approve the supplier and check the ad copy limit before publishing.");
      c.status=v.status;message=`${c.name} ${v.status==="published"?"approved":v.status}.`;break;
    }
    case "record_payment":{
      const v=z.object({supplierId:id,amount:z.number().positive().max(1000000).refine(v=>Math.abs(v*100-Math.round(v*100))<0.000001,"Payment amounts must use whole currency cents."),currency:z.enum(["CAD","USD"]),reference:z.string().trim().min(3).max(150),date,paidUntil:date}).parse(input),s=state.suppliers.find(s=>s.id===v.supplierId);
      if(!s)throw new Error("Supplier not found.");
      if(v.paidUntil<v.date||v.paidUntil<today())throw new Error("Choose a current or future paid-through date.");
      if(state.payments.some(p=>p.reference===v.reference))throw new Error("This payment reference is already recorded.");
      state.payments.unshift({...v,id:crypto.randomUUID(),sample:s.sample});
      s.accessKind=undefined;s.billingStatus="active";s.paidUntil=v.paidUntil;message=`Payment recorded for ${s.name}.`;break;
    }
    case "billing_status":{
      const v=z.object({id,status:z.enum(["unpaid","past_due"])}).parse(input),s=state.suppliers.find(s=>s.id===v.id);
      if(!s)throw new Error("Supplier not found.");s.billingStatus=v.status;message=`${s.name} billing marked ${v.status.replace("_"," ")}.`;break;
    }
    case "save_settings":{
      const v=z.object({name,maxCopy:z.number().int().min(60).max(120),speed:z.number().int().min(20).max(80),paused:z.boolean(),showSamples:z.boolean(),policy:z.string().trim().min(50).max(5000)}).parse(input);
      state.settings={...previous.settings,...v,policyVersion:v.policy===previous.settings.policy?previous.settings.policyVersion:`${today()}.${crypto.randomUUID().slice(0,8)}`};
      message="Network settings saved.";break;
    }
    default:throw new Error("Unknown action.");
  }
  state.activity.unshift({id:crypto.randomUUID(),text:message,date:now});state.activity=state.activity.slice(0,100);
  return state;
}
