// Live, anonymous, read-only UI acceptance. No account or project data is accessed.
import assert from "node:assert/strict";
import { chromium } from "playwright";
const browser=await chromium.launch({headless:true});
try{
 const c=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:"block"});
 const page=await c.newPage();
 const root="https://kzamora19.github.io";
 const loaded=await page.goto(root+"/branchline/apps/",{waitUntil:"domcontentloaded",timeout:30000});
 assert.equal(loaded?.status(),200);
 await page.getByRole("heading",{name:"Your apps"}).waitFor({timeout:15000});
 const names=await page.locator(".card .copy strong").allTextContents();
 assert.deepEqual(names,["Sales Tracker","Price Tag Generator","MegaFrame Studio","MegaFlyer Studio"]);
 const links=await page.locator(".card").evaluateAll(cards=>cards.map(el=>el.getAttribute("href")));
 assert.deepEqual(links.slice(2),[
  "https://kzamora19.github.io/first-megasaver-ptg/studios/?studio=megaframe",
  "https://kzamora19.github.io/first-megasaver-ptg/studios/?studio=flyer"]);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),true);
 console.log("PASS: four-card mobile app chooser live, no horizontal overflow and PTG protected Studio links.");
 for(const path of ["/megaframe-studio/studio/","/flyer-studio/studio/"]){
  const r=await page.goto(root+path,{waitUntil:"domcontentloaded",timeout:30000});
  assert.equal(r?.status(),200);
  const panels=await page.locator("#cloudPanel,#drivePanel").count();
  assert.equal(panels,2,"Both optional backup panels present for compatibility");
  await page.evaluate(()=>{document.querySelector("#cloudPanel").hidden=false;document.querySelector("#drivePanel").hidden=false;});
  const displays=await page.locator("#cloudPanel,#drivePanel").evaluateAll(nodes=>nodes.map(el=>getComputedStyle(el).display));
  assert.deepEqual(displays,["none","none"]);
  console.log("PASS: "+path+" both backups hidden even after JS tries to show them.");
 }
 await c.close();
}finally{await browser.close();}
