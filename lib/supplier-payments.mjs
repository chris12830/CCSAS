import {WorkflowError,ownsSupplier,normalizeWorkspace,executeSupplierWorkflow} from "./supplier-workflows.mjs";
const deny=(status,message)=>{throw new WorkflowError(status,message);};
export const stripeMode=key=>/^(sk|rk)_test_[a-zA-Z0-9_]+$/.test(key||"")?"test":/^(sk|rk)_live_[a-zA-Z0-9_]+$/.test(key||"")?"live":null;
const digest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value))),v=>v.toString(16).padStart(2,"0")).join("");
const safeUrl=(value,host)=>{try{const u=new URL(value);return u.protocol==="https:"&&u.hostname===host&&!u.username&&!u.password?u.href:"";}catch{return "";}};
const text=(v,label)=>typeof v==="string"&&v.length>0&&v.length<=150?v:deny(400,label+" is invalid.");
const publicPayment=p=>Object.fromEntries(Object.entries(p).filter(([key])=>!["createParams","quoteHash","connectionHash","accountId"].includes(key)));
export async function paymentStatus(workspace,key){
 const mode=stripeMode(key),p=normalizeWorkspace(workspace).processing.find(p=>p.id==="stripe-connection");
 return {provider:"stripe",configured:!!mode,mode,enabled:!!p?.enabled&&p.mode===mode&&p.keyFingerprint===await digest(key||"")};
}
function invoiceQuote(row,invoice){
 const s=row.state.suppliers.find(s=>s.id===invoice.supplierId),w=row.workspace;
 if(!s||invoice.status!=="open")deny(409,"This invoice is already paid, void or unavailable.");
 if(invoice.kind!=="royalty"&&(s.accountStatus||"active")!=="active")deny(409,"This account cannot make new marketing purchases.");
 if(!Number.isSafeInteger(invoice.amountCents)||invoice.amountCents<=0||!["CAD","USD"].includes(invoice.currency))deny(409,"The invoice amount or currency needs review.");
 if(invoice.kind==="plan"){
  const terms=w.profiles.find(p=>p.supplierId===s.id)?.terms;
  if(!terms||terms.packageId!==s.packageId||JSON.stringify(terms)!==JSON.stringify(invoice.terms)||terms.amountCents!==invoice.amountCents||terms.currency!==invoice.currency)deny(409,"The accepted membership price has changed. Reconcile this invoice.");
 }
 if(invoice.kind==="royalty"){
  const entries=invoice.royaltyIds?.map(id=>w.royalties.find(r=>r.id===id&&r.supplierId===s.id&&r.status==="reported"&&r.currency===invoice.currency));
  if(!entries?.length||entries.some(r=>!r)||entries.reduce((n,r)=>n+r.royaltyCents,0)!==invoice.amountCents)deny(409,"The royalty invoice has changed.");
 }
 if(invoice.campaignId){
  const campaign=row.state.campaigns.find(c=>c.id===invoice.campaignId&&c.supplierId===s.id);
  if(!campaign||campaign.feeCents!==invoice.amountCents||campaign.currency!==invoice.currency||campaign.paymentStatus==="paid")deny(409,"The advertising purchase has changed.");
 }
 return JSON.stringify({id:invoice.id,supplierId:s.id,kind:invoice.kind,amountCents:invoice.amountCents,currency:invoice.currency,paidUntil:invoice.paidUntil,terms:invoice.terms,royaltyIds:invoice.royaltyIds,campaignId:invoice.campaignId||""});
}
export async function processSupplierPayment(deps,actor,operation,input={},origin=""){
 const key=deps.config.STRIPE_SECRET_KEY,mode=stripeMode(key),at=()=>deps.now?.()||new Date().toISOString();
 async function provider(path,method="GET",params,keyId){
  if(!mode)deny(503,"Online payments are not connected. Contact the network team.");
  let response;try{response=await (deps.fetch||fetch)("https://api.stripe.com/v1"+path,{method,redirect:"error",signal:AbortSignal.timeout(12000),headers:{Authorization:"Bearer "+key,"Stripe-Version":"2025-06-30.basil",...(method==="POST"?{"Content-Type":"application/x-www-form-urlencoded"}:{}),...(keyId?{"Idempotency-Key":keyId}:{})},...(params===undefined?{}:{body:params})});}catch{deny(503,"The payment provider is temporarily unavailable. Retry the same invoice.");}
  if(!response.ok)deny(503,"The payment provider could not verify this operation.");
  return response.json();
 }
 async function edit(fn){
  for(let retry=0;retry<3;retry++){
   const row=await deps.load(),workspace=normalizeWorkspace(row.workspace),result=await fn({...row,workspace});
   try{await deps.save(result.state||row.state,row.version,result.workspace||workspace,row.workspace);return result;}
   catch(e){if(e.status!==409||retry===2)throw e;}
  }
 }
 function owned(row,supplierId){
  const supplier=row.state.suppliers.find(s=>s.id===supplierId);
  if(!supplier)deny(404,"Supplier not found.");
  if(!actor.owner&&!ownsSupplier(supplier,actor))deny(403,"This payment is not yours.");
  return supplier;
 }
 let row=await deps.load();
 if(operation==="status")return paymentStatus(row.workspace,key);
 if(operation==="list")return {processing:await paymentStatus(row.workspace,key),payments:row.workspace.checkouts.filter(p=>actor.owner||row.state.suppliers.some(s=>s.id===p.supplierId&&ownsSupplier(s,actor))).map(publicPayment)};
 if(operation==="configure"){
  if(!actor.owner)deny(403,"Only the network owner can configure payments.");
  if(typeof input.enabled!=="boolean")deny(400,"Choose whether checkout is enabled.");
  const account=input.enabled?await provider("/account"):null;
  if(account&&(!/^acct_[a-zA-Z0-9]+$/.test(account.id)||mode==="live"&&!account.charges_enabled))deny(409,"Activate the Stripe account before enabling live checkout.");
  const keyFingerprint=await digest(key||"");
  await edit(r=>{r.workspace.processing=[{id:"stripe-connection",supplierId:"",enabled:input.enabled,mode,keyFingerprint,accountId:account?.id||"",updatedAt:at(),updatedBy:actor.userId}];return {workspace:r.workspace};});
  return paymentStatus((await deps.load()).workspace,key);
 }
 if(operation==="checkout"){
  const invoiceId=text(input.invoiceId,"Invoice"),invoice=row.workspace.invoices.find(i=>i.id===invoiceId);
  if(!invoice)deny(404,"Invoice not found.");owned(row,invoice.supplierId);
  if(!(await paymentStatus(row.workspace,key)).enabled)deny(503,"Online checkout is disabled. Use the verified payment instructions.");
  if(!/^https:\/\//.test(origin)||new URL(origin).origin!==origin)deny(400,"Use the secure supplier site to start checkout.");
  let payment;
  await edit(async r=>{
   const bill=r.workspace.invoices.find(i=>i.id===invoiceId);if(!bill)deny(404,"Invoice not found.");owned(r,bill.supplierId);
   const quoteHash=await digest(invoiceQuote(r,bill)),connection=r.workspace.processing.find(p=>p.id==="stripe-connection");
   payment=r.workspace.checkouts.find(p=>p.invoiceId===invoiceId&&["creating","open","pending","review"].includes(p.status));
   if(payment){if(payment.quoteHash!==quoteHash||payment.connectionHash!==await digest(key))deny(409,"An existing checkout needs reconciliation before replacing it.");return {workspace:r.workspace};}
   const id=crypto.randomUUID(),params=new URLSearchParams({mode:"payment",client_reference_id:id,success_url:origin+"/api/payments/return?payment="+encodeURIComponent(id),cancel_url:origin+"/api/payments/return?payment="+encodeURIComponent(id)+"&cancelled=1","line_items[0][quantity]":"1","line_items[0][price_data][currency]":bill.currency.toLowerCase(),"line_items[0][price_data][unit_amount]":String(bill.amountCents),"line_items[0][price_data][product_data][name]":bill.reference,"metadata[paymentId]":id,"metadata[invoiceId]":bill.id,"metadata[supplierId]":bill.supplierId,"metadata[quoteHash]":quoteHash});
   payment={id,supplierId:bill.supplierId,invoiceId,amountCents:bill.amountCents,currency:bill.currency,status:"creating",quoteHash,connectionHash:await digest(key),accountId:connection.accountId,livemode:mode==="live",createdAt:at(),createParams:params.toString(),sessionId:"",checkoutUrl:"",appliedAt:""};
   r.workspace.checkouts.push(payment);return {workspace:r.workspace};
  });
  if(payment.status==="review")deny(409,"This payment needs network review.");
  if(payment.sessionId)return publicPayment(payment);
  if(Date.parse(at())-Date.parse(payment.createdAt)>23*3600000)deny(409,"This pending attempt needs Stripe request-log review before it can be resumed.");
  const session=await provider("/checkout/sessions","POST",payment.createParams,"ccsas-invoice-"+payment.id);
  if(!/^cs_(test|live)_[a-zA-Z0-9]+$/.test(session.id)||session.livemode!==payment.livemode||session.client_reference_id!==payment.id||session.metadata?.paymentId!==payment.id||session.metadata?.supplierId!==payment.supplierId||session.metadata?.invoiceId!==payment.invoiceId||session.metadata?.quoteHash!==payment.quoteHash||session.mode!=="payment"||session.amount_total!==payment.amountCents||session.currency!==payment.currency.toLowerCase()||!Number.isSafeInteger(session.expires_at))deny(503,"The checkout session could not be verified.");
  const checkoutUrl=safeUrl(session.url,"checkout.stripe.com");if(!checkoutUrl)deny(503,"The checkout URL could not be verified.");
  await edit(r=>{const p=r.workspace.checkouts.find(p=>p.id===payment.id);if(!p)deny(409,"The checkout reservation changed.");if(p.sessionId&&p.sessionId!==session.id)deny(409,"The checkout reservation has a different session.");Object.assign(p,{sessionId:session.id,checkoutUrl,status:"open",expiresAt:new Date(session.expires_at*1000).toISOString()});return {workspace:r.workspace};});
  return publicPayment((await deps.load()).workspace.checkouts.find(p=>p.id===payment.id));
 }
 if(!["check","expire"].includes(operation))deny(400,"Unknown payment operation.");
 const id=text(input.paymentId,"Payment"),payment=row.workspace.checkouts.find(p=>p.id===id);
 if(!payment)deny(404,"Payment not found.");owned(row,payment.supplierId);
 if(operation==="expire"&&!actor.owner)deny(403,"Only the owner can expire checkout.");
 if(payment.appliedAt||payment.status==='test_paid')return publicPayment(payment);
 if(payment.livemode!==(mode==="live")||payment.connectionHash!==await digest(key||""))deny(409,"Use the original Stripe connection to reconcile this checkout.");
 if(!payment.sessionId)deny(409,"Resume creation using the same invoice button before checking this payment.");
 let session=await provider("/checkout/sessions/"+encodeURIComponent(payment.sessionId)+"?expand[]=payment_intent.latest_charge");
 if(operation==="expire"&&session.status==="open"&&session.payment_status!=="paid"){
  session=await provider("/checkout/sessions/"+encodeURIComponent(payment.sessionId)+"/expire","POST","","ccsas-expire-"+payment.id);
 }
 let reason="";
 if(session.id!==payment.sessionId||session.livemode!==payment.livemode||session.client_reference_id!==payment.id||session.metadata?.paymentId!==payment.id||session.metadata?.invoiceId!==payment.invoiceId||session.metadata?.supplierId!==payment.supplierId||session.metadata?.quoteHash!==payment.quoteHash)reason="Provider checkout identity did not match the reserved invoice.";
 let intent=session.payment_intent,charge=intent?.latest_charge;
 if(!reason&&session.payment_status==="paid"){
  if(session.status!=="complete"||session.mode!=="payment"||session.amount_total!==payment.amountCents||session.currency!==payment.currency.toLowerCase()||typeof intent!=="object"||!/^pi_[a-zA-Z0-9]+$/.test(intent?.id||"")||intent.status!=="succeeded"||intent.amount!==payment.amountCents||intent.amount_received!==payment.amountCents||intent.currency!==payment.currency.toLowerCase()||typeof charge!=="object"||charge?.paid!==true||charge.captured!==true||charge.status!=="succeeded"||charge.amount!==payment.amountCents||charge.currency!==payment.currency.toLowerCase()||charge.disputed!==false||charge.amount_refunded!==0)reason="The processor receipt is incomplete, disputed, refunded or differs from the invoice.";
 }
 await edit(async r=>{
  const p=r.workspace.checkouts.find(p=>p.id===id);if(p.appliedAt)return {workspace:r.workspace};
  Object.assign(p,{checkedAt:at(),providerAmountCents:session.amount_total,providerCurrency:session.currency,paymentIntentId:typeof intent==="object"?intent?.id:intent});
  if(reason){Object.assign(p,{status:"review",reviewReason:reason});return {workspace:r.workspace};}
  if(session.payment_status!=="paid"){p.status=session.status==="expired"?"expired":session.status==="complete"?"pending":"open";if(p.status==="expired")p.checkoutUrl="";return {workspace:r.workspace};}
  const bill=r.workspace.invoices.find(i=>i.id===p.invoiceId);
  try{if(await digest(invoiceQuote(r,bill))!==p.quoteHash)throw new Error("The invoice changed while checkout was open.");}catch(e){Object.assign(p,{status:"review",reviewReason:e.message});return {workspace:r.workspace};}
  if(!p.livemode){Object.assign(p,{status:"test_paid",testConfirmedAt:at(),checkoutUrl:"",reviewReason:"Test-mode receipt: the invoice and live membership remain unpaid."});return {workspace:r.workspace};}
  const receiptReference="stripe:"+intent.id;
  if(r.workspace.sourceRecords.some(s=>s.entity==="onlinePayments"&&s.record?.livemode===1&&s.record?.payment_intent_id===intent.id&&s.record?.applied_at)||r.workspace.submissions.some(s=>s.status==="verified"&&s.receiptReference===receiptReference)||r.state.payments.some(s=>s.reference===receiptReference)){Object.assign(p,{status:"review",reviewReason:"This processor receipt is already recorded."});return {workspace:r.workspace};}
  const submission={id:"stripe-submission-"+p.id,supplierId:p.supplierId,invoiceId:bill.id,reference:session.id,amountCents:p.amountCents,currency:p.currency,status:"submitted",submittedAt:at(),submittedBy:actor.userId};
  r.workspace.submissions.push(submission);
  const verified=executeSupplierWorkflow(r.state,r.workspace,"supplier.verify_payment",{supplierId:p.supplierId,paymentId:submission.id,amountCents:p.amountCents,currency:p.currency,receiptReference},{userId:"stripe:"+p.accountId,email:"processor@stripe",owner:true},{now:at()});
  const confirmed=verified.workspace.checkouts.find(c=>c.id===id);Object.assign(confirmed,{status:"applied",appliedAt:at(),paidAt:at(),checkoutUrl:"",receiptUrl:safeUrl(charge.receipt_url,"pay.stripe.com")});
  if(bill.campaignId){const campaign=verified.state.campaigns.find(c=>c.id===bill.campaignId);campaign.paymentStatus="paid";campaign.paidAt=at();}
  return verified;
 });
 return publicPayment((await deps.load()).workspace.checkouts.find(p=>p.id===id));
}

export async function verifyStripeSignature(body,header,secret,now=Date.now()){
 if(typeof secret!=="string"||!secret.startsWith("whsec_")||typeof header!=="string")return false;
 const fields=header.split(",").map(v=>v.split("=")),timestamps=fields.filter(([k])=>k==="t"),signatures=fields.filter(([k])=>k==="v1").map(([,v])=>v);
 if(timestamps.length!==1||!/^\d+$/.test(timestamps[0][1])||Math.abs(now/1000-Number(timestamps[0][1]))>300)return false;
 const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
 const signature=Array.from(new Uint8Array(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(timestamps[0][1]+"."+body))),v=>v.toString(16).padStart(2,"0")).join("");
 return signatures.some(value=>{if(!/^[a-f0-9]{64}$/.test(value||""))return false;let different=0;for(let i=0;i<64;i++)different|=signature.charCodeAt(i)^value.charCodeAt(i);return different===0;});
}

