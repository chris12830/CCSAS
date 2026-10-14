import SignOut from './sign-out';
import SASClient from "./sas-client";
import {requireChatGPTUser} from "./chatgpt-auth";
export const dynamic="force-dynamic";
export default async function Home(){const user=await requireChatGPTUser("/");return <><SignOut/><SASClient displayName={user.displayName}/></>;}

