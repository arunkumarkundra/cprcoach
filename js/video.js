/* CPR Coach — video session repair
   =================================================================
   Folder: js/video.js
   Load AFTER js/caselog.js and BEFORE js/relay.js.

   Three defects, one of them the cause of the blank stage.

   1. ANY ERROR TORE DOWN THE STAGE.
      The console's error handler in index.html reacted to every PeerJS
      error identically — it hid the video stage and reset the button:

          S.peer.on("error",()=>{ ... $("stagewrap").hidden=true; });

      Most PeerJS errors are not fatal. "peer-unavailable" simply means one
      particular peer could not be reached; the room is still open and any
      camera already connected is still streaming. Hiding the stage on one
      of those blanks a perfectly good feed. js/relay.js opens a second,
      data-only connection back to each camera, and when that one connection
      fails — which is common without TURN servers — it raises exactly this
      non-fatal error. That is why the blank stage appeared when the relay
      was added: the relay did not break the video, it tripped a trapdoor
      that was already there. Fixed by acting only on errors that really do
      end the session, and logging the rest.

   2. THE ROOM DID NOT EXIST UNTIL THE DISPATCHER OPENED IT.
      A caller who entered the code first called a peer ID that had not
      been created, failed, and could not recover, because the failed Peer
      object was left in place and a retry stacked a second one on top.
      Fixed both ways: the room now opens automatically when the console
      opens, so it is always there before the code can be read out; and the
      caller now cleans up properly and can retry.

   3. THE STAGE DID NOT ALWAYS START PLAYING.
      Assigning srcObject is not the same as playing. Safari in particular
      will leave a muted autoplay element on its first black frame if it
      was hidden when the stream arrived. Fixed by calling play() explicitly.

   The 📹 button keeps working exactly as before — it now reads "End video"
   from the moment the console opens, and reopens the room if pressed twice.
*/
(function () {
  "use strict";

  var byId = function (id) { return document.getElementById(id); };
  function note(s) { try { if (window.caseLog) window.caseLog.add(s); } catch (e) {} }

  /* Errors that genuinely end a session. Everything else is weather. */
  var FATAL = {
    "browser-incompatible": 1, "invalid-id": 1, "invalid-key": 1,
    "ssl-unavailable": 1, "server-error": 1, "socket-error": 1,
    "socket-closed": 1, "unavailable-id": 1
  };

  function ui() {
    try { return t().ui; } catch (e) {
      return { openVideo: "Open video", endVideo: "End video",
               waiting: "Waiting for a rescuer to join.", noReach: "Could not reach that code." };
    }
  }
  function label(txt) { var l = byId("d-vidlbl"); if (l) l.textContent = txt; }
  function hint(txt) {
    var h = byId("stagehint");
    if (!h) return;
    h.textContent = txt;
    h.style.display = "grid";
  }

  /* =================================================================
     Dispatcher: the room
  ================================================================= */
  var opening = false, retriedCode = false;

  function havePeer() {
    try { return !!S.peer; } catch (e) { return false; }
  }

  function openRoom() {
    if (opening || havePeer()) return;
    var onConsole = false;
    try { onConsole = byId("s-console").classList.contains("on"); } catch (e) {}
    if (!onConsole) return;

    opening = true;
    label("…");
    loadPeerLib().then(function (ok) {
      opening = false;
      if (!ok) { label(ui().openVideo); hint("⚠"); note("Video library could not be loaded"); return; }
      startRoom();
    });
  }

  function newCode() {
    try {
      S.dCode = String(Math.floor(100000 + Math.random() * 900000));
      var el = byId("d-code");
      if (el) el.textContent = S.dCode;
      S.dLink = location.origin + location.pathname + "?code=" + S.dCode + "&lang=" + S.dLang;
      note("Video code reissued: " + S.dCode);
    } catch (e) {}
  }

  function startRoom() {
    var u = ui(), p;
    try { p = new Peer(ROOM(S.dCode)); } catch (e) { label(u.openVideo); return; }
    S.peer = p;

    var wrap = byId("stagewrap");
    if (wrap) wrap.hidden = false;
    hint(u.waiting);

    p.on("open", function () {
      label(ui().endVideo);
      hint(ui().waiting);
      note("Video room open on code " + S.dCode);
    });

    p.on("error", function (err) {
      var type = (err && err.type) || "";
      if (!FATAL[type]) {
        /* A camera that vanished, a data channel that never formed, a
           momentary network fault. None of these close the room, and none
           of them should blank a stage that is still receiving frames. */
        note("Video warning (" + (type || "unknown") + ")");
        return;
      }
      if (type === "unavailable-id" && !retriedCode) {
        /* Someone else on the public broker is already using this room ID.
           Take a different code rather than failing the call. */
        retriedCode = true;
        try { p.destroy(); } catch (e) {}
        S.peer = null;
        newCode();
        startRoom();
        return;
      }
      note("Video room failed (" + type + ")");
      try { p.destroy(); } catch (e) {}
      S.peer = null;
      label(ui().openVideo);
      hint("⚠");
    });

    p.on("disconnected", function () {
      note("Video broker dropped — reconnecting");
      try { p.reconnect(); } catch (e) {}
    });

    p.on("call", function (c) {
      try { c.answer(); } catch (e) {}
      c.on("stream", function (st) {
        try { addFeed(c.peer, st); } catch (e) {}
      });
      c.on("close", function () { try { removeFeed(c.peer); } catch (e) {} });
      c.on("error", function () { /* one camera's problem, not the room's */ });
    });
  }

  /* The 📹 control keeps both jobs, but "open" now means reopen. */
  function installRoomButton() {
    var b = byId("d-startvid");
    if (!b) return;
    b.onclick = function () {
      if (havePeer()) {
        try { stopVideo(); } catch (e) {}
        label(ui().openVideo);
        note("Video room closed by dispatcher");
        return;
      }
      retriedCode = false;
      openRoom();
    };
  }

  /* =================================================================
     Playback. Assigning a stream is not the same as playing it.
  ================================================================= */
  function kick(video) {
    if (!video) return;
    video.muted = true;
    video.playsInline = true;
    try { video.setAttribute("playsinline", ""); } catch (e) {}
    var go = function () {
      try {
        var pr = video.play();
        if (pr && pr.catch) pr.catch(function () {});
      } catch (e) {}
    };
    go();
    setTimeout(go, 250);
    setTimeout(go, 1000);
  }

  var origSelect = window.selectFeed;
  window.selectFeed = function (id) {
    if (typeof origSelect === "function") { try { origSelect(id); } catch (e) {} }
    kick(byId("stage"));
  };

  var origAdd = window.addFeed;
  window.addFeed = function (id, stream) {
    if (typeof origAdd === "function") { try { origAdd(id, stream); } catch (e) {} }
    var tile = document.querySelector('.tile[data-id="' + id + '"] video');
    kick(tile);
    kick(byId("stage"));
  };

  /* =================================================================
     Caller: joining a room, and being able to try again
  ================================================================= */
  function cleanupCaller() {
    try { if (S.stream) { S.stream.getTracks().forEach(function (x) { x.stop(); }); S.stream = null; } } catch (e) {}
    try { if (S.peer) { S.peer.destroy(); S.peer = null; } } catch (e) {}
  }

  function installCallerButton() {
    var b = byId("btn-code-go");
    if (!b) return;
    b.onclick = async function () {
      var d;
      try { d = t(); } catch (e) { return; }
      var input = byId("codeinput");
      var code = (input && input.value ? input.value : "").trim();
      var noteEl = byId("t-code-note");

      if (!/^\d{6}$/.test(code)) {
        if (noteEl) noteEl.textContent = d.ui.needSix;
        return;
      }
      /* A previous failed attempt left a Peer and a camera behind. Clearing
         them is the whole reason a second try used to be hopeless. */
      cleanupCaller();
      b.textContent = "…";

      var lib = await loadPeerLib();
      if (!lib) {
        if (noteEl) noteEl.textContent = d.ui.noNet;
        b.textContent = d.codeGo;
        return;
      }
      try {
        S.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      } catch (e) {
        if (noteEl) noteEl.textContent = d.ui.noCam;
        b.textContent = d.codeGo;
        return;
      }

      var p;
      try { p = new Peer(); } catch (e) {
        if (noteEl) noteEl.textContent = d.ui.noReach;
        b.textContent = d.codeGo;
        cleanupCaller();
        return;
      }
      S.peer = p;
      var joined = false;

      p.on("open", function () {
        try { p.call(ROOM(code), S.stream); } catch (e) {}
        joined = true;
        S.lastCode = code;
        b.textContent = d.codeGo;
        try { mark("Video joined, code " + code); } catch (e) {}
        try { setVideoBtn(true); } catch (e) {}
        try { show("s-cpr"); } catch (e) {}
      });

      p.on("error", function (err) {
        var type = (err && err.type) || "";
        /* Once the camera is up, a stray error is not a reason to shut it
           down — the rescuer is mid-resuscitation and must not be dragged
           back to a code entry screen. */
        if (joined && !FATAL[type]) return;
        if (noteEl) noteEl.textContent = d.ui.noReach;
        b.textContent = d.codeGo;
        cleanupCaller();
        try { setVideoBtn(false); } catch (e) {}
      });

      p.on("disconnected", function () { try { p.reconnect(); } catch (e) {} });
    };
  }

  /* =================================================================
     Wiring
  ================================================================= */
  function install() {
    installRoomButton();
    installCallerButton();

    /* Opening the console opens the room, so the code on screen is live
       from the moment it can be read out. */
    var bc = byId("btn-console");
    if (bc) {
      var prev = bc.onclick;
      bc.onclick = function (ev) {
        var r;
        if (prev) r = prev.call(this, ev);
        retriedCode = false;
        setTimeout(openRoom, 350);
        return r;
      };
    }

    /* ?role=dispatcher clicks that button before this file has loaded,
       so catch the case where the console is already on screen. */
    setTimeout(function () {
      try {
        if (byId("s-console").classList.contains("on") && !havePeer()) openRoom();
      } catch (e) {}
    }, 900);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install);
  } else {
    install();
  }
})();
