/* Safe startup for the original workspace; called only by approved entry pages.
 * Never replace a parent-hosted updater or hide the original bell on failure.
 */
(function(root){
"use strict";
const ASSETS=Object.freeze({assistant:"/branchline/widgets/assets/assistant.webp",announcements:"/branchline/widgets/assets/announcements.svg",guide:"/branchline/widgets/assets/guide.svg"});
const MODULES=Object.freeze({sales:"/branchline",ptg:"/first-megasaver-ptg",megaframe:"/megaframe-studio/studio",flyer:"/flyer-studio/studio"});
function moduleFor(path){
 if(typeof path!=="string")return null;
 const clean=path.replace(/\/index\.html$/,"").replace(/\/$/,"");
 if(clean==="/branchline"||clean==="/branchline/apps")return "sales";
 if(clean==="/megaframe-studio/studio")return "megaframe";
 if(clean==="/flyer-studio/studio")return "flyer";
 const valid=["dashboard","products","price-memos/import","price-memos/subdealer","admin/accounts","admin/logos","product-master","data-desk","studios","workspace/mobile"];
 if(valid.some(p=>clean==="/first-megasaver-ptg/"+p))return "ptg";
 return null;
}
function eligible(path,native,parentHosted,topLevel=true){return topLevel&&!parentHosted&&moduleFor(path)!==null;}
function assetsFor(path){const base=MODULES[moduleFor(path)]||MODULES.sales;return Object.fromEntries(Object.entries(ASSETS).map(([k,v])=>[k,base+v.slice("/branchline".length)]));}
async function preload(root,assets){
 await Promise.all(Object.values(assets).map(src=>new Promise((resolve,reject)=>{
  const img=new root.Image();const timeout=root.setTimeout(()=>reject(Error("Widget artwork timeout")),5000);
  img.onload=()=>{root.clearTimeout(timeout);img.naturalWidth>0?resolve():reject(Error("Empty widget artwork"));};
  img.onerror=()=>{root.clearTimeout(timeout);reject(Error("Widget artwork unavailable"));};
  img.src=src;
 })));
}
function create(root,options={}){
 const doc=root.document;let controller=null,starting=null,disposed=false,observer=null;
 const isEligible=()=>eligible(root.location.pathname,Boolean(root.chrome?.webview),doc.documentElement.classList.contains("bl-parent-bell"),root.top===root);
 const module=moduleFor(root.location.pathname),mobile=module==="ptg"&&root.location.pathname.includes("/workspace/mobile");
 const studio=module==="megaframe"||module==="flyer";
 const visible=s=>{const el=doc.querySelector(s);return !!(el&&!el.hidden&&el.getClientRects().length>0);};
 const isWorkspaceVisible=()=>studio?visible("#studio-editor-frame"):module==="ptg"?(mobile?visible(".mobile-workspace"):visible(".ptg-unified-host")):root.location.pathname.includes("/apps/")||["#connected-shell","#demo-app"].some(visible);
 const currentContext=()=>{
  if(mobile){const frame=doc.querySelector(".mobile-workspace iframe:not([hidden])");
   try{const url=new URL(frame.contentWindow.location.href);if(url.origin===root.location.origin&&moduleFor(url.pathname))return root.BranchlineGuideContent.contextFor(url.pathname,url.search);}catch{}
   return "workspace";}
  return root.BranchlineGuideContent.contextFor(root.location.pathname,root.location.search);
 };
 async function sync(){
  if(disposed)return false;
  if(!isEligible()||!isWorkspaceVisible()){if(controller){controller.dispose();controller=null;}return false;}
  if(controller)return true;
  if(starting)return starting;
  if(!root.BranchlineWidgetShell||!root.BranchlineReleaseUpdates)return false;
  starting=(async()=>{
   try{
    await preload(root,options.assets||assetsFor(root.location.pathname));
    if(disposed||!isEligible()||!isWorkspaceVisible())return false;
    controller=root.BranchlineWidgetShell.start({assets:options.assets||assetsFor(root.location.pathname),host:mobile?doc.querySelector(".mobile-workspace"):doc.body,getContext:currentContext});
    if(studio||mobile)controller.setCollapsed(true);return true;
   }catch{return false;}finally{starting=null;}
  })();
  return starting;
 }
 function watch(){
  if(disposed||observer)return;
  observer=new root.MutationObserver(()=>{void sync();});
  observer.observe(doc.documentElement,{attributes:true,attributeFilter:["class"]});
  for(const s of ["#connected-shell","#demo-app"]){const e=doc.querySelector(s);if(e)observer.observe(e,{attributes:true,attributeFilter:["hidden","class"]});}
  if(studio){const mount=doc.querySelector("#mount");if(mount)observer.observe(mount,{childList:true});}
  void sync();
 }
 return Object.freeze({sync,watch,setBusy(value){controller?.setBusy(value);},dispose(){disposed=true;observer?.disconnect();controller?.dispose();controller=null;}});
}
const api={ASSETS,moduleFor,eligible,assetsFor,create};
if(typeof module==="object"&&module.exports)module.exports=api;
else{
 root.BranchlineWidgetBootstrap=Object.freeze(api);
 const script=root.document.currentScript;
 if(script?.hasAttribute("data-enable-widgets")&&root.location.origin==="https://kzamora19.github.io"){
  const run=()=>{const boot=create(root);root.BranchlineWidgetRuntime=boot;boot.watch();};
  if(root.document.readyState==="complete")run();else root.addEventListener("load",run,{once:true});
 }
}
})(typeof window!=="undefined"?window:globalThis);
