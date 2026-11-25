/* Shared release bundle loader. Only approved app shells call it, never an editor iframe. */
(function(root){
"use strict";
const paths=["floating-widgets","guide-content","help-panel","widget-shell","widget-bootstrap"];
let loaded=null;
function load(base){
 if(!/^\/(?:branchline|first-megasaver-ptg|megaframe-studio\/studio|flyer-studio\/studio)\/widgets\/$/.test(base))return Promise.reject(Error("Unknown widget bundle"));
 if(loaded)return loaded;
 const doc=root.document,created=[];
 function add(tag,url){return new Promise((resolve,reject)=>{
  const el=doc.createElement(tag);created.push(el);
  if(tag==="link"){el.rel="stylesheet";el.href=url;}else el.src=url;
  const timer=root.setTimeout(()=>reject(Error("Widget resource timeout")),8000);
  el.onload=()=>{root.clearTimeout(timer);resolve();};el.onerror=()=>{root.clearTimeout(timer);reject(Error("Widget resource missing"));};
  doc.head.append(el);
 });}
 loaded=(async()=>{await Promise.all(["floating-widgets.css","help-panel.css"].map(n=>add("link",base+n)));for(const name of paths)await add("script",base+name+".js");return root.BranchlineWidgetBootstrap;})().catch(error=>{for(const el of created)el.remove();loaded=null;throw error;});
 return loaded;
}
root.BranchlineWidgetLoader=Object.freeze({load});
})(window);
