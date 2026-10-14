import {mkdir,readFile,writeFile,rename,unlink,stat} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
export class VPSStorage {
 constructor(directory){this.directory=resolve(directory);}
 path(key){if(typeof key!=='string'||!key||key.length>1024)throw new Error('Invalid file key');return resolve(this.directory,createHash('sha256').update(key).digest('hex'));}
 async put(key,data){await mkdir(this.directory,{recursive:true,mode:0o700});const target=this.path(key),temporary=target+'.'+randomUUID();try{await writeFile(temporary,new Uint8Array(data),{mode:0o600,flag:'wx'});await rename(temporary,target);}finally{await unlink(temporary).catch(()=>{});}}
 async head(key){try{const info=await stat(this.path(key));return {size:info.size};}catch(error){if(error.code==='ENOENT')return null;throw error;}}
 async get(key,options){try{const bytes=await readFile(this.path(key)),range=options?.range;return {size:bytes.length,body:range?new Uint8Array(bytes.subarray(range.offset,range.offset+range.length)):new Uint8Array(bytes)};}catch(error){if(error.code==='ENOENT')return null;throw error;}}
 async delete(key){try{await unlink(this.path(key));}catch(error){if(error.code!=='ENOENT')throw error;}}
}
