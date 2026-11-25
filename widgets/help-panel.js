/* Guide and assistant panel renderer. Explicit opt-in, no remote content. */
(function(root){
"use strict";
function create(options){
 const doc=options.document||root.document, data=options.content||root.BranchlineGuideContent;
 if(!data)throw Error("Guide content is required");
 const host=options.host||doc.body;
 const panel=doc.createElement("section");panel.className="bl-help-panel";panel.hidden=true;panel.setAttribute("aria-label","Branchline help");
 const head=doc.createElement("header"),title=doc.createElement("h2"),dismiss=doc.createElement("button");
 dismiss.type="button";dismiss.textContent="Close";head.append(title,dismiss);
 const label=doc.createElement("label"),search=doc.createElement("input");search.type="search";label.append(search);
 const select=doc.createElement("select");select.setAttribute("aria-label","Filter by application");
 for(const [value,text] of [["all","All applications"],...Object.entries(data.names)]){
  const option=doc.createElement("option");option.value=value;option.textContent=text;select.append(option);
 }
 const summary=doc.createElement("p");summary.setAttribute("role","status");
 const results=doc.createElement("div");results.className="bl-help-results";
 panel.append(head,label,select,summary,results);host.append(panel);
 let mode=null,trigger=null,app="workspace";
 function render(){
  if(!mode)return;
  const q=search.value.trim(),filter=select.value;
  const items=mode==="assistant"&&q?data.answer(q,app,filter):data.searchEntries(mode==="guide"?q:"",filter);
  results.replaceChildren();
  summary.textContent=items.length?(mode==="assistant"?"Suggested guidance: ":"")+items.length+" topic"+(items.length===1?"":"s"): "No matching guide. Try a different term or contact your authorized administrator.";
  for(const item of items){
   const article=doc.createElement("article"),heading=doc.createElement("h3"),category=doc.createElement("small"),steps=doc.createElement("ol");steps.className="bl-guide-steps";
   heading.textContent=item.title;category.textContent=data.names[item.app];article.append(category,heading);
   for(const [index,value] of item.steps.entries()){const li=doc.createElement("li"),number=doc.createElement("span"),instruction=doc.createElement("span");number.className="bl-guide-step-number";number.setAttribute("aria-hidden","true");number.textContent=String(index+1);instruction.textContent=value;li.append(number,instruction);steps.append(li);}
   article.append(steps);
   if(item.limited){const note=doc.createElement("p");note.textContent="Overview only; exact controls require verification.";article.append(note);}
   results.append(article);
  }
 }
 function close(restoreFocus=true){panel.hidden=true;mode=null;if(restoreFocus&&trigger?.isConnected)trigger.focus();trigger=null;}
 function open(kind,context,button){
  if(kind!=="assistant"&&kind!=="guide")return;
  mode=kind;app=data.names[context]?context:"workspace";trigger=button||null;
  title.textContent=kind==="guide"?"Branchline Guide":"Branchline Assistant";
  search.value="";search.placeholder=kind==="guide"?"Search tutorials…":"Ask about an application…";
  search.setAttribute("aria-label",kind==="guide"?"Search tutorials":"Ask a question");
  select.value=kind==="guide"?app:"all";panel.hidden=false;render();search.focus();
 }
 search.addEventListener("input",render);select.addEventListener("change",render);
 dismiss.addEventListener("click",()=>{close();options.onDismiss?.();});
 const escape=e=>{if(e.key==="Escape"&&!panel.hidden){e.stopPropagation();close();options.onDismiss?.();}};
 panel.addEventListener("keydown",escape);
 return Object.freeze({open,close,dispose(){panel.remove();}});
}
const api={create};if(typeof module==="object"&&module.exports)module.exports=api;else root.BranchlineHelpPanel=Object.freeze(api);
})(typeof window!=="undefined"?window:globalThis);
