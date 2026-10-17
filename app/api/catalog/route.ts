import {network} from "../../../lib/sas-db";
import {supplierCriteria} from "../../../lib/supplier-catalog.mjs";
import {sharedPackageCatalog} from "../../../lib/supplier-packages.mjs";
import {categories} from "../../../lib/sas-model";
export async function GET(request:Request){try{
 const currency=new URL(request.url).searchParams.get("currency")||"CAD";
 if(currency!=="CAD"&&currency!=="USD")return Response.json({error:"Choose CAD or USD."},{status:400});
 const row=await network();
 return Response.json({packageStructure:"shared-sas",criteria:supplierCriteria(row.state),policy:{body:row.state.settings.policy,revision:row.state.settings.policyVersion,status:"published"},plans:sharedPackageCatalog(row.state,currency),categories},{headers:{"Cache-Control":"no-store"}});
}catch{return Response.json({error:"The supplier catalog is temporarily unavailable."},{status:503});}}
