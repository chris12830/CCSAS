import type {Network} from "./sas-model";
import type {Actor} from "./sas-actions";
export type WorkspaceRecord={id:string;supplierId?:string;[key:string]:any};
export type Workspace={profiles:WorkspaceRecord[];reviews:WorkspaceRecord[];acceptances:WorkspaceRecord[];messages:WorkspaceRecord[];invoices:WorkspaceRecord[];submissions:WorkspaceRecord[];royalties:WorkspaceRecord[];recurring:WorkspaceRecord[];audit:WorkspaceRecord[];imports:WorkspaceRecord[];sourceRecords:WorkspaceRecord[];checkouts:WorkspaceRecord[];processing:WorkspaceRecord[];integrationReceipts:WorkspaceRecord[];tickets:WorkspaceRecord[];library:WorkspaceRecord[]};
export class WorkflowError extends Error {status:number;constructor(status:number,message:string);}
export const workspaceCollections:(keyof Workspace)[];
export const workflowActions:string[];
export function emptyWorkspace():Workspace;
export function normalizeWorkspace(value:unknown):Workspace;
export function ownsSupplier(supplier:Network["suppliers"][number],actor:Actor):boolean;
export function scopeWorkspace(value:Workspace,network:Network,actor:Actor):Workspace;
export function nextRecurringDate(value:string,cadence:"monthly"|"yearly",anchor?:string):string;
export function executeSupplierWorkflow(previous:Network,workspace:Workspace,action:string,input:unknown,actor:Actor,context?:{now?:string;date?:string;id?:()=>string}):{state:Network;workspace:Workspace};
