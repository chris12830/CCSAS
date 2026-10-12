import {network,hashKey} from "../../../lib/sas-db";
import {SOURCE_PROJECT} from "../../../lib/supplier-transfer.mjs";
export async function GET(request:Request){try{
 const row=await network(),app=row.state.apps.find(a=>a.id===new URL(request.url).searchParams.get("app")),key=request.headers.get("X-SAS-App-Key");
 if(!app?.enabled||app.id!=="owners"||!key||!app.integrationHash||await hashKey(key)!==app.integrationHash)return Response.json({error:"An enabled CCON application connection is required."},{status:401});
 const imported=row.workspace.imports.find(r=>r.sourceProject===SOURCE_PROJECT);
 const suppliers=row.state.suppliers.filter(s=>!s.sample&&s.userId&&(s.sourceProject===SOURCE_PROJECT||app.packages.includes(s.packageId))).map(s=>{
  const profile=row.workspace.profiles.find(p=>p.supplierId===s.id),terms=profile?.terms;
  return {id:s.id,userId:s.userId,sourceSupplierId:s.sourceSupplierId||"",sourceAccountId:s.sourceAccountId||"",status:s.status,accountStatus:s.accountStatus??"active",billingStatus:s.billingStatus,paidUntil:s.paidThroughAt||s.paidUntil,name:s.name,category:s.category,website:s.website,countries:s.countries,description:profile?.description||"",serviceRegions:profile?.serviceRegions||"",terms:terms?{packageId:terms.packageId,name:terms.name,currency:terms.currency,amountCents:terms.amountCents,royaltyBps:terms.royaltyBps,billingInterval:terms.billingInterval||"monthly",acceptedAt:terms.acceptedAt,staticAllowed:!!terms.staticAllowed||!!row.state.packages.find(p=>p.id===terms.packageId)?.staticAllowed}:null};
 });
 return Response.json({schemaVersion:2,sourceProject:SOURCE_PROJECT,version:row.version,import:imported?{fingerprint:imported.fingerprint,counts:imported.counts,mappings:imported.mappings.map((m:{sourceAccountId:string;sourceSupplierId:string;supplierId:string})=>({sourceAccountId:m.sourceAccountId,sourceSupplierId:m.sourceSupplierId,supplierId:m.supplierId})),frozen:imported.frozen}:null,suppliers},{headers:{"Cache-Control":"no-store"}});
}catch{return Response.json({error:"Supplier connection is temporarily unavailable."},{status:503});}}
