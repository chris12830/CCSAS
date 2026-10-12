import type {Actor} from "./sas-actions";
import type {Network} from "./sas-model";
import type {Workspace,WorkspaceRecord} from "./supplier-workflows.mjs";
export type PaymentDependencies={load:()=>Promise<{state:Network;workspace:Workspace;version:number}>;save:(state:Network,version:number,workspace:Workspace,previousWorkspace:Workspace)=>Promise<void>;config:{STRIPE_SECRET_KEY?:string};fetch?:typeof fetch;now?:()=>string};
export function stripeMode(key?:string):"test"|"live"|null;
export function paymentStatus(workspace:Workspace,key?:string):Promise<{provider:string;configured:boolean;mode:"test"|"live"|null;enabled:boolean}>;
export function processSupplierPayment(deps:PaymentDependencies,actor:Actor,operation:string,input?:Record<string,unknown>,origin?:string):Promise<any>;

export function verifyStripeSignature(body:string,header:string|null,secret?:string,now?:number):Promise<boolean>;
