// Pure SQL planning keeps a network version and its supplier records in one D1 transaction.
import {workspaceCollections as collections} from "./supplier-workflows.mjs";
export const compareAndSwapSql="UPDATE sas_networks SET data=?,version=version+1,updated_at=?,write_token=? WHERE id=? AND version=?";
export const supplierUpsertSql=`INSERT INTO sas_supplier_records (collection,id,supplier_id,data,updated_at)
SELECT ?,json_extract(value,'$.id'),COALESCE(json_extract(value,'$.supplierId'),''),json(value),?
FROM json_each(?) WHERE EXISTS (SELECT 1 FROM sas_networks WHERE id='main' AND version=? AND write_token=?)
ON CONFLICT(collection,id) DO UPDATE SET supplier_id=excluded.supplier_id,data=excluded.data,updated_at=excluded.updated_at`;
function bytes(value){let count=0;for(const char of value){const code=char.codePointAt(0);count+=code<=127?1:code<=2047?2:code<=65535?3:4;}return count;}
export function supplierWritePlan({state,version,workspace,previousWorkspace,token,at}){
 if(!Number.isSafeInteger(version)||version<0||!token)throw new Error("A network version and mutation token are required.");
 const networkData=JSON.stringify(state);if(bytes(networkData)>1800000)throw new Error("Network state requires a paged migration before it can be saved.");
 const statements=[{sql:compareAndSwapSql,params:[networkData,at,token,"main",version]}];
 if(workspace)for(const collection of collections){
  const previous=new Map((previousWorkspace?.[collection]??[]).map(row=>[row.id,JSON.stringify(row)])),changed=[];
  for(const row of workspace[collection]??[]){
   if(typeof row.id!=="string"||!row.id)throw new Error("A workspace record identifier is required.");
   const data=JSON.stringify(row);if(previous.get(row.id)===data)continue;
   if(collection==="acceptances"&&previous.has(row.id))throw new Error("Accepted agreement records are immutable.");
   if(bytes(data)>1500000)throw new Error("A supplier record exceeds the storage limit.");
   changed.push(data);
  }
  let chunk=[],size=2;
  const flush=()=>{if(!chunk.length)return;statements.push({sql:supplierUpsertSql,params:[collection,at,"["+chunk.join(",")+"]",version+1,token]});chunk=[];size=2;};
  for(const row of changed){const length=bytes(row)+1;if(size+length>1500000)flush();chunk.push(row);size+=length;}flush();
 }
 // Leaves room for auth and snapshot reads under the Workers Free query limit.
 if(statements.length>40)throw new Error("This import needs paged staging. No supplier records have been saved.");
 return statements;
}
