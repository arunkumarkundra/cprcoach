/* CPR Coach — instruction relay
   =================================================================
   Folder: js/relay.js   (replaces the earlier version of this file)
   Load AFTER js/video.js.

   WHAT THIS DOES
   The console's existing "🔊 Play in <language>" button now does one job
   in two places: it reads the current script line aloud on the console
   speaker, exactly as before, and — if the caller's camera is connected —
   the caller's own handset reads the same line aloud in the caller's own
   language at the same time.

   WHY ONE BUTTON AND NOT TWO
   The first version added a separate "Speak on caller's phone" button.
   That was wrong for two reasons. It asked the dispatcher to decide,
   mid-resuscitation, which of two nearly identical controls to press —
   the sort of choice §2 of the spec exists to remove. And when no camera
   was connected it read "Caller's phone not connected", which is alarming
   and misleading to a dispatcher who is already talking to that caller on
   the telephone. Nothing is wrong in that situation; there is simply no
   video link, which is the normal case.

   Now there is one button. It always plays on the console. It also plays
   on the caller's handset whenever that is possible, and says so
   afterwards. It never reports the absence of a video link as a fault.

   THE IMPORTANT DESIGN DECISION, UNCHANGED
   No text crosses the connection — only a step number, 0 to 5. The
   caller's phone speaks the line from its OWN language pack. So the caller
   can only ever hear one of the six clinically reviewed lines, nothing
   needs translating in transit, and a dispatcher who speaks no Tamil still
   delivers correct Tamil.

   SHARED CHANNEL
   This file also exposes window.relayBus so js/mirror.js can ride the
   same data connection instead of opening a second one. See the block
   below. Nothing else in this file changed.
*/
(function () {
  "use strict";

  var byId = function (id) { return document.getElementById(id); };

  var TX = {
    en: { also: "Also played on the caller's phone", room: "Control room" },
    hi: { also: "कॉलर के फ़ोन पर भी सुनाया गया", room: "कंट्रोल रूम" },
    kn: { also: "ಕರೆ ಮಾಡಿದವರ ಫೋನ್‌ನಲ್ಲಿಯೂ ಕೇಳಿಸಿದೆ", room: "ನಿಯಂತ್ರಣ ಕೊಠಡಿ" },
    ta: { also: "அழைத்தவரின் தொலைபேசியிலும் ஒலித்தது", room: "கட்டுப்பாட்டு அறை" },
    es: { also: "También reproducido en el teléfono del llamante", room: "Sala de control" },
    ar: { also: "تم تشغيله أيضاً على هاتف المتصل", room: "غرفة التحكم" }
  };
  function tx() {
    var l = "en";
    try { if (typeof S !== "undefined" && S && S.lang) l = S.lang; } catch (e) {}
    return TX[l] || TX.en;
  }
  function note(s) { try { if (window.caseLog) window.caseLog.add(s); } catch (e) {} }

  /* =================================================================
     Shared channel bus.

     Added so a second module (js/mirror.js) can ride this same data
     channel without re-implementing peer discovery or opening a second
     connection. A second connection would repeat the 900 ms negotiation
     delay this file already had to introduce for slow mobile networks.

     It keeps its OWN connection map, so nothing else in this file changes
     behaviour: every incoming message is copied to subscribers, and
     subscribers can send objects of their own. Messages are namespaced by
     their "k" field and each handler ignores keys it does not own —
     "say", "hello" and "said" belong to this file, "cs" belongs to
     js/mirror.js.
  ================================================================= */
  var busConns = {}, busFns = [], busSeq = 0;

  function busAdd(conn) {
    if (!conn) return;
    if (!conn.__busKey) conn.__busKey = "b" + (++busSeq);
    busConns[conn.__busKey] = conn;
  }
  function busDrop(conn) {
    if (!conn || !conn.__busKey) return;
    delete busConns[conn.__busKey];
  }
  function bus(msg) {
    for (var i = 0; i < busFns.length; i++) { try { busFns[i](msg); } catch (e) {} }
  }
  window.relayBus = {
    on: function (fn) { if (typeof fn === "function") busFns.push(fn); },
    send: function (obj) {
      var n = 0;
      for (var k in busConns) {
        if (!busConns[k] || !busConns[k].open) continue;
        try { busConns[k].send(obj); n++; } catch (e) {}
      }
      return n;
    },
    live: function () {
      var n = 0;
      for (var k in busConns) if (busConns[k] && busConns[k].open) n++;
      return n;
    }
  };

  /* =================================================================
     Finding the connection.

     index.html creates its Peer objects inside click handlers and never
     announces them, so we watch S.peer and attach to whatever appears.
     PeerJS is an event emitter, so our extra listeners sit alongside the
     ones already registered rather than replacing them.
  ================================================================= */
  var hooked = null, conns = {}, iAmDispatcher = false;

  function watch() {
    var p = null;
    try { p = (typeof S !== "undefined" && S) ? S.peer : null; } catch (e) { p = null; }
    if (p === hooked) {
      if (!p && iAmDispatcher) { conns = {}; busConns = {}; iAmDispatcher = false; }
      return;
    }
    hooked = p;
    conns = {};
    busConns = {};        /* a new peer means every old channel is dead */
    iAmDispatcher = false;
    if (p) hook(p);
  }

  function hook(peer) {
    try {
      if (String(peer.id || "").indexOf("cprcoach-room-") === 0) iAmDispatcher = true;
      peer.on("open", function (id) {
        if (String(id || "").indexOf("cprcoach-room-") === 0) iAmDispatcher = true;
      });
    } catch (e) {}

    /* dispatcher side: a camera arrived, open a data channel back to it */
    try {
      peer.on("call", function (c) {
        iAmDispatcher = true;
        setTimeout(function () { connectBack(peer, c.peer); }, 900);
        try { c.on("close", function () { drop(c.peer); }); } catch (e2) {}
      });
    } catch (e) {}

    /* caller side: the console is opening a data channel to us */
    try {
      peer.on("connection", function (conn) { bindCaller(conn); });
    } catch (e) {}
  }

  function connectBack(peer, remoteId) {
    if (!remoteId || conns[remoteId]) return;
    var conn;
    /* If this fails it raises a non-fatal error on the peer. js/video.js
       now ignores those, which is what stopped it blanking the stage. */
    try { conn = peer.connect(remoteId, { reliable: true }); } catch (e) { return; }
    if (!conn) return;
    conn.on("open", function () {
      conns[remoteId] = conn;
      busAdd(conn);
      note("Instruction link to caller's phone open");
    });
    conn.on("data", function (msg) { fromCaller(msg); bus(msg); });
    conn.on("close", function () { busDrop(conn); drop(remoteId); });
    conn.on("error", function () { busDrop(conn); drop(remoteId); });
  }

  function drop(remoteId) {
    if (conns[remoteId]) {
      delete conns[remoteId];
      note("Instruction link to caller's phone closed");
    }
  }

  function liveCount() {
    var n = 0;
    for (var k in conns) if (conns[k] && conns[k].open) n++;
    return n;
  }

  /* =================================================================
     Dispatcher side: one button, two speakers.
  ================================================================= */
  var statusEl = null, statusT = null;

  function makeStatus() {
    if (statusEl) return;
    var anchor = byId("d-speak");
    if (!anchor) return;
    var css = document.createElement("style");
    css.textContent =
      "#d-relaystatus{margin-top:7px;font-size:12px;font-weight:700;line-height:1.35;" +
      "color:var(--slate,#6B7480);display:none}" +
      "#d-relaystatus.on{display:block}";
    document.head.appendChild(css);
    statusEl = document.createElement("div");
    statusEl.id = "d-relaystatus";
    statusEl.setAttribute("role", "status");
    anchor.parentNode.insertBefore(statusEl, anchor.nextSibling);
  }

  /* Silence is the resting state. The line appears only to confirm that
     something extra happened, never to report that it did not. */
  function flash(text) {
    makeStatus();
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.classList.add("on");
    if (statusT) clearTimeout(statusT);
    statusT = setTimeout(function () { statusEl.classList.remove("on"); }, 4000);
  }

  function stepNow() {
    try {
      var n = LANG_REGISTRY.en.dScript.length;
      return ((S.dStep % n) + n) % n;
    } catch (e) { return 0; }
  }

  /* Wrap the Play button rather than replacing it: the original still
     plays on the console speaker, untouched, and we add the second
     destination afterwards. */
  var armed = null;
  function installPlay() {
    var b = byId("d-speak");
    if (!b || armed === b.onclick) return;
    var prev = b.onclick;
    b.onclick = function (ev) {
      var r;
      if (prev) r = prev.call(this, ev);
      try { sendToCaller(); } catch (e) {}
      return r;
    };
    armed = b.onclick;
    makeStatus();
  }

  function sendToCaller() {
    if (!iAmDispatcher || !liveCount()) return;   // no link: nothing to say about it
    var i = stepNow();
    var sent = 0;
    for (var id in conns) {
      if (!conns[id] || !conns[id].open) continue;
      try { conns[id].send({ k: "say", i: i }); sent++; } catch (e) {}
    }
    if (sent) note("Step " + (i + 1) + " sent to caller's phone");
  }

  function fromCaller(msg) {
    if (!msg || typeof msg !== "object") return;
    if (msg.k === "hello") {
      adoptCallerLanguage(msg.lang);
    } else if (msg.k === "said") {
      note("Caller's phone confirmed step " + ((msg.i | 0) + 1) + " spoken");
      flash("✓ " + tx().also);
    }
  }

  /* The "caller speaks" dropdown was a guess. The caller's handset knows
     the answer, so it tells us and we select it. Everything the console
     displays stays in the dispatcher's own language; only the playback
     language changes, which is exactly what that control governs. */
  function adoptCallerLanguage(code) {
    if (!code) return;
    try {
      if (S.dLang === code) return;
      var apply = function () {
        S.dLang = code;
        try { S.dLink = location.origin + location.pathname + "?code=" + S.dCode + "&lang=" + code; } catch (e) {}
        try { if (typeof dRender === "function") dRender(); } catch (e) {}
        try { if (typeof buildDLangs === "function") buildDLangs(); } catch (e) {}
      };
      if (typeof loadLang === "function") {
        loadLang(code).then(function (ok) { if (ok) apply(); });
      } else { apply(); }
    } catch (e) {}
  }

  /* =================================================================
     Caller side
  ================================================================= */
  function bindCaller(conn) {
    try {
      conn.on("open", function () {
        busAdd(conn);
        var mine = "en";
        try { mine = S.lang || "en"; } catch (e) {}
        try { conn.send({ k: "hello", lang: mine }); } catch (e) {}
      });
      conn.on("data", function (msg) { fromConsole(conn, msg); bus(msg); });
      conn.on("close", function () { busDrop(conn); });
      conn.on("error", function () { busDrop(conn); });
    } catch (e) {}
  }

  function fromConsole(conn, msg) {
    if (!msg || typeof msg !== "object" || msg.k !== "say") return;
    var i = msg.i | 0;
    var pack = null;
    try { pack = (typeof t === "function") ? t() : null; } catch (e) {}
    if (!pack || !pack.dScript || i < 0 || i >= pack.dScript.length) return;
    var line = pack.dScript[i].s;
    if (!line) return;

    /* An instruction from the control room outranks whatever the app was
       saying. It interrupts, and it is shown as well as spoken — a phone
       held against an ear, or a rescuer who has muted the sound, must
       still be able to read it. */
    try { if (typeof say === "function") say(line, { now: true }); } catch (e) {}
    banner(line);
    try { if (typeof mark === "function") mark("Control room instruction " + (i + 1) + " delivered"); } catch (e) {}
    try { conn.send({ k: "said", i: i }); } catch (e) {}
  }

  var bannerEl = null, bannerT = null;

  function banner(text) {
    if (!bannerEl) {
      var css = document.createElement("style");
      css.textContent =
        "#relaybar{position:fixed;inset-inline:10px;top:10px;z-index:9500;padding:14px 16px;" +
        "border-radius:14px;background:#14171A;color:#fff;box-shadow:0 10px 34px rgba(0,0,0,.45);" +
        "font-size:17px;font-weight:700;line-height:1.35;display:none;pointer-events:none}" +
        "#relaybar.on{display:block}" +
        "#relaybar small{display:block;font-size:10px;letter-spacing:.14em;text-transform:uppercase;" +
        "font-weight:800;opacity:.65;margin-bottom:5px}";
      document.head.appendChild(css);
      bannerEl = document.createElement("div");
      bannerEl.id = "relaybar";
      bannerEl.setAttribute("role", "status");
      bannerEl.setAttribute("aria-live", "assertive");
      document.body.appendChild(bannerEl);
    }
    bannerEl.innerHTML = "";
    var lbl = document.createElement("small");
    lbl.textContent = tx().room;
    var p = document.createElement("div");
    p.textContent = text;
    bannerEl.appendChild(lbl);
    bannerEl.appendChild(p);
    bannerEl.classList.add("on");
    if (bannerT) clearTimeout(bannerT);
    bannerT = setTimeout(function () { bannerEl.classList.remove("on"); }, 9000);
  }

  /* ================================================================= */
  function install() {
    installPlay();
    setInterval(function () { watch(); installPlay(); }, 700);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install);
  } else {
    install();
  }
})();
