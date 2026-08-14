/* Verifies every factual claim in SPEC.md against the actual code.
   A specification that drifts from the code is worse than none — it is used as
   project context, so a wrong number here propagates into every future change. */
const ROOT=require('path').join(__dirname,'..');
const fs=require('fs');
const spec=fs.readFileSync(ROOT+'/SPEC.md','utf8');
const html=fs.readFileSync(ROOT+'/index.html','utf8');
const app=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1])[2];
let fails=0;
const ok=(c,m)=>{if(!c){fails++;console.log("  FAIL "+m);}else console.log("  ok   "+m);};

const build=(html.match(/const BUILD="([^"]+)"/)||[])[1];
ok(spec.includes("`"+build+"`"), "build of record matches code ("+build+")");
ok(/const BPM=110/.test(app) && spec.includes("110/min"), "metronome rate 110");
ok(app.includes("},3800)") && spec.includes("3800 ms"), "beat delay 3800 ms");
ok(app.includes("},10200)") && spec.includes("10.2 s"), "breath window 10.2 s");
ok(app.includes("2600") && app.includes("6600") && spec.includes("2.6 s") && spec.includes("6.6 s"), "breath cue timings");
ok(app.includes("lastSwapPrompt>120") && spec.includes("120 s"), "rescuer swap prompt 120 s");
ok(/b.disabled=false;\}\),400\)/.test(app) && spec.includes("400 ms"), "button disarm 400 ms");
ok(app.includes("now-last>330") && spec.includes("330 ms"), "video peak refractory 330 ms");
ok(app.includes("mean*1.55+1.5") && spec.includes("mean × 1.55 + 1.5"), "video threshold formula");
ok(app.includes("seenRate<95||S.seenRate>130") && spec.includes("95–130/min"), "rate warning band");
ok(app.includes("now-last>4000") && spec.includes("4 s"), "stillness alert 4 s");
ok(app.includes("cv.width=48") && spec.includes("48×36"), "video downsample size");
ok(/},9000\)/.test(app) && spec.includes("9 s"), "speech watchdog 9 s");
ok(app.includes("1250:880") && spec.includes("880 Hz") && spec.includes("1250 Hz"), "click frequencies");
ok(app.includes("0.85:0.62") && spec.includes("0.62 / 0.85"), "click gains");
ok(app.includes("scheduler,25") && spec.includes("25 ms"), "scheduler poll 25 ms");
ok(app.includes("scheduler,120") && spec.includes("120 ms"), "suspended-context retry 120 ms");
ok(app.includes("startKeepAlive();audioHealth();},600)") && spec.includes("600 ms"), "keep-alive delay 600 ms");

const flow=(app.match(/const FLOW=\[[^\]]*\]/)||[])[0];
ok(flow && spec.includes('const FLOW = ["s-resp","s-breath","s-who","s-call","s-prep","s-cpr"]'), "FLOW array documented");
const back=(app.match(/const BACK=\{[^}]*\}/)||[])[0];
["s-breath","s-who","s-call","s-prep","s-code"].forEach(k=>
  ok(back.includes('"'+k+'"'), "BACK contains "+k));
ok(!back.includes('"s-cpr":') && !back.includes('"s-aed":'), "no back from compressions or AED");

const screens=[...html.matchAll(/class="screen[^"]*" id="(s-[^"]+)"/g)].map(m=>m[1]);
ok(screens.length===12 && spec.includes("Twelve screens"), "twelve screens");
screens.forEach(s=>ok(spec.includes("`"+s+"`"), "spec documents "+s));

const media=eval("("+app.match(/const MEDIA=\{[\s\S]*?\};/)[0].replace("const MEDIA=","").replace(/;\s*$/,"")+")");
Object.entries(media).forEach(([k,f])=>{
  ok(fs.existsSync(ROOT+"/"+f), "MEDIA."+k+" file exists");
  ok(spec.includes(f.split("/").pop()), "spec lists "+f.split("/").pop());
});

const LANG_REGISTRY={};function registerLang(c,p){LANG_REGISTRY[c]=p;}
const en=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1])[1];
eval(en.replace('const LANG_REGISTRY={};','').replace('function registerLang(code,pack){LANG_REGISTRY[code]=pack;}',''));
const p=LANG_REGISTRY.en;
ok(Object.keys(p).length===48 && spec.includes("48 top-level keys"), "pack has 48 top-level keys");
ok(Object.keys(p.ui).length===34 && spec.includes("ui{34 keys}"), "34 ui strings");
ok(p.say.keep.length===6 && spec.includes("one of six lines"), "six cue lines");
ok(p.aedSteps.length===5 && spec.includes("aedSteps[5]"), "five AED steps");
ok(p.dScript.length===6 && spec.includes("dScript[6]"), "six dispatcher script steps");
ok(p.article.s.length===7 && spec.includes("s[7]"), "seven article sections");
["bi1","bi2","bi3"].forEach(k=>ok(p.say[k], "infant ventilation string "+k));

// every mark() label must appear in the documented event vocabulary
const labels=[...app.matchAll(/mark\("([^"]+)"/g)].map(m=>m[1].trim()).filter(x=>x.length>4);
[...new Set(labels)].forEach(l=>ok(spec.includes(l), "event vocabulary lists: "+l));

const phases=[...new Set([...app.matchAll(/phase="(\w+)"/g)].map(m=>m[1]))];
phases.forEach(ph=>ok(spec.includes("`"+ph+"`"), "phase documented: "+ph));

["?lang=","?code=","?role=dispatcher","?debug=1"].forEach(u=>
  ok(spec.includes(u), "URL parameter documented: "+u));

console.log("\n"+(fails?("SPEC IS OUT OF DATE — "+fails+" mismatch(es)"):"SPEC.md matches the code exactly."));
process.exit(fails?1:0);
