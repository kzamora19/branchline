/* Public, curated workflow guidance. No account data, network calls or AI API. */
(function(root){
"use strict";
const entries=[
{id:"launch",app:"workspace",title:"Open an application",keywords:"home quick launch switch app navigation",steps:["Open Branchline Workspace Home.","Under Quick Launch, select Sales Tracker, Price Tag Generator, MegaFrame Studio or MegaFlyer Studio.","Sign in if prompted. Each application verifies its own access."]},
{id:"update",app:"workspace",title:"Check and install a workspace update",keywords:"bell software restart version",steps:["Open Announcements & Updates.","Select Check for updates.","If an update is available, save open work before selecting Update & Restart. Confirm only after saving."]},
{id:"sales-entry",app:"sales-tracker",title:"Record a sale",keywords:"transaction sales entry product save",steps:["Open the Record a sale form in Sales Tracker.","Enter the sale details and product lines. Use Add product line if necessary.","Review your entry, then select Save sale."]},
{id:"ps-review",app:"sales-tracker",title:"Review individual PS performance",keywords:"monthly daily target assistance walk-in log",steps:["Open the relevant daily or monthly performance view in Sales Tracker.","Select an available PS assistance review or monthly PS performance drill-down.","Use the PS sales log or PS daily performance details to review the underlying entries. Access depends on your role."]},
{id:"ptg-overview",app:"price-tag-generator",title:"Prepare and print price tags",keywords:"barcode product search selling price print queue format copies pdf",steps:["Open Select Product and search by brand, model, barcode or description.","Tick the products to add them to Selected Products / Print Queue.","In Print Price Tags, choose a print format. If batch planning is enabled, select the format and copies per product.","Review the print preflight summary and preview. Select SAVE for PDF or Print for physical printing."]},
{id:"memo-import",app:"price-tag-generator",title:"Import a Head Office price memo",keywords:"memo import batch ready files admin",steps:["If authorized, open Import Price Memo.","Select the Head Office memo files and review the Memo summary and ready status.","Optionally enter the promotion name for the batch; select IMPORT READY MEMO(S).","Review the result before using the newly imported prices. Memo Import History is System Admin only."]},
{id:"studio-access",app:"megaframe-studio",title:"Open MegaFrame Studio",keywords:"photos frames access team leader editor",steps:["Select MegaFrame Studio in Branchline Quick Launch.","Complete PTG authorization if prompted.","Open the photo editing workspace using your authorized account."]},
{id:"frame-backup",app:"megaframe-studio",title:"Back up or retrieve a project",keywords:"cloud google drive save restore backup",steps:["When available, open the manual encrypted cloud project backup panel.","Use Refresh projects to locate a project; select Back up selected project to back it up.","To retrieve an existing backup, select Retrieve cloud project. Google Drive backup controls are available only where configured."]},
{id:"flyer-access",app:"flyer-studio",title:"Open MegaFlyer Studio",keywords:"flyer sale artwork access editor",steps:["Select MegaFlyer Studio in Branchline Quick Launch.","Complete PTG authorization if prompted.","Open the promotional artwork workspace using your authorized account."]},
{id:"flyer-backup",app:"flyer-studio",title:"Back up or retrieve a flyer project",keywords:"cloud drive save restore backup",steps:["Open the available cloud project backup panel.","Select Back up current project to create a backup.","To retrieve an existing backup, select Retrieve from cloud. Use Google Drive controls only when configured."]}
];
for(const e of entries){Object.freeze(e.steps);Object.freeze(e);}
Object.freeze(entries);
const names=Object.freeze({workspace:"Branchline Workspace","sales-tracker":"Sales Tracker","price-tag-generator":"Price Tag Generator","megaframe-studio":"MegaFrame Studio","flyer-studio":"MegaFlyer Studio"});
function contextFor(path,search=""){
 if(typeof path!=="string")return "workspace";
 if(path.startsWith("/megaframe-studio/"))return "megaframe-studio";
 if(path.startsWith("/flyer-studio/"))return "flyer-studio";
 if(path.startsWith("/first-megasaver-ptg/")){
  if(path.startsWith("/first-megasaver-ptg/workspace/mobile"))return "workspace";
  if(path.startsWith("/first-megasaver-ptg/studios/")){
   const s=new URLSearchParams(search).get("studio");
   if(s==="megaframe")return "megaframe-studio";if(s==="flyer")return "flyer-studio";
  }
  return "price-tag-generator";
 }
 return path==="/branchline/"||path==="/branchline/index.html"?"sales-tracker":"workspace";
}
function searchEntries(query="",app="all"){
 const terms=String(query).toLowerCase().match(/[a-z0-9]+/g)||[];
 return entries.filter(e=>(app==="all"||e.app===app)&&terms.every(t=>[e.title,e.keywords,names[e.app],...e.steps].join(" ").toLowerCase().includes(t)));
}
function answer(query,app,filter="all"){
 const words=String(query).toLowerCase().match(/[a-z0-9]+/g)||[];
 const stop=new Set(["how","do","i","can","to","a","an","the","my","in","is","what","where","please","you","me","for","of","and"]);
 const terms=[...new Set(words.filter(w=>!stop.has(w)))];
 if(!terms.length)return [];
 return entries.filter(e=>filter==="all"||e.app===filter).map(e=>{
  const title=e.title.toLowerCase(),keywords=e.keywords.toLowerCase(),body=e.steps.join(" ").toLowerCase();
  let score=0;for(const t of terms)score+=title.includes(t)?4:keywords.includes(t)?3:body.includes(t)?1:0;
  return {entry:e,score:score?(score+(e.app===app?2:0)):0};
 }).filter(x=>x.score>=3).sort((a,b)=>b.score-a.score).slice(0,3).map(x=>x.entry);
}
const api={entries,names,contextFor,searchEntries,answer};
if(typeof module==="object"&&module.exports)module.exports=api;else root.BranchlineGuideContent=Object.freeze(api);
})(typeof window!=="undefined"?window:globalThis);
