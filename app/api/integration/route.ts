import {network,hashKey} from "../../../lib/sas-db";
import {SOURCE_PROJECT} from "../../../lib/supplier-transfer.mjs";
export async function GET(request:Request){try{
 const row=await network(undefined,"imports"),app=row.state.apps.find(a=>a.id===new URL(request.url).searchParams.get("app")),key=request.headers.get("X-SAS-App-Key");
 if(!app?.enabled||app.id!=="owners"||!key||!app.integrationHash||await hashKey(key)!==app.integrationHash)return Response.json({error:"An enabled CCON application connection is required."},{status:401});
 const imported=row.workspace.imports.find(r=>r.sourceProject===SOURCE_PROJECT);
 const suppliers=row.state.suppliers.filter(s=>s.sourceProject===SOURCE_PROJECT&&!s.sample).map(s=>({id:s.id,sourceSupplierId:s.sourceSupplierId,sourceAccountId:s.sourceAccountId,status:s.status,accountStatus:s.accountStatus??"active",billingStatus:s.billingStatus,paidUntil:s.paidThroughAt||s.paidUntil,name:s.name,category:s.category,website:s.website,countries:s.countries}));
 return Response.json({schemaVersion:1,sourceProject:SOURCE_PROJECT,version:row.version,import:imported?{fingerprint:imported.fingerprint,counts:imported.counts,mappings:imported.mappings.map((m:{sourceAccountId:string;sourceSupplierId:string;supplierId:string})=>({sourceAccountId:m.sourceAccountId,sourceSupplierId:m.sourceSupplierId,supplierId:m.supplierId})),frozen:imported.frozen}:null,suppliers},{headers:{"Cache-Control":"no-store"}});
}catch{return Response.json({error:"Supplier connection is temporarily unavailable."},{status:503});}}
