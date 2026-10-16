import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {emptyWorkspace} from '../lib/supplier-workflows.mjs';

const origin='https://ccsas-return.example.test',previous=process.env.SAS_BASE_URL;
process.env.SAS_BASE_URL=origin;
let user=null,row,unavailable=false,loads=0;
globalThis.__checkoutReturnAuth={getUser:()=>user};
globalThis.__checkoutReturnStore={load:()=>{loads++;if(unavailable)throw Error('Unavailable');return row;}};
const hooks=registerHooks({resolve(specifier,context,next){
 if(specifier.endsWith('/chatgpt-auth'))return {url:'data:text/javascript,export async function getChatGPTUser(){return globalThis.__checkoutReturnAuth.getUser()}',shortCircuit:true};
 if(specifier.endsWith('/sas-db'))return {url:'data:text/javascript,export async function network(){return globalThis.__checkoutReturnStore.load()}',shortCircuit:true};
 try{return next(specifier,context);}catch(error){if(specifier.startsWith('.')&&!/\.[a-z]+$/i.test(specifier))return next(specifier+'.ts',context);throw error;}
}});
const {GET}=await import('../app/api/payments/return/route.ts');
after(()=>{hooks.deregister();delete globalThis.__checkoutReturnAuth;delete globalThis.__checkoutReturnStore;if(previous===undefined)delete process.env.SAS_BASE_URL;else process.env.SAS_BASE_URL=previous;});
const owner={userId:'owner',email:'owner@example.test',role:'owner'},supplier={userId:'supplier-user',email:'supplier@example.test',role:'supplier'};
function reset(actor){
 user=actor;unavailable=false;loads=0;
 row={ownerId:'owner',state:{suppliers:[{id:'example-first',userId:'example-user',email:'sample@example.test'},{id:'plan-it',userId:'supplier-user',email:supplier.email}],payments:[]},workspace:emptyWorkspace(),version:1};
 row.workspace.checkouts=[{id:'checkout-02',supplierId:'plan-it',invoiceId:'invoice-02',status:'test_paid'}];
 row.workspace.invoices=[{id:'invoice-02',supplierId:'plan-it',status:'open'}];
}
function request(query='payment=checkout-02',host=origin){return new Request(host+'/api/payments/return?'+query);}
test('owner return selects the real invoice supplier and Billing instead of the first example preview',async()=>{
 reset(owner);const before=structuredClone(row),response=await GET(request()),destination=new URL(response.headers.get('location'));
 assert.equal(response.status,303);assert.equal(destination.origin,origin);assert.equal(destination.pathname,'/');
 assert.equal(destination.searchParams.get('view'),'workspace');assert.equal(destination.searchParams.get('supplier'),'plan-it');assert.equal(destination.searchParams.get('payment'),'checkout-02');
 assert.equal(response.headers.get('cache-control'),'no-store');assert.deepEqual(row,before);
});
test('supplier return cannot be changed to the owner portal by query parameters or a claimed role',async()=>{
 reset({...supplier,role:'owner'});const response=await GET(request('payment=checkout-02&owner=1&view=workspace&supplier=example-first&return_to=https://evil.test'));
 const destination=new URL(response.headers.get('location'));
 assert.equal(response.status,303);assert.equal(destination.pathname,'/supplier');assert.equal(destination.searchParams.get('payment'),'checkout-02');
 assert.equal(destination.searchParams.has('view'),false);assert.equal(destination.searchParams.has('supplier'),false);
});
test('expired sessions preserve the checkout and cancellation context through sign-in',async()=>{
 reset(null);const response=await GET(request('payment=checkout-02&cancelled=1')),destination=new URL(response.headers.get('location'));
 assert.equal(response.status,303);assert.equal(destination.pathname,'/login');assert.equal(destination.searchParams.get('return_to'),'/api/payments/return?payment=checkout-02&cancelled=1');assert.equal(loads,0);
});
test('a matching email cannot borrow a checkout bound to another supplier user',async()=>{
 reset({userId:'borrower',email:supplier.email,role:'supplier'});const before=structuredClone(row),response=await GET(request());
 assert.equal(response.status,403);assert.equal(response.headers.get('location'),null);assert.equal(JSON.stringify(await response.json()).includes('plan-it'),false);assert.deepEqual(row,before);
});
test('invalid, duplicate and missing payment references cannot choose a return account',async()=>{
 for(const query of ['', 'payment=','payment=checkout-02&payment=other','payment=%2F%2Fevil.test','payment='+('a'.repeat(151))]){
  reset(owner);const response=await GET(request(query));assert.equal(response.status,400);assert.equal(response.headers.get('location'),null);assert.equal(loads,0);
 }
 reset(owner);const response=await GET(request('payment=unknown'));assert.equal(response.status,403);assert.equal(response.headers.get('location'),null);
});
test('returns use the configured HTTPS origin and preserve cancellation without confirming payment',async()=>{
 reset(supplier);const before=structuredClone(row),response=await GET(request('payment=checkout-02&cancelled=1','https://evil.test')),destination=new URL(response.headers.get('location'));
 assert.equal(destination.origin,origin);assert.equal(destination.pathname,'/supplier');assert.equal(destination.searchParams.get('cancelled'),'1');assert.deepEqual(row,before);
});
test('a storage outage does not fall back to a supplier preview or manufacture a confirmation',async()=>{
 reset(owner);unavailable=true;const response=await GET(request());assert.equal(response.status,503);assert.equal(response.headers.get('location'),null);
});
