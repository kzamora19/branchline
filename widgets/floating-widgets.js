/* Shared floating widget foundation. Explicit opt-in; never alters app identity. */
(function(root){
  "use strict";
  const TYPES=["assistant","announcements","guide"];
  function unreadLabel(n){return Number.isSafeInteger(n)&&n>0?(n>99?"99+":String(n)):"";}
  function assetURL(value,base){
    if(typeof value!=="string"||!value.trim())throw new TypeError("Widget artwork required");
    const url=new URL(value,base);
    if(url.origin!==new URL(base).origin||!(/^\/(?:branchline|first-megasaver-ptg|megaframe-studio\/studio|flyer-studio\/studio)\/widgets\/assets\//.test(url.pathname))||!(/\.(png|webp|svg)$/i.test(url.pathname)))throw new TypeError("Invalid widget artwork");
    return url.href;
  }
  const PREF_KEY="branchline.widgets.preferences.v2";
  const DEFAULTS=Object.freeze({side:"right",offset:0,size:"medium",motion:true,bubbles:true});
  function normalizePreferences(value){
    const v=value&&typeof value==="object"?value:{};
    return {side:v.side==="left"?"left":"right",offset:Number.isFinite(v.offset)?Math.max(0,Math.min(600,Math.round(v.offset))):0,size:["small","medium","large"].includes(v.size)?v.size:"medium",motion:v.motion!==false,bubbles:v.bubbles!==false};
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
    const ns="http://www.w3.org/2000/svg",symbol=doc.createElementNS(ns,"svg");symbol.setAttribute("viewBox","0 0 24 24");symbol.setAttribute("aria-hidden","true");symbol.setAttribute("width","24");symbol.setAttribute("height","24");
    const grid=doc.createElementNS(ns,"g");for(let i=0;i<4;i++){const tile=doc.createElementNS(ns,"rect");tile.setAttribute("x",String(4+(i%2)*9));tile.setAttribute("y",String(4+Math.floor(i/2)*9));tile.setAttribute("width","7");tile.setAttribute("height","7");tile.setAttribute("rx","1.8");tile.setAttribute("fill","currentColor");grid.append(tile);}
    const chevron=doc.createElementNS(ns,"path");chevron.setAttribute("d","M5 15l7-7 7 7");chevron.setAttribute("fill","none");chevron.setAttribute("stroke","currentColor");chevron.setAttribute("stroke-width","2.5");chevron.setAttribute("stroke-linecap","round");chevron.setAttribute("stroke-linejoin","round");symbol.append(grid,chevron);
    const toggleBadge=doc.createElement("span");toggleBadge.className="bl-widget-toggle-badge";toggleBadge.hidden=true;toggleBadge.setAttribute("aria-hidden","true");collapse.append(symbol,toggleBadge);
    let preferences={...DEFAULTS};try{preferences=normalizePreferences(JSON.parse(root.localStorage.getItem(PREF_KEY)||"null"));}catch{}
    const documentRoot=doc.documentElement;
    const settings=doc.createElement("details");settings.className="bl-widget-settings";
    const settingsToggle=doc.createElement("summary");settingsToggle.setAttribute("aria-label","Widget settings");settingsToggle.title="Widget settings";
    const settingsIcon=doc.createElementNS(ns,"svg");settingsIcon.setAttribute("viewBox","0 0 24 24");settingsIcon.setAttribute("width","20");settingsIcon.setAttribute("height","20");settingsIcon.setAttribute("aria-hidden","true");
    const gear=doc.createElementNS(ns,"path");gear.setAttribute("d","M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM10 2h4l.7 2.5 2 .9 2.4-1.3 2.8 2.8-1.3 2.4.9 2L24 12l-.7 2.7-2.5.7-.9 2 1.3 2.4-2.8 2.8-2.4-1.3-2 .9L14 24h-4l-.7-2.5-2-.9-2.4 1.3-2.8-2.8 1.3-2.4-.9-2L0 12l.7-2.7 2.5-.7.9-2-1.3-2.4 2.8-2.8 2.4 1.3 2-.9Z");gear.setAttribute("fill","currentColor");gear.setAttribute("fill-rule","evenodd");settingsIcon.append(gear);settingsToggle.append(settingsIcon);
    const settingsPanel=doc.createElement("div");settingsPanel.className="bl-widget-settings-panel";
    const heading=doc.createElement("strong");heading.textContent="Widget settings";settingsPanel.append(heading);
    function selectField(label,values){const wrap=doc.createElement("label");wrap.textContent=label;const input=doc.createElement("select");for(const [value,name] of values){const o=doc.createElement("option");o.value=value;o.textContent=name;input.append(o);}wrap.append(input);settingsPanel.append(wrap);return input;}
    const side=selectField("Position",[["right","Right"],["left","Left"]]),size=selectField("Icon size",[["small","Small"],["medium","Medium"],["large","Large"]]);
    const motionLabel=doc.createElement("label"),motion=doc.createElement("input");motion.type="checkbox";motionLabel.append(motion,doc.createTextNode(" Enable animations"));settingsPanel.append(motionLabel);
    const bubbleLabel=doc.createElement("label"),bubbleSetting=doc.createElement("input");bubbleSetting.type="checkbox";bubbleLabel.append(bubbleSetting,doc.createTextNode(" Hover speech bubbles"));settingsPanel.append(bubbleLabel);
    const reset=doc.createElement("button");reset.type="button";reset.textContent="Reset to upper right";settingsPanel.append(reset);
    settings.append(settingsToggle,settingsPanel);
    function applyPreferences(save=false){side.value=preferences.side;size.value=preferences.size;motion.checked=preferences.motion;bubbleSetting.checked=preferences.bubbles;if(!preferences.bubbles)hideBubble();documentRoot.dataset.blWidgetSide=preferences.side;documentRoot.dataset.blWidgetSize=preferences.size;documentRoot.dataset.blWidgetMotion=preferences.motion?"on":"off";if(save){try{root.localStorage.setItem(PREF_KEY,JSON.stringify(preferences));}catch{}}queuePosition();}
    side.addEventListener("change",()=>{preferences.side=side.value;applyPreferences(true);});
    size.addEventListener("change",()=>{preferences.size=size.value;applyPreferences(true);});
    motion.addEventListener("change",()=>{preferences.motion=motion.checked;applyPreferences(true);});
    bubbleSetting.addEventListener("change",()=>{preferences.bubbles=bubbleSetting.checked;applyPreferences(true);});
    reset.addEventListener("click",()=>{preferences={...DEFAULTS};applyPreferences(true);});
    let drag=null,skipClick=false;
    collapse.addEventListener("pointerdown",e=>{if(e.button!==0||!e.isPrimary)return;drag={id:e.pointerId,x:e.clientX,y:e.clientY,offset:preferences.offset,moved:false};collapse.setPointerCapture?.(e.pointerId);});
    collapse.addEventListener("pointermove",e=>{if(!drag||drag.id!==e.pointerId)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(!drag.moved&&Math.hypot(dx,dy)<8)return;if(!drag.moved){drag.moved=true;close();release?.close();settings.open=false;}preferences.side=e.clientX<root.innerWidth/2?"left":"right";preferences.offset=Math.max(0,Math.min(600,drag.offset+dy));applyPreferences();});
    function endDrag(e){if(!drag||drag.id!==e.pointerId)return;if(drag.moved){skipClick=true;applyPreferences(true);root.setTimeout(()=>{skipClick=false;},0);}drag=null;}
    collapse.addEventListener("pointerup",endDrag);collapse.addEventListener("pointercancel",endDrag);
    let countLabel="",badgeObserver=null,headerObserver=null,layoutObserver=null,positionFrame=0;
    const headerSelectors=[".mobile-workspace-header",".ptg-universal-app-rail",".bl-app-rail","header.connected-topbar",".connected-topbar",".ptg-sidebar-header","body[data-bl-studio] > header","body > header"];
    const currentHeader=()=>{for(const selector of headerSelectors){for(const element of doc.querySelectorAll(selector)){const b=element.getBoundingClientRect();if(b.width>100&&b.height>0&&b.height<160&&b.bottom>0&&b.top<130&&root.getComputedStyle(element).visibility!=="hidden")return element;}}return null;};
    let observedHeader=null;
    function position(){positionFrame=0;const header=currentHeader();if(header!==observedHeader){headerObserver?.disconnect();if(header)headerObserver?.observe(header);observedHeader=header;}const bottom=header?Math.max(0,header.getBoundingClientRect().bottom):56;const height=region.getBoundingClientRect().height||42;const maximum=Math.max(0,root.innerHeight-bottom-20-height);doc.documentElement.style.setProperty("--bl-widget-top",Math.round(bottom+10+Math.min(preferences.offset,maximum))+"px");}
    function queuePosition(){if(!positionFrame)positionFrame=root.requestAnimationFrame(()=>{position();placeBubble();});}
    let previousUnread="",previousSignal="",pendingRing=false,ringTimer=0,ringTarget=null;
    function ring(target){
      if(!target||busy||!preferences.motion||root.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches)return;
      ringTarget?.classList.remove("bl-widget-ringing");root.clearTimeout(ringTimer);
      ringTarget=target;target.classList.remove("bl-widget-ringing");void target.offsetWidth;target.classList.add("bl-widget-ringing");
      ringTimer=root.setTimeout(()=>{ringTarget?.classList.remove("bl-widget-ringing");ringTarget=null;},1150);
    }
    function syncBadge(){
      const bell=releaseSlot?.querySelector(".bl-update-bell");
      if(bell)countLabel=bell.dataset.unreadCount||(bell.classList.contains("has-update")?"1":"");
      const signal=bell?(bell.dataset.noticeRevision||"")+":"+(bell.dataset.releaseSequence||""):"";
      const arrival=Boolean(countLabel)&&(!previousUnread||Number.parseInt(countLabel,10)>Number.parseInt(previousUnread,10)||signal!==previousSignal);
      previousUnread=countLabel;previousSignal=signal;if(bubbleKey==="announcements"&&!bubble.hidden){const next=messageFor("announcements");if(bubble.textContent!==next){bubble.textContent=next;placeBubble();}}
      const hide=!collapsed||!countLabel;if(toggleBadge.hidden!==hide)toggleBadge.hidden=hide;
      const label=(collapsed?"Show widgets":"Hide widgets")+(collapsed&&countLabel?", unread notifications":"");if(collapse.getAttribute("aria-label")!==label)collapse.setAttribute("aria-label",label);
      if(!countLabel)pendingRing=false;
      if(arrival){pendingRing=collapsed;if(!busy)ring(collapsed?collapse:bell||buttons.announcements);}
      else if(pendingRing&&!collapsed&&!busy){pendingRing=false;ring(bell||buttons.announcements);}
    }

    const bubble=doc.createElement("div");bubble.id="bl-widget-speech";bubble.className="bl-widget-speech";bubble.hidden=true;bubble.setAttribute("role","tooltip");region.append(bubble);
    const appNames={"sales-tracker":"Sales Tracker","price-tag-generator":"PTG","megaframe-studio":"MegaFrame","flyer-studio":"MegaFlyer",workspace:"Branchline"};
    const events=new root.AbortController();const listenerOptions={signal:events.signal};
    let bubbleAnchor=null,originalDescription=null,bubbleKey="",bubbleTimer=0,bubbleExpiry=0,touchPreview=null,suppressTouchClickUntil=0;
    function messageFor(key){
      let context="workspace";try{context=options.getContext?.()||"workspace";}catch{}
      const name=appNames[context]||"Branchline";
      if(key==="assistant")return "Hi! Need help with "+name+"?";
      if(key==="announcements")return countLabel?"You have something new to check!":context==="price-tag-generator"?"Check price memo updates and announcements.":"Check the latest announcements and updates.";
      if(key==="guide")return "Need a quick guide? I'll walk you through "+name+".";
      return "";
    }
    function canSpeak(){return preferences.bubbles&&!disposed&&!busy&&!collapsed&&!active&&!settings.open&&releaseSlot?.querySelector(".bl-update-bell")?.getAttribute("aria-expanded")!=="true";}
    function hideBubble(){
      root.clearTimeout(bubbleTimer);root.clearTimeout(bubbleExpiry);bubbleTimer=bubbleExpiry=0;
      if(bubbleAnchor){if(originalDescription===null)bubbleAnchor.removeAttribute("aria-describedby");else bubbleAnchor.setAttribute("aria-describedby",originalDescription);bubbleAnchor=null;originalDescription=null;}
      bubble.hidden=true;bubbleKey="";
    }
    function placeBubble(){
      if(bubble.hidden||!bubbleAnchor)return;
      const anchor=bubbleAnchor.getBoundingClientRect();
      const left=anchor.left,right=root.innerWidth-anchor.right;
      const side=left>=right?"left":"right",space=(side==="left"?left:right)-24;
      if(space<96){hideBubble();return;}
      bubble.dataset.direction=side;bubble.style.maxWidth=Math.min(235,space)+"px";
      const rect=bubble.getBoundingClientRect();const center=anchor.top+anchor.height/2;
      const top=Math.max(8,Math.min(root.innerHeight-rect.height-8,center-rect.height/2));
      bubble.style.top=top+"px";bubble.style.left=(side==="left"?anchor.left-12-rect.width:anchor.right+12)+"px";
      bubble.style.setProperty("--bl-speech-tail-y",Math.max(12,Math.min(rect.height-12,center-top))+"px");
    }
    function showBubble(key,anchor,touch=false){
      if(!canSpeak()||!anchor.isConnected||!anchor.getClientRects().length)return;
      hideBubble();bubbleAnchor=anchor;originalDescription=anchor.getAttribute("aria-describedby");bubbleKey=key;bubble.textContent=messageFor(key);bubble.hidden=false;anchor.setAttribute("aria-describedby",[originalDescription,bubble.id].filter(Boolean).join(" "));placeBubble();
      if(touch)bubbleExpiry=root.setTimeout(hideBubble,2400);
    }
    function bindSpeech(key,anchor){
      if(!anchor)return;
      const nativeTitle=anchor.getAttribute("title");anchor.removeAttribute("title");
      events.signal.addEventListener("abort",()=>{if(nativeTitle!==null)anchor.setAttribute("title",nativeTitle);},{once:true});
      const schedule=()=>{hideBubble();if(canSpeak())bubbleTimer=root.setTimeout(()=>showBubble(key,anchor),250);};
      anchor.addEventListener("pointerenter",e=>{if(e.pointerType==="mouse"||e.pointerType==="pen")schedule();},listenerOptions);
      anchor.addEventListener("pointerleave",e=>{if(e.pointerType!=="touch")hideBubble();},listenerOptions);
      anchor.addEventListener("focus",()=>{if(anchor.matches(":focus-visible"))schedule();},listenerOptions);
      anchor.addEventListener("blur",hideBubble,listenerOptions);
      anchor.addEventListener("pointerdown",e=>{hideBubble();touchPreview=null;if(e.pointerType!=="touch"||!e.isPrimary)return;touchPreview={id:e.pointerId,x:e.clientX,y:e.clientY,shown:false};bubbleTimer=root.setTimeout(()=>{if(touchPreview&&canSpeak()){touchPreview.shown=true;showBubble(key,anchor,true);}},550);},listenerOptions);
      anchor.addEventListener("pointermove",e=>{if(touchPreview?.id===e.pointerId&&Math.hypot(e.clientX-touchPreview.x,e.clientY-touchPreview.y)>10){touchPreview=null;hideBubble();}},listenerOptions);
      anchor.addEventListener("pointerup",e=>{if(touchPreview?.id!==e.pointerId)return;root.clearTimeout(bubbleTimer);bubbleTimer=0;if(touchPreview.shown)suppressTouchClickUntil=Date.now()+700;touchPreview=null;},listenerOptions);
      anchor.addEventListener("pointercancel",()=>{touchPreview=null;hideBubble();},listenerOptions);
      anchor.addEventListener("contextmenu",e=>{if(touchPreview){e.preventDefault();}},listenerOptions);
      anchor.addEventListener("click",e=>{if(Date.now()<suppressTouchClickUntil){suppressTouchClickUntil=0;e.preventDefault();e.stopImmediatePropagation();return;}hideBubble();},{capture:true,signal:events.signal});
    }

    const labels={assistant:"Branchline Assistant",announcements:"Announcements & Updates",guide:"Branchline Guide"};
    const buttons={};const release=options.releaseUpdates||null;let releaseSlot=null,active=null,collapsed=false,busy=false,disposed=false;
    function render(){
      if(!canSpeak())hideBubble();
      controls.hidden=collapsed||busy;
      collapse.hidden=busy;settings.hidden=collapsed||busy;if(settings.hidden)settings.open=false;
      collapse.title=collapsed?"Open widgets":"Collapse widgets";
      grid.style.display=collapsed?"":"none";chevron.style.display=collapsed?"none":"";
      region.dataset.collapsed=String(collapsed);syncBadge();
      collapse.setAttribute("aria-expanded",String(!collapsed));
      for(const key of TYPES)buttons[key]?.setAttribute("aria-expanded",String(active===key));queuePosition();
    }
    function close(){
      if(active!==null){const old=active;active=null;options.onClose?.(old);render();}
    }
    function setCollapsed(value){
      collapsed=Boolean(value);
      if(collapsed){close();release?.close();}
      render();
    }
    function setBusy(value){busy=Boolean(value);if(busy){close();release?.close();}render();}
    let badge;
    for(const key of TYPES){
      if(key==="announcements"&&release){
        releaseSlot=doc.createElement("div");releaseSlot.className="bl-widget-release-slot";
        releaseSlot.addEventListener("click",e=>{if(e.target.closest(".bl-update-bell"))close();},true);
        controls.append(releaseSlot);continue;
      }
      const b=doc.createElement("button");b.type="button";b.className="bl-widget-button bl-widget-"+key;
      b.setAttribute("aria-label",labels[key]);b.title=labels[key];
      const img=doc.createElement("img");img.src=assets[key];img.alt="";img.draggable=false;
      b.append(img);
      if(key==="announcements"){
        badge=doc.createElement("span");badge.className="bl-widget-unread";badge.hidden=true;badge.setAttribute("aria-hidden","true");b.append(badge);
      }
      b.addEventListener("click",()=>{
        if(disposed||busy)return;
        release?.close();
        if(active===key){close();return;}
        close();active=key;render();
        try{options.onOpen(key,b);}catch(error){active=null;render();throw error;}
      });
      buttons[key]=b;controls.append(b);
    }
    function setUnread(n){
      if(release)return false; // The existing updater owns its real availability state.
      const label=unreadLabel(n);countLabel=label;badge.hidden=!label;syncBadge();
      buttons.announcements.setAttribute("aria-label",labels.announcements+(label?", "+label+" unread":""));
    }
    const narrow=root.matchMedia?.("(max-width: 640px)");
    collapsed=Boolean(narrow?.matches);
    collapse.addEventListener("click",()=>{if(!skipClick)setCollapsed(!collapsed);});
    const escape=e=>{if(e.key==="Escape"&&active!==null){const key=active;close();buttons[key].focus();}};
    doc.addEventListener("keydown",escape);
    region.append(collapse,controls,settings);host.append(region);
    if(release){
      try{if(!release.attachFloating(releaseSlot,assets.announcements))throw Error("Existing release bell cannot be relocated in this host");}
      catch(error){doc.removeEventListener("keydown",escape);region.remove();throw error;}
    }
    const releaseBell=releaseSlot?.querySelector(".bl-update-bell");if(releaseBell){badgeObserver=new root.MutationObserver(syncBadge);badgeObserver.observe(releaseBell,{attributes:true,attributeFilter:["class","data-unread-count","data-notice-revision","data-release-sequence"]});}
    bindSpeech("assistant",buttons.assistant);bindSpeech("guide",buttons.guide);bindSpeech("announcements",releaseBell||buttons.announcements);
    settings.addEventListener("toggle",()=>{if(settings.open)hideBubble();},listenerOptions);
    doc.addEventListener("keydown",e=>{if(e.key==="Escape")hideBubble();},listenerOptions);
    root.addEventListener("blur",hideBubble,listenerOptions);
    if(releaseBell){const panelObserver=new root.MutationObserver(()=>{if(!canSpeak())hideBubble();});panelObserver.observe(releaseBell,{attributes:true,attributeFilter:["aria-expanded"]});events.signal.addEventListener("abort",()=>panelObserver.disconnect(),{once:true});}
    if(root.ResizeObserver)headerObserver=new root.ResizeObserver(queuePosition);layoutObserver=new root.MutationObserver(queuePosition);layoutObserver.observe(doc.body,{childList:true,subtree:true});root.addEventListener("resize",queuePosition);root.addEventListener("scroll",queuePosition,true);position();
    applyPreferences();render();setUnread(0);
    return Object.freeze({setUnread,setCollapsed,setBusy,close,dispose(){
      if(disposed)return;disposed=true;hideBubble();events.abort();
      try{close();}finally{try{release?.detachFloating();}finally{doc.removeEventListener("keydown",escape);badgeObserver?.disconnect();root.clearTimeout(ringTimer);ringTarget?.classList.remove("bl-widget-ringing");headerObserver?.disconnect();layoutObserver?.disconnect();root.removeEventListener("resize",queuePosition);root.removeEventListener("scroll",queuePosition,true);if(positionFrame)root.cancelAnimationFrame(positionFrame);doc.documentElement.style.removeProperty("--bl-widget-top");delete documentRoot.dataset.blWidgetSide;delete documentRoot.dataset.blWidgetSize;delete documentRoot.dataset.blWidgetMotion;region.remove();}}
    }});
  }
  const api={mount,unreadLabel,assetURL,normalizePreferences};
  if(typeof module==="object"&&module.exports)module.exports=api;
  else root.BranchlineFloatingWidgets=Object.freeze(api);
})(typeof window!=="undefined"?window:globalThis);
