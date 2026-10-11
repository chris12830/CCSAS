// Versioned, allowlisted supplier export. Community and member tables are excluded.
export const SOURCE_PROJECT="appgprj_6abacde500f88191bf85197fee0ef5ba";
export const transferFields={
 accounts:["id","identity_id","email","name","organization","region","country","status","created_at","reviewed_at","info_request","info_due_at","supplier_account_status","supplier_account_reason","supplier_account_updated_at"],
 applications:["user_id","legal_name","company_email","company_phone","applicant_phone","website","category","products","services","service_regions","country_coverage","authorized_at","privacy_accepted_at","criteria_revision","criteria_snapshot","criteria_answers","policy_revision","policy_body","policy_accepted_at","policy_accepted_by","policy_accepted_email"],
 suppliers:["id","owner_user_id","name","category","region","description","website","country_coverage"],
 subscriptions:["supplier_id","plan_id","plan_name","currency","monthly_fee_cents","membership_fee_cents","billing_interval","royalty_bps","payment_url","status","accepted_at","payment_submitted_at","paid_through","updated_at","exclusive_category"],
 ads:["id","supplier_id","title","description","destination_url","target_region","target_hub_id","placement","ticker_speed","status","created_at","kind","fee_cents","currency","payment_status","payment_url","paid_at","expires_at"],
 sales:["id","supplier_id","reference","gross_cents","currency","royalty_bps","royalty_cents","status","created_at","settled_at","recurring_service_id","period_start","enquiry_id","royalty_due_at"],
 recurring:["id","supplier_id","reference","title","fee_cents","currency","cadence","royalty_bps","starts_on","next_due_on","status","created_at","ended_at","enquiry_id"],
 verifications:["id","reference","supplier_id","kind","target_id","amount_cents","currency","verified_by","verified_at"],
 onlinePayments:["id","supplier_id","kind","target_id","amount_cents","currency","description","livemode","status","stripe_session_id","payment_intent_id","receipt_url","provider_amount_cents","provider_currency","applied_at","paid_at","expires_at","created_at"],
 refunds:["sale_id","customer_reference","network_reference","reason","verified_by","verified_at"],
 plans:["id","name","description","currency","monthly_fee_cents","membership_fee_cents","billing_interval","royalty_bps","available","deleted_at","benefits_json","campaign_rates_configured","overview_fee_cents","offers_fee_cents","ticker_fee_cents","hub_ticker_fee_cents","delayed_ticker_fee_cents","delayed_ticker_free","hub_static_fee_cents","plan_payment_url","royalty_payment_url","ticker_payment_url","hub_ticker_payment_url","delayed_ticker_payment_url","hub_static_payment_url"],
 policies:["id","body","status","revision","updated_at"],
 tickets:["id","reference","requester_id","portal","subject","category","status","created_at","updated_at","requester_read_count","admin_read_count"],
 messages:["id","ticket_id","author_id","author_role","body","created_at"],
 hubs:["id","title","category"],
 categoryHubs:["category","hub_id","updated_at"],
};
export function sanitizeTransfer(value){
 if(!value||value.schemaVersion!==1||value.sourceProject!==SOURCE_PROJECT||typeof value.exportedAt!=="string")throw new Error("A version 1 CCON supplier export is required.");
 const result={schemaVersion:1,sourceProject:SOURCE_PROJECT,exportedAt:value.exportedAt,frozen:value.frozen===true,data:{}};
 for(const [entity,fields] of Object.entries(transferFields)){
  const rows=value.data?.[entity];if(!Array.isArray(rows)||rows.length>10000)throw new Error("Invalid or missing export collection: "+entity);
  result.data[entity]=rows.map(row=>{
   if(!row||typeof row!=="object"||Array.isArray(row))throw new Error("Invalid "+entity+" record.");
   const safe={};for(const key of fields)if(row[key]!==undefined){
    const field=row[key];if(field!==null&&typeof field!=="string"&&typeof field!=="number")throw new Error("Invalid export field: "+key);
    if(typeof field==="string"&&field.length>30000)throw new Error("Export text is too long.");
    if(typeof field==="number"&&!Number.isSafeInteger(field))throw new Error("Export numbers must be integer minor units or counts.");
    safe[key]=field;
   }
   for(const [key,field] of Object.entries(safe))if((key.endsWith("_cents")||key.endsWith("_bps"))&&field!==null&&(typeof field!=="number"||field<0||field>100000000))throw new Error("Invalid financial value: "+key);
   if(Object.entries(safe).some(([key,value])=>key.endsWith("_bps")&&Number(value)>10000))throw new Error("Royalty basis points exceed 100%.");
   if(safe.currency&&!["CAD","USD"].includes(safe.currency))throw new Error("Unsupported financial currency.");
   return safe;
  });
 }
 // Defense in depth if a malformed export includes a member's support thread.
 const accountIds=new Set(result.data.accounts.map(r=>r.id)),supplierIds=new Set(result.data.suppliers.map(r=>r.id));
 for(const account of result.data.accounts)if(!account.id||!account.identity_id||!account.email||!account.name)throw new Error("Supplier identity is incomplete.");
 if(new Set(result.data.accounts.map(r=>r.id)).size!==result.data.accounts.length||new Set(result.data.suppliers.map(r=>r.id)).size!==result.data.suppliers.length)throw new Error("Duplicate source supplier identity.");
 if(result.data.suppliers.some(r=>!accountIds.has(r.owner_user_id)))throw new Error("Export includes an unrelated supplier.");
 if(result.data.applications.some(r=>!accountIds.has(r.user_id)))throw new Error("Export includes an unrelated application.");
 for(const entity of ["subscriptions","ads","sales","recurring","verifications","onlinePayments"])if(result.data[entity].some(r=>!supplierIds.has(r.supplier_id)))throw new Error("Export includes an unrelated financial record.");
 if(result.data.tickets.some(r=>!accountIds.has(r.requester_id)||r.portal!=="supplier"))throw new Error("Member support cannot be transferred.");
 const ticketIds=new Set(result.data.tickets.map(r=>r.id));if(result.data.messages.some(r=>!ticketIds.has(r.ticket_id)))throw new Error("Unrelated support messages cannot be transferred.");
 const saleIds=new Set(result.data.sales.map(r=>r.id));if(result.data.refunds.some(r=>!saleIds.has(r.sale_id)))throw new Error("Refund source is missing.");
 return result;
}
export function canonicalTransfer(value){
 const sorted=value=>Array.isArray(value)?value.map(sorted):value&&typeof value==="object"?Object.fromEntries(Object.keys(value).sort().map(key=>[key,sorted(value[key])])):value;
 const data=sanitizeTransfer(value);delete data.exportedAt;return JSON.stringify(sorted(data));
}
