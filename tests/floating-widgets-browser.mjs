import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {chromium} from "playwright";
const origin="https://kzamora19.github.io",running=2026112416;
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const fixture='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="20" fill="#2460bc"/></svg>';
const assets=Object.fromEntries(["assistant","announcements","guide"].map(k=>[k,"/branchline/widgets/assets/"+k+".svg"]));
const browser=await chromium.launch({headless:true});
try{
 for(const viewport of [{width:1280,height:800},{width:390,height:844}]){
  const context=await browser.newContext({viewport,serviceWorkers:"block"});
  let sequence=running,checks=0;
  await context.route("**/*",route=>{
   const url=new URL(route.request().url()),path=url.pathname;
   assert.equal(url.origin,origin);
   if(path==="/branchline/")return route.fulfill({contentType:"text/html",body:'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/branchline/updates/check.css"><link rel="stylesheet" href="/branchline/widgets/floating-widgets.css"><div id="connected-shell"><header class="connected-topbar">Header</header></div><textarea aria-label="Draft"></textarea><script defer src="/branchline/updates/check.js" data-sequence="'+running+'"></script><script defer src="/branchline/widgets/floating-widgets.js"></script>'});
   if(path.endsWith("release.json")){checks++;return route.fulfill({json:{schema:1,channel:"production",app:"sales",sequence}});}
   if(path.endsWith("index.json"))return route.fulfill({json:{schema:1,channel:"production",workspaceVersion:"fixture",modules:[{app:"sales",sequence}]}});
   if(path.includes("/assets/"))return route.fulfill({contentType:"image/svg+xml",body:fixture});
   if(path.endsWith(".js")||path.endsWith(".css"))return route.fulfill({contentType:path.endsWith(".js")?"application/javascript":"text/css",body:read(path.replace("/branchline/",""))});
   return route.fulfill({status:404,body:""});
  });
  const page=await context.newPage(),errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.goto(origin+"/branchline/");
  await page.waitForFunction(()=>window.BranchlineReleaseUpdates&&window.BranchlineFloatingWidgets);
  await page.waitForFunction(()=>!document.querySelector("#bl-update-dropdown button").disabled);
  assert.equal(checks,1);
  await page.evaluate(assets=>{
   window.originalBell=document.querySelector(".bl-update-bell");
   window.opened=[];
   window.widget=window.BranchlineFloatingWidgets.mount({assets,releaseUpdates:window.BranchlineReleaseUpdates,onOpen:key=>opened.push(key)});
  },assets);
  assert.equal(await page.locator(".bl-update-bell").count(),1);
  assert.equal(await page.locator(".bl-widget-announcements").count(),0);
  assert.equal(await page.evaluate(()=>originalBell===document.querySelector(".bl-update-bell")),true);
  assert.equal(await page.locator(".bl-widget-release-slot #bl-release-check").count(),1);
  if(viewport.width<640)await page.getByRole("button",{name:"Show widgets"}).click();
  await page.getByRole("button",{name:"Software update notifications"}).click();
  await page.getByRole("button",{name:"Check for updates"}).waitFor();
  sequence=running+1;
  await page.getByRole("button",{name:"Check for updates"}).click();
  await page.locator(".bl-update-bell.has-update").waitFor();
  await page.waitForFunction(()=>document.querySelector(".bl-update-bell").dataset.unreadCount==="1");
  assert.equal(await page.locator(".bl-update-bell").evaluate(b=>getComputedStyle(b,":after").content),'"1"');
  assert.equal(checks,2);
  await page.getByRole("button",{name:"Branchline Guide"}).click();
  assert.equal(await page.locator("#bl-update-dropdown").isVisible(),false);
  assert.deepEqual(await page.evaluate(()=>opened),["guide"]);
  await page.evaluate(()=>widget.setBusy(true));
  assert.equal(await page.locator(".bl-update-bell").isVisible(),false);
  await page.evaluate(()=>widget.setBusy(false));
  assert.equal(await page.locator(".bl-update-bell").isVisible(),true);
  await page.evaluate(()=>widget.dispose());
  assert.equal(await page.locator("#bl-floating-widgets").count(),0);
  assert.equal(await page.locator(".bl-update-bell").count(),1);
  assert.equal(await page.evaluate(()=>originalBell===document.querySelector(".bl-update-bell")),true);
  assert.equal(await page.locator(".bl-update-bell svg").count(),1);
  assert.equal(await page.locator(".bl-release-floating").count(),0);
  assert.deepEqual(errors,[]);
  await context.close();
  console.log("PASS floating bell migration and restoration",viewport.width);
 }
}finally{await browser.close();}
