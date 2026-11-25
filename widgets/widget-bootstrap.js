/* Safe startup for the original workspace; called only by approved entry pages.
 * Never replace a native parent-hosted updater or hide the original bell on failure.
 */
(function(root){
"use strict";
const ASSETS=Object.freeze({assistant:"/branchline/widgets/assets/assistant.webp",announcements:"/branchline/widgets/assets/announcements.svg",guide:"/branchline/widgets/assets/guide.svg"});
function eligible(path,native,parentHosted){
 return !native&&!parentHosted&&["/branchline/","/branchline/index.html","/branchline/apps/","/branchline/apps/index.html"].includes(path);
}
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
 const isEligible=()=>eligible(root.location.pathname,Boolean(root.chrome?.webview),doc.documentElement.classList.contains("bl-parent-bell"));
 const isWorkspaceVisible=()=>root.location.pathname.includes("/apps/")||["#connected-shell","#demo-app"].some(s=>{const el=doc.querySelector(s);return el&&!el.hidden&&el.getClientRects().length>0;});
 async function sync(){
  if(disposed)return false;
  if(!isEligible()||!isWorkspaceVisible()){if(controller){controller.dispose();controller=null;}return false;}
  if(controller)return true;
  if(starting)return starting;
  starting=(async()=>{
   try{
    if(!root.BranchlineWidgetShell||!root.BranchlineReleaseUpdates)return false;
    await preload(root,options.assets||ASSETS);
    if(disposed||!isEligible()||!isWorkspaceVisible())return false;
    controller=root.BranchlineWidgetShell.start({assets:options.assets||ASSETS});return true;
   }catch{return false;}finally{starting=null;}
  })();
  return starting;
 }
 function watch(){
  if(disposed||observer)return;
  observer=new root.MutationObserver(()=>{void sync();});
  observer.observe(doc.documentElement,{attributes:true,attributeFilter:["class"]});
  for(const s of ["#connected-shell","#demo-app"]){const e=doc.querySelector(s);if(e)observer.observe(e,{attributes:true,attributeFilter:["hidden","class"]});}
  void sync();
 }
 return Object.freeze({sync,watch,setBusy(value){controller?.setBusy(value);},dispose(){disposed=true;observer?.disconnect();controller?.dispose();controller=null;}});
}
const api={ASSETS,eligible,create};
if(typeof module==="object"&&module.exports)module.exports=api;
else root.BranchlineWidgetBootstrap=Object.freeze(api);
})(typeof window!=="undefined"?window:globalThis);
