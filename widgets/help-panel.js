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
 const contextText=doc.createElement("p");contextText.className="bl-help-context";
 const suggestions=doc.createElement("div");suggestions.className="bl-help-suggestions";
 const summary=doc.createElement("p");summary.setAttribute("role","status");
 const results=doc.createElement("div");results.className="bl-help-results";
 panel.append(head,contextText,label,select,suggestions,summary,results);host.append(panel);
 let mode=null,trigger=null,app="workspace",highlighted=null,activeTour=null;
 const targets={
  "sales-entry":['[role="dialog"][aria-label="Record a sale"]','[role="dialog"][aria-label="Record a sale"] #sale-rows','[role="dialog"][aria-label="Record a sale"] .dlg-actions button[type="submit"]'],
  "ptg-overview":["#legacy-product-search",".legacy-queue-panel",".legacy-format-controls","#print-price-tags"],
  "update":[".bl-widget-release-slot .bl-update-bell",null,null],
  "frame-backup":["#cloudPanel","#cloudBackup","#cloudRestore"],
  "flyer-backup":["#cloudPanel","#cloudBackup","#cloudRestore"]
 };
 function clearHighlight(){highlighted?.classList.remove("bl-guide-highlight");highlighted=null;}
 function locate(item,index){clearHighlight();if(item.app!==app&&item.app!=="workspace")return false;const selector=targets[item.id]?.[index];if(!selector)return false;const node=doc.querySelector(selector);if(!node||!node.getClientRects().length||node.closest("[hidden]")||root.getComputedStyle(node).visibility==="hidden")return false;highlighted=node;node.classList.add("bl-guide-highlight");node.scrollIntoView?.({block:"nearest",inline:"nearest",behavior:"instant"});return true;}

 function render(){
  if(!mode)return;
  clearHighlight();activeTour=null;
  const q=search.value.trim(),filter=select.value;
  const items=mode==="assistant"&&q?data.answer(q,app,filter):data.searchEntries(mode==="guide"?q:"",filter);
  results.replaceChildren();suggestions.replaceChildren();
  if(mode==="assistant"&&!q){for(const item of data.searchEntries("",app).slice(0,4)){const suggestion=doc.createElement("button");suggestion.type="button";suggestion.textContent=item.title;suggestion.addEventListener("click",()=>{search.value=item.title;select.value=item.app;render();});suggestions.append(suggestion);}}
  summary.textContent=items.length?(mode==="assistant"?"Suggested guidance: ":"")+items.length+" topic"+(items.length===1?"":"s"): "No matching guide. Try a different term or contact your authorized administrator.";
  for(const item of items){
   const article=doc.createElement("article"),heading=doc.createElement("h3"),category=doc.createElement("small"),steps=doc.createElement("ol");steps.className="bl-guide-steps";
   heading.textContent=item.title;category.textContent=data.names[item.app];article.append(category,heading);
   for(const [index,value] of item.steps.entries()){const li=doc.createElement("li"),number=doc.createElement("span"),instruction=doc.createElement("span");number.className="bl-guide-step-number";number.setAttribute("aria-hidden","true");number.textContent=String(index+1);instruction.textContent=value;li.append(number,instruction);steps.append(li);}
   article.append(steps);
   const tour=doc.createElement("button");tour.type="button";tour.textContent="Start walkthrough";tour.className="bl-guide-start";
   const navigation=doc.createElement("div");navigation.className="bl-guide-navigation";navigation.hidden=true;
   const previous=doc.createElement("button"),next=doc.createElement("button"),progress=doc.createElement("span"),hint=doc.createElement("p");hint.className="bl-guide-target-hint";
   previous.type=next.type="button";previous.textContent="Previous";navigation.append(previous,progress,next,hint);let index=0;
   function showStep(){[...steps.children].forEach((li,i)=>{li.hidden=i!==index;});progress.textContent="Step "+(index+1)+" of "+item.steps.length;previous.disabled=index===0;next.textContent=index===item.steps.length-1?"Finish":"Next";hint.textContent=locate(item,index)?"Highlighted on this screen.":"Follow the instruction manually; the relevant control may be on another screen or in the protected editor.";}
   function stopTour(focus=true){clearHighlight();activeTour=null;navigation.hidden=true;tour.hidden=false;[...steps.children].forEach(li=>li.hidden=false);if(focus)tour.focus();}
   tour.addEventListener("click",()=>{activeTour?.(false);activeTour=stopTour;index=0;tour.hidden=true;navigation.hidden=false;showStep();next.focus();});
   previous.addEventListener("click",()=>{if(index>0){index--;showStep();}});
   next.addEventListener("click",()=>{if(index===item.steps.length-1)stopTour();else{index++;showStep();}});
   article.append(tour,navigation);
   if(item.limited){const note=doc.createElement("p");note.textContent="Overview only; exact controls require verification.";article.append(note);}
   results.append(article);
  }
 }
 function close(restoreFocus=true){clearHighlight();activeTour=null;panel.hidden=true;mode=null;if(restoreFocus&&trigger?.isConnected)trigger.focus();trigger=null;}
 function open(kind,context,button){
  if(kind!=="assistant"&&kind!=="guide")return;
  mode=kind;app=data.names[context]?context:"workspace";trigger=button||null;
  title.textContent=kind==="guide"?"Branchline Guide":"Branchline Assistant";
  contextText.textContent=kind==="assistant"?"Hello! Need help with "+data.names[app]+"? Choose a suggested question or ask your own.":"Explore "+data.names[app]+" tutorials and step-by-step walkthroughs.";
  search.value="";search.placeholder=kind==="guide"?"Search tutorials…":"Ask about an application…";
  search.setAttribute("aria-label",kind==="guide"?"Search tutorials":"Ask a question");
  select.value=kind==="guide"?app:"all";panel.hidden=false;render();search.focus();
 }
 search.addEventListener("input",render);select.addEventListener("change",render);
 dismiss.addEventListener("click",()=>{close();options.onDismiss?.();});
 const escape=e=>{if(e.key==="Escape"&&!panel.hidden){e.stopPropagation();close();options.onDismiss?.();}};
 panel.addEventListener("keydown",escape);
 return Object.freeze({open,close,dispose(){clearHighlight();panel.remove();}});
}
const api={create};if(typeof module==="object"&&module.exports)module.exports=api;else root.BranchlineHelpPanel=Object.freeze(api);
})(typeof window!=="undefined"?window:globalThis);
