// Assemble a downloadable four-app GitHub Pages staging candidate.
// SAFE GUARDS: No Pages deployment, no production source mutations, and no
// private Studio editor bytes in this artifact. Rehosting still requires an
// isolated GitHub Pages repository and verified staging-specific URLs.
import {readFileSync,writeFileSync,mkdirSync,readdirSync,statSync,
  existsSync,cpSync,copyFileSync,rmSync} from "node:fs";
import {resolve,join,dirname,extname} from "node:path";
import {fileURLToPath} from "node:url";
import {createHash} from "node:crypto";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const parent=resolve(root,"..");
const out=resolve(root,"staging","candidate-bundle");
if(process.env.BRANCHLINE_STAGING_CANDIDATE!=="1")
  throw Error("Explicit staging candidate mode required");
if(!process.env.STAGING_SUPABASE_PUBLISHABLE_KEY?.startsWith("sb_publishable_"))
  throw Error("Staging publishable key is required; never use a secret/service key");
const refs={
 branchline:process.env.BRANCHLINE_REF||"unverified",
 ptg:process.env.PTG_REF||"unverified",
 megaframe:process.env.MEGAFRAME_REF||"unverified",
 megaflyer:process.env.MEGAFLYER_REF||"unverified",
};
const stageId="rlfdvmiqkbitetatxkju";
const liveIds=["psoopubvdpwztzkdyifa","agknxlowackphvwyvxge",
 "vmyoxoiygfcecgkbavgg","tzklsscoiwnmeantcefw"];
const sha=v=>createHash("sha256").update(v).digest("hex");
rmSync(out,{recursive:true,force:true});
mkdirSync(out,{recursive:true});
const bl=join(out,"branchline");mkdirSync(bl,{recursive:true});
const allowedExt=new Set([".html",".js",".mjs",".css",".json",".webmanifest",
 ".svg",".png",".jpg",".jpeg",".webp",".ico",".woff2",".ttf",".wasm"]);
for(const file of readdirSync(root)){
 const source=join(root,file);
 if(statSync(source).isDirectory()){
  if(["apps","icons","import-engine"].includes(file))
   cpSync(source,join(bl,file),{recursive:true});
  continue;
 }
 if(file===".nojekyll"||allowedExt.has(extname(file).toLowerCase()) &&
   !/(^|\.)test\.[cm]?js$/.test(file) && !file.endsWith(".spec.js"))
  copyFileSync(source,join(bl,file));
}
const stagePublicKey=process.env.STAGING_SUPABASE_PUBLISHABLE_KEY;
const configPath=join(bl,"supabase-config.js");
const original=readFileSync(configPath,"utf8");
if(!original.includes("psoopubvdpwztzkdyifa")||
 !original.includes("sb_publishable_e_6K64Wul2fJEq2KiuvnTA_NmuaKqNm"))
 throw Error("Sales Tracker Supabase configuration has drifted; reject staging copy");
const staged=original
 .replaceAll("psoopubvdpwztzkdyifa",stageId)
 .replaceAll("sb_publishable_e_6K64Wul2fJEq2KiuvnTA_NmuaKqNm",stagePublicKey);
if(liveIds.some(id=>staged.includes(id)))throw Error("Production project in staged Sales Tracker config");
writeFileSync(configPath,staged);
const parts=[
 ["first-megasaver-ptg","first-megasaver-ptg/out"],
 ["megaframe-studio","megaframe-studio/staging/.candidate-cutover"],
 ["flyer-studio","flyer-studio/staging/.candidate-cutover"]
];
for(const [dest,rel] of parts){
 const path=join(parent,rel);
 if(!existsSync(path))throw Error("Missing required built public part: "+rel);
 cpSync(path,join(out,dest),{recursive:true});
}
for(const [studio,live] of [
 ["megaframe-studio","vmyoxoiygfcecgkbavgg"],
 ["flyer-studio","tzklsscoiwnmeantcefw"]
]){
 const p=join(out,studio,"studio","index.html");
 let html=readFileSync(p,"utf8");
 if(!html.includes(live))throw Error(studio+" public launcher endpoint changed; reject");
 html=html.replaceAll(live,stageId);
 if(liveIds.some(id=>html.includes(id)))throw Error("Live backend found in "+studio+" launcher");
 if(/PRIVATE (MEGAFRAME )?EDITOR BUNDLE|id="quickSaveProject"|id="photosInput"|<canvas/i.test(html))
  throw Error("Private editor bytes leaked into public "+studio+" launcher");
 writeFileSync(p,html);
}
for(const [app,filename] of [
 ["branchline","index.html"],["first-megasaver-ptg","studios/index.html"],
 ["megaframe-studio","studio/index.html"],["flyer-studio","studio/index.html"]
]){
 if(!existsSync(join(out,app,filename)))throw Error("Missing "+app+"/"+filename);
}
const digest={};
for(const [app,filename] of [
 ["branchline","index.html"],["first-megasaver-ptg","studios/index.html"],
 ["megaframe-studio","studio/index.html"],["flyer-studio","studio/index.html"]
])digest[app]=sha(readFileSync(join(out,app,filename)));
const manifest={
 name:"Branchline unified staging RELEASE CANDIDATE ONLY",
 createdAt:new Date().toISOString(),refs,
 stagingSupabaseProject:stageId,
 githubPagesPublished:false,
 previewAppPaths:["branchline/","first-megasaver-ptg/",
  "megaframe-studio/studio/","flyer-studio/studio/"],
 status:"NOT HOSTED - DO NOT deploy these raw paths before staging hostname & absolute URL rewrite verification",
 notes:[
  "This artifact never publishes or edits production GitHub Pages.",
  "PTG static export currently uses its original /first-megasaver-ptg basePath; a nested staging Pages repo needs a separate basePath build.",
  "Studio ticket issuance intentionally stays unavailable until an isolated public staging origin and server authorization are tested.",
  "Studio editors are private backend-delivered and are never packaged into these public Studio launchers.",
  "Sales Tracker config is replaced with the isolated staging Supabase URL/publishable key.",
  "Other absolute links, publisher aliases and auth/CORS paths must be audited before hosting.",
  "WebView2 installer, physical printing, Drive/OAuth and existing PWA upgrades have not been accepted."
 ],entrypointDigestsSha256:digest,
};
writeFileSync(join(out,"STAGING-MANIFEST.json"),JSON.stringify(manifest,null,2)+"\n");
writeFileSync(join(out,"README-NOT-HOSTED.txt"),manifest.notes.join("\n")+
 "\n\nA separate GitHub Pages staging repository is required. Do not import this into an existing live site's publishing branch.\n");
console.log(JSON.stringify({output:out,manifest},null,2));
