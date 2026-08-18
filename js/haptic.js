/* CPR Coach — haptic metronome
   =================================================================
   Folder: js/haptic.js
   Load AFTER the main application script.

   WHAT THIS DOES
   Vibrates the phone once per compression, on the same beat as the click.
   A short pulse on each beat and a longer one on every tenth, mirroring
   the accent already in the audio.

   WHY IT EXISTS
   Three reasons, in order of how likely they are to matter:

   1. The audio may not be reaching anyone. SPEC §21 records that
      behaviour during a live phone call is unverified on low-end Android:
      a rescuer with the handset against their ear, on speaker, or on a
      call that has taken the audio session may hear nothing. Touch is a
      channel the call cannot take away.
   2. A deaf or hard-of-hearing rescuer currently gets a beat they cannot
      perceive at all. Beyond the flashing wash, there is no rhythm cue.
   3. A rescuer who muted the sound deliberately — a quiet ward, a
      sleeping household — still needs the tempo.

   IT ONLY EVER DOES WHAT IT IS TOLD
   Off until tapped, on until tapped again, and nothing else changes it.
   An earlier draft switched itself on when the app was muted or the audio
   context had failed. That was wrong. A phone that starts vibrating in
   someone's hand during a resuscitation, for a reason they did not cause
   and cannot see, is frightening at the worst possible moment, and a
   rescuer startled into pausing compressions has been harmed by the
   feature meant to help them. Audio failure is already reported by the ⚠
   on the sound control, which is the right place for it: it says what is
   wrong and leaves the response to the rescuer.

   Two states, one button:
     📴  off
     📳  on

   PLATFORM
   navigator.vibrate is Android/Chromium only. iOS Safari has never
   implemented it. On a device without it this file adds no control at
   all — a permanently dead toggle on every iPhone would be noise.

   COST
   Around 110 pulses a minute is not free. Expect measurably faster
   battery drain and a warm phone over a ten-minute resuscitation. That is
   the correct trade at the moment it is needed, and one more reason the
   default is off.

   Chromium also drops vibration when the tab is not visible and before
   any user gesture. Both are moot here: the screen is held awake, and the
   only way to switch this on is to tap it.

   WHAT IT DOES NOT DO
   It does not schedule anything. It hangs off the existing beat, so it
   cannot drift away from the click, and if the metronome stops the
   vibration stops with it.
*/
(function () {
  "use strict";

  var byId = function (id) { return document.getElementById(id); };

  /* Pulse lengths, milliseconds. Long enough to feel through a pocket or
     a gloved hand, far shorter than the ~545 ms gap at 110/min so pulses
     can never overlap or cancel each other. */
  var TAP = 40;
  var ACCENT = 90;

  var TX = {
    en: { on: "Vibrate on each compression", off: "Vibration off" },
    hi: { on: "हर दबाव पर कंपन", off: "कंपन बंद" },
    kn: { on: "ಪ್ರತಿ ಒತ್ತುವಿಕೆಗೆ ಕಂಪನ", off: "ಕಂಪನ ಆಫ್" },
    ta: { on: "ஒவ்வொரு அழுத்தத்திற்கும் அதிர்வு", off: "அதிர்வு நிறுத்தம்" },
    es: { on: "Vibrar en cada compresión", off: "Vibración desactivada" },
    ar: { on: "اهتزاز مع كل ضغطة", off: "الاهتزاز متوقف" }
  };
  function tx() {
    var l = "en";
    try { if (typeof S !== "undefined" && S && S.lang) l = S.lang; } catch (e) {}
    return TX[l] || TX.en;
  }

  var supported = false;
  try { supported = typeof navigator !== "undefined" && typeof navigator.vibrate === "function"; }
  catch (e) { supported = false; }

  /* The whole of this module's state: one boolean the rescuer controls. */
  var on = false;
  var btn = null;

  /* Only the rescuer's compression screen. The console metronome plays on
     the dispatcher's own speaker to help them count aloud; buzzing a
     call-taker's desk phone helps nobody. */
  function onRescuerBeat() {
    try { if (typeof current !== "undefined" && current !== "s-cpr") return false; } catch (e) {}
    try { if (typeof phase !== "undefined" && phase !== "compress") return false; } catch (e) {}
    return true;
  }

  function buzz(n) {
    if (!on || !supported || !onRescuerBeat()) return;
    try { navigator.vibrate(n % 10 === 0 ? ACCENT : TAP); } catch (e) {}
  }

  /* =================================================================
     Hang off the existing beat.

     index.html declares onBeat as a global function and the scheduler
     calls it by bare name, so reassigning it here changes what the
     scheduler invokes. The original runs first and is untouched; a throw
     in the vibration path can never reach the counter.
  ================================================================= */
  function hookBeat() {
    var prev = null;
    try { prev = window.onBeat; } catch (e) {}
    if (typeof prev !== "function") return false;
    if (prev.__haptic) return true;
    var next = function (n) {
      var r = prev(n);
      try { buzz(n); } catch (e) {}
      return r;
    };
    next.__haptic = true;
    window.onBeat = next;
    return true;
  }

  /* =================================================================
     The toggle
  ================================================================= */
  function make() {
    if (btn || !supported) return;
    var sound = byId("btn-sound");
    if (!sound || !sound.parentNode) return;
    btn = document.createElement("button");
    btn.id = "btn-buzz";
    btn.type = "button";
    btn.className = sound.className;        // inherit the header styling exactly
    btn.onclick = function () {
      on = !on;
      /* One pulse on switching on, so the rescuer feels what they asked
         for and knows the phone can do it. Nothing on switching off — a
         buzz confirming silence is a contradiction. */
      if (on) { try { navigator.vibrate(ACCENT); } catch (e) {} }
      paint();
    };
    sound.parentNode.insertBefore(btn, sound);
    paint();
  }

  function paint() {
    if (!btn) return;
    var sound = byId("btn-sound");
    /* Mirror the sound control's visibility rather than re-deriving which
       screens show header controls. One source of truth. */
    if (sound) btn.style.display = sound.style.display;

    btn.textContent = on ? "📳" : "📴";
    var label = on ? tx().on : tx().off;
    btn.title = label;
    btn.setAttribute("aria-label", label);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  }

  function install() {
    if (!supported) return;               // add nothing at all
    make();
    /* onBeat may not exist yet depending on script order, and the sound
       control's visibility changes with every screen, so both are checked
       on a slow timer rather than once. */
    setInterval(function () { hookBeat(); make(); paint(); }, 500);
    hookBeat();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install);
  } else {
    install();
  }
})();
