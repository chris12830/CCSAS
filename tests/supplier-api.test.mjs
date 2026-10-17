process.env.SAS_BASE_URL='https://supplier-api.example.test';
import test,{after} from "node:test";
import assert from "node:assert/strict";
import {supplierCriteria} from "../lib/supplier-catalog.mjs";
import {readFileSync,readdirSync} from "node:fs";
import {registerHooks} from "node:module";
import {DatabaseSync} from "node:sqlite";
const db=new DatabaseSync(":memory:");
for(const file of readdirSync(new URL("../drizzle/",import.meta.url)).filter(f=>f.endsWith(".sql")).sort())db.exec(readFileSync(new URL("../drizzle/"+file,import.meta.url),"utf8"));
const binding={
 prepare(sql){const statement=db.prepare(sql);let params=[];return {bind(...values){params=values;return this;},async first(){return statement.get(...params)??null;},async all(){return {results:statement.all(...params)};},async run(){return statement.columns().length?{results:statement.all(...params),meta:{changes:0}}:{results:[],meta:{changes:Number(statement.run(...params).changes)}};}}},
 async batch(statements){db.exec("BEGIN");try{const values=[];for(const statement of statements)values.push(await statement.run());db.exec("COMMIT");return values;}catch(e){db.exec("ROLLBACK");throw e;}},
};
globalThis.__supplierApiEnv={DB:binding};
const hooks=registerHooks({resolve(specifier,context,next){
 if(specifier==="cloudflare:workers"||specifier.endsWith("vps-runtime"))return {url:"data:text/javascript,export const env=globalThis.__supplierApiEnv",shortCircuit:true};
 if(specifier.endsWith("chatgpt-auth"))return {url:"data:text/javascript,export async function getChatGPTUser(){return globalThis.__supplierApiUser;}",shortCircuit:true};
 try{return next(specifier,context);}catch(e){if(specifier.startsWith(".")&&!/\.[a-z]+$/i.test(specifier))return next(specifier+".ts",context);throw e;}
}});
const stateRoute=await import("../app/api/state/route.ts"),supplierRoute=await import("../app/api/supplier/route.ts"),actionRoute=await import("../app/api/action/route.ts"),migrationRoute=await import("../app/api/migration/route.ts"),paymentsRoute=await import("../app/api/payments/route.ts"),libraryRoute=await import("../app/api/library/route.ts"),libraryFileRoute=await import("../app/api/library/[id]/file/route.ts"),catalogRoute=await import("../app/api/catalog/route.ts");
after(()=>{hooks.deregister();db.close();delete globalThis.__supplierApiEnv;delete globalThis.__supplierApiUser;});
const owner={id:"owner",email:"owner@example.test"},supplier={id:"supplier",email:"supplier@example.test"},borrower={id:"borrower",email:supplier.email};
async function request(actor,endpoint,method="GET",body,origin="https://supplier-api.example.test"){
 globalThis.__supplierApiUser=actor?{userId:actor.id,email:actor.email,displayName:actor.id,fullName:null}:null;
 const route={state:stateRoute,supplier:supplierRoute,action:actionRoute,migration:migrationRoute}[endpoint];
 const response=await route[method](new Request("https://supplier-api.example.test/api/"+endpoint,{method,headers:{Origin:origin,"Content-Type":"application/json"},...(body?{body:JSON.stringify(body)}:{})}));
 return {status:response.status,data:await response.json()};
}
db.prepare("INSERT INTO vps_users(id,email,name,password_hash,role) VALUES(?,?,?,?,?)").run("owner","owner@example.test","Owner","test-only","owner");
const loaded=await request(owner,"state"),initial=loaded.data.state;
function applicationInput(state){
 const criteria=supplierCriteria(state);
 return {name:"Test Company",contact:"Sam Supplier",email:"forged@example.test",website:"https://example.test",category:"Software & services",countries:["CA"],packageId:"single",currency:"CAD",accepted:true,policyVersion:state.settings.policyVersion,policyText:state.settings.policy,
  criteriaRevision:criteria.revision,criteriaAnswers:Object.fromEntries(criteria.items.map(item=>[item.id,"confirmed"])),
  applicationDetails:{legalName:"Test Company Incorporated",companyEmail:"company@example.test",companyPhone:"555-555-1111",representativePhone:"555-555-2222",description:"Supplies and services for child care businesses.",products:"Classroom supplies",services:"",serviceRegions:"Ontario",jobTitle:"Director",addressLine1:"100 Example Street",addressLine2:"",city:"Toronto",postalCode:"M1M 1M1",registrationNumber:"TEST-123",registrationAuthority:"Test business registry",businessCountry:"CA",authorized:true,privacyAccepted:true}};
}
const application=await request(supplier,"supplier","POST",{action:"save_supplier",input:applicationInput(initial),version:loaded.data.version});
assert.equal(application.status,200);
const supplierId=application.data.state.suppliers[0].id;
for(const row of [{collection:"messages",id:"own-message",supplierId,body:"Own supplier message",senderRole:"owner",createdAt:"now"},{collection:"messages",id:"other-message",supplierId:"sup-maple",body:"Other supplier private message",senderRole:"owner",createdAt:"now"},{collection:"sourceRecords",id:"internal-source",supplierId,record:{internal:"Private moderation note"}}])
 db.prepare("INSERT INTO sas_supplier_records(collection,id,supplier_id,data,updated_at) VALUES (?,?,?,?,?)").run(row.collection,row.id,row.supplierId,JSON.stringify(row),"now");
async function mutate(actor,action,input,endpoint=actor.id==="owner"?"action":"supplier",version){const current=await request(owner,"state");return request(actor,endpoint,"POST",{action,input,version:version??current.data.version});}
test("supplier API returns only owned records and hides internal source history",async()=>{
 const result=await request(supplier,"supplier");assert.equal(result.status,200);assert.equal(result.data.state.suppliers.length,1);assert.equal(result.data.state.suppliers[0].email,supplier.email);assert.equal(result.data.workspace.messages.length,1);assert.equal(result.data.workspace.sourceRecords.length,0);assert.equal(result.data.workspace.audit.length,0);assert.equal(JSON.stringify(result.data).includes("Other supplier private message"),false);
});
test("bound identity cannot be borrowed through matching email",async()=>{
 const result=await request(borrower,"supplier");assert.equal(result.data.state.suppliers.length,0);
 assert.equal((await mutate(borrower,"supplier.profile",{supplierId,legalName:"Borrowed account"})).status,403);
});
test("supplier cannot use owner actions or approve itself",async()=>{
 assert.equal((await mutate(supplier,"supplier.review",{supplierId,decision:"approved",reason:""})).status,403);
 assert.equal((await mutate(supplier,"supplier.profile",{supplierId,legalName:"Company"},"action")).status,403);
});
test("administrator cannot fabricate policy acceptance through the owner API",async()=>{
 const current=(await request(owner,"state")).data.state;
 assert.equal((await mutate(owner,"supplier.accept_policy",{supplierId,accepted:true,version:current.settings.policyVersion,text:current.settings.policy})).status,403);
});
test("stale writes and cross-origin posts do not change the network",async()=>{
 const current=await request(owner,"state");
 assert.equal((await mutate(supplier,"supplier.profile",{supplierId,legalName:"Stale"},"supplier",current.data.version-1)).status,409);
 const denied=await request(owner,"action","POST",{action:"supplier.account",input:{supplierId,status:"hold",reason:"Hold"},version:current.data.version},"https://other.example.test");assert.equal(denied.status,403);
 assert.equal((await request(owner,"state")).data.version,current.data.version);
});
test("API payment claims stay unpaid until exact terms and a verified owner receipt",async()=>{
 assert.equal((await mutate(owner,"record_payment",{supplierId,amount:49,currency:"CAD",reference:"early-bank-receipt",date:"2026-10-11",paidUntil:"2030-01-31"})).status,409);
 const current=(await request(supplier,"supplier")).data.state;
 const terms=await mutate(supplier,"supplier.accept_terms",{supplierId,accepted:true,version:current.settings.policyVersion,text:current.settings.policy,packageId:"single",currency:"CAD",amountCents:4900,royaltyBps:0});assert.equal(terms.status,200);
 const invoice=await mutate(owner,"supplier.invoice",{supplierId,kind:"plan",reference:"API-INVOICE",amountCents:4900,currency:"CAD",dueAt:"2030-01-01",paidUntil:"2030-01-31"});assert.equal(invoice.status,200);
 const invoiceId=invoice.data.workspace.invoices.at(-1).id;
 const claim=await mutate(supplier,"supplier.submit_payment",{supplierId,invoiceId,reference:"API-CLAIM"});assert.equal(claim.status,200);assert.equal(claim.data.state.suppliers[0].billingStatus,"unpaid");
 const paymentId=claim.data.workspace.submissions.at(-1).id;
 assert.equal((await mutate(owner,"supplier.verify_payment",{supplierId,paymentId,amountCents:4900,currency:"USD",receiptReference:"API-RECEIPT"})).status,409);
 const verified=await mutate(owner,"supplier.verify_payment",{supplierId,paymentId,amountCents:4900,currency:"CAD",receiptReference:"API-RECEIPT"});assert.equal(verified.status,200);assert.equal(verified.data.state.suppliers.find(s=>s.id===supplierId).billingStatus,"active");
});
test("legacy payment endpoint cannot reuse a verified shared receipt",async()=>{
 const result=await mutate(owner,"record_payment",{supplierId,amount:49,currency:"CAD",reference:"API-RECEIPT",date:"2026-10-11",paidUntil:"2030-01-31"});assert.equal(result.status,409);
});
test("unsigned requests and non-owner imports are rejected",async()=>{
 assert.equal((await request(null,"supplier")).status,401);
 assert.equal((await request(supplier,"migration","POST",{version:0,transfer:{},apply:false})).status,403);
});

const helpObjects=new Map();
globalThis.__supplierApiEnv.BUCKET={
 async put(key,bytes){helpObjects.set(key,new Uint8Array(bytes));},
 async head(key){const bytes=helpObjects.get(key);return bytes?{size:bytes.length}:null;},
 async get(key,options){let bytes=helpObjects.get(key);if(!bytes)return null;if(options?.range)bytes=bytes.slice(options.range.offset,options.range.offset+options.range.length);return {body:new ReadableStream({start(controller){controller.enqueue(bytes);controller.close();}})};},
 async delete(key){helpObjects.delete(key);},
};
let helpId="";
function apiActor(actor){globalThis.__supplierApiUser=actor?{userId:actor.id,email:actor.email,displayName:actor.id,fullName:null}:null;}
async function uploadHelp(actor,status="published",fileBody="%PDF-1.7\nSupplier guidance.",name="supplier-guide.pdf"){
 apiActor(actor);const data=new FormData();data.set("title","Supplier guide");data.set("summary","Guidance for supplier accounts and advertising.");data.set("kind","document");data.set("status",status);data.set("file",new File([fileBody],name));
 const result=await libraryRoute.POST(new Request("https://supplier-api.example.test/api/library",{method:"POST",headers:{Origin:"https://supplier-api.example.test"},body:data}));
 return {status:result.status,data:await result.json()};
}
test("only the owner can publish help and uploaded types are validated",async()=>{
 assert.equal((await uploadHelp(supplier)).status,403);
 assert.equal((await uploadHelp(owner,"published","<html>not a PDF</html>")).status,400);
 const uploaded=await uploadHelp(owner);assert.equal(uploaded.status,200);
 apiActor(owner);const result=await libraryRoute.GET();const rows=await result.json();helpId=rows.find(r=>r.title==="Supplier guide").id;assert.equal(rows.some(r=>r.fileKey),false);
});
test("supplier help metadata and bytes are unavailable to unregistered or borrowed identities",async()=>{
 apiActor(borrower);assert.equal((await libraryRoute.GET()).status,403);assert.equal((await libraryFileRoute.GET(new Request("https://supplier-api.example.test/api/library/"+helpId+"/file"))).status,404);
 apiActor(supplier);const file=await libraryFileRoute.GET(new Request("https://supplier-api.example.test/api/library/"+helpId+"/file"));assert.equal(file.status,200);assert.equal(file.headers.get("X-Content-Type-Options"),"nosniff");assert.equal(await file.text(),"%PDF-1.7\nSupplier guidance.");
});
test("draft help is owner-only and file range delivery preserves protected bytes",async()=>{
 assert.equal((await uploadHelp(owner,"draft")).status,200);apiActor(owner);const resources=await(await libraryRoute.GET()).json(),draft=resources.find(r=>r.status==="draft");
 apiActor(supplier);assert.equal((await libraryFileRoute.GET(new Request("https://supplier-api.example.test/api/library/"+draft.id+"/file"))).status,404);
 const partial=await libraryFileRoute.GET(new Request("https://supplier-api.example.test/api/library/"+helpId+"/file",{headers:{Range:"bytes=0-3"}}));assert.equal(partial.status,206);assert.equal(await partial.text(),"%PDF");
});
test("supplier support requests keep thread ownership and genuine sender roles",async()=>{
 const ticket=await mutate(supplier,"supplier.ticket",{supplierId,subject:"Invoice question",category:"billing",body:"Can you explain this invoice?"});assert.equal(ticket.status,200);const id=ticket.data.workspace.tickets.at(-1).id;
 assert.equal((await mutate(borrower,"supplier.message",{supplierId,ticketId:id,body:"Borrowed account"})).status,403);
 const reply=await mutate(owner,"supplier.message",{supplierId,ticketId:id,body:"Here are your payment instructions."});assert.equal(reply.status,200);
 const closed=await mutate(owner,"supplier.ticket_status",{supplierId,ticketId:id,status:"resolved"});assert.equal(closed.status,200);
 const reopened=await mutate(supplier,"supplier.message",{supplierId,ticketId:id,body:"I have a further question."});assert.equal(reopened.status,200);assert.equal(reopened.data.workspace.tickets.find(t=>t.id===id).status,"open");
});

test("real database saves retain checkout reservations and provider settings after reload",async()=>{
 const originalFetch=globalThis.fetch;globalThis.__supplierApiEnv.STRIPE_SECRET_KEY="sk_test_api_fixture";
 let session;
 globalThis.fetch=async(url,options)=>{
  if(String(url).endsWith("/account"))return Response.json({id:"acct_api",charges_enabled:true});
  const values=new URLSearchParams(options.body);
  session={id:"cs_test_apifixture",url:"https://checkout.stripe.com/c/pay/api",livemode:false,mode:"payment",status:"open",payment_status:"unpaid",amount_total:Number(values.get("line_items[0][price_data][unit_amount]")),currency:values.get("line_items[0][price_data][currency]"),expires_at:Math.round(Date.now()/1000)+3600,client_reference_id:values.get("client_reference_id"),metadata:Object.fromEntries(["paymentId","invoiceId","supplierId","quoteHash"].map(k=>[k,values.get("metadata["+k+"]")]))};
  return Response.json(session);
 };
 try{
  apiActor(owner);const configured=await paymentsRoute.POST(new Request("https://supplier-api.example.test/api/payments",{method:"POST",headers:{Origin:"https://supplier-api.example.test","Content-Type":"application/json"},body:JSON.stringify({operation:"configure",input:{enabled:true}})}));assert.equal(configured.status,200);assert.equal((await configured.json()).enabled,true);
  assert.equal((await mutate(owner,"supplier.review",{supplierId,decision:"approved",reason:""})).status,200);
  const membership=await mutate(supplier,"supplier.membership_invoice",{supplierId});assert.equal(membership.status,200);const invoiceId=membership.data.workspace.invoices.at(-1).id;
  apiActor(supplier);const start=await paymentsRoute.POST(new Request("https://supplier-api.example.test/api/payments",{method:"POST",headers:{Origin:"https://supplier-api.example.test","Content-Type":"application/json"},body:JSON.stringify({operation:"checkout",input:{invoiceId}})}));assert.equal(start.status,200);const created=await start.json();
  const list=await paymentsRoute.GET(new Request("https://supplier-api.example.test/api/payments"));const persisted=await list.json();assert.equal(persisted.processing.enabled,true);assert.equal(persisted.payments.at(-1).sessionId,created.sessionId);assert.equal(persisted.payments.at(-1).status,"open");
  const scoped=await request(supplier,"supplier");assert.equal(scoped.data.workspace.checkouts.at(-1).createParams,undefined);assert.equal(scoped.data.workspace.checkouts.at(-1).connectionHash,undefined);
 }finally{globalThis.fetch=originalFetch;delete globalThis.__supplierApiEnv.STRIPE_SECRET_KEY;}
});




test("public catalog publishes the same shared packages in CAD and USD without private records",async()=>{
 const before=await request(owner,"state");apiActor(null);
 for(const [currency,expected] of [["CAD",[4900,9900,14900]],["USD",[3900,7900,11900]]]){
  const response=await catalogRoute.GET(new Request("https://supplier-api.example.test/api/catalog?app=owners&currency="+currency));
  assert.equal(response.status,200);assert.equal(response.headers.get("Cache-Control"),"no-store");
  const catalog=await response.json();assert.equal(catalog.packageStructure,"shared-sas");
  assert.deepEqual(catalog.plans.map(p=>p.id),["single","bundle","network"]);
  assert.deepEqual(catalog.plans.map(p=>p.membershipFeeCents),expected);
  assert.ok(catalog.plans.every(p=>p.billingInterval==="monthly"&&p.currency===currency&&p.applications.some(a=>a.id==="owners")));
  assert.equal(JSON.stringify(catalog).includes("supplier@example.test"),false);
 }
 assert.equal((await catalogRoute.GET(new Request("https://supplier-api.example.test/api/catalog?currency=EUR"))).status,400);
 assert.equal((await request(owner,"state")).data.version,before.data.version);
});

test("shared signup rejects missing, stale or forged consent atomically",async()=>{
 const applicant={id:"new-applicant",email:"new-applicant@example.test"},current=await request(owner,"state"),input=applicationInput(current.data.state);
 const missing={...input};delete missing.applicationDetails;
 for(const bad of [missing,{...input,criteriaRevision:0},{...input,criteriaAnswers:{}},{...input,applicationDetails:{...input.applicationDetails,authorized:false}},{...input,applicationDetails:{...input.applicationDetails,privacyAccepted:false}}]){
  const result=await mutate(applicant,"save_supplier",bad);assert.ok([400,409].includes(result.status));
 }
 const after=await request(owner,"state");assert.equal(after.data.version,current.data.version);
 assert.equal(after.data.state.suppliers.some(s=>s.userId===applicant.id),false);
 assert.deepEqual(after.data.workspace.acceptances,current.data.workspace.acceptances);
});

test("shared applications support information requests and resubmission while preserving rejection and payment state",async()=>{
 const applicant={id:"review-applicant",email:"review-applicant@example.test"},current=await request(owner,"state"),input=applicationInput(current.data.state);
 const created=await mutate(applicant,"save_supplier",{...input,applicationRequired:false,status:"approved",billingStatus:"active"});assert.equal(created.status,200);
 const company=created.data.state.suppliers[0],id=company.id;
 assert.equal(company.status,"pending");assert.equal(company.applicationRequired,true);assert.equal(company.billingStatus,"unpaid");
 const originalSubmission=created.data.workspace.acceptances.find(a=>a.source==="supplier-application");
 assert.equal(originalSubmission.userId,applicant.id);assert.equal(JSON.parse(originalSubmission.text).application.details.city,"Toronto");
 const requested=await mutate(owner,"supplier.review",{supplierId:id,decision:"more_info_requested",reason:"Clarify the company's service region.",dueAt:"2080-01-01"});assert.equal(requested.status,200);
 const beforeInvalid=(await request(owner,"state")).data.version;
 const invalid=await mutate(applicant,"save_supplier",{...input,id,applicationDetails:{...input.applicationDetails,authorized:false}});assert.equal(invalid.status,400);
 assert.equal((await request(owner,"state")).data.version,beforeInvalid);
 const corrected=await mutate(applicant,"save_supplier",{...input,id,applicationDetails:{...input.applicationDetails,city:"Ottawa",serviceRegions:"Ontario and Quebec"}});assert.equal(corrected.status,200);
 assert.equal(corrected.data.state.suppliers[0].status,"pending");
 assert.equal(corrected.data.workspace.reviews.at(-1).decision,"more_info_requested");
 assert.equal(corrected.data.workspace.profiles[0].city,"Ottawa");
 assert.deepEqual(corrected.data.workspace.acceptances.find(a=>a.id===originalSubmission.id),originalSubmission);
 assert.equal(corrected.data.workspace.acceptances.filter(a=>a.source==="supplier-application").length,2);
 assert.equal((await mutate(applicant,"supplier.review",{supplierId:id,decision:"approved",reason:""})).status,403);
 const rejected=await mutate(owner,"supplier.review",{supplierId:id,decision:"rejected",reason:"Application does not meet the published criteria."});assert.equal(rejected.status,200);
 const edited=await mutate(applicant,"save_supplier",{...input,id});assert.equal(edited.status,200);assert.equal(edited.data.state.suppliers[0].status,"rejected");
 assert.equal((await mutate(owner,"supplier.review",{supplierId:id,decision:"pending",reason:"Reopen for owner review."})).status,200);
 const approved=await mutate(owner,"supplier.review",{supplierId:id,decision:"approved",reason:"Company information verified."});assert.equal(approved.status,200);
 const saved=approved.data.state.suppliers.find(s=>s.id===id);assert.equal(saved.status,"approved");assert.equal(saved.billingStatus,"unpaid");assert.equal(saved.paidUntil,"");
 assert.equal(approved.data.workspace.invoices.filter(i=>i.supplierId===id).length,0);
 assert.equal(approved.data.workspace.checkouts.filter(i=>i.supplierId===id).length,0);
 assert.equal(approved.data.state.payments.filter(p=>p.supplierId===id).length,0);
 assert.ok(approved.data.workspace.notices.filter(n=>n.supplierId===id).every(n=>n.status==="queued"));
});

test("owner-created shared records cannot bypass verification through either approval action",async()=>{
 const applicant={id:"invited-applicant",email:"invited-applicant@example.test"},current=(await request(owner,"state")).data.state;
 const created=await mutate(owner,"save_supplier",{...applicationInput(current),email:applicant.email});assert.equal(created.status,200);
 const id=created.data.state.suppliers.at(-1).id;
 // Genuine policy acceptance alone does not substitute for company verification.
 assert.equal((await mutate(applicant,"supplier.accept_policy",{supplierId:id,accepted:true,version:current.settings.policyVersion,text:current.settings.policy})).status,200);
 const profile=await mutate(applicant,"supplier.profile",{supplierId:id,legalName:"Test Company",authorizedAt:"2026-01-01",privacyAcceptedAt:"2026-01-01",criteriaSnapshot:{}});assert.equal(profile.status,200);
 assert.equal(profile.data.workspace.profiles[0].authorizedAt,undefined);
 assert.equal((await mutate(owner,"supplier_status",{id,status:"approved"})).status,409);
 assert.equal((await mutate(owner,"supplier.review",{supplierId:id,decision:"approved",reason:""})).status,409);
 assert.equal((await request(applicant,"supplier")).data.state.suppliers[0].status,"pending");
});
