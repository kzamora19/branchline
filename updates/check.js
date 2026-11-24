/* Production Branchline web release notifications. No native downloads. */
(function(root){
  "use strict";
  const VERSION=value=>Number.isSafeInteger(value)&&value>0;
  function inspect(manifest, running){
    if(!VERSION(running)||!manifest||manifest.schema!==1||
       manifest.channel!=="production"||manifest.app!=="sales"||!VERSION(manifest.sequence)) return "invalid";
    return manifest.sequence===running?"current":manifest.sequence>running?"available":"invalid";
  }
  // Only return to established app entry routes, never replay a signed Studio
  // ticket or use a destination supplied by a remote manifest.
  function restartPath(path){
    if(path==="/branchline/apps/"||path==="/branchline/apps/index.html")return "/branchline/apps/";
    if(path==="/branchline/"||path==="/branchline/index.html")return "/branchline/";
    return null;
  }
  if(typeof module==="object"&&module.exports){module.exports={inspect,restartPath};return;}
  const doc=root.document, script=doc.currentScript;
  if(root.location.origin!=="https://kzamora19.github.io"||!script)return;
  const running=Number(script.dataset.sequence);
  const version=script.dataset.releaseLabel||"Branchline web";
  if(!VERSION(running)||!restartPath(root.location.pathname))return;
  function start(){
    if(doc.getElementById("bl-release-check"))return;
    const box=doc.createElement("section");box.id="bl-release-check";
    box.setAttribute("aria-label","Branchline software updates");
    box.className="bl-release-check";
    const status=doc.createElement("span");status.setAttribute("role","status");
    status.setAttribute("aria-live","polite");status.hidden=true;
    const check=doc.createElement("button");check.type="button";check.textContent="Check for updates";
    const about=doc.createElement("small");about.className="bl-release-version";
    about.textContent=version;about.title="Current web release (not Windows launcher version)";
    const restart=doc.createElement("button");restart.type="button";restart.id="bl-release-restart";restart.textContent="Update & Restart";restart.hidden=true;
    const dismiss=doc.createElement("button");dismiss.type="button";dismiss.textContent="Later";dismiss.hidden=true;
    box.append(about,status,check,restart,dismiss);doc.body.append(box);
    let checking=false, restarting=false, available=null, dismissed=null, confirmRestart=false;
    function resetConfirmation(){confirmRestart=false;restart.dataset.confirm="false";restart.textContent="Update & Restart";}
    function promptUpdate(){
      resetConfirmation();
      status.textContent="Branchline Workspace Update Available. Save your work before restarting to load the new web version.";
      status.hidden=false;restart.hidden=!restartPath(root.location.pathname);dismiss.hidden=false;box.classList.add("bl-update-available");
    }
    async function refresh(manual){
      if(checking||restarting||(!manual&&(doc.visibilityState==="hidden"||confirmRestart)))return;
      checking=true;check.disabled=true;
      try{
        const response=await root.fetch("/branchline/updates/release.json",{cache:"no-store",credentials:"omit",redirect:"error"});
        if(!response.ok)throw Error("Release request failed");
        const manifest=await response.json();
        const result=inspect(manifest,running);
        if(result==="invalid")throw Error("Invalid release");
        if(result==="available"){
          available=manifest.sequence;
          if(manual||dismissed!==available){
            promptUpdate();
          }
        }else{
          available=null;dismissed=null;resetConfirmation();restart.hidden=true;dismiss.hidden=true;box.classList.remove("bl-update-available");
          status.hidden=!manual;if(manual)status.textContent="This web workspace is up to date.";
        }
      }catch{
        if(manual){resetConfirmation();restart.hidden=true;dismiss.hidden=true;status.hidden=false;status.textContent="Could not check for updates. Try again when connected.";}
      }finally{checking=false;check.disabled=false;}
    }
    check.addEventListener("click",()=>refresh(true));
    dismiss.addEventListener("click",()=>{if(restarting)return;dismissed=available;resetConfirmation();status.hidden=true;restart.hidden=true;dismiss.hidden=true;box.classList.remove("bl-update-available");});
    restart.addEventListener("click",async()=>{
      if(checking||restarting||!available)return;
      const target=restartPath(root.location.pathname);
      if(!target)return;
      if(!confirmRestart){
        confirmRestart=true;restart.dataset.confirm="true";restart.textContent="I saved my work — restart";
        status.textContent="Save all open projects, sales entries and print queues first. Restarting may close unsaved work. Select Later to keep working.";
        return;
      }
      restarting=true;check.disabled=true;restart.disabled=true;dismiss.disabled=true;
      const wanted=available;
      try{
        if(!root.navigator.onLine)throw Error("Offline");
        // Refuse to restart while the deployment or service worker still serves
        // an older shell. Check a public static entry only, no auth or query data.
        const response=await root.fetch(target,{cache:"no-store",credentials:"omit",redirect:"error"});
        if(!response.ok)throw Error("Entry unavailable");
        const body=await response.text();
        const parsed=new root.DOMParser().parseFromString(body,"text/html");
        const entry=parsed.querySelector('script[data-branchline-web-release][data-sequence]');
        if(!entry||entry.getAttribute("src")!=="/branchline/updates/check.js?v="+wanted)throw Error("Entry script differs");
        if(!entry||Number(entry.dataset.sequence)!==wanted)throw Error("Entry revision differs");
        root.location.assign(target);
      }catch{
        resetConfirmation();status.textContent="The new workspace is not ready on this device. Your current work is still open; try again when connected.";
      }finally{restarting=false;check.disabled=false;restart.disabled=false;dismiss.disabled=false;}
    });
    root.addEventListener("online",()=>refresh(false));
    doc.addEventListener("visibilitychange",()=>{if(doc.visibilityState==="visible")refresh(false);});
    root.setInterval(()=>refresh(false),15*60*1000);
    refresh(false);
  }
  if(doc.readyState==="complete")start();else root.addEventListener("load",start,{once:true});
})(typeof window!=="undefined"?window:globalThis);
