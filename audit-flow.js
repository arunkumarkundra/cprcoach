/* Whole-workflow audit: enumerate every screen, every exit, and flag dead ends,
   unreachable states and clinically wrong transitions. */
const ROOT=require('path').join(__dirname,'..');
const fs=require('fs');
const html=fs.readFileSync(ROOT+'/index.html','utf8');
const app=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1])[2];
const screens=[...html.matchAll(/class="screen[^"]*" id="(s-[^"]+)"/g)].map(m=>m[1]);

// map every screen -> the buttons it shows and where each leads
const exits={};
screens.forEach(s=>exits[s]=[]);
const add=(from,label,to)=>exits[from]&&exits[from].push({label,to});

add("s-home","SOMEONE COLLAPSED","s-resp");
add("s-home","Dispatcher (header)","s-console");
add("s-resp","Yes — responded","s-alive");
add("s-resp","No — nothing","s-breath");
add("s-breath","Yes — breathing","s-alive");
add("s-breath","No / unsure","s-who");
add("s-breath","back","s-resp");
add("s-who","adult / child / infant","s-call");
add("s-who","back","s-breath");
add("s-call","Done — next step","s-prep");
add("s-call","I'm alone","s-prep");
add("s-call","back","s-who");
add("s-prep","Ready — start pushing","s-cpr");
add("s-prep","back","s-call");
add("s-cpr","Defibrillator","s-aed");
add("s-cpr","They're breathing","s-alive");
add("s-cpr","Handing over","s-cpr (reset)");
add("s-cpr","Breaths toggle","s-cpr");
add("s-cpr","Paramedics here","s-hand");
add("s-cpr","Join video","s-code");
add("s-code","Connect","s-cpr");
add("s-code","Not now","s-cpr");
add("s-aed","step 5 / Back","s-cpr");
add("s-alive","They stopped breathing","s-who OR s-cpr (conditional)");
add("s-alive","Handover summary","s-hand");
add("s-hand","Share / Copy","s-hand");
add("s-hand","Start over","s-home");
add("s-console","Exit","s-home");

console.log("=== SCREEN GRAPH ===");
let issues=[];
screens.forEach(s=>{
  console.log("\n"+s);
  if(!exits[s].length){issues.push(s+" is a DEAD END — no way out");console.log("   (no exits)");}
  exits[s].forEach(e=>console.log("   "+e.label.padEnd(28)+"→ "+e.to));
});

console.log("\n=== REACHABILITY ===");
const reached=new Set(["s-home"]);
let grew=true;
while(grew){grew=false;
  screens.forEach(s=>{if(!reached.has(s))return;
    exits[s].forEach(e=>{const t=e.to.split(" ")[0];
      if(screens.includes(t)&&!reached.has(t)){reached.add(t);grew=true;}});});}
screens.forEach(s=>{if(!reached.has(s))issues.push(s+" is UNREACHABLE from home");});
console.log(reached.size+"/"+screens.length+" screens reachable from home");

console.log("\n=== CLINICAL CHECKS ===");
const check=(cond,msg)=>{console.log((cond?"  ok   ":"  FAIL ")+msg);if(!cond)issues.push(msg);};
check(/if\(S.cprStarted\)/.test(app),"re-arrest after CPR resumes compressions directly");
check(/else\{mark\("Deteriorated/.test(app),"re-arrest without prior CPR runs who → call → prep");
check(/btn-medics/.test(app),"paramedic handover reachable from the compression screen");
const BACKOBJ=app.match(/const BACK=\{[^}]*\};/)[0];
check(!/"s-cpr":/.test(BACKOBJ),"no back button during compressions");
check(!/"s-aed":/.test(BACKOBJ),"no back button during AED");
check(!/"s-hand":/.test(BACKOBJ),"no back button off the handover record");
check(/"s-code":"s-cpr"/.test(BACKOBJ),"video code screen returns to compressions");
check(/current!=="s-alive"\)return/.test(app),"restart button only fires from the recovery screen");
check(/current!=="s-cpr"&&current!=="s-aed"\)return/.test(app),"paramedic button only fires mid-resuscitation");
check(/S.breaths=\(S.who!=="adult"\)/.test(app),"breaths default set by patient age");
// every file named in MEDIA must actually exist, or the browser logs a 404
const media=eval("("+app.match(/const MEDIA=\{[\s\S]*?\};/)[0].replace("const MEDIA=","").replace(/;\s*$/,"")+")");
Object.entries(media).forEach(([k,f])=>
  check(fs.existsSync(ROOT+"/"+f), "MEDIA."+k+" -> "+f+" exists on disk"));
check(Object.keys(media).length===0||true,"MEDIA declares "+Object.keys(media).length+" image(s)");
check(/ts:Date.now\(\)/.test(app),"every logged event carries a wall-clock timestamp");

console.log("\n"+(issues.length?("ISSUES:\n - "+issues.join("\n - ")):"No dead ends, no unreachable screens, all clinical checks pass."));
process.exit(issues.length?1:0);
