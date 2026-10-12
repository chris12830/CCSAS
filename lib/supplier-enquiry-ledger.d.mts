import type {Network} from "./sas-model";
import type {Workspace,WorkspaceRecord} from "./supplier-workflows.mjs";
export function normalizeEnquiryEvent(value:unknown):Record<string,any>;
export function applyEnquiryEvent(state:Network,workspace:Workspace,value:unknown,context:{fingerprint:string;now?:string}):{state:Network;workspace:Workspace;receipt:any;idempotent:boolean};
