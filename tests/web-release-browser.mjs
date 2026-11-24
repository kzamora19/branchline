import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {chromium} from "playwright";

const origin="https://kzamora19.github.io";
const revision=2026112401, next=2026112402, third=2026112403;
const script=readFileSync(new URL("../updates/check.js",import.meta.url),"utf8");
const css=readFileSync(new URL("../updates/check.css",import.meta.url),"utf8");
const browser=await chromium.launch({headless:true});
try {
 for(const viewport of [{width:1280,height:800},{width:390,height:844}]){
  const context=await browser.newContext({viewport,serviceWorkers:"block"});
  let manifest={schema:1,channel:"production",sequence:revision};
  let fail=false, calls=0, navigations=0, entryRevision=revision;
  await context.route("**/*",async route=>{
    const url=new URL(route.request().url());
    assert.equal(url.origin,origin,"No cross-origin requests");
    if(url.pathname==="/branchline/")return route.fulfill({contentType:"text/html",body:'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/branchline/updates/check.css"><textarea aria-label="Unsaved draft"></textarea><script defer src="/branchline/updates/check.js?v='+entryRevision+'" data-branchline-web-release data-sequence="'+entryRevision+'" data-release-label="Web release '+entryRevision+'"></script>'});
    if(url.pathname.endsWith("/check.js"))return route.fulfill({contentType:"application/javascript",body:script});
    if(url.pathname.endsWith("/check.css"))return route.fulfill({contentType:"text/css",body:css});
    if(url.pathname.endsWith("/release.json")){
      calls++;
      if(fail)return route.abort("internetdisconnected");
      return route.fulfill({json:manifest});
    }
    return route.fulfill({status:404,body:""});
  });
  const page=await context.newPage(), errors=[];
  page.on("pageerror",error=>errors.push(error.message));
  page.on("framenavigated",frame=>{if(frame===page.mainFrame())navigations++;});
  await page.goto(origin+"/branchline/");
  const panel=page.locator("#bl-release-check"), status=panel.getByRole("status",{includeHidden:true});
  const check=panel.getByRole("button",{name:"Check for updates"});
  const dismiss=panel.getByRole("button",{name:"Later"});
  const restart=panel.locator("#bl-release-restart");
  const confirmed=panel.locator("#bl-release-restart[data-confirm=true]");
  await panel.waitFor();
  assert.match(await panel.locator(".bl-release-version").textContent(),/Web release/);
  await page.waitForFunction(()=>!document.querySelector("#bl-release-check button").disabled);
  assert.ok(calls>=1,"Automatic check on load");
  assert.equal(await status.isVisible(),false,"No update prompt when current");
  await page.getByRole("textbox",{name:"Unsaved draft"}).fill("Do not lose my unsaved draft");
  manifest.sequence=next;
  await check.click();
  await status.waitFor({state:"visible"});
  assert.match(await status.textContent(),/Update Available/);
  assert.equal(await dismiss.isVisible(),true);
  assert.equal(await page.getByRole("textbox").inputValue(),"Do not lose my unsaved draft");
  assert.equal(navigations,1,"No automatic refresh");
  await restart.click();
  assert.match(await status.textContent(),/Save all open projects/);
  assert.equal(navigations,1,"First click is warning only");
  assert.equal(await restart.getAttribute("data-confirm"),"true");
  await confirmed.click();
  await page.waitForFunction(()=>!document.querySelector("#bl-release-check button").disabled);
  assert.match(await status.textContent(),/not ready/,"Stale entry rejected");
  assert.equal(await page.getByRole("textbox").inputValue(),"Do not lose my unsaved draft");
  const bounds=await panel.boundingBox();
  assert.ok(bounds.x>=0&&bounds.x+bounds.width<=viewport.width+1,"Fits viewport");
  await dismiss.click();
  await status.waitFor({state:"hidden"});
  const before=calls;
  await page.evaluate(()=>window.dispatchEvent(new Event("online")));
  await page.waitForFunction(()=>!document.querySelector("#bl-release-check button").disabled);
  assert.ok(calls>before,"Recheck when online");
  assert.equal(await status.isVisible(),false,"Dismissed revision stays dismissed");
  manifest.sequence=third;
  await page.evaluate(()=>window.dispatchEvent(new Event("online")));
  await status.waitFor({state:"visible"});
  assert.match(await status.textContent(),/Update Available/);
  await dismiss.click();
  fail=true;
  await check.click();
  await status.waitFor({state:"visible"});
  assert.match(await status.textContent(),/Could not check/);
  assert.equal(await page.getByRole("textbox").inputValue(),"Do not lose my unsaved draft");
  fail=false;manifest={schema:1,channel:"staging",sequence:third};
  await check.click();
  await page.waitForFunction(()=>!document.querySelector("#bl-release-check button").disabled);
  assert.match(await status.textContent(),/Could not check/);
  assert.equal(navigations,1);
  // The only actual restart follows explicit save confirmation and a matching
  // new entry stamp. It does not create a new installation or use a remote URL.
  manifest={schema:1,channel:"production",sequence:third};entryRevision=third;
  await check.click();await restart.waitFor({state:"visible"});
  await restart.click();
  await Promise.all([page.waitForNavigation(),confirmed.click()]);
  await page.locator("#bl-release-check").waitFor();
  assert.equal(navigations,2,"One explicitly approved restart");
  assert.match(await page.locator(".bl-release-version").textContent(),/2026112403/);
  assert.deepEqual(errors,[]);
  console.log("PASS",viewport.width,"startup, update, dismiss, new revision, offline, wrong channel, unsaved draft, stale shell guard, explicit restart");
  await context.close();
 }
}finally{await browser.close();}
