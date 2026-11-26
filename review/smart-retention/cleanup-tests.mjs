import {test} from "node:test";
import assert from "node:assert/strict";
import {runCleanup} from "../../supabase/functions/_shared/retention-cleanup.mjs";
const id="00000000-0000-0000-0000-000000000101",actor="00000000-0000-0000-0000-000000000001",token="00000000-0000-0000-0000-000000000099";
const bytes=new TextEncoder().encode("fixture");
const sha256=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes)),n=>n.toString(16).padStart(2,"0")).join("");
const path="originals/"+sha256+"/"+id+".xlsx";
function fake({hold=false,badPath=false,badHash=false,removeFails=false,stillExists=false,claimDenied=false}={}){
 const calls=[];const admin={rpc:async(name,p)=>{calls.push([name,p]);switch(name){case "branchline_retention_candidates":return {data:[{id}]};case "branchline_retention_claim":return {data:claimDenied?null:{id,token,sha256,path:badPath?"official-logo.png":path,bytes:bytes.length}};case "branchline_retention_revalidate":return {data:!hold};case "branchline_retention_finish":return {data:null};default:throw Error("Unexpected RPC");}},storage:{from:bucket=>{assert.equal(bucket,"branchline-retained-imports");return {download:async p=>{calls.push(["download",p]);return {data:new Blob([badHash?new Uint8Array(bytes.length):bytes])};},remove:async p=>{calls.push(["remove",p]);return {error:removeFails?new Error("failed"):null};},exists:async p=>{calls.push(["exists",p]);return {data:stillExists,error:null};}};}}};return {admin,calls};
}
const run=(f,dryRun=false)=>runCleanup({admin:f.admin,actorId:actor,dryRun});
test("dry run does not claim or delete",async()=>{const f=fake();const r=await run(f,true);assert.equal(r.candidates,1);assert.deepEqual(f.calls.map(x=>x[0]),["branchline_retention_candidates"]);});
test("verified object removed and absence checked before finalization",async()=>{const f=fake();const r=await run(f);assert.equal(r.deleted,1);assert.deepEqual(f.calls.map(x=>x[0]),["branchline_retention_candidates","branchline_retention_claim","download","branchline_retention_revalidate","remove","exists","branchline_retention_finish"]);assert.equal(f.calls.at(-1)[1].p_outcome,"deleted");});
for(const options of [{badPath:true},{badHash:true},{hold:true},{claimDenied:true},{removeFails:true},{stillExists:true}]){
 test("fail closed "+JSON.stringify(options),async()=>{const f=fake(options);const r=await run(f);assert.equal(r.deleted,0);if(options.badPath||options.badHash||options.hold||options.claimDenied)assert.ok(!f.calls.some(c=>c[0]==="remove"));if(!options.claimDenied)assert.notEqual(f.calls.at(-1)[1].p_outcome,"deleted");});
}
