import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {chromium} from "playwright";
const [module,dir,prefix,entry]=process.argv.slice(2);
const origin="https://kzamora19.github.io",running=2026112416;
const read=p=>readFileSync(new URL("../"+dir+"/"+p,import.meta.url));
const browser=await chromium.launch({headless:true});
try{
 for(const viewport of [{width:1280,height:800},{width:390,height:844}]){
  const context=await browser.newContext({viewport,serviceWorkers:"block"});let sequence=running,checks=0;
  const studio=module!=="ptg";
  await context.route("**/*",route=>{
   const u=new URL(route.request().url()),p=u.pathname;
   assert.equal(u.origin,origin);
   if(p===prefix+entry)return route.fulfill({contentType:"text/html",body:'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="'+prefix+'/updates/check.css">'+(studio?'<main><div id="mount"></div></main>':'<main class="ptg-unified-host"><div class="ptg-sidebar-header">PTG</div></main>')+'<textarea aria-label="Draft"></textarea><script defer src="'+prefix+'/updates/check.js" data-sequence="'+running+'"></script>'});
   if(p.endsWith("/updates/release.json")){checks++;return route.fulfill({json:{schema:1,channel:"production",app:module,sequence}});}
   if(p.endsWith("/updates/index.json"))return route.fulfill({json:{schema:1,channel:"production",workspaceVersion:"fixture",modules:[{app:module,sequence}]}});
   if(p.startsWith(prefix+"/")&&/\.(js|css|svg|webp)$/.test(p)){
    const ext=p.split(".").pop(),type={js:"application/javascript",css:"text/css",svg:"image/svg+xml",webp:"image/webp"}[ext];
    try{return route.fulfill({contentType:type,body:read(p.slice(prefix.length+1))});}catch{return route.fulfill({status:404});}
   }
   return route.fulfill({status:404,body:""});
  });
  const page=await context.newPage();const errors=[];page.on("pageerror",e=>errors.push(e.message));
  if(viewport.width===1280)await page.addInitScript(()=>{window.chrome=window.chrome||{};window.chrome.webview={};});
  await page.goto(origin+prefix+entry);
  await page.waitForFunction(()=>window.BranchlineWidgetRuntime);
  await page.waitForFunction(()=>!document.querySelector("#bl-update-dropdown button").disabled);
  await page.evaluate(()=>{window.originalBell=document.querySelector(".bl-update-bell");});
  if(studio){assert.equal(await page.locator("#bl-floating-widgets").count(),0);await page.evaluate(()=>{const f=document.createElement("iframe");f.id="studio-editor-frame";f.setAttribute("sandbox","allow-scripts");f.srcdoc="<p>Authorized fixture</p>";document.querySelector("#mount").append(f);});}
  await page.locator("#bl-floating-widgets").waitFor();
  if(await page.getByRole("button",{name:"Show widgets"}).isVisible())await page.getByRole("button",{name:"Show widgets"}).click();
  await page.waitForFunction(()=>[...document.querySelectorAll("#bl-floating-widgets img")].length===3&&[...document.querySelectorAll("#bl-floating-widgets img")].every(i=>i.complete&&i.naturalWidth>0));
  assert.equal(await page.locator(".bl-update-bell").count(),1);
  assert.equal(await page.evaluate(()=>originalBell===document.querySelector(".bl-update-bell")),true);
  await page.getByRole("button",{name:"Branchline Guide"}).click();
  const panel=page.locator(".bl-help-panel");await panel.waitFor();
  assert.equal(await panel.getByRole("combobox").inputValue(),{ptg:"price-tag-generator",megaframe:"megaframe-studio",flyer:"flyer-studio"}[module]);
  await panel.getByRole("button",{name:"Close"}).click();
  await page.getByRole("button",{name:"Software update notifications"}).click();
  sequence=running+1;const before=checks;await page.getByRole("button",{name:"Check for updates"}).click();
  await page.locator(".bl-update-bell.has-update").waitFor();assert.equal(checks,before+1);
  await page.getByRole("button",{name:"Later"}).click();
  await page.evaluate(()=>document.documentElement.classList.add("bl-parent-bell"));
  await page.locator("#bl-floating-widgets").waitFor({state:"detached"});
  assert.equal(await page.locator(".bl-update-bell").count(),1);
  await page.evaluate(()=>document.documentElement.classList.remove("bl-parent-bell"));
  await page.locator("#bl-floating-widgets").waitFor();
  if(studio){await page.evaluate(()=>document.querySelector("#mount").replaceChildren());await page.locator("#bl-floating-widgets").waitFor({state:"detached"});}
  else{await page.evaluate(()=>window.dispatchEvent(new Event("branchline-ptg-release-unmount")));await page.locator("#bl-floating-widgets").waitFor({state:"detached"});assert.equal(await page.locator(".bl-update-bell").count(),0);}
  assert.deepEqual(errors,[]);await context.close();console.log("PASS",module,viewport.width);
 }
}finally{await browser.close();}
