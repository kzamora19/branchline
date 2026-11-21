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
    ["draft-vault.js","drive-backup.js","index.html","launch.js"]);
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
 }
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


test("MegaFlyer Smart Product Photos use PTG-gated private backend in both standalone and protected editors",()=>{
 const privateBuilder=read(pathMap.flyer,"scripts/build-private-flyer.mjs");
 const photoClient=read(pathMap.flyer,"site/product-photo-library.js");
 const photoBackend=read(pathMap.flyer,"supabase/functions/flyer-product-photos/index.ts");
 const migration=read(pathMap.flyer,"supabase/migrations/202611210001_smart_product_photos.sql");
 const publicPage=read(pathMap.flyer,"scripts/build-cutover-pages.mjs");
 const publicAdapter=read(pathMap.flyer,"site/product-photo-standalone.js");
 const toolbar=read(pathMap.flyer,"site/toolbar-tabs.js");
 assert.match(publicAdapter,/__MEGAFLYER_PRIVATE_DB__/);
 assert.match(publicAdapter,/__MEGAFLYER_PHOTO_RPC__/);
 assert.match(toolbar,/product-photo-standalone\.js/);
 assert.match(toolbar,/__MEGAFLYER_PRIVATE_DB__/);
 assert.match(privateBuilder,/product-photo-library\.js/);
 assert.match(privateBuilder,/product-photo-match\.js/);
 assert.doesNotMatch(publicPage,/product-photo-library\.js/);
 assert.match(photoClient,/Product Photo Library/);
 assert.match(photoBackend,/await identity\(req,body\)/);
 assert.match(photoBackend,/FLYER_PRODUCT_PHOTO_ALLOWED_ORIGIN/);
 assert.match(photoBackend,/agknxlowackphvwyvxge/);
 assert.match(photoBackend,/flyer-product-photos/);
 const p256Relay=read(pathMap.flyer,"staging/studio-access/launch.js");
 const frameRelay=read(pathMap.flyer,"staging/editor-storage-bridge.js");
 assert.match(photoBackend,/validSignedProof\(body.studioProof\)/);
 assert.match(photoBackend,/STUDIO_GATEWAY_URL/);
 assert.match(photoBackend,/STUDIO_GATEWAY_SECRET/);
 assert.match(p256Relay,/studioProof:/);
 assert.match(p256Relay,/proofQueue/);
 assert.doesNotMatch(p256Relay,/Authorization:'Bearer '\+message.token/);
 assert.doesNotMatch(frameRelay,/token:account.token/);
 assert.match(ptgIssuer,/actorId:record.user_id/);
 assert.match(ptgIssuer,/canManage:active.profile.role_key/);
 assert.match(migration,/enable row level security/);
 assert.match(migration,/flyer_product_photo_audit/);
 assert.match(read(pathMap.flyer,"supabase/config.toml"),/\[functions\.flyer-product-photos\]/);
 assert.ok(!readdirSync(join(pathMap.flyer,"staging/.cross-repo-cutover/studio")).includes("product-photo-library.js"));
});


test("MegaFrame v2.7 startup and recovery remain encrypted inside the protected integration",()=>{
 const editor=read(pathMap.frame,"editor.js");
 const builder=read(pathMap.frame,"staging/build-private-package.mjs");
 const launcher=read(pathMap.frame,"staging/studio-access/launch.js");
 const vault=read(pathMap.frame,"staging/studio-access/draft-vault.js");
 assert.match(editor,/startupChoiceDialog/);
 assert.match(editor,/async function beginNewProject\(/);
 assert.match(editor,/async function initializeDraftRecovery\(/);
 assert.match(editor,/function recoveryArchiveId\(draft\)/);
 assert.match(editor,/async function deleteLinkedRecovery\(id\)/);
 assert.match(builder,/recoveryHelpers/);
 assert.match(builder,/function recoveryArchiveId\(draft\)/);
 assert.match(builder,/async function deleteLinkedRecovery\(id\)/);
 assert.match(builder,/__MEGAFRAME_PRIVATE_DRAFT__/);
 assert.match(vault,/validProjectId/);
 assert.match(vault,/recovery_/);
 assert.match(vault,/AES-GCM/);
 assert.match(launcher,/allow-scripts allow-downloads allow-modals/);
 assert.doesNotMatch(launcher,/frame\.sandbox\s*=\s*["'][^"'\n]*allow-same-origin/);
});

test("current live MegaFlyer wording and both app cutover release gates survive branch reconciliation",()=>{
 const flyerHtml=read(pathMap.flyer,"site/index.html");
 assert.match(flyerHtml,/<h1>MegaFlyer Studio<\/h1>/);
 assert.match(flyerHtml,/Flyer Status: Draft/);
 assert.match(flyerHtml,/aria-label="Flyer status: Draft"/);
 for(const item of [
  {dir:pathMap.frame,variable:"MEGAFRAME_CUTOVER_APPROVED"},
  {dir:pathMap.flyer,variable:"MEGAFLYER_CUTOVER_APPROVED"}
 ]){
  const workflow=read(item.dir,".github/workflows/pages.yml");
  assert.ok(workflow.includes(item.variable),
    "No unattended public editor cutover is permitted for "+item.variable);
  assert.match(workflow,/github\.event_name == 'workflow_dispatch'/);
  assert.match(workflow,/refs\/heads\/main/);
 }
 // Latest standalone Smart Photo tests and its CI must not disappear when
 // the older protected Studio development branch merges the live release.
 assert.ok(existsSync(join(pathMap.flyer,".github/workflows/megaflyer-photo-release-ci.yml")));
 assert.ok(existsSync(join(pathMap.flyer,"tests/megaflyer-smart-photo-release.cjs")));
 assert.ok(existsSync(join(pathMap.flyer,"site/product-photo-standalone.js")));
});


test("PTG protected Pages portal cannot publish ahead of synchronized Studio cutover",()=>{
 const workflow=read(pathMap.ptg,".github/workflows/deploy-pages.yml");
 assert.ok(workflow.includes("workflow_dispatch:"),"Owner release must be manually triggered");
 const deploy=workflow.split("\n  deploy:\n")[1];
 assert.ok(deploy && deploy.includes("github.event_name == 'workflow_dispatch'") &&
   deploy.includes("refs/heads/migration/github-pages") &&
   deploy.includes("vars.PTG_STUDIOS_CUTOVER_APPROVED == 'true'"),
   "PTG Pages release must require explicit owner approval");
 for(const [varName,studioPath] of [
   ["NEXT_PUBLIC_STUDIO_MEGAFRAME_LAUNCH_URL","megaframe-studio/studio/"],
   ["NEXT_PUBLIC_STUDIO_FLYER_LAUNCH_URL","flyer-studio/studio/"]
 ]){
   const row=workflow.split("\n").find(x=>x.trim().startsWith(varName+":"));
   assert.ok(row && row.includes(studioPath) &&
     row.includes("PTG_STUDIOS_CUTOVER_APPROVED") &&
     row.includes("workflow_dispatch"),
     "Protected launcher for "+varName+" must not be published on routine pushes");
 }
});


test("latest live MegaFrame and MegaFlyer editor interfaces survive private packaging",()=>{
 const frameHtml=read(pathMap.frame,"index.html");
 const frameBuilder=read(pathMap.frame,"staging/build-private-package.mjs");
 const frameSource=read(pathMap.frame,"editor.js");
 const frameSidebar=read(pathMap.frame,"chat-sidebar.js");
 const frameOverlay=read(pathMap.frame,"overlay-engine.js");
 assert.match(frameHtml,/src="\.\/overlay-engine\.js"/);
 assert.match(frameHtml,/src="\.\/chat-sidebar\.js\?v=/);
 assert.match(frameHtml,/href="\.\/chat-sidebar\.css\?v=/);
 assert.match(frameBuilder,/"overlay-engine\.js"/);
 assert.match(frameBuilder,/"chat-sidebar\.js"/);
 assert.match(frameBuilder,/chat-sidebar\.css/);
 assert.match(frameBuilder,/versioned|resource|static-loader-1/);
 assert.match(frameSidebar,/Captions & Overlays/);
 assert.match(frameOverlay,/OVERLAY_FONT_GROUPS/);
 assert.match(frameOverlay,/overlayDrawLayers/);
 assert.match(frameSource,/startupChoiceDialog/);
 // The standalone production app now includes overlay/font/mobile regression tests.
 for(const name of ["qa/smoke-overlays.cjs","qa/smoke-multiple-overlays.cjs",
  "qa/smoke-font-picker.cjs","qa/smoke-editable-slider-values.cjs",
  "qa/smoke-mobile-panels.cjs","qa/smoke-right-rail-reload.cjs"]){
   assert.ok(existsSync(join(pathMap.frame,name)),name+" must survive integration");
 }
 const flyerBuilder=read(pathMap.flyer,"scripts/build-private-flyer.mjs");
 const flyerPanel=read(pathMap.flyer,"site/floating-panels.js");
 const flyerSidebar=read(pathMap.flyer,"site/chat-sidebar.js");
 const flyerTest=read(pathMap.flyer,"tests/megaflyer-browser-ui.mjs");
 assert.match(flyerPanel,/chat-sidebar\.js/);
 assert.match(flyerBuilder,/chat-sidebar\.js/);
 assert.match(flyerBuilder,/chat-sidebar\.css/);
 assert.match(flyerBuilder,/latest ChatGPT-style two-level sidebar/);
 assert.match(flyerSidebar,/chatMobileClosed/);
 assert.match(flyerTest,/studioChatHeader/);
 assert.match(flyerTest,/second sidebar|sidebarSizes/i);
 const branchAuth=read(branchline,"auth-app.js");
 assert.match(branchAuth,/data-ps-review-person/);
 assert.match(branchAuth,/data-review-ps-day/);
 const branchTests=read(branchline,"tests/applications.test.mjs");
 assert.match(branchTests,/PS assist drilldown values/);
 assert.match(read(branchline,"index.html"),/auth-app\.js\?v=ps-assist-review-20261121/);
});

test("PTG-account cloud backups span both Studios without a fifth Supabase project",()=>{
 const access=read(pathMap.ptg,"supabase/functions/ptg-studio-access/index.ts");
 const schema=read(pathMap.ptg,"supabase/migrations/20261121212700_ptg_studio_cloud_backups.sql");
 const policy=read(pathMap.ptg,"supabase/functions/_shared/studio-cloud-policy.mjs");
 const cloudSuite=read(pathMap.ptg,"tests/studio-edge-http-acceptance.mjs");
 assert.match(access,/async function cloud\(/);
 assert.match(access,/ptg_studio_cloud_backups/);
 assert.match(access,/ptg_studio_cloud_write/);
 assert.match(access,/const proven=await prove\(request,body\)/);
 assert.match(access,/actor=authority\.actorId/);
 assert.match(schema,/owner_ptg_id uuid not null references auth\.users/);
 assert.match(schema,/enable row level security/);
 assert.match(schema,/revoke all on public\.ptg_studio_cloud_backups from public, anon, authenticated/);
 assert.match(schema,/security invoker/);
 assert.match(schema,/p_expected_version/);
 assert.match(policy,/STUDIO_CLOUD_CIPHERTEXT_LIMIT/);
 assert.match(policy,/cloudKeyAllowed/);
 assert.match(cloudSuite,/Different PTG actor cannot read another user's archive/);
 for(const studio of studioCases){
  const edge=read(studio.dir,studio.function);
  const vault=read(studio.dir,"staging/studio-access/draft-vault.js");
  const script=read(studio.dir,"staging/studio-access/launch.js");
  const launcher=read(studio.dir,"staging/studio-access/index.html");
  assert.match(edge,/body\.action==="cloud"/);
  assert.match(edge,/["']cloud["']/);
  assert.match(edge,/sessionId:verified\.sessionId|sessionId:auth\.sessionId/);
  assert.doesNotMatch(edge,/actorId:verified\.actorId|actorId:auth\.actorId/);
  assert.match(vault,/AES-GCM-v1/);
  assert.match(vault,/cloudExport|cloud-export/);
  assert.match(vault,/cloudImport|cloud-import/);
  assert.match(script,/cloudOperation/);
  assert.match(script,/expectedVersion/);
  assert.match(script,/window\.confirm/);
  assert.match(launcher,/id="cloudPanel"/);
  assert.match(launcher,/id="cloudBackup"/);
  assert.match(launcher,/id="cloudRestore"/);
  assert.match(read(studio.dir,studio.id==="flyer"?"tests/cloud-launcher-browser.test.mjs":
   "staging/cloud-launcher-browser.test.mjs"),/P-256/);
 }
 // The source retains four current backends and does not ask for a new project.
 const plan=read(branchline,"docs/branchline-four-app-two-account-integration-20261121.md");
 assert.match(plan,/four already existing, active Supabase projects/);
 assert.doesNotMatch(plan,/create a fifth Supabase project|add a paid staging project/i);
});

test("manual Google Drive backup remains PTG-gated, opt-in and encrypted for both Studios",()=>{
 for(const studio of studioCases){
  const drive=read(studio.dir,"staging/studio-access/drive-backup.js");
  const launcher=read(studio.dir,"staging/studio-access/index.html");
  const source=read(studio.dir,"staging/studio-access/launch.js");
  const vault=read(studio.dir,"staging/studio-access/draft-vault.js");
  const builder=read(studio.dir,studio.id==="megaframe"?
   "staging/build-cutover-pages.mjs":"scripts/build-cutover-pages.mjs");
  assert.match(drive,/https:\/\/www\.googleapis\.com\/drive\/v3\/files/);
  assert.match(drive,/https:\/\/www\.googleapis\.com\/auth\/drive\.file/);
  assert.match(drive,/BranchlineStudioDriveBackupV1/);
  assert.match(drive,/uploadType=resumable/);
  assert.match(drive,/await context\.verify\(\)/);
  assert.match(drive,/ownerScope/);
  assert.match(drive,/window\.confirm/);
  assert.doesNotMatch(drive,/localStorage|sessionStorage|service_role|allow-same-origin/);
  assert.match(source,/BRANCHLINE_GOOGLE_DRIVE_BACKUP\.setup/);
  assert.match(source,/BRANCHLINE_GOOGLE_DRIVE_BACKUP\?\.lock/);
  assert.match(launcher,/id="drivePanel"/);
  assert.match(launcher,/id="driveConnect"/);
  assert.match(launcher,/id="driveBackup"/);
  assert.match(launcher,/id="driveRestore"/);
  assert.match(launcher,/drive-backup\.js/);
  assert.match(builder,/drive-backup\.js/);
  assert.match(vault,/options\.drive===true\?145_000_000:1_200_000/);
  assert.doesNotMatch(read(studio.dir,studio.cutover+"/studio/index.html"),
   /CLIENT_SECRET|GOOGLE_DRIVE_REFRESH_TOKEN|PTG_STUDIO_DRAFT_RECOVERY_SECRET/);
 }
});
