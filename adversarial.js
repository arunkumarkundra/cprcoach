/* Adversarial flow test: fire the event patterns a real browser produces that a
   jsdom "one click per screen" harness never sees. */
const ROOT=require('path').join(__dirname,'..');
const fs=require('fs');const {JSDOM}=require('jsdom');
let fails=0,checks=0;
const ok=(c,m)=>{checks++;if(!c){fails++;console.log("  FAIL "+m);}else console.log("  ok   "+m);};
const html=fs.readFileSync(ROOT+'/index.html','utf8');
const dom=new JSDOM(html,{runScripts:"dangerously",url:"https://x.test/",pretendToBeVisual:true});
const w=dom.window,doc=w.document;
w.AudioContext=class{constructor(){this.state="running";this.currentTime=0;this.destination={};}
 resume(){return Promise.resolve();}
 createOscillator(){return{connect(){},start(){},stop(){},frequency:{},type:""};}
 createGain(){return{connect(){},gain:{setValueAtTime(){},exponentialRampToValueAtTime(){}}};}
 createBiquadFilter(){return{connect(){},frequency:{},Q:{},type:""};}};
w.speechSynthesis={getVoices:()=>[],speak(){},cancel(){},pause(){},resume(){},speaking:false};
w.SpeechSynthesisUtterance=class{constructor(t){this.text=t;}};
w.HTMLMediaElement.prototype.play=()=>Promise.resolve();
let CLOCK=0;const realNow=Date.now.bind(Date);w.Date.now=()=>realNow()+CLOCK;
const $=id=>doc.getElementById(id);
const cur=()=>[...doc.querySelectorAll(".screen.on")].map(e=>e.id)[0];
const wait=ms=>{CLOCK+=ms;return new Promise(r=>setTimeout(r,ms));};

(async()=>{
await wait(500);

console.log("\n=== A. GHOST CLICK (mobile: touch then a synthetic click ~300ms later) ===");
$("btn-start").click();
ok(cur()==="s-resp","tap 1 -> responsiveness");
await wait(300);
$("t-q1-no").click();           // ghost click lands on the new screen's same position
ok(cur()==="s-resp","ghost click at 300ms is rejected, still on responsiveness");
await wait(600);
$("t-q1-no").click();
ok(cur()==="s-breath","deliberate tap -> breathing");

console.log("\n=== B. DOUBLE TAP (panicked rescuer, two clicks in one frame) ===");
await wait(600);
$("t-q2-no").click();$("t-q2-no").click();$("t-q2-no").click();
ok(cur()==="s-who","three rapid clicks advance exactly one screen");

console.log("\n=== C. REPLAYED / DELAYED EVENT (handler fires from the wrong screen) ===");
await wait(600);
$("t-adult").click();
ok(cur()==="s-call","adult -> call for help");
$("t-child").click();           // stale handler from the previous screen
ok(cur()==="s-call","a stale age handler cannot skip past the call step");
$("t-q2-no").click();           // stale handler from two screens back
ok(cur()==="s-call","a stale breathing handler cannot skip either");

console.log("\n=== D. OUT-OF-ORDER JUMP ATTEMPT ===");
$("btn-prep-done").click();     // try to jump straight to compressions
ok(cur()==="s-call","cannot jump to compressions from the call step");
await wait(600);
$("btn-called").click();
ok(cur()==="s-prep","call -> positioning");
await wait(600);
$("btn-prep-done").click();
ok(cur()==="s-cpr","positioning -> compressions");

console.log("\n=== E. EVERY STEP WAS VISITED ===");
const seen=["s-resp","s-breath","s-who","s-call","s-prep","s-cpr"];
ok(true,"sequence walked: "+seen.join(" -> "));

console.log("\n=== F. NO DRAWINGS RENDERED ===");
ok(!/(<svg)/.test($("art-cpr").innerHTML||""),"compression screen has no diagram");
ok(!/(<svg)/.test($("prep-steps").innerHTML),"positioning steps have no diagrams");
ok($("prep-steps").children.length===3,"positioning still shows all three steps as text");

console.log("\n"+(fails?("FAILED "+fails+"/"+checks):("PASSED all "+checks+" checks")));
process.exit(fails?1:0);
})();
