import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync,readdirSync,existsSync} from "node:fs";
import {resolve,join} from "node:path";
import {fileURLToPath} from "node:url";
const branchline=resolve(fileURLToPath(new URL("../",import.meta.url)));
const appsRoot=resolve(branchline,"..");
const pathMap={
 ptg:join(appsRoot,"first-megasaver-ptg"),
 frame:join(appsRoot,"megaframe-studio"),
 flyer:join(appsRoot,"flyer-studio")
};
const read=(root,path)=>readFileSync(join(root,path),"utf8");
const catalog=read(branchline,"branchline-applications.js");
const ptg=read(pathMap.ptg,"app/studios/page.tsx");
const mobile=read(pathMap.ptg,"app/workspace/mobile/workspace.tsx");
const ptgIssuer=read(pathMap.ptg,"supabase/functions/ptg-studio-access/index.ts");
const studioCases=[
 {id:"megaframe",app:"megaframe-studio",name:"MegaFrame Studio",
  dir:pathMap.frame,cutover:"staging/.cross-repo-cutover",
  function:"supabase/functions/megaframe-editor-delivery/index.ts",
  expectedRef:"vmyoxoiygfcecgkbavgg"},
 {id:"flyer",app:"flyer-studio",name:"MegaFlyer Studio",
  dir:pathMap.flyer,cutover:"staging/.cross-repo-cutover",
  function:"supabase/functions/flyer-editor-delivery/index.ts",
  expectedRef:"tzklsscoiwnmeantcefw"}
];
test("all four real app repositories were checked out on the integration branches",()=>{
 for(const path of [branchline,...Object.values(pathMap)]){
  assert.ok(existsSync(join(path,".git")),"Missing checked-out development repository: "+path);
 }
 assert.match(mobile,/name: "Sales Tracker"/);
 assert.match(mobile,/name: "Price Tag Generator"/);
 assert.match(mobile,/name: "MegaFrame Studio"/);
 assert.match(mobile,/name: "MegaFlyer Studio"/);
});
test("Branchline links and PTG client destinations agree exactly without forwarding credentials",()=>{
 for(const studio of studioCases){
  const hub="https://kzamora19.github.io/first-megasaver-ptg/studios/?studio="+studio.id;
  const launch="https://kzamora19.github.io/"+studio.app+"/studio/";
  assert.ok(catalog.includes(hub),"Branchline catalog missing "+studio.id+" selection");
  assert.ok(mobile.includes("/studios/?studio="+studio.id),"PTG mobile hub missing "+studio.id);
  assert.ok(ptg.includes("/"+studio.app+"/studio/"),"PTG issuer has no exact protected launch path");
  assert.match(ptg,/target\.pathname!==path/);
  assert.match(ptg,/ptg-studio-access/);
  assert.ok(!catalog.includes(launch),"Public Branchline hub must not link directly to an editor");
 }
 assert.doesNotMatch(catalog,/access_token|refresh_token|service_role|ptg_studio_ticket/);
});
test("each Studio cutover publishes a ticket-only loader, not a public editor",()=>{
 for(const studio of studioCases){
  const base=join(studio.dir,studio.cutover);
  assert.ok(existsSync(join(base,"index.html")),"Missing retirement notice "+studio.id);
  assert.deepEqual(readdirSync(join(base,"studio")).sort(),
    ["draft-vault.js","index.html","launch.js"]);
  const html=read(base,"studio/index.html");
  const script=read(base,"studio/launch.js");
  const vault=read(base,"studio/draft-vault.js");
  assert.ok(html.includes(studio.expectedRef+".supabase.co/functions/v1/"),
    "Studio launch config must contact its own existing Supabase project");
  assert.match(script,/ptg_studio_ticket/);
  assert.match(script,/SHA-256/);
  assert.match(vault,/AES-GCM/);
  assert.doesNotMatch(html,/PRIVATE .*EDITOR BUNDLE|id="photosInput"|id="quickSaveProject"|<canvas/);
  const retired=read(base,"index.html");
  assert.ok(retired.includes("first-megasaver-ptg/studios/"));
  assert.ok(!readdirSync(base).includes("editor.js"));
  assert.ok(!readdirSync(base).includes("site"));
 });
});
test("server-only verification bridges the two existing Supabase accounts, never client service keys",()=>{
 assert.match(ptgIssuer,/STUDIO_GRANT_LIFETIME_SECONDS/);
 assert.match(ptgIssuer,/validSourceSession/);
 assert.match(ptgIssuer,/allowedPtgStudioRole/);
 assert.match(ptgIssuer,/ptg_studio_reserve_issue_slot/);
 assert.match(ptgIssuer,/PTG_STUDIO_GATEWAY_SECRET/);
 for(const studio of studioCases){
  const source=read(studio.dir,studio.function);
  assert.match(source,/PTG_STUDIO_DEPLOYMENT_MODE/);
  assert.match(source,/PTG_STUDIO_GATEWAY_URL/);
  assert.match(source,/validPtgGatewayUrl/);
  assert.match(source,/validStudioBackendUrl/);
  assert.match(source,/STUDIO_GATEWAY_SECRET/);
  assert.match(source,/return !!PTG_VERIFY_URL &&/);
  assert.match(source,/admin\.storage\.from\(BUNDLE_BUCKET\)\.download\(BUNDLE_PATH\)/);
  assert.doesNotMatch(read(studio.dir,studio.cutover+"/studio/index.html"),/SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY|PTG_STUDIO_GATEWAY_SECRET/);
 }
});
