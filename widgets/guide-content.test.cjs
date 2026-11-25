const {test}=require("node:test");
const assert=require("node:assert/strict");
const guide=require("./guide-content.js");
test("all five workspace contexts resolve without reading private data",()=>{
 const cases=[["/branchline/apps/","","workspace"],["/branchline/","","sales-tracker"],["/first-megasaver-ptg/","","price-tag-generator"],["/first-megasaver-ptg/studios/","?studio=megaframe","megaframe-studio"],["/flyer-studio/studio/","","flyer-studio"]];
 for(const [path,query,app] of cases)assert.equal(guide.contextFor(path,query),app);
});
test("guide filters by application and terms",()=>{
 assert.equal(guide.entries.length,9);
 assert.equal(guide.searchEntries("record sale","sales-tracker")[0]?.id,"sales-entry");
 assert.equal(guide.searchEntries("backup","megaframe-studio")[0]?.id,"frame-backup");
 assert.equal(guide.searchEntries("backup","price-tag-generator").length,0);
});
test("assistant returns curated topics and no made-up answer",()=>{
 assert.equal(guide.answer("How do I record a sale?","sales-tracker")[0]?.id,"sales-entry");
 assert.equal(guide.answer("quantum entanglement","workspace").length,0);
 assert.equal(guide.answer("how do I","workspace").length,0);
});
test("all steps are immutable plain text; PTG overview explicitly limited",()=>{
 assert.ok(Object.isFrozen(guide.entries));
 for(const e of guide.entries){assert.ok(Object.isFrozen(e.steps));assert.ok(e.steps.every(s=>typeof s==="string"));}
 assert.equal(guide.entries.find(e=>e.id==="ptg-overview").limited,true);
});

test("assistant applies application filter before ranking",()=>{assert.ok(guide.answer("backup","megaframe-studio","flyer-studio").every(e=>e.app==="flyer-studio"));assert.equal(guide.answer("backup","megaframe-studio","flyer-studio")[0]?.id,"flyer-backup");});

test("mobile launcher home uses workspace context",()=>assert.equal(guide.contextFor("/first-megasaver-ptg/workspace/mobile/"),"workspace"));
