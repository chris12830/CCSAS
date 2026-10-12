import test from "node:test";
import assert from "node:assert/strict";
import {emptyWorkspace} from "../lib/supplier-workflows.mjs";
import {queueSupplierNotice,deliverSupplierNotices} from "../lib/supplier-notices.mjs";
test("supplier notices use authoritative account email and stay pending without sender setup",async()=>{
 const state={suppliers:[{id:"s",email:"supplier@example.test",name:"Company",status:"approved",sample:false}]},workspace=queueSupplierNotice(emptyWorkspace(),state,"supplier.review",{supplierId:"s",reason:"Approved",email:"forged@example.test"});assert.equal(workspace.notices[0].to,"supplier@example.test");
 let saved=workspace;const deps={load:async()=>({state,workspace:saved,version:0}),save:async(_s,_v,w)=>{saved=w},config:{}};
 const result=await deliverSupplierNotices(deps,{owner:true});assert.equal(result.sent,0);assert.equal(saved.notices[0].status,"pending_setup");
 await assert.rejects(()=>deliverSupplierNotices(deps,{owner:false}),e=>e.status===403);
});
test("notification delivery preserves one provider idempotency key and does not send twice",async()=>{
 const state={suppliers:[{id:"s",email:"supplier@example.test",name:"Company",status:"approved",sample:false}]};let saved=queueSupplierNotice(emptyWorkspace(),state,"supplier.review",{supplierId:"s",reason:"Approved"}),calls=[];
 const deps={load:async()=>({state,workspace:saved,version:0}),save:async(_s,_v,w)=>{saved=w},config:{RESEND_API_KEY:"test-provider-key",SAS_MAIL_FROM:"sender@example.test"},fetch:async(url,options)=>{calls.push(options.headers["Idempotency-Key"]);return Response.json({id:"email"})}};
 assert.equal((await deliverSupplierNotices(deps,{owner:true})).sent,1);assert.equal((await deliverSupplierNotices(deps,{owner:true})).sent,0);assert.equal(calls.length,1);assert.equal(saved.notices[0].status,"sent");
});
