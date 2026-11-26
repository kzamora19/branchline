import {test} from "node:test";
import assert from "node:assert/strict";
import {signRetention,verifyRetention,verifyCronToken} from "../../supabase/functions/_shared/retention-envelope.mjs";
const secret="synthetic-only-long-enough-secret-123456",project="synthetic-project",time=String(Date.now()),body=JSON.stringify({actorId:"00000000-0000-0000-0000-000000000001",action:"overview"}),signature=await signRetention(secret,project,time,body);
test("only exact authenticated target, body and timestamp verify",async()=>{const good={secret,project,time,body,signature};assert.equal(await verifyRetention(good),true);for(const changes of [{body:body.replace("overview","cleanup")},{project:"other-project"},{secret:"x".repeat(40)},{signature:"0".repeat(64)},{now:Number(time)+61000},{time:""}])assert.equal(await verifyRetention({...good,...changes}),false);});
test("cron token requires separate sufficiently strong matching secret",async()=>{assert.equal(await verifyCronToken(secret,secret),true);assert.equal(await verifyCronToken(secret,"different"),false);assert.equal(await verifyCronToken("short","short"),false);});
