/* CPR Coach — caller state mirror
   =================================================================
   Folder: js/mirror.js
   Load AFTER the main application script, AFTER js/caselog.js and
   AFTER js/relay.js.

   WHAT THIS DOES
   The console could see the caller's camera and nothing else. If the
   caller never shared video — or shared it and then stopped — the
   dispatcher was blind to facts the caller's own phone already knew:
   whether the patient is an adult, a child or an infant, how far through
   the six steps they are, whether compressions have started at all, and
   how long ago the collapse was reported.

   This module sends that state from the caller's phone to the console and
   renders it as one card, between the milestone buttons and the video.

   WHAT CROSSES THE CONNECTION
   One small object, at most once every 700 ms, and only while a rescue is
   actually running:

     { k:"cs", who, scr, ph, cpr, br, el, tot }

   No free text. No identity. No location. Nothing that could carry an
   improvised medical instruction in either direction. The console renders
   the fields it recognises and ignores anything else, so an older caller
   build talking to a newer console degrades to a partial card rather than
   an error.

   THE CARD SAYS "REPORTS", AND THAT WORDING MATTERS
   Every value here is what the caller's *app* believes, not what is true
   at the patient's side. The app believes compressions started because
   somebody tapped a button. A dispatcher must not read this card as
   confirmation. The case-log entries are all prefixed "Caller app
   reports" for the same reason.

   FAILURE IS VISIBLE
   Three separate states, never a blank card:
     · no link            — says so in words
     · link but stale     — the dot greys and the values dim after 12 s
     · relay not updated  — says so, naming the file to fix

   The last one exists because this module depends on a small addition to
   js/relay.js (window.relayBus). If that edit is missing, the card says
   which file is wrong instead of silently showing nothing.

   WHAT IT DOES NOT DO
   It carries no instruction in either direction — js/relay.js owns that.
   It never drives the flow: no message received here can change a screen,
   start a beat, or alter the protocol on either device. It is a one-way
   window.
*/
(function () {
  "use strict";

  var byId = function (id) { return document.getElementById(id); };

  /* Only six strings need translating. The patient words (adult / child /
     infant) and "Step"/"of" already exist in every language pack, so they
     are read from there rather than duplicated here. Unreviewed machine
     translations, consistent with the rest of the non-English strings in
     this project. */
  var TX = {
    en: { title: "Caller's app", patient: "Patient", comp: "Compressions",
          nolink: "No link to the caller's app.", notyet: "Not started",
          broken: "Channel not available — js/relay.js needs the relayBus edit." },
    hi: { title: "कॉलर का ऐप", patient: "मरीज़", comp: "छाती दबाव",
          nolink: "कॉलर के ऐप से संपर्क नहीं।", notyet: "शुरू नहीं हुआ",
          broken: "चैनल उपलब्ध नहीं — js/relay.js में relayBus बदलाव चाहिए।" },
    kn: { title: "ಕರೆ ಮಾಡಿದವರ ಆ್ಯಪ್", patient: "ರೋಗಿ", comp: "ಎದೆ ಒತ್ತುವಿಕೆ",
          nolink: "ಕರೆ ಮಾಡಿದವರ ಆ್ಯಪ್ ಸಂಪರ್ಕವಿಲ್ಲ.", notyet: "ಪ್ರಾರಂಭವಾಗಿಲ್ಲ",
          broken: "ಚಾನೆಲ್ ಲಭ್ಯವಿಲ್ಲ — js/relay.js ಗೆ relayBus ಬದಲಾವಣೆ ಬೇಕು." },
    ta: { title: "அழைத்தவரின் செயலி", patient: "நோயாளி", comp: "நெஞ்சு அழுத்தங்கள்",
          nolink: "அழைத்தவரின் செயலியுடன் இணைப்பு இல்லை.", notyet: "தொடங்கவில்லை",
          broken: "தடம் இல்லை — js/relay.js இல் relayBus மாற்றம் தேவை." },
    es: { title: "App del llamante", patient: "Paciente", comp: "Compresiones",
          nolink: "Sin conexión con la app del llamante.", notyet: "No iniciadas",
          broken: "Canal no disponible: js/relay.js necesita el cambio relayBus." },
    ar: { title: "تطبيق المتصل", patient: "المريض", comp: "الضغطات",
          nolink: "لا يوجد اتصال بتطبيق المتصل.", notyet: "لم تبدأ",
          broken: "القناة غير متوفرة — يحتاج js/relay.js إلى تعديل relayBus." }
  };
  function tx() {
    var l = "en";
    try { if (typeof S !== "undefined" && S && S.lang) l = S.lang; } catch (e) {}
    return TX[l] || TX.en;
  }
  function pack() {
    try { if (typeof t === "function") return t(); } catch (e) {}
    try { return LANG_REGISTRY.en; } catch (e) {}
    return null;
  }
  function logIt(s) { try { if (window.caseLog) window.caseLog.add(s); } catch (e) {} }

  /* Case-log labels are English regardless of interface language, exactly
     as in js/caselog.js: a record read by quality assurance, a medical
     director or a court should not vary by who took the call. */
  var SCREEN_EN = {
    "s-home": "home screen", "s-resp": "checking response",
    "s-breath": "checking breathing", "s-who": "patient age",
    "s-call": "call for help", "s-prep": "positioning",
    "s-cpr": "compressions", "s-aed": "defibrillator",
    "s-alive": "recovery position", "s-hand": "handover record",
    "s-code": "joining video", "s-console": "dispatcher console"
  };

  /* Prefer the app's own FLOW so the step numbers can never disagree with
     the ones printed on the caller's screen. The literal is a fallback
     only, for the case where this file is loaded without index.html's
     application script. */
  function flow() {
    try { if (typeof FLOW !== "undefined" && FLOW && FLOW.length) return FLOW; } catch (e) {}
    return ["s-resp", "s-breath", "s-who", "s-call", "s-prep", "s-cpr"];
  }

  function pad2(n) { return String(n).padStart(2, "0"); }
  function mmssOf(sec) {
    if (sec === null || sec === undefined || sec < 0) return "—:—";
    return Math.floor(sec / 60) + ":" + pad2(sec % 60);
  }

  /* =================================================================
     Which end am I?

     The console's peer id always carries the room prefix; a caller's is
     assigned by the broker. Screen identity is used as a second signal
     because the id is null for a moment before the peer opens.
  ================================================================= */
  function amConsole() {
    try { if (typeof current !== "undefined" && current === "s-console") return true; } catch (e) {}
    try {
      var p = S.peer;
      if (p && String(p.id || "").indexOf("cprcoach-room-") === 0) return true;
    } catch (e) {}
    return false;
  }

  /* =================================================================
     Caller side — build and send the snapshot
  ================================================================= */
  var lastSent = null, lastSentAt = 0, announced = false;
  var HEARTBEAT = 5000;     // refresh the clock even when nothing changed

  function snapshot() {
    var s = null;
    try { s = (typeof S !== "undefined") ? S : null; } catch (e) {}
    if (!s) return null;
    var scr = null, ph = null;
    try { scr = (typeof current !== "undefined") ? current : null; } catch (e) {}
    try { ph = (typeof phase !== "undefined") ? phase : null; } catch (e) {}
    return {
      k: "cs",
      who: s.who || null,
      scr: scr,
      ph: ph,
      cpr: !!s.cprStarted,
      br: !!s.breaths,
      el: s.t0 ? Math.round((Date.now() - s.t0) / 1000) : null,
      tot: s.total || 0
    };
  }

  /* Elapsed and total change every second by definition, so they are
     excluded from the change test and carried by the heartbeat instead.
     Without this the channel would carry a message every 700 ms for the
     whole resuscitation. */
  function meaningfullyDifferent(a, b) {
    if (!a || !b) return true;
    return a.who !== b.who || a.scr !== b.scr || a.ph !== b.ph ||
           a.cpr !== b.cpr || a.br !== b.br;
  }

  function pump() {
    if (!window.relayBus) return;
    if (amConsole()) return;
    var live = 0;
    try { live = window.relayBus.live(); } catch (e) { return; }
    if (!live) { lastSent = null; return; }

    /* el is null when no rescue is running on this device, and there is
       nothing worth mirroring in that case. `announced` deliberately
       survives a dropped link: one line in the handover record per
       session, not one per reconnection. */
    var snap = snapshot();
    if (!snap || snap.el === null) return;

    var now = Date.now();
    if (!meaningfullyDifferent(snap, lastSent) && now - lastSentAt < HEARTBEAT) return;

    var sent = 0;
    try { sent = window.relayBus.send(snap); } catch (e) { sent = 0; }
    if (!sent) return;
    lastSent = snap; lastSentAt = now;

    /* One line in the rescuer's handover record, not one per update —
       the record paramedics read must stay readable. */
    if (!announced) {
      announced = true;
      try { if (typeof mark === "function") mark("Status shared with control room"); } catch (e) {}
    }
  }

  /* =================================================================
     Console side — receive, render, record
  ================================================================= */
  var got = null, gotAt = 0;
  var seen = {};            // last logged value per field
  var linkWasUp = false;
  var STALE = 12000;

  function onMessage(msg) {
    if (!msg || typeof msg !== "object" || msg.k !== "cs") return;
    got = msg; gotAt = Date.now();
    setLink(true);
    record(msg);
    render();
  }

  function record(m) {
    if (seen.who !== m.who && m.who) {
      seen.who = m.who;
      logIt("Caller app reports patient: " + m.who);
    }
    if (seen.scr !== m.scr && m.scr) {
      seen.scr = m.scr;
      var f = flow(), i = f.indexOf(m.scr);
      var name = SCREEN_EN[m.scr] || m.scr;
      logIt(i >= 0
        ? "Caller app reports step " + (i + 1) + "/" + f.length + " — " + name
        : "Caller app reports screen: " + name);
    }
    if (seen.cpr !== m.cpr) {
      if (seen.cpr !== undefined) {
        logIt(m.cpr ? "Caller app reports compressions started"
                    : "Caller app reports compressions not started");
      } else if (m.cpr) {
        logIt("Caller app reports compressions already started");
      }
      seen.cpr = m.cpr;
    }
    if (seen.br !== m.br) {
      if (seen.br !== undefined) {
        logIt(m.br ? "Caller app reports 30:2 with breaths"
                   : "Caller app reports compression-only");
      }
      seen.br = m.br;
    }
  }

  /* ---------------- the card ---------------- */
  var card = null, dot = null, body = null;

  function css() {
    if (byId("mirror-css")) return;
    var s = document.createElement("style");
    s.id = "mirror-css";
    s.textContent =
      "#mirror{border:2px solid var(--hair);border-radius:18px;padding:14px 18px 16px}" +
      "#mirror .mh{display:flex;justify-content:space-between;align-items:center;" +
      "font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;" +
      "color:var(--slate);margin-bottom:10px}" +
      "#mirror .dot{width:10px;height:10px;border-radius:50%;background:var(--hair);flex:none}" +
      "#mirror.live .dot{background:var(--jade,#0E7C5E)}" +
      "#mirror.stale .dot{background:var(--amber,#C97A0B)}" +
      "#mirror .rows{display:flex;flex-direction:column;gap:7px}" +
      "#mirror .r{display:flex;justify-content:space-between;align-items:baseline;gap:12px}" +
      "#mirror .r span{font-size:13px;font-weight:700;color:var(--slate)}" +
      "#mirror .r b{font-size:19px;font-weight:800;font-variant-numeric:tabular-nums;" +
      "letter-spacing:-.01em;text-align:end}" +
      "#mirror.stale .rows{opacity:.45}" +
      "#mirror .msg{font-size:14px;font-weight:600;color:var(--slate);line-height:1.4}";
    document.head.appendChild(s);
  }

  function build() {
    if (card) return;
    var host = document.querySelector("#s-console .d-video");
    if (!host || !host.parentNode) return;
    css();
    card = document.createElement("div");
    card.id = "mirror";
    var head = document.createElement("div");
    head.className = "mh";
    var lbl = document.createElement("span");
    lbl.id = "mirror-title";
    dot = document.createElement("i");
    dot.className = "dot";
    head.appendChild(lbl);
    head.appendChild(dot);
    body = document.createElement("div");
    card.appendChild(head);
    card.appendChild(body);
    /* Above the video, below the milestones: it is context for the call,
       not an attribute of the picture. */
    host.parentNode.insertBefore(card, host);
    render();
  }

  function row(label, value) {
    var d = document.createElement("div");
    d.className = "r";
    var s = document.createElement("span");
    s.textContent = label;
    var b = document.createElement("b");
    b.textContent = value;
    d.appendChild(s);
    d.appendChild(b);
    return d;
  }

  function message(text) {
    var d = document.createElement("div");
    d.className = "msg";
    d.textContent = text;
    return d;
  }

  function render() {
    if (!card || !body) return;
    var x = tx(), p = pack();
    var titleEl = byId("mirror-title");
    if (titleEl) titleEl.textContent = x.title;
    body.innerHTML = "";
    card.classList.remove("live", "stale");

    if (!window.relayBus) { body.appendChild(message(x.broken)); return; }

    var live = 0;
    try { live = window.relayBus.live(); } catch (e) {}
    var age = got ? Date.now() - gotAt : Infinity;

    if (!got || (!live && age > STALE)) {
      body.appendChild(message(x.nolink));
      return;
    }
    card.classList.add(age > STALE ? "stale" : "live");

    var m = got;

    if (m.who && p && p[m.who]) body.appendChild(row(x.patient, p[m.who]));
    else if (m.who) body.appendChild(row(x.patient, m.who));

    var f = flow(), i = f.indexOf(m.scr);
    if (i >= 0 && p && p.ui) {
      body.appendChild(row(p.ui.step, (i + 1) + " / " + f.length));
    }

    if (m.cpr) {
      var v = mmssOf(m.el);
      if (m.tot) v += " · " + m.tot;
      body.appendChild(row(x.comp, v));
    } else {
      body.appendChild(row(x.comp, x.notyet));
    }
  }

  /* =================================================================
     Link up / link down, recorded once each way
  ================================================================= */
  /* An arriving message is itself proof the link is up, and it arrives
     between polls. Routing both signals through one setter means a link
     that opens and closes inside a single 700 ms window is still recorded
     in the right order. */
  function setLink(up) {
    if (up === linkWasUp) return;
    linkWasUp = up;
    if (!up) seen = {};          // a reconnection re-records what it sees
    if (amConsole()) logIt(up ? "Caller app link established" : "Caller app link lost");
    render();
  }

  function watchLink() {
    if (!window.relayBus) return;
    var live = false;
    try { live = window.relayBus.live() > 0; } catch (e) { live = false; }
    setLink(live);
  }

  /* ================================================================= */
  function install() {
    if (window.relayBus) {
      try { window.relayBus.on(onMessage); } catch (e) {}
    }
    /* One timer for everything. The console card must re-render on a
       clock even when no message arrives, or a dead link would keep
       showing the last good values as though they were current. */
    setInterval(function () {
      build();
      watchLink();
      pump();
      if (card) render();
    }, 700);
    /* A new resuscitation on this device starts a clean slate. */
    var b = byId("btn-console");
    if (b) {
      var prev = b.onclick;
      b.onclick = function (ev) {
        var r;
        if (prev) r = prev.call(this, ev);
        got = null; gotAt = 0; seen = {}; linkWasUp = false;
        lastSent = null; announced = false;
        try { build(); render(); } catch (e) {}
        return r;
      };
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install);
  } else {
    install();
  }
})();
