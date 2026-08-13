/* Ships-or-not gate for the language packs.
   A build script once truncated every pack to zero bytes; index.html still worked
   because English is inline, so nothing failed loudly — language switching just
   silently stopped. This runs before packaging and refuses to pass on an empty,
   unparseable, unregistered or incomplete pack. */
const ROOT=require('path').join(__dirname,'..');
const fs=require('fs'),path=require('path');
const LANG_REGISTRY={};
function registerLang(c,p){LANG_REGISTRY[c]=p;}
let fails=0;
const fail=m=>{fails++;console.log("  FAIL "+m);};

// reference: the English pack inlined in index.html
const html=fs.readFileSync(ROOT+'/index.html','utf8');
const enBlock=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1])[1];
eval(enBlock.replace('const LANG_REGISTRY={};','').replace('function registerLang(code,pack){LANG_REGISTRY[code]=pack;}',''));
const ref=LANG_REGISTRY.en;
if(!ref) {console.log("FAIL: English pack not inline in index.html");process.exit(1);}

// every code the app offers must have a working pack
const idx=eval(html.match(/const LANG_INDEX=\[[\s\S]*?\];/)[0].replace('const LANG_INDEX=',''));
console.log("languages offered:",idx.map(l=>l.code).join(" "));

idx.filter(l=>l.code!=="en").forEach(l=>{
 const p="lang/"+l.code+".js";
 if(!fs.existsSync(ROOT+'/'+p))return fail(l.code+": "+p+" does not exist");
 const src=fs.readFileSync(ROOT+'/'+p,"utf8");
 if(src.trim().length===0)return fail(l.code+": FILE IS EMPTY");
 if(src.length<1000)return fail(l.code+": suspiciously small ("+src.length+" bytes)");
 if(!src.includes('registerLang("'+l.code+'"'))return fail(l.code+": does not call registerLang(\""+l.code+"\")");
 try{eval(src);}catch(e){return fail(l.code+": parse error — "+e.message);}
 const pack=LANG_REGISTRY[l.code];
 if(!pack)return fail(l.code+": did not register");
 const gaps=[];
 (function walk(a,b,prefix){
  for(const k of Object.keys(a)){
   if(b[k]===undefined){gaps.push(prefix+k);continue;}
   if(Array.isArray(a[k])){
    if(!Array.isArray(b[k]))gaps.push(prefix+k+" (not an array)");
    else if(a[k].length!==b[k].length)gaps.push(prefix+k+" length "+b[k].length+" != "+a[k].length);
   } else if(a[k]&&typeof a[k]==="object")walk(a[k],b[k],prefix+k+".");
  }
 })(ref,pack,"");
 if(gaps.length)return fail(l.code+": missing "+gaps.join(", "));
 console.log("  ok   "+l.code+"  "+src.length+" bytes, "+Object.keys(pack.ui).length+" ui keys, full parity");
});

console.log(fails?("\nFAILED "+fails+" pack(s) — DO NOT SHIP"):"\nAll language packs load and match English exactly.");
process.exit(fails?1:0);
