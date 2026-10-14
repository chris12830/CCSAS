import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,readFileSync,readdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
export class VPSDatabase {
 constructor(path){if(path!==':memory:')mkdirSync(dirname(path),{recursive:true,mode:0o700});this.raw=new DatabaseSync(path);this.raw.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;');}
 prepare(sql){
  const statement=this.raw.prepare(sql);let params=[];
  function execute(){return statement.columns().length?{results:statement.all(...params),meta:{changes:0}}:{results:[],meta:{changes:Number(statement.run(...params).changes)}};}
  return {bind(...values){params=values;return this;},async first(){return statement.get(...params)??null;},async all(){return {results:statement.all(...params)};},async run(){return execute();},execute};
 }
 async batch(statements){this.raw.exec('BEGIN IMMEDIATE');try{const result=statements.map(statement=>statement.execute());this.raw.exec('COMMIT');return result;}catch(error){this.raw.exec('ROLLBACK');throw error;}}
 migrate(directory){if(directory instanceof URL)directory=fileURLToPath(directory);this.raw.exec('CREATE TABLE IF NOT EXISTS vps_migrations(name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');for(const name of readdirSync(directory).filter(x=>x.endsWith('.sql')).sort()){if(this.raw.prepare('SELECT name FROM vps_migrations WHERE name=?').get(name))continue;this.raw.exec('BEGIN IMMEDIATE');try{this.raw.exec(readFileSync(resolve(directory,name),'utf8'));this.raw.prepare('INSERT INTO vps_migrations VALUES(?,?)').run(name,new Date().toISOString());this.raw.exec('COMMIT');}catch(error){this.raw.exec('ROLLBACK');throw error;}}}
 close(){this.raw.close();}
}
let singleton;
export function getDatabase(){if(!singleton)singleton=new VPSDatabase(resolve(process.env.SAS_DATA_DIR||'var/ccsas','ccsas.sqlite'));return singleton;}
