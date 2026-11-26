import {runCleanup} from "../_shared/retention-cleanup.mjs";
import {verifyRetention,verifyCronToken} from "../_shared/retention-envelope.mjs";
const reply=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
type Admin=Parameters<typeof runCleanup>[0]["admin"];
type Options={project:string;getEnv:(name:string)=>string|undefined;createAdmin:()=>Admin};
export function createRetentionHandler({project,getEnv,createAdmin}:Options){
 return async (request:Request):Promise<Response>=>{
 if(request.method!=="POST")return reply({ok:false},405);
 if(request.headers.has("origin"))return reply({ok:false},403);
 try{
  if(!project)return reply({ok:false},503);
  const cron=request.headers.get("x-retention-cron-token");
  if(cron!==null){
   if(getEnv("RETENTION_RUNTIME_ENABLED")!=="true"||!await verifyCronToken(getEnv("RETENTION_CRON_TOKEN")??"",cron))return reply({ok:false},403);
   const admin=createAdmin();
   return reply({ok:true,cleanup:await runCleanup({admin,actorId:null,dryRun:false,fileId:null})});
  }
  if(Number(request.headers.get("content-length")??0)>8192)return reply({ok:false},413);
  const body=await request.text();
  if(body.length>8192||!await verifyRetention({secret:getEnv("BRANCHLINE_RETENTION_RELAY_SECRET")??"",project,time:request.headers.get("x-branchline-retention-time")??"",body,signature:request.headers.get("x-branchline-retention-signature")??""}))return reply({ok:false},403);
  const input=JSON.parse(body);
  if(!input||typeof input.actorId!=="string"||!uuid.test(input.actorId)||typeof input.requestId!=="string"||!uuid.test(input.requestId))return reply({ok:false},400);
  const admin=createAdmin();
  const actorId=input.actorId;
  let rpc:string,args:Record<string,unknown>;
  const consume=async()=>{const {data,error}=await admin.rpc("branchline_retention_consume_request",{p_request_id:input.requestId});if(error)throw Error("Replay protection unavailable");return data===true;};
  switch(input.action){
   case "overview":rpc="branchline_storage_review";args={p_actor_id:actorId};break;
   case "notices":rpc="branchline_retention_notices";args={p_actor_id:actorId};break;
   case "configure":
    if(input.confirmed!==true||!Number.isInteger(input.days)||input.days<60||input.days>3650||typeof input.enabled!=="boolean")return reply({ok:false},400);
    rpc="branchline_retention_configure";args={p_actor_id:actorId,p_days:input.days,p_enabled:input.enabled};break;
   case "hold":
    if(typeof input.id!=="string"||!uuid.test(input.id)||typeof input.hold!=="boolean")return reply({ok:false},400);
    rpc="branchline_retention_hold";args={p_actor_id:actorId,p_id:input.id,p_hold:input.hold};break;
   case "cleanup":{
    const dryRun=input.dryRun!==false;
    if(!dryRun&&(input.confirmed!==true||getEnv("RETENTION_RUNTIME_ENABLED")!=="true"))return reply({ok:false},403);
    const fileId=input.id??null;if(fileId!==null&&(typeof fileId!=="string"||!uuid.test(fileId)))return reply({ok:false},400);
    if(!dryRun&&!await consume())return reply({ok:false,message:"Duplicate request rejected"},409);
    return reply({ok:true,cleanup:await runCleanup({admin,actorId,dryRun,fileId})});
   }
   default:return reply({ok:false},400);
  }
  if((input.action==="configure"||input.action==="hold")&&!await consume())return reply({ok:false,message:"Duplicate request rejected"},409);
  const {data,error}=await admin.rpc(rpc,args);
  if(error)return reply({ok:false,message:error.code==="P0001"?error.message:"Storage operation not confirmed"},error.code==="P0001"?400:error.code==="42501"?403:503);
  return reply({ok:true,data});
 }catch{return reply({ok:false,message:"Storage operation not confirmed"},503);}
 };
}
