import test from "node:test";
import assert from "node:assert/strict";
import {emptyWorkspace} from "../lib/supplier-workflows.mjs";
import {queueSupplierNotice,deliverSupplierNotices,supplierInbox} from "../lib/supplier-notices.mjs";
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

test("inbox counts only incoming messages and account notifications for the selected supplier",()=>{
 const workspace=emptyWorkspace();
 workspace.messages=[
  {id:"incoming",supplierId:"s",senderRole:"owner",createdAt:"2026-10-19T12:00:00Z",readAt:""},
  {id:"outgoing",supplierId:"s",senderRole:"supplier",createdAt:"2026-10-19T12:01:00Z",readAt:""},
  {id:"read",supplierId:"s",senderRole:"owner",createdAt:"2026-10-19T11:00:00Z",readAt:"2026-10-19T11:05:00Z"},
  {id:"other",supplierId:"other",senderRole:"owner",createdAt:"2026-10-19T13:00:00Z",readAt:""}
 ];
 workspace.notices=[
  {id:"application",supplierId:"s",subject:"Application update",detail:"Please confirm your regions.",createdAt:"2026-10-19T12:00:00Z"},
  {id:"message-email",supplierId:"s",subject:"New message from the network team",createdAt:"2026-10-19T12:01:00Z"},
  {id:"read-update",supplierId:"s",subject:"Earlier update",createdAt:"2026-10-19T10:00:00Z",readAt:"2026-10-19T10:01:00Z"},
  {id:"private-other",supplierId:"other",subject:"Other supplier update",createdAt:"2026-10-19T14:00:00Z"}
 ];
 const before=structuredClone(workspace),supplier=supplierInbox(workspace,"s");
 assert.equal(supplier.unreadMessages,1);assert.equal(supplier.unreadNotifications,1);
 assert.deepEqual(supplier.messages.map(m=>m.id),["incoming","read"]);
 assert.deepEqual(supplier.notifications.map(n=>n.id),["application","read-update"]);
 const owner=supplierInbox(workspace,"s",true);assert.equal(owner.unreadMessages,1);assert.deepEqual(owner.notifications,[]);
 assert.deepEqual(workspace,before);
});

test("campaign and access updates appear in the portal without entering the email delivery queue",async()=>{
 const state={suppliers:[{id:"s",email:"supplier@example.test",name:"Company",status:"approved",sample:false,paidUntil:"2026-10-22"}],campaigns:[{id:"campaign",supplierId:"s",name:"Autumn offer",status:"published"}]};
 let workspace=queueSupplierNotice(emptyWorkspace(),state,"campaign_status",{id:"campaign",status:"published"},"2026-10-19T12:00:00Z");
 workspace=queueSupplierNotice(workspace,state,"grant_complimentary",{id:"s",reason:"Launch test"},"2026-10-19T12:01:00Z");
 workspace=queueSupplierNotice(workspace,state,"revoke_complimentary",{id:"s"},"2026-10-19T12:02:00Z");
 const inbox=supplierInbox(workspace,"s");assert.equal(inbox.unreadNotifications,3);
 assert.equal(inbox.notifications[0].subject,"Complimentary advertising access ended");
 const campaign=workspace.notices.find(n=>n.kind==="campaign");assert.equal(campaign.campaignId,"campaign");assert.equal(campaign.destination,"campaign");assert.match(campaign.detail,/Autumn offer/);
 assert.ok(workspace.notices.every(n=>n.inAppOnly&&n.status==="in_app"));
 let calls=0;
 const result=await deliverSupplierNotices({load:async()=>({state,workspace,version:0}),save:async()=>{throw Error("No email writes expected");},config:{RESEND_API_KEY:"test-only",SAS_MAIL_FROM:"sender@example.test"},fetch:async()=>{calls++;return Response.json({id:"test"});}},{owner:true});
 assert.equal(calls,0);assert.deepEqual(result,{sent:0,pending:0});
});

test("existing application notices become visible even if email sending has not been configured",()=>{
 const state={suppliers:[{id:"s",email:"supplier@example.test",name:"Company",status:"more_info_requested",sample:false}]};
 const queued=queueSupplierNotice(emptyWorkspace(),state,"supplier.review",{supplierId:"s",reason:"Confirm the provinces you serve.",dueAt:"2026-10-25"});
 assert.equal(queued.notices[0].status,"queued");assert.equal(supplierInbox(queued,"s").unreadNotifications,1);
 assert.match(supplierInbox(queued,"s").notifications[0].detail,/2026-10-25/);
 const legacy=structuredClone(queued);delete legacy.notices[0].detail;delete legacy.notices[0].kind;delete legacy.notices[0].readAt;
 assert.match(supplierInbox(legacy,"s").notifications[0].detail,/Confirm the provinces/);
 assert.equal(supplierInbox(legacy,"s").notifications[0].detail.includes("Sign in"),false);
});
