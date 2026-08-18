/* CPR Coach — recognition to first compression
   =================================================================
   Folder: js/interval.js
   Load AFTER the main application script and AFTER js/caselog.js.

   WHAT THIS DOES
   The console already captures the two timestamps with the strongest
   evidence base in telephone CPR. It never showed the thing those two
   timestamps exist to measure: the gap between them.

   This adds one readout under the milestone buttons. Before recognition
   is marked it is inert. Once recognition is marked it counts up, live,
   and keeps counting until first compression is marked. Then it stops and
   holds the interval.

   WHY A COUNTER AND NOT A REPORT
   A number that appears afterwards is an audit tool. A number climbing on
   screen while the call is in progress is a prompt, and the prompt is the
   point: the only lever the dispatcher has over this interval is what
   they say in the next ten seconds.

   THIS IS NOT A CLINICAL TARGET
   The colour thresholds below (60 s, 120 s) are placeholders and are NOT
   drawn from a guideline. They are there so the readout has some visible
   grammar rather than none, and they are the first thing a medical
   reviewer should either replace or delete. Change WARN_S and BAD_S.

   The readout never blocks, never speaks, and never alters the script.

   NO NETWORK, NO DEPENDENCY
   It reads two click times on this device. It works with no connection,
   no caller, and no camera.
*/
(function () {
  "use strict";

  var byId = function (id) { return document.getElementById(id); };

  /* Placeholder thresholds. See the note above before trusting them. */
  var WARN_S = 60;
  var BAD_S = 120;

  var TX = {
    en: { lbl: "Recognition → first compression" },
    hi: { lbl: "पहचान → पहला दबाव" },
    kn: { lbl: "ಗುರುತಿಸುವಿಕೆ → ಮೊದಲ ಒತ್ತುವಿಕೆ" },
    ta: { lbl: "அறிதல் → முதல் அழுத்தம்" },
    es: { lbl: "Reconocimiento → primera compresión" },
    ar: { lbl: "التعرف ← أول ضغطة" }
  };
  function tx() {
    var l = "en";
    try { if (typeof S !== "undefined" && S && S.lang) l = S.lang; } catch (e) {}
    return TX[l] || TX.en;
  }
  function logIt(s) { try { if (window.caseLog) window.caseLog.add(s); } catch (e) {} }

  function pad2(n) { return String(n).padStart(2, "0"); }
  function mmss(sec) { return Math.floor(sec / 60) + ":" + pad2(sec % 60); }

  /* Wall-clock times of the two presses. index.html writes only a
     formatted string into each button's label, so the raw moment is
     captured here instead of parsed back out of the text. */
  var recogAt = null, firstAt = null, logged = false;

  /* =================================================================
     Wrapping, not replacing.

     The original handler runs first and is untouched. js/caselog.js wraps
     the same two buttons; both wrappers preserve the previous onclick, so
     load order changes nothing.
  ================================================================= */
  function wrap(id, fn) {
    var el = byId(id);
    if (!el) return;
    var prev = el.onclick;
    el.onclick = function (ev) {
      var r;
      if (prev) r = prev.call(this, ev);
      try { fn(); } catch (e) {}
      return r;
    };
  }

  function css() {
    if (byId("ivl-css")) return;
    var s = document.createElement("style");
    s.id = "ivl-css";
    s.textContent =
      "#ivl{display:flex;justify-content:space-between;align-items:baseline;gap:12px;" +
      "border:2px solid var(--hair);border-radius:18px;padding:13px 18px}" +
      "#ivl span{font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;" +
      "color:var(--slate);line-height:1.35}" +
      "#ivl b{font-size:26px;font-weight:800;font-variant-numeric:tabular-nums;" +
      "letter-spacing:-.02em;color:var(--hair);flex:none}" +
      "#ivl.run b{color:var(--ink)}" +
      "#ivl.warn{border-color:var(--amber,#B45309)}#ivl.warn b{color:var(--amber,#B45309)}" +
      "#ivl.bad{border-color:var(--red,#B91C1C)}#ivl.bad b{color:var(--red,#B91C1C)}" +
      "#ivl.done{border-color:var(--jade,#0F7B5A)}#ivl.done b{color:var(--jade,#0F7B5A)}";
    document.head.appendChild(s);
  }

  var box = null, val = null, lbl = null;

  function build() {
    if (box) return;
    var ms = document.querySelector("#s-console .d-ms");
    if (!ms || !ms.parentNode) return;
    css();
    box = document.createElement("div");
    box.id = "ivl";
    lbl = document.createElement("span");
    val = document.createElement("b");
    val.textContent = "—:—";
    box.appendChild(lbl);
    box.appendChild(val);
    /* Directly beneath the two buttons whose values it subtracts. */
    ms.parentNode.insertBefore(box, ms.nextSibling);
    paint();
  }

  function paint() {
    if (!box) return;
    if (lbl) lbl.textContent = tx().lbl;
    box.classList.remove("run", "warn", "bad", "done");

    if (!recogAt) { val.textContent = "—:—"; return; }

    /* First compression marked before recognition is a data-entry error,
       not a negative interval. Show nothing rather than something wrong. */
    if (firstAt && firstAt < recogAt) { val.textContent = "—:—"; return; }

    var end = firstAt || Date.now();
    var sec = Math.round((end - recogAt) / 1000);
    if (sec < 0) sec = 0;
    val.textContent = mmss(sec);

    if (firstAt) { box.classList.add("done"); return; }
    box.classList.add("run");
    if (sec >= BAD_S) box.classList.add("bad");
    else if (sec >= WARN_S) box.classList.add("warn");
  }

  function install() {
    wrap("d-mark-recog", function () {
      recogAt = Date.now();
      /* Re-marking recognition invalidates a settled interval. */
      if (firstAt && firstAt < recogAt) { firstAt = null; logged = false; }
      paint();
    });
    wrap("d-mark-first", function () {
      firstAt = Date.now();
      if (recogAt && firstAt >= recogAt && !logged) {
        logged = true;
        logIt("MILESTONE — recognition to first compression: " +
              mmss(Math.round((firstAt - recogAt) / 1000)));
      }
      paint();
    });
    /* A new console session starts a new measurement. */
    wrap("btn-console", function () {
      recogAt = null; firstAt = null; logged = false;
      build(); paint();
    });

    setInterval(function () { build(); paint(); }, 500);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install);
  } else {
    install();
  }
})();
