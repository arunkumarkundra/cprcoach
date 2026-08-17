/* CPR Coach — dispatcher case log
   =================================================================
   Folder: js/caselog.js
   Load AFTER the main application script in index.html.

   The rescuer gets a handover record. The dispatcher got nothing — every
   fact on the console was displayed and then discarded, including the two
   timestamps with the strongest evidence base in telephone CPR (arrest
   recognised, first compression), which were written into a button label
   and nowhere else.

   This file adds a 📋 button beside Exit in the console header. It opens
   an overlay listing everything the console observed, with Copy and Share.

   DESIGN NOTES
   - It touches nothing in the existing flow. The button is injected, the
     record is an overlay, and events are captured by wrapping the
     handlers already attached in index.html rather than replacing them.
   - Event labels are English regardless of interface language, matching
     the rescuer log. A record read by quality assurance, a medical
     director or a court should not vary by who happened to take the call.
   - The record lives in memory only and dies with the tab, exactly like
     the rescuer log. Persisting it is a policy decision, not a coding one.
   - It survives Exit, so a call-taker who exits before copying can still
     retrieve it. A new console session clears it.
*/
(function () {
  "use strict";

  var byId = function (id) { return document.getElementById(id); };

  /* Only these seven strings are localised; see the note above about
     event labels. Unreviewed machine translations, consistent with the
     rest of the non-English strings in this project. */
  var TX = {
    en: { title: "Case log", close: "Close", copy: "Copy", share: "Share",
          copied: "Copied", empty: "Nothing recorded yet.",
          note: "Dispatcher record — guidance only, not a clinical record." },
    hi: { title: "केस लॉग", close: "बंद करें", copy: "कॉपी", share: "साझा करें",
          copied: "कॉपी हो गया", empty: "अभी कुछ दर्ज नहीं हुआ।",
          note: "डिस्पैचर रिकॉर्ड — केवल मार्गदर्शन, चिकित्सीय रिकॉर्ड नहीं।" },
    kn: { title: "ಪ್ರಕರಣ ದಾಖಲೆ", close: "ಮುಚ್ಚು", copy: "ನಕಲಿಸು", share: "ಹಂಚಿಕೊಳ್ಳಿ",
          copied: "ನಕಲಾಗಿದೆ", empty: "ಇನ್ನೂ ಏನೂ ದಾಖಲಾಗಿಲ್ಲ.",
          note: "ಡಿಸ್ಪ್ಯಾಚರ್ ದಾಖಲೆ — ಮಾರ್ಗದರ್ಶನ ಮಾತ್ರ, ವೈದ್ಯಕೀಯ ದಾಖಲೆ ಅಲ್ಲ." },
    ta: { title: "வழக்குப் பதிவு", close: "மூடு", copy: "நகலெடு", share: "பங்கிடு",
          copied: "நகலெடுக்கப்பட்டது", empty: "இன்னும் எதுவும் பதிவாகவில்லை.",
          note: "அனுப்புநர் பதிவு — வழிகாட்டுதல் மட்டுமே, மருத்துவப் பதிவு அல்ல." },
    es: { title: "Registro del caso", close: "Cerrar", copy: "Copiar", share: "Compartir",
          copied: "Copiado", empty: "Aún no hay nada registrado.",
          note: "Registro del operador — solo orientación, no es un registro clínico." },
    ar: { title: "سجل الحالة", close: "إغلاق", copy: "نسخ", share: "مشاركة",
          copied: "تم النسخ", empty: "لا يوجد شيء مسجل بعد.",
          note: "سجل المرسل — إرشاد فقط، وليس سجلاً طبياً." }
  };
  function tx() {
    var l = "en";
    try { if (typeof S !== "undefined" && S && S.lang) l = S.lang; } catch (e) {}
    return TX[l] || TX.en;
  }

  /* ---------------- the record itself ---------------- */
  var LOG = [];
  var CAP = 500;

  function pad2(n) { return String(n).padStart(2, "0"); }
  function wall(ms) {
    var d = new Date(ms);
    return pad2(d.getHours()) + ":" + pad2(d.getMinutes()) + ":" + pad2(d.getSeconds());
  }
  function elapsed(ms) {
    var t0 = null;
    try { t0 = (typeof S !== "undefined" && S) ? S.dT0 : null; } catch (e) {}
    if (!t0) return "";
    var s = Math.round((ms - t0) / 1000);
    if (s < 0) s = 0;
    return Math.floor(s / 60) + ":" + pad2(s % 60);
  }
  function dayOfMs(ms) {
    try { return new Date(ms).toDateString(); } catch (e) { return ""; }
  }

  function add(label) {
    if (!label) return;
    LOG.push({ ts: Date.now(), label: String(label) });
    if (LOG.length > CAP) LOG.splice(0, LOG.length - CAP);
    if (overlay && overlay.classList.contains("on")) render();
    paintButton();
  }

  function reset() { LOG.length = 0; paintButton(); }

  /* Exposed so js/relay.js can write into the same record. */
  window.caseLog = { add: add, reset: reset, entries: function () { return LOG.slice(); } };

  function asText() {
    var out = [], day = "";
    out.push("CPR Coach — dispatcher case log");
    LOG.forEach(function (e) {
      var d = dayOfMs(e.ts);
      if (d !== day) { day = d; out.push("", d); }
      var el = elapsed(e.ts);
      out.push(wall(e.ts) + (el ? "  +" + el : "      ") + "  " + e.label);
    });
    out.push("", tx().note);
    return out.join("\n").trim();
  }

  /* ---------------- header button ---------------- */
  var btn = null;

  function makeButton() {
    var exit = byId("hdr-exit");
    if (!exit || btn) return;
    btn = document.createElement("button");
    btn.id = "hdr-caselog";
    btn.className = exit.className;      // inherit the header button styling
    btn.type = "button";
    btn.textContent = "📋";
    btn.setAttribute("aria-label", tx().title);
    btn.title = tx().title;
    btn.style.display = "none";
    btn.onclick = open;
    exit.parentNode.insertBefore(btn, exit);
  }

  function onConsole() {
    var c = byId("s-console");
    return !!(c && c.classList.contains("on"));
  }

  function paintButton() {
    if (!btn) return;
    /* Visible on the console, and afterwards anywhere a finished record is
       still waiting to be copied. */
    var want = onConsole() || LOG.length > 0;
    btn.style.display = want ? "" : "none";
    btn.setAttribute("aria-label", tx().title);
    btn.title = tx().title;
  }

  /* ---------------- overlay ---------------- */
  var overlay = null, listEl = null, titleEl = null, noteEl = null,
      copyEl = null, shareEl = null, closeEl = null;

  function makeOverlay() {
    if (overlay) return;
    var css = document.createElement("style");
    css.textContent =
      "#caselog{position:fixed;inset:0;z-index:9000;display:none;background:rgba(11,13,15,.72);" +
      "backdrop-filter:blur(2px);padding:16px}" +
      "#caselog.on{display:grid;place-items:center}" +
      "#caselog .cl-card{background:var(--paper,#FAFAF7);color:var(--ink,#14171A);width:100%;max-width:640px;" +
      "max-height:88vh;border-radius:16px;display:flex;flex-direction:column;overflow:hidden;" +
      "box-shadow:0 18px 60px rgba(0,0,0,.45)}" +
      "#caselog .cl-top{display:flex;align-items:center;justify-content:space-between;gap:12px;" +
      "padding:16px 18px;border-bottom:2px solid rgba(0,0,0,.10)}" +
      "#caselog .cl-top h2{margin:0;font-size:19px;font-weight:800}" +
      "#caselog .cl-x{border:0;background:transparent;font-size:22px;line-height:1;min-height:44px;" +
      "min-width:44px;cursor:pointer;color:inherit}" +
      "#caselog .cl-body{overflow:auto;-webkit-overflow-scrolling:touch;padding:8px 18px 4px}" +
      "#caselog ol{list-style:none;margin:0;padding:0}" +
      "#caselog li{display:flex;gap:12px;padding:9px 0;border-bottom:1px solid rgba(0,0,0,.07);" +
      "font-size:15px;line-height:1.35}" +
      "#caselog li.cl-day{font-weight:800;border-bottom:0;padding-top:14px}" +
      "#caselog li time{flex:0 0 auto;font-variant-numeric:tabular-nums;font-weight:700;opacity:.75}" +
      "#caselog li em{font-style:normal;opacity:.55;font-size:12px;font-weight:700;margin-inline-start:6px}" +
      "#caselog .cl-note{padding:10px 18px;font-size:12px;opacity:.65;line-height:1.4}" +
      "#caselog .cl-foot{display:flex;gap:10px;padding:14px 18px;border-top:2px solid rgba(0,0,0,.10)}" +
      "#caselog .cl-foot button{flex:1;min-height:52px;border-radius:12px;font-size:16px;font-weight:800;" +
      "cursor:pointer;border:2px solid rgba(0,0,0,.18);background:transparent;color:inherit}";
    document.head.appendChild(css);

    overlay = document.createElement("div");
    overlay.id = "caselog";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.innerHTML =
      '<div class="cl-card">' +
        '<div class="cl-top"><h2></h2><button class="cl-x" type="button" aria-label="Close">✕</button></div>' +
        '<div class="cl-body"><ol></ol></div>' +
        '<div class="cl-note"></div>' +
        '<div class="cl-foot"><button type="button" data-a="copy"></button>' +
        '<button type="button" data-a="share"></button></div>' +
      '</div>';
    document.body.appendChild(overlay);

    titleEl = overlay.querySelector("h2");
    listEl = overlay.querySelector("ol");
    noteEl = overlay.querySelector(".cl-note");
    closeEl = overlay.querySelector(".cl-x");
    copyEl = overlay.querySelector('[data-a="copy"]');
    shareEl = overlay.querySelector('[data-a="share"]');

    closeEl.onclick = close;
    overlay.onclick = function (e) { if (e.target === overlay) close(); };
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && overlay.classList.contains("on")) close();
    });

    copyEl.onclick = function () {
      var t = tx();
      copy(asText(), copyEl, t.copy, t.copied);
    };
    shareEl.onclick = async function () {
      var t = tx();
      var text = asText();
      if (navigator.share) {
        try { await navigator.share({ title: "CPR dispatcher case log", text: text }); return; } catch (e) {}
      }
      copy(text, shareEl, t.share, t.copied);
    };
  }

  async function copy(text, el, normal, ok) {
    try {
      await navigator.clipboard.writeText(text);
      el.textContent = "✓ " + ok;
      setTimeout(function () { el.textContent = normal; }, 1800);
    } catch (e) {
      /* Clipboard is refused in some embedded browsers; select it instead
         so the call-taker can still copy by hand. */
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.style.cssText = "position:fixed;inset:auto;opacity:0";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); el.textContent = "✓ " + ok; } catch (e2) {}
      setTimeout(function () { ta.remove(); el.textContent = normal; }, 1800);
    }
  }

  function render() {
    var t = tx();
    titleEl.textContent = t.title;
    noteEl.textContent = t.note;
    copyEl.textContent = t.copy;
    shareEl.textContent = t.share;
    closeEl.setAttribute("aria-label", t.close);
    listEl.innerHTML = "";

    if (!LOG.length) {
      var li0 = document.createElement("li");
      li0.textContent = t.empty;
      listEl.appendChild(li0);
      return;
    }
    var day = "";
    LOG.forEach(function (e) {
      var d = dayOfMs(e.ts);
      if (d !== day) {
        day = d;
        var h = document.createElement("li");
        h.className = "cl-day";
        h.textContent = d;
        listEl.appendChild(h);
      }
      var li = document.createElement("li");
      var tm = document.createElement("time");
      tm.textContent = wall(e.ts);
      var sp = document.createElement("span");
      sp.textContent = e.label;
      var el = elapsed(e.ts);
      if (el) {
        var em = document.createElement("em");
        em.textContent = "+" + el;
        sp.appendChild(em);
      }
      li.appendChild(tm);
      li.appendChild(sp);
      listEl.appendChild(li);
    });
    listEl.parentNode.scrollTop = listEl.parentNode.scrollHeight;
  }

  function open() { makeOverlay(); render(); overlay.classList.add("on"); }
  function close() { if (overlay) overlay.classList.remove("on"); }

  /* ---------------- capturing what the console does ----------------
     Every handler below was already attached by index.html. We wrap it:
     the original runs first and its behaviour is untouched, then we
     record what happened. If an element is missing the wrap is skipped,
     so this file cannot break a screen it does not recognise. */
  function wrap(id, fn) {
    var el = byId(id);
    if (!el) return;
    var prev = el.onclick;
    el.onclick = function (ev) {
      var r;
      if (prev) { try { r = prev.call(this, ev); } catch (e) { throw e; } }
      try { fn(this, ev); } catch (e) {}
      return r;
    };
  }

  function enLine(i) {
    try {
      var p = LANG_REGISTRY.en;
      if (p && p.dScript && p.dScript[i]) return p.dScript[i].s;
    } catch (e) {}
    return "";
  }
  function stepNow() {
    try {
      var n = LANG_REGISTRY.en.dScript.length;
      return ((S.dStep % n) + n) % n;
    } catch (e) { return 0; }
  }
  function stepCount() {
    try { return LANG_REGISTRY.en.dScript.length; } catch (e) { return 6; }
  }
  function langLabel(code) {
    try {
      if (typeof langName === "function") return langName(code, "en-US");
    } catch (e) {}
    return code;
  }

  function install() {
    makeButton();
    makeOverlay();
    paintButton();

    wrap("btn-console", function () {
      reset();
      add("Dispatcher console opened");
      try { add("Video code issued: " + S.dCode); } catch (e) {}
      var i = stepNow();
      add("Showing step " + (i + 1) + "/" + stepCount() + " — " + enLine(i));
    });

    wrap("d-next", function () {
      var i = stepNow();
      add("Advanced to step " + (i + 1) + "/" + stepCount() + " — " + enLine(i));
    });
    wrap("d-prev", function () {
      var i = stepNow();
      add("Back to step " + (i + 1) + "/" + stepCount() + " — " + enLine(i));
    });
    wrap("d-speak", function () {
      var i = stepNow();
      add("Played step " + (i + 1) + " aloud on the console in " + langLabel(safeDLang()));
    });
    wrap("d-mark-recog", function () { add("MILESTONE — arrest recognised"); });
    wrap("d-mark-first", function () { add("MILESTONE — first compression"); });
    wrap("d-copylink", function () { add("Camera link copied to clipboard"); });
    wrap("d-startvid", function () {
      /* The handler is asynchronous, so read the resulting state a moment
         later rather than guessing which way it went. */
      setTimeout(function () {
        var live = false;
        try { live = !!S.peer; } catch (e) {}
        add(live ? "Video session opened" : "Video session closed");
      }, 400);
    });
    wrap("d-metro", function () {
      var run = false;
      try { run = !!S.running; } catch (e) {}
      add(run ? "Console metronome started" : "Console metronome stopped");
    });
    wrap("hdr-exit", function () {
      add("Dispatcher console closed");
      /* The record deliberately survives Exit so it can still be copied. */
    });
    /* A new resuscitation on this device starts a new record. */
    wrap("btn-start", function () { reset(); });

    setInterval(tick, 1000);
  }

  function safeDLang() {
    try { return S.dLang || "en"; } catch (e) { return "en"; }
  }

  /* ---------------- the once-a-second watcher ----------------
     Three things worth recording are not attached to any button:
     how many cameras are connected, what compression rate the console
     is seeing, and how long the chest was left alone. The last of those
     is hands-off time, which is the quality measure that matters most
     after the two milestone timestamps. */
  var lastFeeds = -1, lastDLang = null, pauseFrom = null,
      lastRateAt = 0, lastOutOfRange = null;

  function tick() {
    paintButton();

    var s = null;
    try { s = (typeof S !== "undefined") ? S : null; } catch (e) { s = null; }
    if (!s || !s.dT0) { pauseFrom = null; return; }

    /* cameras */
    var n = 0;
    try { n = s.feeds ? Object.keys(s.feeds).length : 0; } catch (e) {}
    if (n !== lastFeeds) {
      if (lastFeeds >= 0) {
        add(n > lastFeeds
          ? "Camera joined — " + n + " connected"
          : "Camera left — " + n + " connected");
      }
      lastFeeds = n;
    }

    /* the caller's language, however it got set */
    if (s.dLang && s.dLang !== lastDLang) {
      if (lastDLang !== null) add("Caller language set to " + langLabel(s.dLang));
      lastDLang = s.dLang;
    }

    /* rate and hands-off, read off the badge the console already shows */
    var badge = byId("ratebadge");
    var visible = badge && badge.style.display !== "none";
    if (!visible) { pauseFrom = null; return; }

    var txt = (badge.textContent || "");
    var m = txt.match(/(\d+)/);
    if (!m) {
      if (!pauseFrom) pauseFrom = Date.now();
      return;
    }
    if (pauseFrom) {
      var secs = Math.round((Date.now() - pauseFrom) / 1000);
      if (secs >= 3) add("Compressions resumed after " + secs + " s with none seen");
      pauseFrom = null;
    }
    var rate = parseInt(m[1], 10);
    var out = rate < 95 || rate > 130;
    if (lastOutOfRange === null) {
      add("Compression rate observed: " + rate + "/min");
      lastOutOfRange = out; lastRateAt = Date.now();
    } else if (out !== lastOutOfRange) {
      add(out ? "Rate outside 95–130: " + rate + "/min"
              : "Rate back within range: " + rate + "/min");
      lastOutOfRange = out; lastRateAt = Date.now();
    } else if (Date.now() - lastRateAt > 60000) {
      add("Compression rate observed: " + rate + "/min");
      lastRateAt = Date.now();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install);
  } else {
    install();
  }
})();
