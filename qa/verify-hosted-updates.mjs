import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const origin="https://kzamora19.github.io";
const registry=JSON.parse(readFileSync(new URL("../updates/index.json",import.meta.url),"utf8"));
assert.equal(registry.schema,1);assert.equal(registry.channel,"production");
assert.deepEqual(registry.modules.map(m=>m.app),["sales","ptg","megaframe","flyer"]);
async function fetchText(path){
 const url=new URL(path,origin);
 assert.equal(url.origin,origin);assert.equal(url.username,"");assert.equal(url.password,"");
 assert.equal(url.hash,"");
 const response=await fetch(url,{redirect:"error",cache:"no-store",credentials:"omit",signal:AbortSignal.timeout(20000)});
 assert.equal(response.status,200,path+" not published");
 return await response.text();
}
async function verify(){
 for(const m of registry.modules){
  const r=JSON.parse(await fetchText(m.manifest));
  assert.equal(r.schema,1);assert.equal(r.channel,"production");assert.equal(r.app,m.app);
  assert.ok(Number.isSafeInteger(r.sequence)&&r.sequence>0);
  assert.ok(typeof r.label==="string"&&r.label.length>0);
  const asset=m.manifest.replace(/release[.]json$/,"check.js");
  const js=await fetchText(asset+"?v="+r.sequence);
  assert.ok(js.includes('manifest.app!=="'+m.app+'"'),"Module scope missing");
  assert.ok(js.includes("I saved my work"),"Save confirmation missing");
  assert.ok(js.includes('https://kzamora19.github.io'),"Wrong origin");
  for(const path of m.entries){
   const body=await fetchText(path);
   if(m.stamp==="meta"){
    assert.ok(body.includes('name="branchline-web-release" content="'+r.sequence+'"'),path+" metadata not current");
   }else{
    assert.ok(body.includes('data-sequence="'+r.sequence+'"'),path+" stamp mismatch");
    assert.ok(body.includes('src="'+asset+'?v='+r.sequence+'"'),path+" script mismatch");
   }
  }
  console.log("PASS",m.app,r.sequence,r.label);
 }
 const remote=JSON.parse(await fetchText("/branchline/updates/index.json"));
 assert.deepEqual(remote,registry,"Central registry differs");
}
for(let attempt=1;;attempt++){
 try{await verify();break;}
 catch(error){if(attempt>=5)throw error;console.log("Hosted verification attempt",attempt,"not yet coherent:",error.message);await new Promise(r=>setTimeout(r,10000));}
}
