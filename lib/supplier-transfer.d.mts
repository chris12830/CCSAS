export const SOURCE_PROJECT:string;
export const transferFields:Record<string,string[]>;
export type SupplierTransfer={schemaVersion:1;sourceProject:string;exportedAt:string;frozen:boolean;data:Record<string,Record<string,any>[]>};
export function sanitizeTransfer(value:unknown):SupplierTransfer;
export function canonicalTransfer(value:unknown):string;
