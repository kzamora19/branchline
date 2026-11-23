import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
const root=resolve("..");
const file=(repo,path)=>readFileSync(resolve(root,repo,path));
const src=(repo,path)=>file(repo,path).toString("utf8");
const branch="branchline",ptg="first-megasaver-ptg",frame="megaframe-studio",flyer="flyer-studio";
const ids=["price-tag-generator","sales-tracker","megaframe-studio","flyer-studio"];
const dig=buf=>createHash("sha256").update(buf).digest("hex");

test("all four navigations ship the exact same authoritative R1 image bytes",()=>{
 const logo=[
   file(branch,"icons/official/branchline.png"),
   file(ptg,"public/icons/official/branchline.png"),
   file(frame,"staging/studio-access/official/branchline.png"),
   file(flyer,"staging/studio-access/official/branchline.png")];
 const icons=[
   file(branch,"icons/official/four-apps.png"),
   file(ptg,"public/icons/official/four-apps.png"),
   file(frame,"staging/studio-access/official/four-apps.png"),
   file(flyer,"staging/studio-access/official/four-apps.png")];
 for(const items of [logo,icons]){
   assert.ok(items[0].subarray(0,8).equals(Buffer.from("89504e470d0a1a0a","hex")));
   assert.equal(new Set(items.map(dig)).size,1,"Only approved R1 icon artwork may be used");
 }
});

test("PTG protected Studio URLs and role policies remain the only Studio choices",()=>{
 const layout=src(ptg,"components/workspace-layout.tsx");
 for(const id of ids)assert.ok(layout.includes('id:"'+id+'"'),"Missing app: "+id);
 assert.match(layout,/withBasePath\("\/studios\/\?studio=megaframe"\)/);
 assert.match(layout,/withBasePath\("\/studios\/\?studio=flyer"\)/);
 assert.match(layout,/ClientSessionGate watchAvailability/);
 assert.match(layout,/session => <Suspense fallback=\{null\}><WorkspaceFrame session=\{session\}/);
 assert.match(layout,/ptg-official-mobile-logo/);
 assert.match(layout,/ptg-menu-toggle/);
 assert.match(layout,/setAppMenuOpen\(false\);setOpenOnPath/);
 assert.doesNotMatch(layout,/access_token|refresh_token|ptg_studio_ticket/);
 const nav=src(ptg,"components/workspace-nav.tsx");
 assert.match(nav,/studiosAllowed=system\|\|role==="BRANCH_ADMIN"/);
 assert.match(nav,/legacyRole\.trim\(\)\.toUpperCase\(\)==="TEAM LEADER"/);
});

test("branchline app list is logo-controlled while Sales Tracker retains its own workspace hamburger",()=>{
 const rail=src(branch,"branchline-app-rail.js");
 const html=src(branch,"index.html");
 const css=src(branch,"branchline-app-rail.css");
 for(const id of ids)assert.ok(rail.includes('"'+id+'"'));
 assert.match(rail,/makeLogoButton/);
 assert.match(rail,/setAttribute\("aria-controls", drawerId\)/);
 assert.match(rail,/bl-mobile-brand/);
 assert.doesNotMatch(rail,/bl-app-switcher/);
 assert.match(html,/id="connected-menu"/);
 assert.match(html,/id="mobile-menu"/);
 assert.match(css,/\.bl-app-rail/);
 assert.match(rail,/\.connected-sidebar, \.sidebar/);
 assert.doesNotMatch(rail,/ptg_studio_ticket|refresh_token/);
});

test("the Studio rail is outside the opaque protected iframe and has no direct public editor links",()=>{
 for(const [repo,kind,builder] of [
   [frame,"megaframe","staging/build-cutover-pages.mjs"],
   [flyer,"flyer","scripts/build-cutover-pages.mjs"]]){
  const html=src(repo,"staging/studio-access/index.html");
  const js=src(repo,"staging/studio-access/unified-navigation.js");
  const css=src(repo,"staging/studio-access/unified-navigation.css");
  const packageSource=src(repo,builder);
  assert.match(html,new RegExp('data-bl-studio="'+kind+'"'));
  assert.match(html,/unified-navigation\.js/);
  assert.match(js,/const BRAND_SRC/);
  assert.match(js,/bl-protected-app-rail/);
  assert.match(js,/bl-protected-mobile-brand/);
  assert.match(js,/\/first-megasaver-ptg\/studios\/\?studio=megaframe/);
  assert.match(js,/\/first-megasaver-ptg\/studios\/\?studio=flyer/);
  assert.match(js,/\[ "megaframe","flyer" \]|\["megaframe","flyer"\]/);
  assert.match(css,/background:transparent/);
  assert.match(packageSource,/bundledLauncher/);
  assert.match(packageSource,/unified-navigation\.css/);
  assert.match(packageSource,/unified-navigation\.js/);
  assert.doesNotMatch(js,/access_token|refresh_token|service_role|supabaseKey/);
  assert.doesNotMatch(html,/<canvas|id="quickSaveProject"|id="photosInput"/);
 }
});
