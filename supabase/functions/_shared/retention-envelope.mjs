// Shared server-only HMAC envelope. Distinct secret per target project.
const enc=new TextEncoder();
const hex=bytes=>Array.from(new Uint8Array(bytes),n=>n.toString(16).padStart(2,"0")).join("");
const constantEqual=(a,b)=>{if(typeof a!=="string"||typeof b!=="string"||a.length!==b.length)return false;let x=0;for(let i=0;i<a.length;i++)x|=a.charCodeAt(i)^b.charCodeAt(i);return x===0;};
export async function signRetention(secret,project,time,body){
 if(typeof secret!=="string"||secret.length<32||typeof project!=="string"||!project||typeof time!=="string"||!/^\d{13}$/.test(time)||typeof body!=="string"||body.length>8192)throw Error("Invalid storage envelope");
 const key=await crypto.subtle.importKey("raw",enc.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
 return hex(await crypto.subtle.sign("HMAC",key,enc.encode("branchline-retention-v1\n"+project+"\n"+time+"\n"+body)));
}
export async function verifyRetention({secret,project,time,body,signature,now=Date.now()}){
 if(typeof signature!=="string"||!/^[a-f0-9]{64}$/.test(signature)||typeof time!=="string"||!/^\d{13}$/.test(time)||Math.abs(now-Number(time))>60000)return false;
 try{return constantEqual(await signRetention(secret,project,time,body),signature);}catch{return false;}
}
export async function verifyCronToken(expected,actual){
 if(typeof expected!=="string"||expected.length<32||typeof actual!=="string"||actual.length>512)return false;
 const a=hex(await crypto.subtle.digest("SHA-256",enc.encode(expected))),b=hex(await crypto.subtle.digest("SHA-256",enc.encode(actual)));return constantEqual(a,b);
}
