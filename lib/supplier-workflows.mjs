// Shared supplier workflows. No member records or provider secrets belong here.
export class WorkflowError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const collections = ["profiles","reviews","acceptances","messages","invoices","submissions","royalties","recurring","audit","imports","sourceRecords","checkouts","processing","integrationReceipts","tickets","library","notices"];
export const workspaceCollections = collections;
export function emptyWorkspace() { return Object.fromEntries(collections.map(k => [k, []])); }
export function normalizeWorkspace(value) {
  const next = emptyWorkspace();
  for (const key of collections) next[key] = Array.isArray(value?.[key]) ? JSON.parse(JSON.stringify(value[key])) : [];
  return next;
}
const clone = value => JSON.parse(JSON.stringify(value));
const fail = (status, message) => { throw new WorkflowError(status, message); };
const text = (value, label, max = 2000, min = 1) => {
  if (typeof value !== "string" || value.trim().length < min || value.trim().length > max) fail(400, label + " is invalid.");
  return value.trim();
};
const choice = (value, values, label) => values.includes(value) ? value : fail(400, label + " is invalid.");
const integer = (value, label, min = 0, max = 100000000) => {
  if (!Number.isSafeInteger(value) || value < min || value > max) fail(400, label + " is invalid.");
  return value;
};
const date = (value, label) => {
  const v = text(value, label, 10, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v + "T00:00:00Z")) || new Date(v + "T00:00:00Z").toISOString().slice(0,10) !== v) fail(400, label + " is invalid.");
  return v;
};
export function ownsSupplier(supplier, actor) {
  return supplier.userId ? supplier.userId === actor.userId : supplier.email.toLowerCase() === actor.email.toLowerCase();
}
export function scopeWorkspace(value, network, actor) {
  const workspace = normalizeWorkspace(value);
  if (actor.owner) return workspace;
  const ids = new Set(network.suppliers.filter(s => ownsSupplier(s,actor)).map(s => s.id));
  for (const key of collections) workspace[key] = key === "imports" || key === "audit" ? [] : workspace[key].filter(r => ids.has(r.supplierId));
  // Source records can contain internal moderation notes. Suppliers see normalized records only.
  workspace.sourceRecords = [];
  workspace.library=(ids.size?normalizeWorkspace(value).library:[]).filter(r=>r.status==="published"&&(!r.supplierId||ids.has(r.supplierId))).map(({fileKey,...record})=>record);
  workspace.checkouts = workspace.checkouts.map(({createParams,quoteHash,connectionHash,accountId,...record})=>record);
  return workspace;
}
export function nextRecurringDate(value, cadence, anchor) {
  const source = new Date(value + "T00:00:00Z"), day = anchor ? new Date(anchor + "T00:00:00Z").getUTCDate() : source.getUTCDate();
  source.setUTCDate(1);
  if (cadence === "yearly") source.setUTCFullYear(source.getUTCFullYear() + 1);
  else source.setUTCMonth(source.getUTCMonth() + 1);
  const last = new Date(Date.UTC(source.getUTCFullYear(), source.getUTCMonth()+1, 0)).getUTCDate();
  source.setUTCDate(Math.min(day,last));
  return source.toISOString().slice(0,10);
}
export const workflowActions = [
  "supplier.profile","supplier.review","supplier.account","supplier.accept_policy","supplier.accept_terms",
  "supplier.terms","supplier.message","supplier.read_messages","supplier.invoice","supplier.submit_payment",
  "supplier.verify_payment","supplier.report_sale","supplier.refund_sale","supplier.recurring",
  "supplier.recurring_payment","supplier.end_recurring","supplier.membership_invoice","supplier.royalty_invoice","supplier.campaign_invoice","supplier.royalty_due","supplier.ticket","supplier.ticket_status"
];
export function executeSupplierWorkflow(previous, previousWorkspace, action, input, actor, context = {}) {
  if (!workflowActions.includes(action)) fail(400,"Unknown supplier action.");
  if (!input || typeof input !== "object" || Array.isArray(input)) fail(400,"Invalid supplier request.");
  const state = clone(previous), workspace = normalizeWorkspace(previousWorkspace);
  const at = context.now || new Date().toISOString(), currentDate = context.date || at.slice(0,10);
  const uuid = context.id || (() => globalThis.crypto.randomUUID());
  const supplierId = text(input.supplierId,"Supplier",100);
  const supplier = state.suppliers.find(s => s.id === supplierId);
  if (!supplier) fail(404,"Supplier not found.");
  if (!actor.owner && !ownsSupplier(supplier,actor)) fail(403,"This supplier account is not yours.");
  const owner = () => { if (!actor.owner) fail(403,"Only the network owner can perform this action."); };
  const active = () => { if ((supplier.accountStatus || "active") !== "active") fail(409,"This supplier account is on hold or closed. Messaging and existing financial obligations remain available."); };
  const profile = () => workspace.profiles.find(r => r.supplierId === supplierId);
  const putProfile = fields => {
    let p = profile();
    if (!p) { p = {id:uuid(),supplierId,createdAt:at}; workspace.profiles.push(p); }
    Object.assign(p,fields,{updatedAt:at}); return p;
  };
  const invoice = id => {
    const found = workspace.invoices.find(r => r.id === id && r.supplierId === supplierId);
    if (!found) fail(404,"Invoice not found."); return found;
  };
  const policy = () => {
    if (actor.owner) fail(403,"The supplier must accept their own agreement. Administrators cannot fabricate consent.");
    if (input.version !== state.settings.policyVersion || input.text !== state.settings.policy) fail(409,"The supplier policy has changed. Reload and read the current policy before accepting.");
    if (input.accepted !== true) fail(400,"Read and accept the supplier policy.");
    const existing = workspace.acceptances.find(r => r.supplierId === supplierId && r.source === "ccsas" && r.version === state.settings.policyVersion && r.text === state.settings.policy);
    if (!existing) workspace.acceptances.push({id:uuid(),supplierId,source:"ccsas",version:state.settings.policyVersion,text:state.settings.policy,name:supplier.contact,email:actor.email,userId:actor.userId,acceptedAt:at});
    supplier.policyAcceptedAt = existing?.acceptedAt || at;
    supplier.policyVersion = state.settings.policyVersion; supplier.policyText = state.settings.policy;
    if (!supplier.userId) supplier.userId = actor.userId;
  };
  let target = supplierId;
  switch (action) {
    case "supplier.profile": {
      const p = {};
      for (const [field,max] of [["legalName",150],["companyPhone",60],["representativePhone",60],["description",4000],["products",4000],["services",4000],["serviceRegions",2000]]) {
        if (input[field] !== undefined) p[field] = text(input[field],field,max,0);
      }
      putProfile(p); break;
    }
    case "supplier.review": {
      owner();
      const decision = choice(input.decision,["approved","pending","rejected","more_info_requested"],"Decision");
      const reason = text(input.reason,"Review note",4000,decision === "approved" ? 0 : 3);
      if(decision==="approved"&&state.packages.find(p=>p.id===supplier.packageId)?.sourceAppId==="owners"&&(!profile()?.authorizedAt||!profile()?.privacyAcceptedAt||!profile()?.criteriaSnapshot))fail(409,"Supplier authority, privacy and criteria acceptance are required before approval.");
      if (decision === "approved" && !supplier.policyAcceptedAt) fail(409,"Supplier policy acceptance is required before approval.");
      const dueAt = decision === "more_info_requested" ? date(input.dueAt,"Information deadline") : "";
      if (dueAt && dueAt < currentDate) fail(400,"Choose a current or future information deadline.");
      supplier.status = decision;
      workspace.reviews.push({id:uuid(),supplierId,decision,reason,dueAt,reviewedAt:at,reviewedBy:actor.userId});
      break;
    }
    case "supplier.account": {
      const status = choice(input.status,["active","hold","cancelled","deleted"],"Account status");
      if (!actor.owner && !["cancelled","deleted"].includes(status)) fail(403,"Only the owner can hold or reactivate an account.");
      if (supplier.accountStatus === "deleted") fail(409,"A closed account cannot be reopened through this action.");
      const reason = text(input.reason,"Account note",2000,3);
      supplier.accountStatus = status; supplier.accountReason = reason; supplier.accountUpdatedAt = at;
      // Logical closure preserves receipts, consent, support and royalty obligations.
      break;
    }
    case "supplier.accept_policy": policy(); break;
    case "supplier.terms": {
      owner(); const royaltyBps = integer(input.royaltyBps,"Royalty rate",0,10000);
      putProfile({royaltyBps,termsUpdatedAt:at}); break;
    }
    case "supplier.accept_terms": {
      active(); policy();
      const packageId = text(input.packageId,"Package",100), currency = choice(input.currency,["CAD","USD"],"Currency");
      const pack = state.packages.find(p => p.id === packageId && p.enabled);
      if(pack?.supplierId&&pack.supplierId!==supplierId)fail(403,"This preserved contract belongs to another supplier.");
      if (!pack) fail(409,"Choose an available advertising package.");
      if (pack.sourceCurrency && pack.sourceCurrency!==currency) fail(409,"This preserved CCON contract is denominated in "+pack.sourceCurrency+".");
      const amountCents = integer(Math.round((currency === "CAD" ? pack.cad : pack.usd)*100),"Package price");
      const royaltyBps = integer(profile()?.royaltyBps ?? pack.royaltyBps ?? 0,"Royalty rate",0,10000);
      if (input.amountCents !== amountCents || input.royaltyBps !== royaltyBps) fail(409,"The package terms have changed. Reload and review them.");
      const terms = {packageId,name:pack.name,currency,amountCents,royaltyBps,billingInterval:pack.billingInterval || "monthly",acceptedAt:at,acceptedBy:actor.userId,policyVersion:state.settings.policyVersion,staticAllowed:!!pack.staticAllowed};
      workspace.acceptances.push({id:uuid(),supplierId,source:"ccsas-terms",version:at,text:JSON.stringify(terms),name:supplier.contact,email:actor.email,userId:actor.userId,acceptedAt:at,terms});
      if (supplier.packageId !== packageId || supplier.currency !== currency) { supplier.billingStatus="unpaid"; supplier.paidUntil=""; }
      supplier.packageId=packageId; supplier.currency=currency; putProfile({terms});
      break;
    }
    case "supplier.ticket": {
      if(actor.owner)fail(403,"A supplier opens their own support request.");
      const row={id:uuid(),supplierId,reference:"HELP-"+uuid().replaceAll("-","").slice(0,12).toUpperCase(),subject:text(input.subject,"Support subject",150,2),category:text(input.category,"Support category",60),status:"open",createdAt:at,updatedAt:at};
      workspace.tickets.push(row);workspace.messages.push({id:uuid(),supplierId,ticketId:row.id,body:text(input.body,"Support message",6000),senderRole:"supplier",senderId:actor.userId,createdAt:at,readAt:""});target=row.id;break;
    }
    case "supplier.ticket_status": {
      owner();const ticket=workspace.tickets.find(t=>t.id===input.ticketId&&t.supplierId===supplierId);if(!ticket)fail(404,"Support request not found.");
      ticket.status=choice(input.status,["open","resolved"],"Support status");ticket.updatedAt=at;target=ticket.id;break;
    }
    case "supplier.message": {
      const body = text(input.body,"Message",6000,1);
      const ticket=input.ticketId?workspace.tickets.find(t=>t.id===input.ticketId&&t.supplierId===supplierId):undefined;
      if(input.ticketId&&!ticket)fail(404,"Support request not found.");if(ticket){ticket.status="open";ticket.updatedAt=at;}
      workspace.messages.push({id:uuid(),supplierId,body,ticketId:ticket?.id||"",senderRole:actor.owner?"owner":"supplier",senderId:actor.userId,createdAt:at,readAt:""});
      break;
    }
    case "supplier.read_messages": {
      for (const message of workspace.messages.filter(m => m.supplierId === supplierId && m.senderRole !== (actor.owner?"owner":"supplier") && !m.readAt)) message.readAt=at;
      break;
    }
    case "supplier.royalty_due": {
      owner();const sale=workspace.royalties.find(r=>r.id===input.saleId&&r.supplierId===supplierId&&r.status==="reported");if(!sale)fail(409,"Only an unpaid royalty due date can change.");
      const value=text(input.dueAt,"Due date",40);if(!Number.isFinite(Date.parse(value)))fail(400,"Enter a valid royalty due date.");sale.dueAt=new Date(/^\d{4}-\d{2}-\d{2}$/.test(value)?value+"T23:59:59.000Z":value).toISOString();target=sale.id;break;
    }
    case "supplier.campaign_invoice": {
      active();const campaign=state.campaigns.find(c=>c.id===input.campaignId&&c.supplierId===supplierId);if(!campaign)fail(404,"Campaign not found.");
      if(!campaign.feeCents||campaign.paymentStatus!=="unpaid")fail(409,"This campaign does not need another payment.");
      const pending=workspace.invoices.find(i=>i.campaignId===campaign.id&&i.status==="open");if(pending){target=pending.id;break;}
      const row={id:uuid(),supplierId,campaignId:campaign.id,kind:"advertising",reference:"AD-"+uuid(),amountCents:campaign.feeCents,currency:campaign.currency,dueAt:currentDate,paidUntil:"",status:"open",createdAt:at,royaltyIds:[],terms:clone(profile()?.terms||{})};
      workspace.invoices.push(row);target=row.id;break;
    }
    case "supplier.membership_invoice": {
      active();
      const terms=profile()?.terms;
      if (supplier.status!=="approved"||!terms||terms.packageId!==supplier.packageId||terms.currency!==supplier.currency) fail(409,"An approved supplier and accepted membership terms are required.");
      if (terms.amountCents<=0) fail(409,"Contact the network team to activate a free or historical membership.");
      const pending=workspace.invoices.find(i=>i.supplierId===supplierId&&i.kind==="plan"&&i.status==="open"&&JSON.stringify(i.terms)===JSON.stringify(terms));
      if(pending){target=pending.id;break;}
      const paidThrough=supplier.paidThroughAt?.slice(0,10)||supplier.paidUntil;
      const start=paidThrough&&paidThrough>currentDate?paidThrough:currentDate;
      const paidUntil=nextRecurringDate(start,terms.billingInterval==="annual"?"yearly":"monthly");
      const row={id:uuid(),supplierId,kind:"plan",reference:"MEM-"+uuid(),amountCents:terms.amountCents,currency:terms.currency,dueAt:currentDate,paidUntil,status:"open",createdAt:at,terms:clone(terms),royaltyIds:[]};
      workspace.invoices.push(row);target=row.id;break;
    }
    case "supplier.royalty_invoice": {
      const currency=choice(input.currency,["CAD","USD"],"Currency");
      const entries=workspace.royalties.filter(r=>r.supplierId===supplierId&&r.currency===currency&&r.status==="reported"&&r.royaltyCents>0&&!workspace.invoices.some(i=>i.status==="open"&&i.royaltyIds?.includes(r.id)));
      if(!entries.length)fail(409,"There are no uninvoiced royalties in this currency.");
      const row={id:uuid(),supplierId,kind:"royalty",reference:"ROY-"+uuid(),amountCents:entries.reduce((n,r)=>n+r.royaltyCents,0),currency,dueAt:currentDate,paidUntil:"",status:"open",createdAt:at,terms:clone(profile()?.terms||{}),royaltyIds:entries.map(r=>r.id)};
      workspace.invoices.push(row);target=row.id;break;
    }
    case "supplier.invoice": {
      owner();
      const kind=choice(input.kind,["plan","advertising","royalty"],"Invoice kind");
      if (kind !== "royalty") active();
      const amountCents=integer(input.amountCents,"Invoice amount",1);
      const currency=choice(input.currency,["CAD","USD"],"Currency"), reference=text(input.reference,"Invoice reference",100,3);
      if (workspace.invoices.some(i=>i.supplierId===supplierId&&i.reference===reference)) fail(409,"This invoice reference already exists.");
      const dueAt=date(input.dueAt,"Invoice due date");
      const paidUntil=kind==="plan"?date(input.paidUntil,"Paid-through date"):"";
      if (paidUntil && paidUntil < currentDate) fail(400,"Choose a current or future paid-through date.");
      const terms=clone(profile()?.terms || {});
      if (kind==="plan" && (!terms.packageId || terms.packageId!==supplier.packageId || terms.currency!==currency || terms.amountCents!==amountCents)) fail(409,"The supplier must accept the exact package price and currency before invoicing.");
      const royaltyIds=kind==="royalty"?input.royaltyIds:[];
      if (kind==="royalty") {
        if (!Array.isArray(royaltyIds)||!royaltyIds.length||new Set(royaltyIds).size!==royaltyIds.length) fail(400,"Choose unpaid royalty entries.");
        const rows=royaltyIds.map(id=>workspace.royalties.find(r=>r.id===id&&r.supplierId===supplierId&&r.status==="reported"&&r.currency===currency));
        if (rows.some(r=>!r)||rows.reduce((sum,r)=>sum+r.royaltyCents,0)!==amountCents) fail(409,"The royalty balance or currency has changed.");
        if (workspace.invoices.some(i=>i.status!=="void"&&i.status!=="paid"&&i.royaltyIds?.some(id=>royaltyIds.includes(id)))) fail(409,"An unpaid invoice already covers one of these royalties.");
      }
      const row={id:uuid(),supplierId,kind,reference,amountCents,currency,dueAt,paidUntil,status:"open",createdAt:at,terms,royaltyIds};
      workspace.invoices.push(row); target=row.id; break;
    }
    case "supplier.submit_payment": {
      const bill=invoice(text(input.invoiceId,"Invoice",100));
      if (bill.status==="paid"||bill.status==="void") fail(409,"This invoice does not accept another payment.");
      const reference=text(input.reference,"Payment reference",150,3);
      if (workspace.submissions.some(p=>p.supplierId===supplierId&&p.reference===reference)) fail(409,"This payment reference was already submitted.");
      const row={id:uuid(),supplierId,invoiceId:bill.id,reference,amountCents:bill.amountCents,currency:bill.currency,status:"submitted",submittedAt:at,submittedBy:actor.userId};
      workspace.submissions.push(row); target=row.id; break;
    }
    case "supplier.verify_payment": {
      owner();
      const payment=workspace.submissions.find(p=>p.id===input.paymentId&&p.supplierId===supplierId);
      if (!payment) fail(404,"Payment submission not found.");
      if (payment.status==="verified") fail(409,"This payment has already been verified.");
      const bill=invoice(payment.invoiceId);
      if (bill.status==="paid"||bill.status==="void") fail(409,"This invoice is already paid or void.");
      const amount=integer(input.amountCents,"Verified amount",1);
      const currency=choice(input.currency,["CAD","USD"],"Verified currency");
      if (amount!==bill.amountCents||currency!==bill.currency) fail(409,"The independently verified receipt must match the invoice amount and currency.");
      const receiptReference=text(input.receiptReference,"Verified receipt reference",150,3);
      if (workspace.submissions.some(p=>p.status==="verified"&&p.receiptReference===receiptReference)||state.payments?.some(p=>p.reference===receiptReference)) fail(409,"This receipt is already recorded.");
      if (bill.kind==="plan" && bill.terms.packageId!==supplier.packageId) fail(409,"The supplier package has changed. Reconcile this invoice first.");
      if (bill.kind==="royalty") {
        const entries=bill.royaltyIds.map(id=>workspace.royalties.find(r=>r.id===id&&r.supplierId===supplierId&&r.status==="reported"&&r.currency===currency));
        if (entries.some(r=>!r)||entries.reduce((sum,r)=>sum+r.royaltyCents,0)!==amount) fail(409,"The royalty invoice must be reconciled before verification.");
        for (const row of entries) { row.status="settled"; row.settledAt=at; row.paymentReference=receiptReference; }
      }
      Object.assign(payment,{status:"verified",verifiedAt:at,verifiedBy:actor.userId,receiptReference});
      if(bill.campaignId){const campaign=state.campaigns.find(c=>c.id===bill.campaignId&&c.supplierId===supplierId);if(!campaign||campaign.feeCents!==amount||campaign.currency!==currency||campaign.paymentStatus!=="unpaid")fail(409,"The campaign invoice needs reconciliation.");campaign.paymentStatus="paid";campaign.paidAt=at;campaign.expiresAt=nextRecurringDate(currentDate,"monthly")+at.slice(10);}
      bill.status="paid"; bill.paidAt=at;
      if (bill.kind==="plan") { supplier.billingStatus="active"; supplier.paidUntil=bill.paidUntil; supplier.paidThroughAt=""; }
      target=payment.id; break;
    }
    case "supplier.report_sale": {
      const terms=profile()?.terms;
      if (!terms || !Number.isInteger(terms.royaltyBps)) fail(409,"Accepted royalty terms are required before reporting sales.");
      const grossCents=integer(input.grossCents,"Sale amount",1), reference=text(input.reference,"Sale reference",100,3);
      if (workspace.royalties.some(r=>r.supplierId===supplierId&&r.reference===reference)) fail(409,"This sale reference already exists.");
      const row={id:uuid(),supplierId,reference,grossCents,currency:terms.currency,royaltyBps:terms.royaltyBps,royaltyCents:Math.round(grossCents*terms.royaltyBps/10000),status:"reported",createdAt:at,dueAt:new Date(Date.parse(at)+30*86400000).toISOString(),terms:clone(terms)};
      workspace.royalties.push(row); target=row.id; break;
    }
    case "supplier.refund_sale": {
      owner(); const sale=workspace.royalties.find(r=>r.id===input.saleId&&r.supplierId===supplierId);
      if (!sale) fail(404,"Sale not found.");
      if (sale.status==="refunded") fail(409,"This sale is already refunded.");
      if (workspace.invoices.some(i=>i.status==="open"&&i.royaltyIds?.includes(sale.id))) fail(409,"Reconcile the open royalty invoice before recording a refund.");
      const customerReference=text(input.customerReference,"Verified customer refund reference",150,3);
      const networkReference=sale.status==="settled"?text(input.networkReference,"Verified royalty refund reference",150,3):"";
      Object.assign(sale,{status:"refunded",customerRefundReference:customerReference,networkRefundReference:networkReference,refundVerifiedAt:at});
      target=sale.id; break;
    }
    case "supplier.recurring": {
      active(); const terms=profile()?.terms;
      if (!terms || !Number.isInteger(terms.royaltyBps)) fail(409,"Accepted royalty terms are required.");
      const reference=text(input.reference,"Service reference",100,3);
      if (workspace.recurring.some(r=>r.supplierId===supplierId&&r.reference===reference)) fail(409,"This recurring service reference already exists.");
      const row={id:uuid(),supplierId,reference,title:text(input.title,"Service title",150,3),feeCents:integer(input.feeCents,"Service fee",1),cadence:choice(input.cadence,["monthly","yearly"],"Billing cadence"),nextDueOn:date(input.startsOn,"Start date"),startsOn:input.startsOn,status:"active",terms:clone(terms),createdAt:at};
      workspace.recurring.push(row); target=row.id; break;
    }
    case "supplier.recurring_payment": {
      const service=workspace.recurring.find(r=>r.id===input.serviceId&&r.supplierId===supplierId);
      if (!service||(service.status!=="active"&&!(service.status==="ended"&&service.nextDueOn<=service.endedAt?.slice(0,10)))) fail(409,"A due recurring service period is required.");
      const reference=text(input.reference,"Receipt reference",100,3);
      if (workspace.royalties.some(r=>r.supplierId===supplierId&&r.reference===reference)) fail(409,"This receipt reference already exists.");
      if (service.nextDueOn>currentDate||(service.sourceNextDueAt&&Date.parse(service.sourceNextDueAt)>Date.parse(at))) fail(409,"The next service period is not due yet.");
      const row={id:uuid(),supplierId,reference,grossCents:service.feeCents,currency:service.terms.currency,royaltyBps:service.terms.royaltyBps,royaltyCents:Math.round(service.feeCents*service.terms.royaltyBps/10000),status:"reported",createdAt:at,dueAt:new Date(Date.parse(at)+30*86400000).toISOString(),recurringId:service.id,periodStart:service.nextDueOn,terms:clone(service.terms)};
      workspace.royalties.push(row); service.nextDueOn=nextRecurringDate(service.nextDueOn,service.cadence,service.startsOn); if(service.sourceNextDueAt)service.sourceNextDueAt=service.nextDueOn+service.sourceNextDueAt.slice(10); target=row.id; break;
    }
    case "supplier.end_recurring": {
      const service=workspace.recurring.find(r=>r.id===input.serviceId&&r.supplierId===supplierId);
      if (!service||service.status!=="active") fail(409,"Active recurring service not found.");
      service.status="ended"; service.endedAt=at; target=service.id; break;
    }
  }
  workspace.audit.push({id:uuid(),supplierId,action,target,actorId:actor.userId,actorRole:actor.owner?"owner":"supplier",at});
  return {state,workspace};
}
