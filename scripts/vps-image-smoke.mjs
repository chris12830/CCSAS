import {execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync,chownSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import assert from 'node:assert/strict';
const directory=mkdtempSync(join(tmpdir(),'ccsas-image-')),image=process.argv[2]||'ccsas-staging',name='ccsas-vps-smoke',password=randomBytes(24).toString('hex');
chownSync(directory,1000,1000);
const common=['--rm','-v',directory+':/data','-e','SAS_BASE_URL=https://staging.ccsas.test'];
const docker=(args,input)=>execFileSync('docker',args,{input,encoding:'utf8',stdio:['pipe','pipe','pipe']});
async function ready(){for(let i=0;i<40;i++){try{if((await fetch('http://127.0.0.1:3100/login')).status===200)return;}catch{}await new Promise(r=>setTimeout(r,500));}throw new Error('Container did not become ready.');}
async function api(path,body,cookie,extra={}){return fetch('http://127.0.0.1:3100'+path,{method:body?'POST':'GET',redirect:'manual',headers:{host:'staging.ccsas.test','x-forwarded-proto':'https',origin:'https://staging.ccsas.test','content-type':'application/json',...(cookie?{cookie}:{}),...extra},...(body?{body:JSON.stringify(body)}:{})});}
try{
 docker(['run',...common,image,'node','scripts/vps-admin.mjs','migrate']);
 docker(['run','-i',...common,image,'node','scripts/vps-admin.mjs','owner','owner@example.test','Owner'],password+'\n');
 docker(['run','-d','--name',name,...common,'--read-only','--tmpfs','/tmp:rw,size=128m','-p','127.0.0.1:3100:3100',image]);await ready();
 assert.equal((await api('/api/state',null,null,{'oai-authenticated-user-id':'owner','oai-authenticated-user-email':'owner@example.test'})).status,401);
 const login=await api('/api/auth',{operation:'login',email:'owner@example.test',password,returnTo:'/'});assert.equal(login.status,200);const setCookie=login.headers.get('set-cookie');assert.match(setCookie,/HttpOnly/i);assert.match(setCookie,/Secure/i);const cookie=setCookie.split(';')[0];
 const network=await api('/api/state',null,cookie);assert.equal(network.status,200);const initial=await network.json();
 const token=docker(['run',...common,image,'node','scripts/vps-admin.mjs','invite','supplier@example.test']).trim().split('token=')[1];
 const registration=await api('/api/auth',{operation:'register',token,name:'Supplier',password});assert.equal(registration.status,200);const supplierCookie=registration.headers.get('set-cookie').split(';')[0];assert.equal((await api('/api/state',null,supplierCookie)).status,403);assert.equal((await api('/api/supplier',null,supplierCookie)).status,200);
 const application=await api('/api/supplier',{action:'save_supplier',input:{name:'Test Company',contact:'Sam Supplier',email:'forged@example.test',website:'https://example.test',category:'Software & services',countries:['CA'],packageId:'single',currency:'CAD',accepted:true,policyVersion:initial.state.settings.policyVersion,policyText:initial.state.settings.policy},version:initial.version},supplierCookie);assert.equal(application.status,200,await application.text());
 docker(['restart',name]);await ready();assert.equal((await api('/api/state',null,cookie)).status,200);
 assert.equal((await api('/api/auth',{operation:'logout'},cookie)).status,200);assert.equal((await api('/api/state',null,cookie)).status,401);
 console.log('Image smoke passed: migrations, owner/supplier access, forged-header rejection, secure sessions, persistence across restart, logout.');
}finally{docker(['rm','-f',name]);rmSync(directory,{recursive:true,force:true});}

