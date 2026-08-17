/* CPR Coach — instruction relay
   =================================================================
   Folder: js/relay.js
   Load AFTER the main application script and AFTER js/speech.js.

   WHAT THIS DOES
   The dispatcher can already see the caller's camera but has no way to be
   heard by them. This adds one button to the console: "Speak on caller's
   phone". Pressing it makes the caller's own handset read the current
   script line aloud, in the caller's own language.

   THE IMPORTANT DESIGN DECISION
   No text ever crosses the connection. Only a step number does — 0 to 5.
   The caller's phone then speaks the line from its OWN language pack.

   Three things follow from that, and they are the reason it is built this
   way rather than by sending words:
     · The caller can only ever hear one of the six clinically reviewed
       lines. A dispatcher cannot improvise medical instructions through
       this channel, whether by accident or otherwise.
     · Nothing needs translating in transit. No translation service, no
       network round trip, no chance of a mistranslation reaching a
       resuscitation.
     · A dispatcher who speaks no Tamil can still deliver correct Tamil.

   The channel also carries two harmless housekeeping messages: the caller
   announces which language its app is set to, so the console can select it
   without guessing, and the caller confirms when a line has actually been
   spoken, so the dispatcher knows it landed.

   WHAT IT DOES NOT DO
   It is not a substitute for the voice call. It carries no audio, no
   free text and no two-way conversation. It rides on the same PeerJS
   data path as the video, so it inherits every limitation of that path:
   the public broker, the absence of TURN servers, and total dependence on
   the caller having pressed "Share my camera" first. If the connection is
   not up, the button says so and does nothing.
*/
(function () {
  "use strict";

  var byId = function (id) { return document.getElementById(id); };

  var TX = {
    en: { send: "Speak on caller's phone", heard: "Heard on caller's phone",
          none: "Caller's phone not connected", room: "Control room" },
    hi: { send: "कॉलर के फ़ोन पर बोलें", heard: "कॉलर के फ़ोन पर सुना गया",
          none: "कॉलर का फ़ोन जुड़ा नहीं है", room: "कंट्रोल रूम" },
    kn: { send: "ಕರೆ ಮಾಡಿದವರ ಫೋನ್‌ನಲ್ಲಿ ಹೇಳಿ", heard: "ಕರೆ ಮಾಡಿದವರ ಫೋನ್‌ನಲ್ಲಿ ಕೇಳಿಸಿದೆ",
          none: "ಕರೆ ಮಾಡಿದವರ ಫೋನ್ ಸಂಪರ್ಕವಾಗಿಲ್ಲ", room: "ನಿಯಂತ್ರಣ ಕೊಠಡಿ" },
    ta: { send: "அழைத்தவரின் தொலைபேசியில் பேசு", heard: "அழைத்தவரின் தொலைபேசியில் கேட்டது",
          none: "அழைத்தவரின் தொலைபேசி இணைக்கப்படவில்லை", room: "கட்டுப்பாட்டு அறை" },
    es: { send: "Hablar en el teléfono del llamante", heard: "Escuchado en el teléfono del llamante",
          none: "El teléfono del llamante no está conectado", room: "Sala de control" },
    ar: { send: "التحدث على هاتف المتصل", heard: "تم سماعه على هاتف المتصل",
          none: "هاتف المتصل غير متصل", room: "غرفة التحكم" }
  };
  function tx() {
    var l = "en";
    try { if (typeof S !== "undefined" && S && S.lang) l = S.lang; } catch (e) {}
    return TX[l] || TX.en;
  }
  function logIt(s) { try { if (window.caseLog) window.caseLog.add(s); } catch (e) {} }

  /* =================================================================
     Peer discovery.

     index.html creates its Peer objects inside two click handlers and
     never announces them. Rather than edit those handlers, we watch for
     S.peer to change and attach our listeners to whatever appears.
     PeerJS uses an event emitter, so adding a second "call" listener does
     not disturb the one index.html already registered.
  ================================================================= */
  var hooked = null;
  var conns = {};          // dispatcher side: caller peer id -> DataConnection
  var iAmDispatcher = false;

  function watch() {
    var p = null;
    try { p = (typeof S !== "undefined" && S) ? S.peer : null; } catch (e) { p = null; }
    if (p === hooked) { if (!p) { conns = {}; iAmDispatcher = false; paint(); } return; }
    hooked = p;
    conns = {};
    iAmDispatcher = false;
    if (p) hook(p);
    paint();
  }

  function hook(peer) {
    var id = "";
    try { id = String(peer.id || ""); } catch (e) {}
    if (id.indexOf("cprcoach-room-") === 0) iAmDispatcher = true;
    try {
      peer.on("open", function (openId) {
        if (String(openId || "").indexOf("cprcoach-room-") === 0) iAmDispatcher = true;
        paint();
      });
    } catch (e) {}

    /* --- dispatcher side: a camera arrived, open a data channel back --- */
    try {
      peer.on("call", function (c) {
        iAmDispatcher = true;
        /* Give the media negotiation a moment before opening a second
           channel on the same connection; doing both at once made the
           data channel fail to open on slow mobile networks. */
        setTimeout(function () { connectBack(peer, c.peer); }, 900);
        try { c.on("close", function () { drop(c.peer); }); } catch (e2) {}
      });
    } catch (e) {}

    /* --- caller side: the console is opening a data channel to us --- */
    try {
      peer.on("connection", function (conn) { bindCaller(conn); });
    } catch (e) {}
  }

  function connectBack(peer, remoteId) {
    if (!remoteId || conns[remoteId]) return;
    var conn;
    try { conn = peer.connect(remoteId, { reliable: true }); } catch (e) { return; }
    if (!conn) return;
    conn.on("open", function () {
      conns[remoteId] = conn;
      logIt("Instruction channel open to caller's phone");
      paint();
    });
    conn.on("data", function (msg) { fromCaller(msg); });
    conn.on("close", function () { drop(remoteId); });
    conn.on("error", function () { drop(remoteId); });
  }

  function drop(remoteId) {
    if (conns[remoteId]) {
      delete conns[remoteId];
      logIt("Instruction channel to caller's phone closed");
    }
    paint();
  }

  function liveCount() {
    var n = 0;
    for (var k in conns) if (conns[k] && conns[k].open) n++;
    return n;
  }

  /* =================================================================
     Dispatcher side
  ================================================================= */
  var sendBtn = null, resetLbl = null;

  function makeButton() {
    var anchor = byId("d-speak");
    if (!anchor || sendBtn) return;
    sendBtn = document.createElement("button");
    sendBtn.id = "d-relay";
    sendBtn.type = "button";
    sendBtn.className = anchor.className;   // sits as a sibling of Play
    sendBtn.style.marginTop = "8px";
    sendBtn.textContent = "📲 " + tx().send;
    sendBtn.onclick = send;
    anchor.parentNode.insertBefore(sendBtn, anchor.nextSibling);
    paint();
  }

  function paint() {
    if (!sendBtn) return;
    var n = liveCount();
    var ok = iAmDispatcher && n > 0;
    sendBtn.disabled = !ok;
    sendBtn.style.opacity = ok ? "1" : ".45";
    if (resetLbl) return;                   // a confirmation is on screen
    sendBtn.textContent = ok ? ("📲 " + tx().send) : ("📲 " + tx().none);
  }

  function stepNow() {
    try {
      var n = LANG_REGISTRY.en.dScript.length;
      return ((S.dStep % n) + n) % n;
    } catch (e) { return 0; }
  }

  function send() {
    if (!liveCount()) return;
    var i = stepNow();
    var payload = { k: "say", i: i };
    var sent = 0;
    for (var id in conns) {
      if (!conns[id] || !conns[id].open) continue;
      try { conns[id].send(payload); sent++; } catch (e) {}
    }
    if (!sent) { paint(); return; }
    logIt("Sent step " + (i + 1) + " to caller's phone");
    flash("📲 …");
  }

  function flash(label) {
    if (!sendBtn) return;
    sendBtn.textContent = label;
    if (resetLbl) clearTimeout(resetLbl);
    resetLbl = setTimeout(function () { resetLbl = null; paint(); }, 2600);
  }

  function fromCaller(msg) {
    if (!msg || typeof msg !== "object") return;
    if (msg.k === "hello") {
      adoptCallerLanguage(msg.lang);
    } else if (msg.k === "said") {
      logIt("Caller's phone confirmed step " + ((msg.i | 0) + 1) + " spoken");
      flash("✓ " + tx().heard);
    }
  }

  /* The console's "caller speaks" dropdown was previously a guess. The
     caller's handset knows the answer, so it tells us and we select it.
     Everything the console shows stays in the dispatcher's own language;
     only the playback language changes, which is what that control means. */
  function adoptCallerLanguage(code) {
    if (!code) return;
    try {
      if (S.dLang === code) return;
      var apply = function () {
        S.dLang = code;
        try {
          S.dLink = location.origin + location.pathname + "?code=" + S.dCode + "&lang=" + code;
        } catch (e) {}
        try { if (typeof dRender === "function") dRender(); } catch (e) {}
        try { if (typeof buildDLangs === "function") buildDLangs(); } catch (e) {}
      };
      if (typeof loadLang === "function") {
        loadLang(code).then(function (ok) { if (ok) apply(); });
      } else {
        apply();
      }
    } catch (e) {}
  }

  /* =================================================================
     Caller side
  ================================================================= */
  function bindCaller(conn) {
    try {
      conn.on("open", function () {
        var mine = "en";
        try { mine = S.lang || "en"; } catch (e) {}
        try { conn.send({ k: "hello", lang: mine }); } catch (e) {}
      });
      conn.on("data", function (msg) { fromConsole(conn, msg); });
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
    makeButton();
    setInterval(function () { watch(); paint(); }, 700);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install);
  } else {
    install();
  }
})();
