import test from "node:test";
import assert from "node:assert/strict";
import {initialNetwork,eligibleAds,deliveryAd,today,publicState,Network} from "../lib/sas-model";
import {applyAction} from "../lib/sas-actions";
const owner={userId:"owner",email:"owner@example.test",owner:true};
const supplierActor={userId:"supplier-a",email:"supplier-a@example.test",owner:false};
const opts={appId:"owners",preview:true};
function realNetwork(){const s=initialNetwork();for(const supplier of s.suppliers)supplier.sample=false;for(const c of s.campaigns)c.sample=false;return s;}

test("examples can be previewed but never enter a live feed",()=>{
 const s=initialNetwork();assert.equal(eligibleAds(s,opts).length,4);assert.equal(eligibleAds(s,{appId:"owners"}).length,0);
 assert.equal(eligibleAds(s,{...opts,country:"CA"}).length,2);assert.equal(eligibleAds(s,{...opts,country:"US"}).length,2);
 assert.equal(eligibleAds(s,{appId:"invoice",preview:true}).length,0);
});
test("supplier approval, payment expiry and campaign dates stop delivery",()=>{
 for(const status of ["pending","suspended","rejected"] as const){const s=realNetwork();s.suppliers[0].status=status;assert.ok(!eligibleAds(s,opts).some(c=>c.id==="ad-maple"));}
 for(const billing of ["unpaid","past_due"] as const){const s=realNetwork();s.suppliers[0].billingStatus=billing;assert.ok(!eligibleAds(s,opts).some(c=>c.id==="ad-maple"));}
 for(const status of ["draft","review","paused","rejected"] as const){const s=realNetwork();s.campaigns[0].status=status;assert.ok(!eligibleAds(s,opts).some(c=>c.id==="ad-maple"));}
 const expired=realNetwork();expired.suppliers[0].paidUntil="2020-01-01";assert.ok(!eligibleAds(expired,opts).some(c=>c.id==="ad-maple"));
 const future=realNetwork();future.campaigns[0].start="2099-01-01";assert.ok(!eligibleAds(future,opts).some(c=>c.id==="ad-maple"));
 const ended=realNetwork();ended.campaigns[0].end="2020-01-01";assert.ok(!eligibleAds(ended,opts).some(c=>c.id==="ad-maple"));
});
test("application country, audience, placement, package and global pause are enforced",()=>{
 const s=realNetwork();assert.equal(eligibleAds(s,{...opts,audience:"staff"}).length,0);
 assert.equal(eligibleAds(s,{...opts,placement:"Unconfigured placement"}).length,0);
 s.apps[0].countries=["CA"];assert.ok(eligibleAds(s,opts).every(c=>c.country==="CA"));
 s.apps[0].packages=["single"];assert.equal(eligibleAds(s,opts).length,0);
 s.settings.paused=true;assert.equal(eligibleAds(s,opts).length,0);
});
test("regional targeting matches the app context and does not block nationwide offers",()=>{
 const s=realNetwork();s.campaigns[0].region="Ontario";
 assert.ok(!eligibleAds(s,opts).some(c=>c.id==="ad-maple"));
 assert.ok(eligibleAds(s,{...opts,region:"ontario"}).some(c=>c.id==="ad-maple"));
 assert.ok(eligibleAds(s,{...opts,region:"Florida"}).some(c=>c.id==="ad-bright-ca"));
});
test("full-network packages include newly enabled apps and reduced package limits are enforced",()=>{
 const s=realNetwork();s.apps.find(a=>a.id==="invoice")!.enabled=true;
 const ads=eligibleAds(s,{appId:"invoice"});assert.deepEqual(ads.map(c=>c.id),["ad-bright-ca","ad-bright-us"]);
 s.packages.find(p=>p.id==="bundle")!.maxApps=1;assert.ok(!eligibleAds(s,opts).some(c=>c.id==="ad-maple"));
});
test("supplier submissions are pending, bound to verified identity, and retain policy acceptance",()=>{
 const s=initialNetwork();const next=applyAction(s,"save_supplier",{name:"Real Supplier",contact:"Sam Supplier",email:"forged@example.test",website:"https://example.test",category:"Software & services",countries:["CA"],packageId:"single",currency:"CAD",accepted:true,policyVersion:s.settings.policyVersion,policyText:s.settings.policy,sample:true},supplierActor);
 const supplier=next.suppliers.at(-1)!;assert.equal(supplier.email,supplierActor.email);assert.equal(supplier.userId,supplierActor.userId);assert.equal(supplier.status,"pending");assert.equal(supplier.billingStatus,"unpaid");assert.equal(supplier.sample,false);assert.equal(supplier.policyText,s.settings.policy);assert.ok(supplier.policyAcceptedAt);
 assert.equal(s.suppliers.length,4);assert.throws(()=>applyAction(next,"supplier_status",{id:supplier.id,status:"approved"},supplierActor),/network owner/);
 assert.throws(()=>applyAction(next,"save_supplier",{...supplier,id:"sup-maple",accepted:true},supplierActor),/another supplier/);
});
test("campaign editing requires ownership, valid currency, ad length and purchased coverage",()=>{
 const s=realNetwork(),c=s.campaigns[0];
 assert.throws(()=>applyAction(s,"save_campaign",{...c,submit:true},supplierActor),/another supplier/);
 assert.throws(()=>applyAction(s,"save_campaign",{...c,text:"x".repeat(110),submit:true},owner),/100 characters/);
 assert.throws(()=>applyAction(s,"save_campaign",{...c,currency:"USD",submit:true},owner),/CAD/);
 s.suppliers[0].packageId="single";assert.throws(()=>applyAction(s,"save_campaign",{...c,submit:true},owner),/up to 1/);
 s.suppliers[0].packageId="bundle";const next=applyAction(s,"save_campaign",{...c,submit:true},owner);assert.equal(next.campaigns[0].status,"review");assert.ok(!eligibleAds(next,{appId:"owners"}).some(a=>a.id===c.id));
});
test("recorded payments activate coverage, duplicates are rejected and package changes require payment",()=>{
 let s=realNetwork();s.suppliers[0].billingStatus="unpaid";s.suppliers[0].paidUntil="";
 const payment={supplierId:"sup-maple",amount:99,currency:"CAD",reference:"receipt-123",date:today(),paidUntil:"2027-12-31"};
 s=applyAction(s,"record_payment",payment,owner);assert.equal(s.payments.length,1);assert.ok(eligibleAds(s,{appId:"owners"}).some(c=>c.id==="ad-maple"));
 assert.throws(()=>applyAction(s,"record_payment",payment,owner),/already recorded/);
 s=applyAction(s,"save_supplier",{...s.suppliers[0],packageId:"network",accepted:true},owner);assert.equal(s.suppliers[0].billingStatus,"unpaid");assert.equal(s.suppliers[0].paidUntil,"");assert.ok(!eligibleAds(s,{appId:"owners"}).some(c=>c.id==="ad-maple"));
});
test("policy revisions retain prior accepted text until renewed and credentials stay out of dashboard data",()=>{
 const old=initialNetwork();const next=applyAction(old,"save_settings",{...old.settings,policy:old.settings.policy+" Prices must include the offer expiry date."},owner);
 assert.notEqual(next.settings.policyVersion,old.settings.policyVersion);assert.equal(next.suppliers[0].policyText,old.settings.policy);
 next.apps[0].integrationHash="secret-digest";const safe=publicState(next);assert.equal(safe.apps[0].integrationHash,undefined);assert.equal(safe.apps[0].hasKey,true);
});

test("administrator-created profiles cannot manufacture supplier consent",()=>{
 const state=initialNetwork();
 const next=applyAction(state,"save_supplier",{name:"New Company",contact:"Company Representative",email:"new-company@example.test",website:"https://example.test",category:"Software & services",countries:["CA"],packageId:"single",currency:"CAD",accepted:true},owner);
 const created=next.suppliers.at(-1)!;assert.equal(created.policyAcceptedAt,"");assert.equal(created.policyText,"");assert.throws(()=>applyAction(next,"supplier_status",{id:created.id,status:"approved"},owner),/acceptance/);
});
test("matching email cannot bypass a bound supplier identity through legacy actions",()=>{
 const state=realNetwork(),existing=state.suppliers[0];existing.userId="bound-user";
 const actor={userId:"other-user",email:existing.email,owner:false};
 assert.throws(()=>applyAction(state,"save_supplier",{...existing,accepted:true,policyVersion:state.settings.policyVersion,policyText:state.settings.policy},actor),/another supplier/);
 assert.throws(()=>applyAction(state,"save_campaign",{...state.campaigns[0],submit:true},actor),/another supplier/);
});

function complimentaryCandidate(){
 const s=realNetwork(),supplier=s.suppliers[0];
 supplier.billingStatus="unpaid";supplier.paidUntil="";
 return {s,id:supplier.id};
}
test("complimentary grant activates eligible ads without creating a payment",()=>{
 const {s,id}=complimentaryCandidate(),payments=structuredClone(s.payments);
 const next=applyAction(s,"grant_complimentary",{id,reason:"Owner-funded launch verification",until:"2098-12-31"},owner);
 assert.deepEqual(next.payments,payments);
 assert.equal(next.suppliers[0].accessKind,"complimentary");
 assert.equal(next.suppliers[0].complimentaryHistory?.[0].by,owner.userId);
 assert.ok(eligibleAds(next,{appId:"owners"}).some(c=>c.supplierId===id));
 assert.equal(s.suppliers[0].billingStatus,"unpaid");
});
test("complimentary grant requires owner, acceptance, approval, and valid expiry",()=>{
 const {s,id}=complimentaryCandidate(),input={id,reason:"Owner launch grant",until:"2098-12-31"};
 assert.throws(()=>applyAction(s,"grant_complimentary",input,supplierActor));
 for(const field of ["policyAcceptedAt","policyVersion","policyText"] as const){
  const copy=structuredClone(s);copy.suppliers[0][field]="";
  assert.throws(()=>applyAction(copy,"grant_complimentary",input,owner));
 }
 const copy=structuredClone(s);copy.suppliers[0].status="pending";
 assert.throws(()=>applyAction(copy,"grant_complimentary",input,owner));
 assert.throws(()=>applyAction(s,"grant_complimentary",{...input,until:"2020-01-01"},owner));
 assert.throws(()=>applyAction(s,"grant_complimentary",{...input,reason:""},owner));
});
test("complimentary grant preserves paid subscriptions and imported contract workflows",()=>{
 const {s,id}=complimentaryCandidate(),input={id,reason:"Owner launch grant",until:"2098-12-31"};
 const paid=structuredClone(s);paid.suppliers[0].billingStatus="active";paid.suppliers[0].paidUntil="2098-12-31";
 assert.throws(()=>applyAction(paid,"grant_complimentary",input,owner));
 const imported=structuredClone(s);imported.suppliers[0].sourceProject="ccon";
 assert.throws(()=>applyAction(imported,"grant_complimentary",input,owner));
});
test("complimentary access expires and revocation retains grant history",()=>{
 const {s,id}=complimentaryCandidate();
 let next=applyAction(s,"grant_complimentary",{id,reason:"Owner launch grant",until:"2098-12-31"},owner);
 next.campaigns[0].end="2099-12-31";
 assert.ok(!eligibleAds(next,{appId:"owners",date:"2099-01-01"}).some(c=>c.supplierId===id));
 next=applyAction(next,"revoke_complimentary",{id},owner);
 assert.equal(next.suppliers[0].billingStatus,"unpaid");
 assert.ok(next.suppliers[0].complimentaryHistory?.[0].revokedAt);
 assert.equal(next.payments.length,0);
});
test("representative policy acceptance records current wording and signer without approving supplier",()=>{
 const {s,id}=complimentaryCandidate();s.suppliers[0].policyAcceptedAt="";s.suppliers[0].status="pending";
 const input={id,representative:"Chris McKinnon",accepted:true,policyVersion:s.settings.policyVersion,policyText:s.settings.policy};
 const next=applyAction(s,"accept_representative_policy",input,owner);
 assert.equal(next.suppliers[0].status,"pending");
 assert.equal(next.suppliers[0].policyAcceptanceHistory?.[0].text,s.settings.policy);
 assert.equal(next.suppliers[0].policyAcceptanceHistory?.[0].actorId,owner.userId);
 assert.throws(()=>applyAction(s,"accept_representative_policy",{...input,accepted:false},owner));
 assert.throws(()=>applyAction(s,"accept_representative_policy",{...input,policyVersion:"stale"},owner));
 const other=structuredClone(s);other.suppliers[0].userId="someone-else";
 assert.throws(()=>applyAction(other,"accept_representative_policy",input,owner));
});

test("owner saves registered hub IDs without losing the application key",()=>{
 const s=realNetwork(),app=s.apps.find(a=>a.id==="owners")!;app.integrationHash="keep-me";
 const next=applyAction(s,"save_app",{...app,hubIds:["child-care-policies","finance-audits"]},owner);
 assert.deepEqual(next.apps.find(a=>a.id==="owners")?.hubIds,["child-care-policies","finance-audits"]);
 assert.equal(next.apps.find(a=>a.id==="owners")?.integrationHash,"keep-me");
 assert.throws(()=>applyAction(s,"save_app",{...app,hubIds:["duplicate","duplicate"]},owner));
 assert.throws(()=>applyAction(s,"save_app",{...app,hubIds:["Bad Hub Name"]},owner));
});
test("hub campaign is restricted to its selected app and exact registered hub",()=>{
 const s=realNetwork(),app=s.apps.find(a=>a.id==="owners")!;app.hubIds=["child-care-policies"];
 const supplier=s.suppliers[0];supplier.packageId="network";
 const input={supplierId:supplier.id,name:"Hub targeting verification",text:"A valid hub advertising message",url:"https://example.com",country:"CA",currency:"CAD",appIds:["owners"],placement:"Resource hub ticker",region:"",hubId:"child-care-policies",start:today(),end:"2027-12-31",submit:true};
 let next=applyAction(s,"save_campaign",input,owner);
 const c=next.campaigns.at(-1)!;
 next=applyAction(next,"campaign_status",{id:c.id,status:"published"},owner);
 assert.ok(eligibleAds(next,{appId:"owners",placement:"Resource hub ticker",hubId:"child-care-policies"}).some(a=>a.id===c.id));
 assert.ok(!eligibleAds(next,{appId:"owners",placement:"Resource hub ticker",hubId:"finance-audits"}).some(a=>a.id===c.id));
 assert.throws(()=>applyAction(s,"save_campaign",{...input,hubId:"unregistered"},owner));
 assert.throws(()=>applyAction(s,"save_campaign",{...input,placement:"Dashboard ticker"},owner));
 assert.throws(()=>applyAction(next,"save_app",{...app,hubIds:[]},owner));
});


test("new supplier records cannot opt out of company verification or approve through legacy controls",()=>{
 const state=initialNetwork(),input={name:"New Shared Supplier",contact:"Sam Supplier",email:supplierActor.email,website:"https://example.test",category:"Software & services",countries:["CA"],packageId:"single",currency:"CAD",accepted:true,policyVersion:state.settings.policyVersion,policyText:state.settings.policy,applicationRequired:false};
 const next=applyAction(state,"save_supplier",input,supplierActor),created=next.suppliers.at(-1)!;
 assert.equal(created.applicationRequired,true);
 assert.throws(()=>applyAction(next,"supplier_status",{id:created.id,status:"approved"},owner),/company verification/);
});

test("new suppliers cannot select legacy CCON offers by posting their identifiers",()=>{
 const state=initialNetwork();state.packages.push({...state.packages[0],id:"old-ccon",sourceAppId:"owners",publicOffer:true});
 const input={name:"New Shared Supplier",contact:"Sam Supplier",email:supplierActor.email,website:"https://example.test",category:"Software & services",countries:["CA"],packageId:"old-ccon",currency:"CAD",accepted:true,policyVersion:state.settings.policyVersion,policyText:state.settings.policy};
 assert.throws(()=>applyAction(state,"save_supplier",input,supplierActor),/shared SAS package/);
 assert.equal(state.suppliers.length,4);
});


test("routine network settings retain the published supplier criteria and their revision",()=>{
 const state=initialNetwork();state.settings.supplierCriteria={title:"Published network criteria",introduction:"Owner-reviewed company requirements.",revision:7,items:[{id:"business",title:"Business",description:"Verify the company.",responseType:"confirmation",required:true}]};
 const before=structuredClone(state.settings.supplierCriteria);
 const next=applyAction(state,"save_settings",{...state.settings,showSamples:false},owner);
 assert.deepEqual(next.settings.supplierCriteria,before);assert.equal(next.settings.showSamples,false);
});

test("all shared packages accept 100 message characters and reject 101 without changing saved copy",()=>{
 for(const packageId of ["single","bundle","network"]){
  const state=realNetwork(),campaign=state.campaigns[0];state.suppliers[0].packageId=packageId;
  const input={...campaign,appIds:["owners"],text:"A".repeat(100),submit:false};
  const next=applyAction(state,"save_campaign",input,owner);
  assert.equal(next.campaigns[0].text,input.text);assert.equal(next.campaigns[0].status,"draft");
  assert.throws(()=>applyAction(next,"save_campaign",{...input,text:"A".repeat(101)},owner),/100 characters/);
  assert.equal(next.campaigns[0].text,input.text);assert.equal(state.campaigns[0].text,campaign.text);
 }
});

test("message limits count Unicode characters and include spaces and punctuation",()=>{
 const state=realNetwork(),input={...state.campaigns[0],appIds:["owners"],text:"😀".repeat(100),submit:false};
 assert.equal(applyAction(state,"save_campaign",input,owner).campaigns[0].text,input.text);
 assert.throws(()=>applyAction(state,"save_campaign",{...input,text:"😀".repeat(101)},owner),/100 characters/);
 const copy="Save ".repeat(19)+"$20!!";
 assert.equal(copy.length,100);
 assert.equal(applyAction(state,"save_campaign",{...input,text:copy},owner).campaigns[0].text,copy);
 assert.throws(()=>applyAction(state,"save_campaign",{...input,text:copy+"!"},owner),/100 characters/);
});

test("preserved CCON contracts use the same message limit without changing contract prices",()=>{
 const state=realNetwork(),contract={...state.packages[0],id:"legacy-copy",sourceAppId:"owners",sourceCurrency:"CAD" as const,campaignRates:{configured:true,ticker:0,premium:0,premiumFree:false,hubTicker:0,hubStatic:0}};
 state.packages.push(contract);state.apps[0].packages.push(contract.id);state.suppliers[0].packageId=contract.id;state.settings.maxCopy=500;
 const input={...state.campaigns[0],appIds:["owners"],text:"A".repeat(100),submit:false};
 const next=applyAction(state,"save_campaign",input,owner);
 assert.equal(next.campaigns[0].text,input.text);assert.deepEqual(next.packages,state.packages);
 assert.throws(()=>applyAction(state,"save_campaign",{...input,text:"A".repeat(101)},owner),/100 characters/);
});

test("a separate supplier advertising name accepts 40 characters while preserving the business name",()=>{
 const state=realNetwork(),supplier=state.suppliers[0],advertisingName="é".repeat(40);
 const next=applyAction(state,"save_supplier",{...supplier,advertisingName,accepted:true},owner);
 assert.equal(next.suppliers[0].name,supplier.name);assert.equal(next.suppliers[0].advertisingName,advertisingName);
 assert.equal(deliveryAd(next.campaigns[0],next).supplier,advertisingName);
 assert.throws(()=>applyAction(next,"save_supplier",{...next.suppliers[0],advertisingName:"é".repeat(41),accepted:true},owner),/40 characters/);
 assert.equal(next.suppliers[0].advertisingName,advertisingName);
});

test("public ads omit internal campaign titles and bound legacy business names without altering records",()=>{
 const state=realNetwork();state.suppliers[0].name="é".repeat(41);
 const campaign=state.campaigns[0],before=structuredClone(state),ad=deliveryAd(campaign,state);
 assert.equal(ad.supplier,"é".repeat(39)+"…");assert.equal(Object.hasOwn(ad,"name"),false);
 assert.equal(ad.id,campaign.id);assert.equal(ad.text,campaign.text);assert.equal(ad.url,campaign.url);
 assert.equal(ad.country,campaign.country);assert.equal(ad.currency,campaign.currency);
 assert.deepEqual(state,before);
});

test("overlong stored ads stop delivery until shortened and reviewed without truncating their saved text",()=>{
 const state=realNetwork(),campaign=state.campaigns[0];campaign.text="A".repeat(101);state.settings.maxCopy=500;
 assert.equal(eligibleAds(state,{appId:"owners"}).some(ad=>ad.id===campaign.id),false);
 assert.throws(()=>applyAction(state,"campaign_status",{id:campaign.id,status:"published"},owner),/copy limit/);
 assert.equal(campaign.text,"A".repeat(101));assert.equal(campaign.status,"published");
 let next=applyAction(state,"save_campaign",{...campaign,text:"A".repeat(100),submit:true},owner);
 assert.equal(eligibleAds(next,{appId:"owners"}).some(ad=>ad.id===campaign.id),false);
 next=applyAction(next,"campaign_status",{id:campaign.id,status:"published"},owner);
 assert.equal(eligibleAds(next,{appId:"owners"}).some(ad=>ad.id===campaign.id),true);
});

test("network settings cannot raise the shared copy limit and report 100 for preserved settings",()=>{
 const state=realNetwork();state.settings.maxCopy=500;
 assert.equal(publicState(state).settings.maxCopy,100);assert.equal(state.settings.maxCopy,500);
 assert.throws(()=>applyAction(state,"save_settings",{...state.settings,maxCopy:101},owner));
 const next=applyAction(state,"save_settings",{...state.settings,maxCopy:100},owner);
 assert.equal(next.settings.maxCopy,100);
});
