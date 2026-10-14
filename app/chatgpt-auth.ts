// Compatibility exports now use a revocable server session, never client headers.
import {cookies} from 'next/headers';
import {redirect} from 'next/navigation';
import {getDatabase} from '../lib/vps-database.mjs';
import {sessionUser,sessionCookie,safeReturnPath} from '../lib/vps-auth.mjs';
export type ChatGPTUser={userId:string;displayName:string;email:string;fullName:string|null;role:string};
export async function getChatGPTUser():Promise<ChatGPTUser|null>{return sessionUser(getDatabase(),(await cookies()).get(sessionCookie)?.value) as ChatGPTUser|null;}
export async function requireChatGPTUser(returnTo:string):Promise<ChatGPTUser>{const user=await getChatGPTUser();if(!user)redirect(chatGPTSignInPath(returnTo));return user;}
export function chatGPTSignInPath(returnTo:string){return '/login?return_to='+encodeURIComponent(safeReturnPath(returnTo));}
export function chatGPTSignOutPath(){return '/login';}

