/* Opt-in wiring for the shared shell. No auto-mount until production artwork and host are verified. */
(function(root){
"use strict";
function start(options={}){
 const doc=options.document||root.document,host=options.host||doc.body;
 const widgets=options.widgets||root.BranchlineFloatingWidgets;
 const content=options.content||root.BranchlineGuideContent;
 const panels=options.panels||root.BranchlineHelpPanel;
 const release=options.releaseUpdates||root.BranchlineReleaseUpdates;
 if(!widgets||!content||!panels||!release)throw Error("Branchline widget dependencies are not ready");
 let controller;
 const help=panels.create({document:doc,host,content,onDismiss:()=>controller?.close()});
 const getContext=options.getContext||(()=>content.contextFor(root.location.pathname,root.location.search));
 try{
  controller=widgets.mount({document:doc,host,assets:options.assets,releaseUpdates:release,onOpen:(key,button)=>help.open(key,getContext(),button),onClose:()=>help.close(false)});
 }catch(error){help.dispose();throw error;}
 return Object.freeze({setBusy:controller.setBusy,setCollapsed:controller.setCollapsed,dispose(){try{controller.dispose();}finally{help.dispose();}}});
}
const api={start};if(typeof module==="object"&&module.exports)module.exports=api;else root.BranchlineWidgetShell=Object.freeze(api);
})(typeof window!=="undefined"?window:globalThis);
