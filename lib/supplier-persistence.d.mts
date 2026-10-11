import type {Network} from "./sas-model";
import type {Workspace} from "./supplier-workflows.mjs";
export const compareAndSwapSql:string;
export const supplierUpsertSql:string;
export function supplierWritePlan(input:{state:Network;version:number;workspace?:Workspace;previousWorkspace?:Workspace;token:string;at:string}):{sql:string;params:(string|number)[]}[];
