import type {Network} from "./sas-model";
import type {Workspace} from "./supplier-workflows.mjs";
import type {Actor} from "./sas-actions";
import type {PaymentDependencies} from "./supplier-payments.mjs";
export function queueSupplierNotice(workspace:Workspace,state:Network,action:string,input:any,now?:string):Workspace;
export function deliverSupplierNotices(deps:Omit<PaymentDependencies,"config">&{config:{RESEND_API_KEY?:string;SAS_MAIL_FROM?:string}},actor:Actor):Promise<{sent:number;pending:number}>;
