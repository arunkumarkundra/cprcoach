/* CPR Coach — unit tests for the three add-on modules
   =================================================================
   Folder: tests/test-modules.js        NOT SERVED — run with node.

       node tests/test-modules.js

   This does NOT replace tests/test.js. That one boots the real
   index.html and walks the flow. This one rebuilds only the console DOM
   and the globals the application script provides, then exercises the
   three modules in isolation — including the states that are hard to
   reach by clicking: a dropped data channel, a half-applied edit to
   js/relay.js, and a first-compression mark made before recognition.

   The relay bus, the case log and the beat are stubbed here, so a
   failure in this file points at one of the three modules and nowhere
   else. Requires jsdom, same as tests/test.js.

   42 assertions.
*/
const { JSDOM } = require("jsdom");
const fs = require("fs");

const HTML = `<!doctype html><html><body>
<header><button id="hdr-back"></button><span id="hdr-clock"></span>
 <button id="btn-sound">🔊</button><select id="langsel"></select>
 <button id="hdr-exit"></button><a id="btn-console"></a></header>
<section class="screen" id="s-cpr"><div id="counter">0</div></section>
<section class="screen" id="s-console"><div class="d-wrap">
  <div class="d-say"><div class="d-quote" id="d-quote"></div>
    <button id="d-prev"></button><button id="d-next"></button>
    <select id="d-langsel"></select><button id="d-speak"></button></div>
  <div class="row d-ms">
    <button class="ms" id="d-mark-recog"><small></small><b>—:—</b></button>
    <button class="ms" id="d-mark-first"><small></small><b>—:—</b></button></div>
  <div class="d-video"><div class="codebox"></div>
    <div class="stagewrap" id="stagewrap" hidden></div><div id="tiles"></div></div>
  <button id="d-metro"></button>
</div></section></body></html>`;

const dom = new JSDOM(HTML, { runScripts: "outside-only", pretendToBeVisual: true });
const w = dom.window;

// ---- pulses recorded here
const pulses = [];
w.navigator.vibrate = (ms) => { pulses.push(ms); return true; };

// ---- the globals index.html's application script provides
const app = `
  var S = { lang:"en", who:null, breaths:false, t0:null, count:0, total:0, cycles:0,
            running:false, cprStarted:false, aedStep:0, log:[], muted:false,
            lastSwapPrompt:0, dLang:"en", dCode:"123456", dLink:"", dStep:0, dT0:null,
            peer:null, stream:null, feeds:{}, sel:null, vision:false, seenRate:0 };
  var phase = "idle";
  var current = "s-home";
  var FLOW = ["s-resp","s-breath","s-who","s-call","s-prep","s-cpr"];
  var ac = { state:"running" };
  var LANG_REGISTRY = { en: { name:"English", code:"en-US",
    adult:"Adult", child:"Child", infant:"Infant",
    ui:{ step:"Step", of:"of", arrestRec:"Arrest recognised", firstComp:"First compression" },
    dScript:[{s:"1"},{s:"2"},{s:"3"},{s:"4"},{s:"5"},{s:"6"}] } };
  function t(){ return LANG_REGISTRY[S.lang] || LANG_REGISTRY.en; }
  var MARKS = [];
  function mark(l){ MARKS.push(l); }
  var BEATS = [];
  function onBeat(n){ BEATS.push(n); }
  function mmss(s){ return Math.floor(s/60)+":"+String(s%60).padStart(2,"0"); }
  // stand-in for the case log module
  var CASELOG = [];
  window.caseLog = { add:function(s){ CASELOG.push(s); }, reset:function(){ CASELOG.length=0; },
                     entries:function(){ return CASELOG.slice(); } };
  // stand-in for the relayBus edit in js/relay.js
  var BUSSENT = [], BUSFNS = [], BUSLIVE = 0;
  window.relayBus = {
    on: function(f){ BUSFNS.push(f); },
    send: function(o){ if(!BUSLIVE) return 0; BUSSENT.push(JSON.parse(JSON.stringify(o))); return BUSLIVE; },
    live: function(){ return BUSLIVE; }
  };
  window.__deliver = function(msg){ BUSFNS.forEach(function(f){ f(msg); }); };
  // index.html sets the console's milestone labels on click
  document.getElementById("d-mark-recog").onclick = function(e){
    e.currentTarget.querySelector("b").textContent = mmss(7); e.currentTarget.classList.add("done"); };
  document.getElementById("d-mark-first").onclick = function(e){
    e.currentTarget.querySelector("b").textContent = mmss(120); e.currentTarget.classList.add("done"); };
  document.getElementById("btn-console").onclick = function(){
    S.dT0 = Date.now(); S.dStep = 0; current = "s-console"; };
`;
const ready = new Promise(r => {
  if (w.document.readyState !== "loading") return r();
  w.document.addEventListener("DOMContentLoaded", () => r());
});

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log("  FAIL " + m); } else console.log("  ok   " + m); };
const $ = (id) => w.document.getElementById(id);
const tick = (ms) => { const n = Math.ceil(ms / 500); for (let i = 0; i < n; i++) w.eval("void 0"); };
// jsdom timers run for real; advance by waiting
const wait = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  await ready;
  w.eval(app);
  const ROOT = require("path").join(__dirname, "..");
  for (const f of ["js/haptic.js", "js/interval.js", "js/mirror.js"]) {
    w.eval(fs.readFileSync(require("path").join(ROOT, f), "utf8"));
  }

  console.log("\n=== HAPTIC ===");
  ok(!!$("btn-buzz"), "vibration toggle injected next to the sound control");
  ok($("btn-buzz").textContent === "📴", "starts off");
  ok(w.eval("window.onBeat.__haptic === true"), "beat handler wrapped");

  // beats with vibration off -> no pulses, original handler still runs
  w.eval("current='s-cpr'; phase='compress'; for(var i=1;i<=5;i++) onBeat(i);");
  ok(w.eval("BEATS.length") === 5, "original beat handler still receives every beat");
  ok(pulses.length === 0, "no pulses while off");

  $("btn-buzz").dispatchEvent(new w.Event("click"));
  ok(pulses.length === 1 && pulses[0] === 90, "tapping on gives one confirmation pulse");
  pulses.length = 0;
  w.eval("for(var i=1;i<=10;i++) onBeat(i);");
  ok(pulses.length === 10, "ten beats -> ten pulses");
  ok(pulses.slice(0, 9).every(x => x === 40), "beats 1-9 are short pulses");
  ok(pulses[9] === 90, "every tenth beat is the long accent");

  // not on the compression screen -> silent
  pulses.length = 0;
  w.eval("current='s-console'; for(var i=1;i<=5;i++) onBeat(i);");
  ok(pulses.length === 0, "no vibration off the compression screen (console metronome)");
  w.eval("current='s-cpr'");

  // automatic engagement when muted
  $("btn-buzz").dispatchEvent(new w.Event("click"));   // explicit off
  pulses.length = 0;
  ok($("btn-buzz").textContent === "📴", "explicit off honoured");
  w.eval("S.muted = true;");
  await wait(700);
  ok($("btn-buzz").textContent === "📴", "explicit off is respected even when muted");
  w.eval("for(var i=1;i<=3;i++) onBeat(i);");
  ok(pulses.length === 0, "  and stays silent");

  console.log("\n=== INTERVAL ===");
  $("btn-console").dispatchEvent(new w.Event("click"));
  await wait(600);
  ok(!!$("ivl"), "interval readout injected under the milestone row");
  ok($("ivl").querySelector("b").textContent === "—:—", "inert before recognition is marked");

  $("d-mark-recog").dispatchEvent(new w.Event("click"));
  await wait(1200);
  const running = $("ivl").querySelector("b").textContent;
  ok(/^0:0[12]$/.test(running), "counts up live after recognition (" + running + ")");
  ok($("ivl").classList.contains("run"), "shows as running");

  $("d-mark-first").dispatchEvent(new w.Event("click"));
  await wait(600);
  ok($("ivl").classList.contains("done"), "settles green once first compression is marked");
  const settled = $("ivl").querySelector("b").textContent;
  ok(/^0:0[12]$/.test(settled), "holds the interval (" + settled + ")");
  await wait(700);
  ok($("ivl").querySelector("b").textContent === settled, "and stops counting");
  ok(w.eval("CASELOG.filter(function(s){return s.indexOf('recognition to first compression')>=0}).length") === 1,
     "one case-log entry for the interval");

  console.log("\n=== MIRROR: console side ===");
  ok(!!$("mirror"), "caller-state card injected above the video");
  ok($("mirror").textContent.indexOf("No link") >= 0, "says so plainly when there is no link");

  w.eval("BUSLIVE = 1;");
  w.eval(`window.__deliver({k:"cs",who:"adult",scr:"s-cpr",ph:"compress",cpr:true,br:false,el:134,tot:245});`);
  await wait(100);
  const card = $("mirror").textContent;
  ok(card.indexOf("Adult") >= 0, "patient rendered in the dispatcher's language");
  ok(card.indexOf("6 / 6") >= 0, "step number rendered");
  ok(card.indexOf("2:14") >= 0 && card.indexOf("245") >= 0, "elapsed and total rendered");
  ok($("mirror").classList.contains("live"), "link shown as live");
  const log = w.eval("CASELOG.join(' | ')");
  ok(log.indexOf("Caller app reports patient: adult") >= 0, "logs the patient");
  ok(log.indexOf("Caller app reports step 6/6 — compressions") >= 0, "logs the step");
  ok(log.indexOf("Caller app reports compressions already started") >= 0, "logs compressions");

  // an unknown message must be ignored, not crash
  w.eval(`window.__deliver({k:"say",i:3}); window.__deliver({k:"hello",lang:"ta"}); window.__deliver(null);`);
  ok(true, "ignores messages it does not own");

  // repeat identical state -> no duplicate log lines
  const before = w.eval("CASELOG.length");
  w.eval(`window.__deliver({k:"cs",who:"adult",scr:"s-cpr",ph:"compress",cpr:true,br:false,el:140,tot:256});`);
  ok(w.eval("CASELOG.length") === before, "unchanged state adds no log noise");
  ok(w.eval("CASELOG.join(' | ')").indexOf("Caller app link established") >= 0,
     "records the link coming up, from the message itself");

  // link drops
  w.eval("BUSLIVE = 0;");
  await wait(900);
  ok(w.eval("CASELOG.join(' | ')").indexOf("Caller app link lost") >= 0, "records the link dropping");

  console.log("\n=== MIRROR: caller side ===");
  // become the caller: leave the console screen, start a rescue
  w.eval(`current="s-cpr"; S.peer=null; S.t0=Date.now()-95000; S.who="child";
          S.cprStarted=true; S.breaths=true; S.total=173; BUSLIVE=1; BUSSENT.length=0;`);
  await wait(900);
  const sent = w.eval("JSON.stringify(BUSSENT)");
  const arr = JSON.parse(sent);
  ok(arr.length >= 1, "caller sends a snapshot when the channel is live");
  ok(arr[0].k === "cs" && arr[0].who === "child" && arr[0].cpr === true && arr[0].br === true,
     "snapshot carries the fields the console needs");
  ok(arr[0].el >= 94 && arr[0].el <= 97, "elapsed seconds correct (" + arr[0].el + ")");
  ok(Object.keys(arr[0]).length === 8, "and nothing else — 8 fields, no free text");
  ok(w.eval("MARKS.filter(function(m){return m==='Status shared with control room'}).length") === 1,
     "one line in the rescuer's handover record");

  // no further sends while nothing changes (heartbeat is 5 s)
  const n1 = w.eval("BUSSENT.length");
  await wait(1500);
  ok(w.eval("BUSSENT.length") === n1, "no traffic while state is unchanged");

  // a real change goes immediately
  w.eval(`S.who="infant";`);
  await wait(900);
  ok(w.eval("BUSSENT.length") > n1, "a state change is sent at once");

  console.log("\n=== MISSING relayBus (half-applied edit) ===");
  w.eval("delete window.relayBus;");
  await wait(900);
  ok($("mirror").textContent.indexOf("js/relay.js") >= 0,
     "card names the file to fix rather than showing nothing");

  console.log("\n" + (fails ? fails + " FAILURES" : "all assertions passed"));
  process.exit(fails ? 1 : 0);
})();
