import SASClient from "../sas-client";
import {requireChatGPTUser} from "../chatgpt-auth";
import {network} from "../../lib/sas-db";
export const dynamic="force-dynamic";
export default async function SupplierPage(){
  const user=await requireChatGPTUser("/supplier");
  let owner=false;try{owner=(await network()).ownerId===user.userId;}catch{}
  return <SASClient supplierOnly ownerPreview={owner} displayName={user.displayName}/>;
}
