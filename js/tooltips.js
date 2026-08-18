/* CPR Coach — labels for the icon-only controls
   =================================================================
   Folder: js/tooltips.js
   Load AFTER the main application script. Position among the other
   modules does not matter.

   WHAT THIS DOES
   Gives every header control that shows a symbol instead of a word a
   title (hover on desktop, long-press on most Android browsers) and a
   matching aria-label (screen readers), in the interface language.

   WHY IT EXISTS
   The header shed its words to stop the controls overlapping on small
   phones. That is the right trade — an overlapping bar is unusable and a
   symbol is faster to hit — but a symbol alone is a guess. ← and ✕ are
   near-universal; 🔊 with three different states is not, and a call-taker
   who cannot tell "muted" from "audio has failed" is being told nothing
   by a control that exists to tell them exactly that.

   WHAT IT DOES NOT DO
   It sets attributes and nothing else. No handler is wrapped, no element
   is created or moved, no state is read that it could change. If this
   file never arrives, every control keeps working exactly as it does now
   with the labels it was born with — which is why it is not listed in
   the module check in index.html.

   WHERE THE WORDS COME FROM
   Back and Exit already exist in every language pack (ui.back, ui.exit),
   so they are read from there and never duplicated here. The three sound
   states do not exist in the packs, so they are carried below —
   unreviewed machine translations, consistent with the rest of the
   non-English strings in this project.

   WHY A TIMER
   The sound glyph changes on tap, on mute, and when the audio context
   fails; the language changes from two different pickers. Rather than
   wrapping audioHealth() and applyLang() — two more couplings to keep in
   step — this re-reads what is on screen every 700 ms and matches it.
   Setting an attribute that is already correct costs nothing.
*/
(function () {
  "use strict";

  var byId = function (id) { return document.getElementById(id); };

  /* Sound states, keyed by the glyph index.html puts in the button:
       🔊  playing      🔇  muted      ⚠  audio is not reaching the speaker  */
  var TX = {
    en: { sound: "Sound on — tap to mute",
          muted: "Sound off — tap to unmute",
          warn:  "Sound is not playing — tap to retry",
          lang:  "Language",
          back:  "Back", exit: "Exit" },
    hi: { sound: "आवाज़ चालू — बंद करने के लिए दबाएँ",
          muted: "आवाज़ बंद — चालू करने के लिए दबाएँ",
          warn:  "आवाज़ नहीं चल रही — फिर से कोशिश करने के लिए दबाएँ",
          lang:  "भाषा",
          back:  "वापस", exit: "बाहर" },
    kn: { sound: "ಧ್ವನಿ ಚಾಲೂ — ನಿಶ್ಶಬ್ದಗೊಳಿಸಲು ಒತ್ತಿ",
          muted: "ಧ್ವನಿ ಆಫ್ — ಚಾಲೂ ಮಾಡಲು ಒತ್ತಿ",
          warn:  "ಧ್ವನಿ ಬರುತ್ತಿಲ್ಲ — ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಲು ಒತ್ತಿ",
          lang:  "ಭಾಷೆ",
          back:  "ಹಿಂದೆ", exit: "ನಿರ್ಗಮಿಸು" },
    ta: { sound: "ஒலி இயக்கத்தில் — நிறுத்த தட்டவும்",
          muted: "ஒலி நிறுத்தம் — இயக்க தட்டவும்",
          warn:  "ஒலி வரவில்லை — மீண்டும் முயற்சிக்க தட்டவும்",
          lang:  "மொழி",
          back:  "பின்", exit: "வெளியேறு" },
    es: { sound: "Sonido activado — toca para silenciar",
          muted: "Sonido desactivado — toca para activar",
          warn:  "El sonido no suena — toca para reintentar",
          lang:  "Idioma",
          back:  "Atrás", exit: "Salir" },
    ar: { sound: "الصوت مفعّل — اضغط للكتم",
          muted: "الصوت مكتوم — اضغط للتشغيل",
          warn:  "الصوت لا يعمل — اضغط للمحاولة",
          lang:  "اللغة",
          back:  "رجوع", exit: "خروج" }
  };

  function lang() {
    try { if (typeof S !== "undefined" && S && S.lang) return S.lang; } catch (e) {}
    return "en";
  }
  function tx() { return TX[lang()] || TX.en; }

  /* The language packs are the authority for any word they already carry.
     Duplicating "Back" here would let the two drift apart, and the pack
     is the one a translator actually reviews. */
  function fromPack(key) {
    try {
      var p = LANG_REGISTRY[lang()];
      if (p && p.ui && p.ui[key]) return p.ui[key];
    } catch (e) {}
    return null;
  }

  function label(el, text) {
    if (!el || !text) return;
    if (el.title !== text) el.title = text;
    if (el.getAttribute("aria-label") !== text) el.setAttribute("aria-label", text);
  }

  function paint() {
    var t = tx();

    label(byId("hdr-back"), fromPack("back") || t.back);
    label(byId("hdr-exit"), fromPack("exit") || t.exit);
    label(byId("langsel"),  t.lang);

    /* Read the glyph rather than the state. index.html owns the decision
       about which of the three the rescuer is in; re-deriving it here
       from S.muted and ac.state would be a second copy of that logic,
       free to disagree with the button the rescuer is looking at. */
    var snd = byId("btn-sound");
    if (snd) {
      var g = (snd.textContent || "").trim();
      label(snd, g === "🔇" ? t.muted : (g === "🔊" ? t.sound : t.warn));
    }
  }

  function install() {
    paint();
    setInterval(paint, 700);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install);
  } else {
    install();
  }
})();
