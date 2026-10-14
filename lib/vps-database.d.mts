export type Result={results:Record<string,any>[];meta:{changes:number}};
export type Statement={bind(...values:any[]):Statement;first():Promise<Record<string,any>|null>;all():Promise<{results:Record<string,any>[]}>;run():Promise<Result>;execute():Result};
export class VPSDatabase {constructor(path:string);raw:any;prepare(sql:string):Statement;batch(statements:Statement[]):Promise<Result[]>;migrate(directory:string|URL):void;close():void;}
export function getDatabase():VPSDatabase;
