"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const read=p=>fs.readFileSync(path.join(__dirname,"..",p),"utf8");
const {inspect,restartPath}=require("../updates/check.js");
const release=JSON.parse(read("updates/release.json"));
test("monotonic production-only releases",()=>{
 const n=release.sequence;
 assert.equal(inspect(release,n),"current");
 assert.equal(inspect({...release,sequence:n+1},n),"available");
 for(const data of [null,{}, {...release,sequence:n-1}, {...release,channel:"staging"}, {...release,sequence:""+n}, {...release,sequence:0}])
  assert.equal(inspect(data,n),"invalid");
});
test("same established app routes only",()=>{
 assert.equal(restartPath("/branchline/apps/index.html"),"/branchline/apps/");
 assert.equal(restartPath("/branchline/index.html"),"/branchline/");
 assert.equal(restartPath("/first-megasaver-ptg/"),null);
 assert.equal(restartPath("/branchline/other/"),null);
});
test("existing manifest identity and routes unchanged; all release stamps match",()=>{
 const m=JSON.parse(read("manifest.webmanifest"));
 assert.equal(m.id,"./");assert.equal(m.start_url,"./apps/");assert.equal(m.scope,"./");
 for(const name of ["index.html","apps/index.html"]){
  const body=read(name);
  assert.ok(body.includes('data-sequence="'+release.sequence+'"'));
  assert.ok(body.includes('data-release-label="'+release.label+'"'));
  assert.ok(body.includes('src="/branchline/updates/check.js?v='+release.sequence+'"'));
  assert.ok(body.includes('href="/branchline/updates/check.css?v='+release.sequence+'"'));
 }
 const sw=read("sw.js");
 assert.ok(sw.includes('-web-'+release.sequence+'"'));
 assert.ok(sw.includes('"./updates/check.js?v='+release.sequence+'"'));
 assert.ok(sw.includes('"./updates/check.css?v='+release.sequence+'"'));
 assert.ok(!sw.includes('"./updates/release.json"'));
});
test("cache cleanup preserves other app caches",async()=>{
 const callbacks={},removed=[];
 const own=read("sw.js").match(/const CACHE_NAME = "([^"]+)"/)[1];
 const self={registration:{scope:"https://kzamora19.github.io/branchline/"},addEventListener:(n,cb)=>callbacks[n]=cb,clients:{claim:async()=>{assert.deepEqual(removed,["branchline-shell-v196"]);}}};
 const caches={keys:async()=>[own,"branchline-shell-v196","branchline-user-preferences","first-megasaver-ptg-shell-v2","megaframe-shell-fixture"],delete:async k=>{removed.push(k);return true;}};
 vm.runInNewContext(read("sw.js"),{self,caches,URL,Set,Promise});
 let done;callbacks.activate({waitUntil:p=>done=p});await done;
 assert.deepEqual(removed,["branchline-shell-v196"]);
});
