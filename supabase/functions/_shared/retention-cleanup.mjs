// Server-only. No browser-supplied bucket/path or service credential.
const BUCKET="branchline-retained-imports";
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes)),n=>n.toString(16).padStart(2,"0")).join("");
// Explicit nullable types for Deno inference. Only backend clients call this adapter.
/** @param {{admin: any,actorId:string|null,dryRun?:boolean,fileId?:string|null}} options */
export async function runCleanup({admin,actorId,dryRun=true,fileId=null}){
 if(actorId!==null&&(typeof actorId!=="string"||!uuid.test(actorId)))throw Error("Invalid actor");
 if(fileId!==null&&(typeof fileId!=="string"||!uuid.test(fileId)))throw Error("Invalid file id");
 const {data,error}=await admin.rpc("branchline_retention_candidates",{p_actor_id:actorId});
 if(error||!Array.isArray(data))throw Error("Cleanup candidates unavailable");
 const selected=fileId?data.filter(r=>r.id===fileId):data.slice(0,10);
 const report={candidates:selected.length,deleted:0,skipped:0,review:0,dryRun,reviewStages:[]};
 if(dryRun)return report;
 const bucket=admin.storage.from(BUCKET);
 for(const {id} of selected){
  const {data:claim,error:claimError}=await admin.rpc("branchline_retention_claim",{p_actor_id:actorId,p_id:id});
  if(claimError){report.review++;report.reviewStages.push("claim");continue;}if(!claim){report.skipped++;continue;}
  const finish=async outcome=>{const {error}=await admin.rpc("branchline_retention_finish",{p_token:claim.token,p_outcome:outcome});if(error)throw Error("Cleanup outcome not recorded");};
  let stage="claim-validation";
  try{
   if(claim.id!==id||!uuid.test(claim.token)||!uuid.test(id)||!(/^[a-f0-9]{64}$/).test(claim.sha256)||typeof claim.path!=="string"||!claim.path.startsWith("originals/"+claim.sha256+"/"+id+".")||!/^originals\/[a-f0-9]{64}\/[a-f0-9-]{36}\.(xlsx|xls|xlsm|csv|pdf|png|jpg|jpeg|webp)$/.test(claim.path)||!Number.isSafeInteger(claim.bytes)||claim.bytes<=0||claim.bytes>20*1024*1024)throw Error("Unverified claim");
   stage="download-and-hash";
   const {data:blob,error:downloadError}=await bucket.download(claim.path);
   if(downloadError||!blob||blob.size!==claim.bytes||await hash(await blob.arrayBuffer())!==claim.sha256)throw Error("File verification failed");
   stage="revalidate";
   const {data:stillEligible,error:checkError}=await admin.rpc("branchline_retention_revalidate",{p_token:claim.token});
   if(checkError)throw Error("Revalidation unavailable");
   if(stillEligible!==true){await finish("cancelled");report.skipped++;continue;}
   stage="remove";
   const {error:removeError}=await bucket.remove([claim.path]);
   if(removeError)throw Error("Deletion not confirmed");
   stage="verify-absence";
   // HEAD/exists has inconsistent missing-object responses across Storage versions.
   // Require a successful exact-parent list, an unambiguous page, and no exact name.
   // Finalization separately verifies absence of the exact database storage object.
   const split=claim.path.lastIndexOf("/"),parent=claim.path.slice(0,split),leaf=claim.path.slice(split+1);
   const {data:listed,error:listError}=await bucket.list(parent,{search:leaf,limit:100,offset:0});
   if(listError||!Array.isArray(listed)||listed.length>=100||listed.some(o=>!o||typeof o.name!=="string"||o.name===leaf))throw Error("Object absence not confirmed");
   stage="finalize";
   await finish("deleted");report.deleted++;
  }catch{
   report.reviewStages.push(stage);
   try{await finish("review");}catch{/* Claim remains locked for audited reconciliation. Never retry deletion blindly. */}
   report.review++;
  }
 }
 return report;
}
