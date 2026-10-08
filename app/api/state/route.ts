import {getChatGPTUser} from "../../chatgpt-auth";
import {network,summaries} from "../../../lib/sas-db";
import {publicState} from "../../../lib/sas-model";
export async function GET(){
  try{const user=await getChatGPTUser();if(!user)return Response.json({error:"Sign in to open SAS."},{status:401});
    const row=await network(user.userId);if(row.ownerId!==user.userId)return Response.json({error:"This portal is reserved for the network owner. Use the Supplier portal."},{status:403});
    return Response.json({state:publicState(row.state),version:row.version,summary:await summaries(),user:user.displayName},{headers:{"Cache-Control":"no-store"}});
  }catch(error){console.error("SAS load",error);return Response.json({error:"SAS could not load your saved network. Please try again."},{status:503});}
}
