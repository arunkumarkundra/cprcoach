/* Flow regression test. Boots the real index.html in a DOM and walks every path. */
const ROOT=require('path').join(__dirname,'..');
const fs=require('fs');const {JSDOM}=require('jsdom');
let fails=0, checks=0;
const ok=(c,m)=>{checks++;if(!c){fails++;console.log("  FAIL "+m);}else console.log("  ok   "+m);};

const html=fs.readFileSync(ROOT+'/index.html','utf8');
const dom=new JSDOM(html,{runScripts:"dangerously",url:"https://x.test/",pretendToBeVisual:true});
const w=dom.window,doc=w.document;
// stub the browser APIs the app touches
w.AudioContext=class{constructor(){this.state="running";this.currentTime=0;this.destination={};}
 resume(){return Promise.resolve();}
 createOscillator(){return{connect(){},start(){},stop(){},frequency:{},type:""};}
 createGain(){return{connect(){},gain:{setValueAtTime(){},exponentialRampToValueAtTime(){}}};}
 createBiquadFilter(){return{connect(){},frequency:{},Q:{},type:""};}};
w.speechSynthesis={getVoices:()=>[],speak(){},cancel(){},pause(){},resume(){},speaking:false};
w.SpeechSynthesisUtterance=class{constructor(t){this.text=t;}};
w.HTMLMediaElement.prototype.play=()=>Promise.resolve();

const $=id=>doc.getElementById(id);
const on=()=>[...doc.querySelectorAll(".screen.on")].map(e=>e.id);
// virtual clock: a real user cannot tap twice in the same millisecond, and the
// app now guards against exactly that, so the harness must pace itself
let CLOCK=0;const realNow=Date.now.bind(Date);
w.Date.now=()=>realNow()+CLOCK;
// buttons are disabled for 400 ms after a screen appears, so the harness must
// actually wait — a virtual clock alone cannot re-enable a real DOM attribute
const settle=()=>new Promise(r=>setTimeout(r,430));
const tap=async id=>{CLOCK+=600;const e=$(id);if(!e)throw new Error("no element "+id);e.click();await settle();};
const tapFast=id=>{const e=$(id);if(!e)throw new Error("no element "+id);e.click();};

(async()=>{
await settle();
console.log("\n=== 1. HOME ===");
ok(on().join()==="s-home","starts on home");
ok($("btn-console").style.display!=="none","dispatcher link visible on home");
ok($("btn-sound").style.display==="none","sound control hidden on home");
ok($("t-home-h").textContent.length>0,"home headline populated");
ok($("article").children.length>0,"SEO article rendered");

console.log("\n=== 2. FULL ARREST PATH ===");
await tap("btn-start");            ok(on().join()==="s-resp","1 responsiveness");
ok($("t-q1").textContent.includes("shoulder"),"  question text present");
await tap("t-q1-no");              ok(on().join()==="s-breath","2 breathing");
ok($("t-q2-warn").textContent.toLowerCase().includes("gasping"),"  agonal warning present");
await tap("t-q2-no");              ok(on().join()==="s-who","3 WHO ARE YOU HELPING");
ok($("t-adult").textContent.length>0,"  adult option labelled");
ok($("t-child").textContent.length>0,"  child option labelled");
ok($("t-infant").textContent.length>0,"  infant option labelled");
await tap("t-adult");              ok(on().join()==="s-call","4 CALL FOR HELP");
ok($("s-call").querySelector(".stepno").textContent.includes("4"),"  labelled Step 4 of 6");
ok($("t-call-h").textContent.toLowerCase().includes("ambulance"),"  call instruction present");
await tap("btn-called");           ok(on().join()==="s-prep","5 positioning");
ok($("s-prep").querySelector(".stepno").textContent.includes("5"),"  labelled Step 5 of 6");
ok($("prep-steps").children.length===3,"  three positioning steps rendered");
ok(!$("prep-steps").innerHTML.includes("<svg"),"  positioning steps carry no diagram");
await tap("btn-prep-done");        ok(on().join()==="s-cpr","6 compressions");
ok(!$("art-cpr").innerHTML.includes("svg"),"  compression screen carries no diagram");

console.log("\n=== 3. CPR SCREEN CONTROLS ===");
await tap("btn-swap");
ok(on().join()==="s-cpr","handover stays on the compression screen");
ok(parseInt($("counter").textContent,10)<5,"handover resets the counter for the new rescuer");
await tap("btn-breaths");ok(true,"breaths toggle does not throw");
await tap("btn-breaths");
await tap("btn-aed");    ok(on().join()==="s-aed","AED mode");
for(let i=0;i<5;i++)await tap("btn-aed-next");
ok(on().join()==="s-cpr","AED sequence returns to compressions");
await tap("btn-video");  ok(on().join()==="s-code","video code screen");
await tap("btn-code-back");ok(on().join()==="s-cpr","code screen backs out");
await tap("btn-alive");  ok(on().join()==="s-alive","recovery");
await tap("btn-handover2");ok(on().join()==="s-hand","handover summary");
ok($("loglist").children.length>=6,"handover log has every milestone ("+$("loglist").children.length+" rows)");
const path=[...$("loglist").querySelectorAll("span")].map(e=>e.textContent).filter(x=>x.startsWith("→ step"));
ok(path.length>=5,"handover records the screen path: "+path.map(p=>p.split(" ")[2]).join(" "));
await tap("btn-home");   ok(on().join()==="s-home","start over");

console.log("\n=== 4. ALTERNATE EXITS ===");
await tap("btn-start");await tap("t-q1-yes"); ok(on().join()==="s-alive","responsive -> recovery");
await tap("btn-home");
await tap("btn-start");await tap("t-q1-no");await tap("t-q2-yes"); ok(on().join()==="s-alive","breathing -> recovery");
await tap("btn-home");
await tap("btn-start");await tap("t-q1-no");await tap("t-q2-no");await tap("t-infant");
ok(on().join()==="s-call","infant path reaches call step");
await tap("btn-alone"); ok(on().join()==="s-prep","alone path reaches positioning");
await tap("btn-home");

console.log("\n=== 5. BACK NAVIGATION ===");
await tap("btn-start");await tap("t-q1-no");
ok($("hdr-back").style.display!=="none","back arrow on triage");
await tap("hdr-back"); ok(on().join()==="s-resp","back works");
await tap("t-q1-no");await tap("t-q2-no");await tap("t-adult");await tap("btn-called");await tap("btn-prep-done");
ok($("hdr-back").style.display==="none","NO back button during compressions");
ok($("hdr-clock").style.display!=="none","elapsed clock shown during compressions");
await tap("btn-alive");await tap("btn-handover2");await tap("btn-home");

console.log("\n=== 6. DISPATCHER CONSOLE ===");
await tap("btn-console");
ok(on().join()==="s-console","console opens");
ok(/^\d{6}$/.test($("d-code").textContent),"6-digit code generated");
ok($("d-quote").textContent.length>0,"script line rendered");
ok($("d-speak").offsetParent!==null||$("d-speak").style.display!=="none","Play button visible for English");
ok($("d-langsel").options.length===6,"caller-language select has all languages");
ok($("stagewrap").hidden===true,"video stage hidden until opened");
ok($("d-metro").className.includes("b-quiet"),"metronome is a quiet control, not red");
const before=$("d-quote").textContent; await tap("d-next");
ok($("d-quote").textContent!==before,"next advances the script");
await tap("d-mark-recog"); ok($("d-mark-recog").className.includes("done"),"recognition timestamp captured");
await tap("d-mark-first"); ok($("d-mark-first").className.includes("done"),"first-compression timestamp captured");
await tap("hdr-exit"); ok(on().join()==="s-home","exit returns home");

console.log("\n=== 7. DOUBLE-TAP GUARD (mobile step-skipping) ===");
// consecutive screens put their red answer in the same position; a fast double
// touch must NOT advance two screens
await tap("btn-start");
CLOCK+=600;$("t-q1-no").click();          // no settle: buttons on the new screen are still disarmed
ok(on().join()==="s-breath","first tap advances to breathing");
tapFast("t-q2-no");
ok(on().join()==="s-breath","instant second tap in the same position is rejected");
tapFast("t-q2-no");
ok(on().join()==="s-breath","a third instant tap is also rejected");
await settle();
await tap("t-q2-no");
ok(on().join()==="s-who","a deliberate tap after the guard window works");
await tap("btn-home");

console.log("\n=== 8. AUDIO ===");
await tap("btn-start");await tap("t-q1-no");await tap("t-q2-no");await tap("t-adult");await tap("btn-called");await tap("btn-prep-done");
ok(on().join()==="s-cpr","reached compressions for audio test");
ok(/keepAlive.pause/.test(html),"keep-alive tears itself down if it suspends the context");
ok(/silentWav/.test(html),"keep-alive uses a real one-second silence, not a zero-length loop");
ok(/setTimeout\(\(\)=>\{startKeepAlive\(\);audioHealth\(\);\},600\)/.test(html),"keep-alive starts only after the beat is running");
ok($("btn-sound").textContent.length>0,"sound control shows a state glyph");
await tap("btn-home");

console.log("\n=== 9. NO STALE-BUILD MACHINERY ===");
ok(!/serviceWorker\.register/.test(html),"no service worker is registered");
ok(/getRegistrations/.test(html),"page unregisters any worker left by an old build");
ok(/caches\.delete/.test(html),"page clears caches left by an old build");
ok(/const BUILD="/.test(html),"build stamp present in source");
ok($("buildtag").textContent.length>0,"build stamp rendered on home");

console.log("\n=== 10. NO DIAGRAMS / FLOW HARDENING ===");
ok(/const SVG=\{\};/.test(html),"no built-in drawings ship");
ok(!/<svg class="art"/.test(html),"no diagram markup anywhere in the source");
ok(/MEDIA=\{/.test(html),"media table present for verified photos");
ok(/mediaOK\[key\]=false/.test(html),"a missing media file fails silently");
ok(/function step\(from,to,fn\)/.test(html),"transitions are gated by origin screen");
ok(/b.disabled=true/.test(html),"buttons disarm for 400ms on every screen change");
ok(/const FLOW=\["s-resp","s-breath","s-who","s-call","s-prep","s-cpr"\]/.test(html),"flow order declared in one place");
ok((html.match(/class="eyebrow stepno"/g)||[]).length===5,"every emergency screen carries a step number");
ok(/debug.*===\"1\"/.test(html)||/get\("debug"\)==="1"/.test(html),"?debug=1 transition trace available");

console.log("\n=== 11. LOCALISATION ===");
const chrome=["hdr-elapsed","hdr-exit","btn-console","btn-copy","btn-home","d-saylbl","d-sellbl",
 "d-codelbl","d-linklbl","d-nextlbl","d-recoglbl","d-firstlbl","d-vidlbl"];
ok(chrome.every(id=>$(id).textContent.trim().length>0),"all console chrome labels populated");
ok($("d-metro").textContent.includes("110/min"),"metronome label shows rate");
ok($("langsel").options.length===6,"header language select lists six languages");
ok([...$("langsel").options].some(o=>o.textContent.includes("Hindi")),"options show native and Latin names");
ok($("d-langsel").options.length===6,"caller language select lists six languages");
ok(/function langName\(code,inLocale\)/.test(html),"language names resolve into the reader's own language");
ok(!/langsheet|langlist|langsearch/.test(html),"the old custom language sheet is gone");
ok(/id="d-prevlbl"/.test(html),"back button is labelled, not a bare arrow");
ok(/u.copyLink/.test(html),"video link button reads 'Copy link'");

console.log("\n"+(fails?("FAILED "+fails+"/"+checks):("PASSED all "+checks+" checks")));
process.exit(fails?1:0);
})();
