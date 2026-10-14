import {resolve} from 'node:path';
import {getDatabase} from './vps-database.mjs';
import {VPSStorage} from './vps-storage.mjs';
const bucket=new VPSStorage(resolve(process.env.SAS_DATA_DIR||'var/ccsas','files'));
export const env=new Proxy({} as Record<string, any>,{get(_target,name){if(name==='DB')return getDatabase();if(name==='BUCKET')return bucket;return process.env[String(name)];}});
