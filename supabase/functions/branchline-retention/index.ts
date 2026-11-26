import {createClient} from "npm:@supabase/supabase-js@2.95.0";
import {runCleanup} from "../_shared/retention-cleanup.mjs";
import {verifyRetention,verifyCronToken} from "../_shared/retention-envelope.mjs";
const url=Deno.env.get("SUPABASE_URL")??"",key=Deno.env.get("SUPABASE_SECRET_KEY")??Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??"";
const project=url?new URL(url).hostname.split(".")[0]:"";
const reply=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
Deno.serve(async request=>{
 if(request.method!=="POST")return reply({ok:false},405);
 if(request.headers.has("origin"))return reply({ok:false},403);
 try{
  if(!url||!key||!project)return reply({ok:false},503);
  const cron=request.headers.get("x-retention-cron-token");
  if(cron!==null){
   if(Deno.env.get("RETENTION_RUNTIME_ENABLED")!=="true"||!await verifyCronToken(Deno.env.get("RETENTION_CRON_TOKEN")??"",cron))return reply({ok:false},403);
   const admin=createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}});
   return reply({ok:true,cleanup:await runCleanup({admin,actorId:null,dryRun:false,fileId:null})});
  }
  if(Number(request.headers.get("content-length")??0)>8192)return reply({ok:false},413);
  const body=await request.text();
  if(body.length>8192||!await verifyRetention({secret:Deno.env.get("BRANCHLINE_RETENTION_RELAY_SECRET")??"",project,time:request.headers.get("x-branchline-retention-time")??"",body,signature:request.headers.get("x-branchline-retention-signature")??""}))return reply({ok:false},403);
  const input=JSON.parse(body);
  if(!input||typeof input.actorId!=="string"||!uuid.test(input.actorId))return reply({ok:false},400);
  const admin=createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}});
  const actorId=input.actorId;
  let rpc:string,args:Record<string,unknown>;
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
    if(!dryRun&&(input.confirmed!==true||Deno.env.get("RETENTION_RUNTIME_ENABLED")!=="true"))return reply({ok:false},403);
    const fileId=input.id??null;if(fileId!==null&&(typeof fileId!=="string"||!uuid.test(fileId)))return reply({ok:false},400);
    return reply({ok:true,cleanup:await runCleanup({admin,actorId,dryRun,fileId})});
   }
   default:return reply({ok:false},400);
  }
  const {data,error}=await admin.rpc(rpc,args);
  if(error)return reply({ok:false,message:error.code==="P0001"?error.message:"Storage operation not confirmed"},error.code==="P0001"?400:error.code==="42501"?403:503);
  return reply({ok:true,data});
 }catch{return reply({ok:false,message:"Storage operation not confirmed"},503);}
});
