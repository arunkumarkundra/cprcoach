/* CPR Coach — speech engine
   =================================================================
   Folder: js/speech.js
   Load AFTER the main application script in index.html.

   This file replaces say() from index.html. It changes nothing else.

   WHY IT EXISTS — three separate Android Chrome defects were producing
   the three symptoms reported:

   1. TRUNCATION MID-SENTENCE.
      Chrome abandons a single utterance that runs past roughly fifteen
      seconds. Worse, the pause()/resume() watchdog in index.html — which
      exists to work around that very defect — is itself harmful on
      Android, where pause() can stop output permanently and resume() can
      restart a sentence from the beginning. Fixed here by splitting text
      at sentence boundaries so no single utterance is ever long enough to
      trip the defect, and by neutralising pause() on Android.

   2. OVERLAPPING SENTENCES.
      speechSynthesis.cancel() is asynchronous. index.html calls speak()
      on the very next line, which races it, so the outgoing utterance is
      still running when the new one starts. Fixed by holding exactly one
      utterance in flight at a time, driven by our own queue, with a
      settling delay after every cancel().

   3. POOR VOICE QUALITY.
      index.html accepted the first voice whose language tag matched. On
      Android that is often a low-quality fallback even when a much better
      voice for the same language is installed. Fixed by scoring the
      candidates instead of taking the first.

   NOTE ON THE LIMITS OF SOFTWARE: on Android the actual voice comes from
   the operating system's text-to-speech engine, not from the browser. If
   the high-quality voice data for a language is not installed on the
   handset, no web page can conjure it. See the deployment notes.
*/
(function () {
  "use strict";

  var ss = window.speechSynthesis;
  if (!ss) {                                  // no synthesiser at all
    window.say = function () {};
    window.sayStop = function () {};
    return;
  }

  var UA = navigator.userAgent || "";
  var ANDROID = /Android/i.test(UA);
  var DEBUG = false;
  try { DEBUG = new URLSearchParams(location.search).get("debug") === "1"; } catch (e) {}

  function log(msg) {
    if (!DEBUG) return;
    try { if (typeof trace === "function") trace("speech: " + msg); } catch (e) {}
    try { console.log("[speech] " + msg); } catch (e) {}
  }

  /* ------------------------------------------------------------------
     1. Disarm the old pause/resume watchdog.

     The interval in index.html keeps running; we cannot clear it from
     here because its handle was never stored. Instead we make the two
     methods it calls harmless. resume() is still honoured when the
     synthesiser really is paused, which is the only case where it helps.
  ------------------------------------------------------------------ */
  var nativeResume = null;
  try { nativeResume = ss.resume.bind(ss); } catch (e) {}
  if (ANDROID) {
    try { ss.pause = function () {}; } catch (e) {}
    try {
      ss.resume = function () {
        try { if (ss.paused && nativeResume) nativeResume(); } catch (e2) {}
      };
    } catch (e) {}
  }

  /* ------------------------------------------------------------------
     2. Voices.

     Android populates the list late and sometimes more than once, so we
     listen for the event AND poll briefly at startup. We attach with
     addEventListener rather than assigning onvoiceschanged, so the
     handler already installed by index.html keeps working.
  ------------------------------------------------------------------ */
  var voices = [];
  var voiceCache = {};

  function loadVoices() {
    var v = [];
    try { v = ss.getVoices() || []; } catch (e) { v = []; }
    if (v.length !== voices.length) voiceCache = {};   // re-score on change
    voices = v;
  }
  loadVoices();
  try {
    if (ss.addEventListener) ss.addEventListener("voiceschanged", loadVoices);
  } catch (e) {}
  var polls = 0;
  var vpoll = setInterval(function () {
    loadVoices();
    if (voices.length || ++polls > 25) clearInterval(vpoll);
  }, 300);

  /* Names that indicate a deliberately low-fidelity or novelty voice. */
  var POOR = /espeak|pico|compact|eloquence|zarvox|albert|bahh|bells|boing|bubbles|cellos|deranged|hysterical|jester|organ|superstar|trinoids|whisper|wobble|bad news|good news|pipe organ/i;
  /* Names that indicate a full-quality voice on the platforms we target. */
  var GOOD = /google|neural|natural|enhanced|premium|siri|nicky|aaron|rishi|lekha|veena|moira|tessa|daniel|karen|monica|paulina|jorge|hala|maged/i;

  function pickVoice(code) {
    if (voiceCache[code] !== undefined) return voiceCache[code];
    if (!voices.length) return null;              // do not cache a null-by-timing

    var want = String(code).toLowerCase().replace("_", "-");
    var base = want.split("-")[0];
    var pool = [];
    for (var i = 0; i < voices.length; i++) {
      var lang = String(voices[i].lang || "").toLowerCase().replace("_", "-");
      if (lang === want || lang.split("-")[0] === base) pool.push(voices[i]);
    }
    if (!pool.length) { voiceCache[code] = null; return null; }

    var best = null, bestScore = -1e9;
    for (var j = 0; j < pool.length; j++) {
      var v = pool[j];
      var vl = String(v.lang || "").toLowerCase().replace("_", "-");
      var name = String(v.name || "");
      var s = 0;
      if (vl === want) s += 40;                    // exact region match
      if (GOOD.test(name)) s += 30;
      if (POOR.test(name)) s -= 70;
      if (v.default) s += 4;
      if (ANDROID) {
        if (/google/i.test(name)) s += 25;         // Google TTS beats OEM engines
        if (v.localService) s += 4;                // installed = no network stall
      } else {
        if (!v.localService) s += 8;               // desktop: server voices are better
      }
      if (s > bestScore) { bestScore = s; best = v; }
    }
    voiceCache[code] = best;
    log("voice for " + code + " = " + (best ? best.name + " [" + best.lang + "]" : "engine default"));
    return best;
  }

  /* ------------------------------------------------------------------
     3. Splitting text into utterance-sized pieces.

     Break on sentence punctuation, including the Devanagari danda and
     the Arabic full stop and question mark. Hard-cap any run that has no
     punctuation. Very short fragments are folded back into the previous
     piece so the delivery does not sound chopped.
  ------------------------------------------------------------------ */
  var BREAKS = ".!?;:\u0964\u06D4\u061F\u3002\uFF01\uFF1F";
  var MAX = 150, MIN = 14;

  function splitText(text) {
    var s = String(text).replace(/\s+/g, " ").trim();
    if (!s) return [];
    var out = [], start = 0, i = 0;
    while (i < s.length) {
      var atBreak = BREAKS.indexOf(s.charAt(i)) >= 0 &&
                    (i + 1 >= s.length || s.charAt(i + 1) === " ");
      if (atBreak) {
        out.push(s.slice(start, i + 1).trim());
        start = i + 1;
      } else if (i - start >= MAX) {
        var cut = s.lastIndexOf(" ", i);
        if (cut <= start) cut = i;
        out.push(s.slice(start, cut).trim());
        start = cut;
      }
      i++;
    }
    if (start < s.length) out.push(s.slice(start).trim());

    var merged = [];
    for (var k = 0; k < out.length; k++) {
      if (!out[k]) continue;
      if (merged.length && (out[k].length < MIN ||
          merged[merged.length - 1].length < MIN) &&
          merged[merged.length - 1].length + out[k].length <= MAX) {
        merged[merged.length - 1] += " " + out[k];
      } else {
        merged.push(out[k]);
      }
    }
    return merged;
  }

  /* ------------------------------------------------------------------
     4. The queue. Exactly one utterance in flight, ever.
  ------------------------------------------------------------------ */
  var queue = [];          // [{text, code}]
  var busy = false;        // an utterance is out with the synthesiser
  var blockUntil = 0;      // do not speak before this timestamp
  var guard = null;        // absolute-limit timer
  var monitor = null;      // silence detector
  var pumpT = null;

  function clearTimers() {
    if (guard) { clearTimeout(guard); guard = null; }
    if (monitor) { clearInterval(monitor); monitor = null; }
  }

  function langCode(want) {
    try {
      var reg = (typeof LANG_REGISTRY !== "undefined") ? LANG_REGISTRY : null;
      var key = want || ((typeof S !== "undefined" && S) ? S.lang : "en");
      var pack = reg ? (reg[key] || reg.en) : null;
      if (pack && pack.code) return pack.code;
    } catch (e) {}
    return "en-US";
  }

  function isMuted() {
    try { return !!(typeof S !== "undefined" && S && S.muted); } catch (e) { return false; }
  }

  /* Wipe everything. Used on a deliberate interruption — a new screen,
     a new instruction. The settling delay is the whole point: cancel()
     has not finished when it returns, so we refuse to speak for a moment. */
  function stopAll(settle) {
    queue.length = 0;
    clearTimers();
    if (pumpT) { clearTimeout(pumpT); pumpT = null; }
    busy = false;
    try { ss.cancel(); } catch (e) {}
    blockUntil = Date.now() + (settle === undefined ? (ANDROID ? 220 : 140) : settle);
  }

  function pump() {
    if (pumpT) { clearTimeout(pumpT); pumpT = null; }
    if (busy) return;
    if (!queue.length) return;
    var wait = blockUntil - Date.now();
    if (wait > 0) { pumpT = setTimeout(pump, wait + 10); return; }

    var item = queue.shift();
    var u;
    try { u = new SpeechSynthesisUtterance(item.text); } catch (e) { return; }

    var v = pickVoice(item.code);
    if (v) { u.voice = v; u.lang = v.lang; } else { u.lang = item.code; }
    /* Android engines resample non-integer rates and the result is muddier.
       Desktop Safari and Chrome are unaffected, so they keep the slower
       reading speed that was chosen for clarity. */
    u.rate = ANDROID ? 1 : 0.97;
    u.pitch = 1;
    u.volume = 1;

    var finished = false;
    var startedAt = Date.now();

    function done(why) {
      if (finished) return;
      finished = true;
      clearTimers();
      busy = false;
      log("end (" + why + ") " + item.text.slice(0, 28));
      /* A short gap between utterances. Android in particular drops an
         utterance handed over in the same tick as the previous one ended. */
      pumpT = setTimeout(pump, ANDROID ? 110 : 45);
    }

    u.onend = function () { done("onend"); };
    u.onerror = function () { done("onerror"); };

    /* Do not trust onend alone: on Android it sometimes never fires.
       Two independent detectors. */
    monitor = setInterval(function () {
      if (finished) return;
      if (Date.now() - startedAt < 1200) return;      // let it get going
      var speaking = true;
      try { speaking = !!(ss.speaking || ss.pending); } catch (e) { speaking = true; }
      if (!speaking) done("silent");
    }, 350);

    var limit = 1500 + item.text.length * 160;         // deliberately generous
    guard = setTimeout(function () {
      if (finished) return;
      try { ss.cancel(); } catch (e) {}
      blockUntil = Date.now() + (ANDROID ? 200 : 120);
      done("guard");
    }, limit);

    busy = true;
    try {
      ss.speak(u);
      log("speak: " + item.text.slice(0, 40));
    } catch (e) {
      done("throw");
    }
  }

  /* ------------------------------------------------------------------
     5. Public API — same shape index.html already calls.

        say(text)                       replaces whatever is speaking
        say(text, {queue:true})         appends, never interrupts
        say(text, {lang:"ta"})          speaks in that language pack
        say(text, {now:true})           replaces, highest urgency
  ------------------------------------------------------------------ */
  function say(text, opts) {
    opts = opts || {};
    if (!text) return;
    if (isMuted()) return;

    var code = langCode(opts.lang);
    var pieces = splitText(text);
    if (!pieces.length) return;

    if (!opts.queue) stopAll(opts.now ? (ANDROID ? 180 : 100) : undefined);

    for (var i = 0; i < pieces.length; i++) queue.push({ text: pieces[i], code: code });
    pump();
  }

  window.say = say;
  window.sayStop = function () { stopAll(); };

  /* Type speechReport() in the browser console to see every voice the
     device offers and which one this app would choose. Paste the output
     into a bug report — it is the only way to tell a browser problem
     apart from a missing system voice. */
  window.speechReport = function () {
    loadVoices();
    voiceCache = {};
    var codes = [];
    try {
      for (var k in LANG_REGISTRY) if (LANG_REGISTRY[k] && LANG_REGISTRY[k].code) codes.push(LANG_REGISTRY[k].code);
    } catch (e) { codes = ["en-US"]; }
    var lines = ["Device: " + UA, "Voices installed: " + voices.length, ""];
    voices.forEach(function (v) {
      lines.push("  " + v.lang + "  " + v.name + (v.localService ? "  [on device]" : "  [network]") + (v.default ? "  [default]" : ""));
    });
    lines.push("", "Chosen:");
    codes.forEach(function (c) {
      var v = pickVoice(c);
      lines.push("  " + c + " -> " + (v ? v.name : "ENGINE DEFAULT (no match)"));
    });
    var out = lines.join("\n");
    try { console.log(out); } catch (e) {}
    return out;
  };

  /* The synthesiser is dropped when the tab is hidden on some Android
     builds. Clear our own state on return so the next say() is clean
     rather than waiting on an utterance that will never end. */
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible" && !queue.length) {
      clearTimers();
      busy = false;
    }
  });

  log("engine installed (" + (ANDROID ? "android" : "desktop") + " profile)");
})();
