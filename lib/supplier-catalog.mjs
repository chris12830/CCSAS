import {WorkflowError,normalizeWorkspace} from "./supplier-workflows.mjs";
const fail=(status,message)=>{throw new WorkflowError(status,message);};
const text=(v,label,max=2000,min=1)=>typeof v==="string"&&v.trim().length>=min&&v.trim().length<=max?v.trim():fail(400,label+" is invalid.");
const cents=(v,label,max=100000000)=>Number.isSafeInteger(v)&&v>=0&&v<=max?v:fail(400,label+" is invalid.");
export const defaultSupplierCriteria={title:"Supplier application criteria",introduction:"We vet every supplier to keep ChildCareOwnersNetwork useful and trustworthy. Confirm the criteria below and provide complete company and representative details.",revision:1,items:[
{id:"verifiable-business",title:"Verifiable business or professional supplier",description:"Your business or professional registration can be checked by the network administrator.",responseType:"confirmation",required:true},
{id:"child-care-relevance",title:"Products or services relevant to child care",description:"Your products or services support child care businesses, their operations, staff, programs or facilities.",responseType:"confirmation",required:true},
{id:"complete-information",title:"Complete company and contact information",description:"Provide your legal and trading names, registration, address, website, company contacts and authorized representative’s details.",responseType:"confirmation",required:true},
{id:"accurate-and-private",title:"Accurate information and member privacy",description:"Supply accurate information and respect the restriction to resource hub titles and descriptions. Member identities, businesses and content are private.",responseType:"confirmation",required:true}
]};
export function supplierCriteria(state){return structuredClone(state.settings.supplierCriteria||defaultSupplierCriteria);}
export function catalogPlanFromSource(plan){
 const amount=plan.membership_fee_cents||plan.monthly_fee_cents;
 return {id:"ccon-offer-"+plan.id,name:plan.name==="Tier 2 — Exclusive Category Partner"?"Tier 2 — Resource Hub Advertiser":plan.name,description:plan.description||"CCON supplier membership",maxApps:1,cad:plan.currency==="CAD"?amount/100:0,usd:plan.currency==="USD"?amount/100:0,enabled:!!plan.available&&!plan.deleted_at,publicOffer:true,sourcePlanId:plan.id,sourceAppId:"owners",sourceCurrency:plan.currency,billingInterval:plan.billing_interval,royaltyBps:plan.royalty_bps,staticAllowed:!!plan.exclusive_category_partner,benefits:(()=>{try{const value=JSON.parse(plan.benefits_json||'[]');return Array.isArray(value)?value.filter(v=>typeof v==='string'):[];}catch{return [];}})(),checkoutCad:plan.currency==="CAD"?plan.plan_payment_url||"":"",checkoutUsd:plan.currency==="USD"?plan.plan_payment_url||"":"",
 campaignRates:{configured:!!plan.campaign_rates_configured,ticker:plan.ticker_fee_cents||0,premium:plan.delayed_ticker_fee_cents||0,premiumFree:!!plan.delayed_ticker_free,hubTicker:plan.hub_ticker_fee_cents||0,hubStatic:plan.hub_static_fee_cents||0},
 campaignCheckout:{ticker:plan.ticker_payment_url||"",premium:plan.delayed_ticker_payment_url||"",hubTicker:plan.hub_ticker_payment_url||"",hubStatic:plan.hub_static_payment_url||""}};
}
export function validateSupplierApplication(state,workspaceValue,supplier,input,actor,now=new Date().toISOString()){
 if(actor.owner)fail(403,"The supplier must submit their own application.");
 const workspace=normalizeWorkspace(workspaceValue),criteria=supplierCriteria(state),details=input.applicationDetails;
 if(!details||input.criteriaRevision!==criteria.revision)fail(409,"Reload the current supplier criteria before applying.");
 if(details.authorized!==true||details.privacyAccepted!==true)fail(400,"Confirm your authority and the member privacy restrictions.");
 const answers=Object.create(null);for(const item of criteria.items){
  const value=Object.hasOwn(input.criteriaAnswers||{},item.id)?String(input.criteriaAnswers[item.id]).trim():"";
  if(item.responseType==="confirmation"){if(value==="confirmed")answers[item.id]=value;else if(item.required)fail(400,"Confirm the supplier criterion: "+item.title);}
  else if(value.length>=10&&value.length<=4000)answers[item.id]=value;else if(item.required||value)fail(400,"Provide at least 10 characters for: "+item.title);
 }
 const fields={};for(const [key,min,max] of [["legalName",2,180],["companyEmail",3,254],["companyPhone",7,40],["representativePhone",7,40],["description",20,500],["serviceRegions",2,2000],["jobTitle",2,120],["addressLine1",4,180],["city",2,100],["postalCode",3,20],["registrationNumber",1,100],["registrationAuthority",2,140]])fields[key]=text(details[key],key,max,min);
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.companyEmail))fail(400,"Enter a company email.");
 if(!["CA","US"].includes(details.businessCountry))fail(400,"Choose the company's business country.");
 for(const key of ["products","services","addressLine2"])fields[key]=text(details[key]||"",key,key==="addressLine2"?180:2000,0);
 if(!fields.products&&!fields.services)fail(400,"Describe products or services relevant to child care.");
 try{const url=new URL(supplier.website);if(!["https:","http:"].includes(url.protocol)||url.username||url.password)throw Error();}catch{fail(400,"Enter the company's website.");}
 let profile=workspace.profiles.find(p=>p.supplierId===supplier.id);if(!profile){profile={id:"profile-"+supplier.id,supplierId:supplier.id,createdAt:now};workspace.profiles.push(profile);}
 Object.assign(profile,fields,{businessCountry:details.businessCountry,criteriaRevision:criteria.revision,criteriaSnapshot:criteria,criteriaAnswers:answers,authorizedAt:now,privacyAcceptedAt:now,applicationSubmittedBy:actor.userId,updatedAt:now});
 workspace.acceptances.push({id:crypto.randomUUID(),supplierId:supplier.id,source:"supplier-application",version:String(criteria.revision),text:JSON.stringify({criteria,answers,authorized:true,privacyAccepted:true}),userId:actor.userId,email:actor.email,name:supplier.contact,acceptedAt:now});
 return workspace;
}
export const catalogActions=["catalog.plan","catalog.criteria"];
export function applyCatalogAction(previous,previousWorkspace,action,input,actor){
 if(!actor.owner)fail(403,"Only the network owner can publish supplier terms.");
 const state=structuredClone(previous),workspace=normalizeWorkspace(previousWorkspace),at=new Date().toISOString();
 if(action==="catalog.criteria"){
  const before=supplierCriteria(state);if(input.baseRevision!==before.revision)fail(409,"The supplier criteria changed. Reload before editing.");
  if(!Array.isArray(input.items)||input.items.length<1||input.items.length>20||new Set(input.items.map(i=>i.id)).size!==input.items.length)fail(400,"Use one to twenty distinct criteria.");
  if(input.items.some(item=>typeof item.id!=='string'||!/^[-a-zA-Z0-9_]{1,80}$/.test(item.id)))fail(400,'Use valid criterion identifiers.');
  const items=input.items.map(item=>({id:text(item.id,"Criterion identifier",80),title:text(item.title,"Criterion title",160,2),description:text(item.description||"","Criterion explanation",1000,0),responseType:["confirmation","text"].includes(item.responseType)?item.responseType:fail(400,"Invalid response type."),required:typeof item.required==="boolean"?item.required:fail(400,"Set whether a criterion is required.")}));
  state.settings.supplierCriteria={title:text(input.title,"Criteria title",120,2),introduction:text(input.introduction,"Criteria introduction",2000,10),revision:before.revision+1,items,updatedAt:at};
 }else if(action==="catalog.plan"){
  const id=input.id?text(input.id,"Plan",100):"ccon-offer-"+crypto.randomUUID(),existing=state.packages.find(p=>p.id===id);
  if(input.id&&(!existing||!existing.publicOffer||existing.sourceAppId!=="owners"))fail(404,"CCON catalog plan not found.");
  const currency=["CAD","USD"].includes(input.currency)?input.currency:fail(400,"Invalid currency"),amount=cents(input.amountCents,"Membership fee");
  const interval=["monthly","annual"].includes(input.billingInterval)?input.billingInterval:fail(400,"Invalid membership period"),royaltyBps=cents(input.royaltyBps,"Royalty rate",10000);
  if(input.staticAllowed&&interval!=="annual")fail(400,"Static Resource Hub memberships use annual billing.");
  const rates={configured:input.campaignRatesConfigured===true,ticker:cents(input.tickerFeeCents,"Dashboard ticker rate"),premium:cents(input.premiumFeeCents,"Premium ticker rate"),premiumFree:input.premiumFree===true,hubTicker:cents(input.hubTickerFeeCents,"Resource Hub ticker rate"),hubStatic:cents(input.hubStaticFeeCents,"Static Resource Hub rate")};
  if(rates.premiumFree&&rates.premium!==0||rates.premium>0&&rates.premium<=rates.ticker||rates.hubTicker>0&&rates.hubTicker<=rates.ticker)fail(400,"Paid premium and Resource Hub ticker rates must exceed the normal rate.");
  const url=(value)=>{if(!value)return "";const parsed=new URL(value);if(parsed.protocol!=="https:"||parsed.username||parsed.password)fail(400,"Use secure payment links.");return parsed.href;};
  const plan={...existing,id,name:text(input.name,"Plan name",150,2),description:text(input.description,"Plan description",2000,5),sourceAppId:"owners",sourcePlanId:existing?.sourcePlanId||id,publicOffer:true,sourceCurrency:currency,maxApps:1,cad:currency==="CAD"?amount/100:0,usd:currency==="USD"?amount/100:0,enabled:input.enabled===true,billingInterval:interval,royaltyBps,staticAllowed:input.staticAllowed===true,campaignRates:rates,campaignCheckout:{ticker:url(input.tickerPaymentUrl),premium:url(input.premiumPaymentUrl),hubTicker:url(input.hubTickerPaymentUrl),hubStatic:url(input.hubStaticPaymentUrl)},checkoutCad:currency==="CAD"?url(input.planPaymentUrl):"",checkoutUsd:currency==="USD"?url(input.planPaymentUrl):""};
  if(existing)state.packages=state.packages.map(p=>p.id===id?plan:p);else state.packages.push(plan);
  const app=state.apps.find(a=>a.id==="owners");if(!app)fail(409,"Configure CCON before publishing its membership plans.");if(!app.packages.includes(id))app.packages.push(id);
 }else fail(400,"Unknown catalog action.");
 workspace.audit.push({id:crypto.randomUUID(),supplierId:"",action,actorId:actor.userId,actorRole:"owner",at});
 return {state,workspace};
}
export function campaignPurchaseQuote(state,campaign){
 const supplier=state.suppliers.find(s=>s.id===campaign.supplierId),contract=state.packages.find(p=>p.id===supplier?.packageId);
 if(contract?.sourceAppId!=="owners"||!campaign.appIds.includes("owners"))return null;
 const published=state.packages.find(p=>p.publicOffer&&p.sourceAppId==="owners"&&p.sourcePlanId===contract.sourcePlanId);
 if(published&&!published.enabled)fail(409,"This advertising offering is retired.");
 if(supplier.status!=="approved"||supplier.billingStatus!=="active"||(supplier.accountStatus||"active")!=="active"||!supplier.paidUntil||supplier.paidUntil<new Date().toISOString().slice(0,10)||(supplier.paidThroughAt&&Date.parse(supplier.paidThroughAt)<=Date.now()))fail(409,"Activate the accepted CCON membership before purchasing campaigns.");
 const offer=published||contract;
 const rates=offer.campaignRates;if(!rates)fail(409,"Advertising rates need network review.");
 let kind=campaign.placement==="Resource hub static"?"hubStatic":campaign.placement==="Resource hub ticker"?"hubTicker":campaign.tickerSpeed==="premium"?"premium":"ticker";
 if(kind==="hubStatic"&&(!contract.staticAllowed||contract.billingInterval!=="annual"))fail(403,"Static Resource Hub advertising requires the accepted annual advertising membership.");
 if(kind!=="hubStatic"&&!rates.configured)fail(409,"Campaign rates have not been published.");
 const amountCents=cents(rates[kind],"Campaign fee"),free=kind!=="hubStatic"&&amountCents===0&&(kind!=="premium"||rates.premiumFree);
 if(!free&&amountCents<=0)fail(409,"Publish this campaign rate before purchase.");
 return {amountCents,currency:offer.sourceCurrency,free,checkoutUrl:offer.campaignCheckout?.[kind]||"",kind};
}
