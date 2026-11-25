/* Shared floating widget foundation. Explicit opt-in; never alters app identity. */
(function(root){
  "use strict";
  const TYPES=["assistant","announcements","guide"];
  function unreadLabel(n){return Number.isSafeInteger(n)&&n>0?(n>99?"99+":String(n)):"";}
  function assetURL(value,base){
    if(typeof value!=="string"||!value.trim())throw new TypeError("Widget artwork required");
    const url=new URL(value,base);
    if(url.origin!==new URL(base).origin||!url.pathname.startsWith("/branchline/widgets/assets/")||!(/\.(png|webp|svg)$/i.test(url.pathname)))throw new TypeError("Invalid widget artwork");
    return url.href;
  }
  function mount(options){
    const doc=options.document||root.document;
    const host=options.host||doc.body;
    const existing=doc.getElementById("bl-floating-widgets");
    if(existing)throw new Error("Floating widgets already mounted");
    if(typeof options.onOpen!=="function")throw new TypeError("Widget open handler required");
    const assets=Object.fromEntries(TYPES.map(key=>[key,assetURL(options.assets?.[key],doc.baseURI)]));
    const region=doc.createElement("aside");
    region.id="bl-floating-widgets";region.className="bl-floating-widgets";
    region.setAttribute("aria-label","Branchline floating widgets");
    const controls=doc.createElement("div");controls.id="bl-floating-widget-controls";
    const collapse=doc.createElement("button");collapse.type="button";collapse.className="bl-widget-collapse";
    collapse.setAttribute("aria-controls",controls.id);
    const labels={assistant:"Branchline Assistant",announcements:"Announcements & Updates",guide:"Branchline Guide"};
    const buttons={};let active=null,collapsed=false,busy=false,disposed=false;
    function render(){
      controls.hidden=collapsed||busy;
      collapse.hidden=busy;
      collapse.textContent=collapsed?"Show widgets":"Hide widgets";
      collapse.setAttribute("aria-expanded",String(!collapsed));
      for(const key of TYPES)buttons[key].setAttribute("aria-expanded",String(active===key));
    }
    function close(){
      if(active!==null){const old=active;active=null;options.onClose?.(old);render();}
    }
    function setCollapsed(value){
      collapsed=Boolean(value);
      if(collapsed)close();
      render();
    }
    function setBusy(value){busy=Boolean(value);if(busy)close();render();}
    let badge;
    for(const key of TYPES){
      const b=doc.createElement("button");b.type="button";b.className="bl-widget-button bl-widget-"+key;
      b.setAttribute("aria-label",labels[key]);b.title=labels[key];
      const img=doc.createElement("img");img.src=assets[key];img.alt="";img.draggable=false;
      b.append(img);
      if(key==="announcements"){
        badge=doc.createElement("span");badge.className="bl-widget-unread";badge.hidden=true;badge.setAttribute("aria-hidden","true");b.append(badge);
      }
      b.addEventListener("click",()=>{
        if(disposed||busy)return;
        if(active===key){close();return;}
        close();active=key;render();
        try{options.onOpen(key,b);}catch(error){active=null;render();throw error;}
      });
      buttons[key]=b;controls.append(b);
    }
    function setUnread(n){
      const label=unreadLabel(n);badge.textContent=label;badge.hidden=!label;
      buttons.announcements.setAttribute("aria-label",labels.announcements+(label?", "+label+" unread":""));
    }
    const narrow=root.matchMedia?.("(max-width: 640px)");
    collapsed=Boolean(narrow?.matches);
    collapse.addEventListener("click",()=>setCollapsed(!collapsed));
    const escape=e=>{if(e.key==="Escape"&&active!==null){const key=active;close();buttons[key].focus();}};
    doc.addEventListener("keydown",escape);
    region.append(controls,collapse);host.append(region);render();setUnread(0);
    return Object.freeze({setUnread,setCollapsed,setBusy,close,dispose(){
      if(disposed)return;disposed=true;
      try{close();}finally{doc.removeEventListener("keydown",escape);region.remove();}
    }});
  }
  const api={mount,unreadLabel,assetURL};
  if(typeof module==="object"&&module.exports)module.exports=api;
  else root.BranchlineFloatingWidgets=Object.freeze(api);
})(typeof window!=="undefined"?window:globalThis);
