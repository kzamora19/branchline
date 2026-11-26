import {createRetentionHandler} from "../../supabase/functions/branchline-retention/handler.ts";
import {signRetention} from "../../supabase/functions/_shared/retention-envelope.mjs";
import assert from "node:assert/strict";
const secret="synthetic-only-signature-secret-123456789",project="fixture-project",actorId="00000000-0000-0000-0000-000000000001";
const seen=new Set<string>();let mutations=0;
const handler=createRetentionHandler({project,getEnv:n=>n==="BRANCHLINE_RETENTION_RELAY_SECRET"?secret:undefined,createAdmin:()=>({rpc:async(name:string,args:Record<string,unknown>)=>{
 if(name==="branchline_retention_consume_request"){const id=String(args.p_request_id);if(seen.has(id))return {data:false};seen.add(id);return {data:true};}
 if(name==="branchline_storage_review")return {data:{scope:project,policy:{enabled:false}}};
 if(name==="branchline_retention_notices")return {data:[]};
 if(name==="branchline_retention_configure"){mutations++;return {data:null};}
 if(name==="branchline_retention_candidates")return {data:[]};
 throw Error("Unexpected RPC: "+name);
}})});
async function req(action:string,params:Record<string,unknown>={},opts:{target?:string;stamp?:string;signature?:string;origin?:string;requestId?:string;key?:string}={}){
 const body=JSON.stringify({...params,actorId,action,requestId:opts.requestId??crypto.randomUUID()}),time=opts.stamp??String(Date.now());
 const headers:Record<string,string>={"Content-Type":"application/json","x-branchline-retention-time":time,"x-branchline-retention-signature":opts.signature??await signRetention(opts.key??secret,opts.target??project,time,body)};
 if(opts.origin)headers.Origin=opts.origin;
 return await handler(new Request("http://127.0.0.1/retention",{method:"POST",headers,body}));
}
Deno.test("signed read and dry-run reach the local gateway; invalid targets and unsigned browsers fail closed",async()=>{
 assert.equal((await req("overview")).status,200);
 assert.equal((await req("cleanup",{dryRun:true})).status,200);
 assert.equal((await req("overview",{},{target:"wrong-project"})).status,403);
 assert.equal((await req("overview",{},{key:"x".repeat(40)})).status,403);
 assert.equal((await req("overview",{},{stamp:String(Date.now()-70000)})).status,403);
 assert.equal((await req("overview",{},{signature:"0".repeat(64)})).status,403);
 assert.equal((await req("overview",{},{origin:"https://untrusted.invalid"})).status,403);
 assert.equal((await req("cleanup",{dryRun:false,confirmed:true})).status,403);
});
Deno.test("signed mutation is accepted once and replayed nonce cannot change state",async()=>{
 const requestId=crypto.randomUUID(),params={days:60,enabled:false,confirmed:true};
 assert.equal((await req("configure",params,{requestId})).status,200);
 assert.equal((await req("configure",params,{requestId})).status,409);
 assert.equal(mutations,1);
});
