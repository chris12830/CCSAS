import test from "node:test";
import assert from "node:assert/strict";
import {initialNetwork,eligibleAds,today,publicState,Network} from "../lib/sas-model";
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
 const s=initialNetwork();const next=applyAction(s,"save_supplier",{name:"Real Supplier",contact:"Sam Supplier",email:"forged@example.test",website:"https://example.test",category:"Software & services",countries:["CA"],packageId:"single",currency:"CAD",accepted:true,sample:true},supplierActor);
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
