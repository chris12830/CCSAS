import type {Network} from "./sas-model";
import type {Workspace} from "./supplier-workflows.mjs";
import type {Actor} from "./sas-actions";
export function importSuppliers(state:Network,workspace:Workspace,input:unknown,actor:Actor,context:{fingerprint:string;now?:string}):{state:Network;workspace:Workspace;report:{idempotent:boolean;fingerprint:string;mappings:any[];counts:Record<string,number>;warnings:string[];frozen?:boolean}};
