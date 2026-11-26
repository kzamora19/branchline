import {createClient} from "npm:@supabase/supabase-js@2.95.0";
import {createRetentionHandler} from "./handler.ts";
const url=Deno.env.get("SUPABASE_URL")??"",key=Deno.env.get("SUPABASE_SECRET_KEY")??Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??"";
const project=url?new URL(url).hostname.split(".")[0]:"";
Deno.serve(createRetentionHandler({project,getEnv:name=>Deno.env.get(name),createAdmin:()=>{
 if(!url||!key)throw Error("Missing project-local backend configuration");
 return createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}});
}}));
