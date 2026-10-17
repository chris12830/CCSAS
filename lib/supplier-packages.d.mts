import type {Network,Package,Supplier} from "./sas-model";
export function isSharedPackage(pack:Package):boolean;
export function selectableSupplierPackages(packages:Package[],currentPackageId?:string):Package[];
export function supplierApprovalError(supplier:Supplier,pack:Package|undefined,profile:Record<string,unknown>|undefined):string|undefined;
export function sharedPackageCatalog(state:Network,currency?:"CAD"|"USD"):Array<{
 id:string;name:string;description:string;currency:"CAD"|"USD";membershipFeeCents:number;monthlyFeeCents:number;
 prices:{CAD:number;USD:number};billingInterval:"monthly"|"annual";maxApps:number;benefits:string[];exclusiveCategoryPartner:boolean;
 applications:Array<{id:string;name:string;countries:Network["apps"][number]["countries"]}>;
}>;
