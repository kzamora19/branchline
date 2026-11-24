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
test("existing manifest identity and start URL unchanged; shared-origin scope and release stamps match",()=>{
 const m=JSON.parse(read("manifest.webmanifest"));
 assert.equal(m.id,"./");assert.equal(m.start_url,"./apps/");assert.equal(m.scope,"/");assert.equal(m.display,"standalone");
 const manifestURL="https://kzamora19.github.io/branchline/manifest.webmanifest";
 const scope=new URL(m.scope,manifestURL);
 const catalogWindow={};vm.runInNewContext(read("branchline-applications.js"),{window:catalogWindow,URL});
 for(const app of catalogWindow.BranchlineApplications.list){
  const target=new URL(app.url||"/branchline/",manifestURL);
  assert.equal(target.origin,scope.origin);
  assert.ok(target.pathname.startsWith(scope.pathname));
 }
 assert.deepEqual(m.icons,[
   {src:"icons/r6/Approved.branchline.png?v=r6-install-20261124-11",sizes:"360x360",type:"image/png",purpose:"any"},
   ...[192,512].map(size=>({src:"icons/r6/Approved.branchline-"+size+".png",sizes:size+"x"+size,type:"image/png",purpose:"any"}))
 ]);
 for(const size of [192,512]){
   const png=require("node:fs").readFileSync("icons/r6/Approved.branchline-"+size+".png");
   assert.equal(png.readUInt32BE(16),size);
   assert.equal(png.readUInt32BE(20),size);
 }
 const png=fs.readFileSync(path.join(__dirname,"..",m.icons[0].src.split("?")[0]));
 assert.equal(png.readUInt32BE(16),360);assert.equal(png.readUInt32BE(20),360);
 for(const p of ["index.html","apps/index.html","install.html","oauth-consent.html"])assert.ok(read(p).includes("icons/r6/Approved.branchline.png?v=r6-install-20261124-11"),p);
 assert.ok(read("sw.js").includes("./icons/r6/Approved.branchline.png?v=r6-install-20261124-11"));
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

test("central production release registry contains four existing same-origin modules",()=>{
 const r=JSON.parse(read("updates/index.json"));
 assert.equal(r.channel,"production");
 assert.deepEqual(r.modules.map(m=>m.app),["sales","ptg","megaframe","flyer"]);
 for(const m of r.modules){assert.ok(m.manifest.startsWith("/")&&!m.manifest.startsWith("//"));assert.ok(m.entries.length>0);}
});
