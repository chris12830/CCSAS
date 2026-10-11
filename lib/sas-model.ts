export type Country = "CA" | "US";
export type Audience = "owner" | "admin" | "staff";
export type Application = {
  id: string; name: string; short: string; domain: string; color: string;
  enabled: boolean; countries: Country[]; packages: string[]; audiences: Audience[];
  placements: string[]; integrationHash?: string; hasKey?: boolean; lastSeen?: string; hubIds?:string[];
};
export type Package = {id:string; name:string; description:string; maxApps:number; cad:number; usd:number; enabled:boolean; checkoutCad:string; checkoutUsd:string; billingInterval?:"monthly"|"annual"; royaltyBps?:number};
export type Supplier = {
  id:string; name:string; contact:string; email:string; website:string; category:string;
  countries:Country[]; status:"pending"|"approved"|"suspended"|"rejected"|"more_info_requested";
  accountStatus?:"active"|"hold"|"cancelled"|"deleted"; accountReason?:string; accountUpdatedAt?:string;
  sourceProject?:string; sourceSupplierId?:string;
  packageId:string; billingStatus:"unpaid"|"active"|"past_due"; paidUntil:string;
  currency:"CAD"|"USD"; sample:boolean; userId?:string;
  policyAcceptedAt:string; policyVersion:string; policyText:string; createdAt:string;
};
export type Campaign = {
  id:string; supplierId:string; name:string; text:string; url:string; country:Country;
  currency:"CAD"|"USD"; appIds:string[]; placement:string; region:string;
  status:"draft"|"review"|"published"|"paused"|"rejected";
  start:string; end:string; createdAt:string; sample:boolean;
  hubId?:string; tickerSpeed?:"normal"|"premium"; sourceProject?:string; sourceAdId?:string;
};
export type Payment = {id:string; supplierId:string; amount:number; currency:"CAD"|"USD"; reference:string; date:string; paidUntil:string; sample:boolean};
export type Activity = {id:string; text:string; date:string; sample?:boolean};
export type Network = {
  apps:Application[]; packages:Package[]; suppliers:Supplier[]; campaigns:Campaign[];
  payments:Payment[]; activity:Activity[];
  settings:{name:string; maxCopy:number; speed:number; paused:boolean; showSamples:boolean; policy:string;policyVersion:string};
};
export type Summary = {appId:string; impressions:number; clicks:number};
export const POLICY_VERSION="2026-10-05.1";
export const INITIAL_POLICY="Suppliers must provide accurate offers, clearly disclose prices, currency, availability and service regions, and honour advertised terms. Advertising requires approval and an active subscription. You may pause or cancel future advertising; refunds are reviewed according to the agreed purchase terms. Misleading or inappropriate content may be removed. Suppliers are responsible for their products, services and transactions with customers. Acceptance is recorded with the policy version and date.";
export const categories=["Educational supplies","Furniture & equipment","Training & consulting","Insurance","Food & nutrition","Software & services","Playgrounds","Cleaning & maintenance"];
export const placements=["Dashboard ticker","Resource hub ticker","Resource hub static"];
export function today(){return new Intl.DateTimeFormat("en-CA",{timeZone:"America/Toronto",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());}
export function initialNetwork():Network {
  const start=today(),end="2027-12-31",now=new Date().toISOString();
  const app=(id:string,name:string,short:string,domain:string,color:string,enabled=false):Application=>({id,name,short,domain,color,enabled,countries:["CA","US"],packages:["single","bundle","network"],audiences:["owner","admin"],placements:id==="owners"?[...placements]:[placements[0]]});
  const packages:Package[]=[
    {id:"single",name:"Single Application",description:"Build your presence in one selected app.",maxApps:1,cad:49,usd:39,enabled:true,checkoutCad:"",checkoutUsd:""},
    {id:"bundle",name:"Selected Applications",description:"Reach owners across up to three apps.",maxApps:3,cad:99,usd:79,enabled:true,checkoutCad:"",checkoutUsd:""},
    {id:"network",name:"Full Network",description:"Advertise in every participating app.",maxApps:99,cad:149,usd:119,enabled:true,checkoutCad:"",checkoutUsd:""},
  ];
  const supplier=(id:string,name:string,contact:string,email:string,category:string,countries:Country[],packageId:string,status:Supplier["status"]="approved"):Supplier=>({id,name,contact,email,website:"https://example.com",category,countries,status,packageId,billingStatus:"active",paidUntil:end,currency:countries[0]==="CA"?"CAD":"USD",sample:true,policyAcceptedAt:now,policyVersion:POLICY_VERSION,policyText:INITIAL_POLICY,createdAt:now});
  const campaign=(id:string,supplierId:string,name:string,text:string,country:Country,status:Campaign["status"]="published"):Campaign=>({id,supplierId,name,text,url:"https://example.com",country,currency:country==="CA"?"CAD":"USD",appIds:["owners","doctrain"],placement:placements[0],region:"",status,start,end,createdAt:now,sample:true});
  return {
    apps:[app("owners","Child Care Owners Network","ON","childcareownersnetwork.com","#5465d9",true),app("doctrain","Child Care Doc & Train","DT","childcaredoctrain.com","#12877a",true),app("registration","Child Care Registration","RG","childcareregistration.com","#dd814d"),app("invoice","Child Care Invoice","IN","childcareinvoice.com","#427daf"),app("checkin","Child Care Check In / Out","IO","childcarecheckinout.com","#9462b2"),app("cwelcc","CWELCC Help","CW","CWELCC Help","#248463"),app("clean","Child Care Clean","CL","Child Care Clean","#b55f87")],
    packages,
    suppliers:[supplier("sup-maple","Maple Learning Co.","Jordan Lee","jordan@maple.example","Educational supplies",["CA"],"bundle"),supplier("sup-bright","BrightStart Furnishings","Taylor Morgan","taylor@bright.example","Furniture & equipment",["CA","US"],"network"),supplier("sup-care","CareWise Training","Alex Parker","alex@carewise.example","Training & consulting",["US"],"bundle"),supplier("sup-play","PlaySpace Outdoors","Casey Brown","casey@playspace.example","Playgrounds",["CA","US"],"network","pending")],
    campaigns:[campaign("ad-maple","sup-maple","Fall learning essentials","Save 15% on classroom learning kits. Canada-wide delivery.","CA"),campaign("ad-bright-ca","sup-bright","Classroom refresh · Canada","Child care furniture bundles from CAD $499. Explore our range.","CA"),campaign("ad-care","sup-care","Staff training offer","First aid refresher courses from USD $59 per person.","US"),campaign("ad-bright-us","sup-bright","Classroom refresh · USA","Save 10% on classroom furniture. Shipping across the USA.","US"),campaign("ad-play","sup-play","Playground planning","Free playground planning consultation for child care owners.","CA","review")],
    payments:[],activity:[{id:"welcome",text:"Your advertising network is ready to configure.",date:now}],
    settings:{name:"SAS · Supplier Advertising System",maxCopy:100,speed:40,paused:false,showSamples:true,policy:INITIAL_POLICY,policyVersion:POLICY_VERSION},
  };
}
export function eligibleAds(state:Network,opts:{appId:string;country?:Country;audience?:Audience;placement?:string;region?:string;hubId?:string;preview?:boolean;date?:string}):Campaign[]{
  const date=opts.date??today(),app=state.apps.find(a=>a.id===opts.appId);
  if(!app?.enabled||state.settings.paused||!app.audiences.includes(opts.audience??"owner"))return [];
  const placement=opts.placement??placements[0]; if(!app.placements.includes(placement))return [];
  return state.campaigns.filter(c=>{
    const s=state.suppliers.find(s=>s.id===c.supplierId),p=state.packages.find(p=>p.id===s?.packageId);
    if(!s||!p?.enabled||s.status!=="approved"||(s.accountStatus??"active")!=="active"||s.billingStatus!=="active"||!s.paidUntil||s.paidUntil<date)return false;
    if(c.status!=="published"||c.start>date||c.end<date||c.placement!==placement||(p.maxApps<99&&!c.appIds.includes(app.id)))return false;
    if(c.appIds.length>p.maxApps)return false;
    if(c.hubId&&(c.hubId!==opts.hubId||!c.appIds.includes(app.id)))return false;
    if(!app.packages.includes(p.id)||!app.countries.includes(c.country)||!s.countries.includes(c.country))return false;
    if(opts.country&&c.country!==opts.country)return false;
    if(c.region&&c.region.toLowerCase()!==opts.region?.toLowerCase())return false;
    if((c.sample||s.sample)&&!opts.preview)return false; return true;
  });
}
export function deliveryAd(c:Campaign,state:Network){const supplier=state.suppliers.find(s=>s.id===c.supplierId);return {id:c.id,supplierId:c.supplierId,supplier:supplier?.name??"Supplier",category:supplier?.category??"",name:c.name,text:c.text,url:c.url,country:c.country,currency:c.currency,placement:c.placement,hubId:c.hubId??"",tickerSpeed:c.tickerSpeed??"normal",sourceProject:c.sourceProject??"",sourceAdId:c.sourceAdId??"",sourceSupplierId:supplier?.sourceSupplierId??"",sample:c.sample};}
export function publicState(state:Network):Network{return {...state,apps:state.apps.map(({integrationHash,...app})=>({...app,hasKey:!!integrationHash}))};}
