# CPR Coach — Project Specification

**Build of record: `2026-08-14i`** · Status: **beta, not clinically approved**

---

## 0. How to use this document

This is the single source of truth for the project. It is written to be loaded as context
at the start of any working session, by a person or an AI assistant.

**Read §2 (Design laws), §18 (Decision log) and §19 (Bug history) before proposing any
change.** Those three sections exist to stop the same ground being re-covered. Several
ideas here have already been tried and removed for reasons not obvious from the code
alone, and several bugs have already been fixed twice.

**Rules for anyone changing this project:**

1. Run `node tests/check-langs.js` and `node tests/audit-flow.js` before and after every
   change. Run the full suite before shipping (§17).
2. Every new user-visible string goes into all six language packs. No exceptions.
3. Bump `BUILD` in `index.html` on every change.
4. Update this document in the same commit as the change it describes.
5. If a change touches the emergency path, justify it against §2.

---

## 1. What this is

A zero-install, offline-capable web app that talks a bystander through cardiopulmonary
resuscitation, plus a console that helps an emergency dispatcher do the same over the
phone.

**The single metric that matters is time from collapse to first chest compression.**
Everything else is secondary — including features, polish, and this document.

**Not clinically approved.** Every clinical string requires review by a resuscitation
clinician and by a native speaker of each language. This is the blocker for release.

### Quantified targets

| Metric | Target | Current |
|---|---|---|
| Taps from landing to first compression | 5 | 5 |
| Questions asked before compressions | 3 | 3 |
| Compression rate | 100–120/min | 110/min fixed |
| Pause for two rescue breaths | ≤ 10 s | 10.2 s |
| Time to interactive, cold, 3G | < 2 s | untested on real hardware |
| Works with no network after first load | yes | **no — caching disabled, §15** |

---

## 2. Design laws

Any proposed change is checked against these. They are ordered; a lower-numbered law
wins.

1. **Nothing on screen unless it helps someone survive.** No branding, no engagement
   prompts, no marketing, no build stamps, no credits during an emergency.
2. **Never delay compressions.** No feature may sit between recognition and the first
   push. Optional features are reachable only *after* compressions have started.
3. **The emergency path never waits on the network.** English, the state machine, the
   audio and the flow logic are inline in `index.html`.
4. **Audio-first.** The rescuer's hands and eyes are busy. Every instruction is spoken;
   the screen is the secondary channel.
5. **No AI on the clinical path.** The protocol is a deterministic state machine. Machine
   learning appears only in optional, non-critical features.
6. **No praise, only correction.** Encouragement reinforces whatever the rescuer is
   doing, including doing it wrong.
7. **Fail visibly, never silently.** A feature that stops working must say so. Three
   separate bugs in this project's history were invisible failures (§19).

---

## 3. Repository layout

```
index.html              SERVED. App shell: meta/SEO, all CSS, the complete English
                        language pack, and all application logic. Self-sufficient —
                        runs alone, in English, with no other file present.
sw.js                   SERVED. Must be at the ROOT. A self-uninstalling stub (§15).
manifest.webmanifest    SERVED. PWA metadata; makes the app installable.
lang/hi.js kn.js ta.js  SERVED. Additional language packs, loaded lazily on selection.
lang/es.js ar.js
lang/manifest.json      Informational only; not read at runtime.
images/*                SERVED. Photographs and animations (§11).
assets/icon-192.png     SERVED. PWA icons and the social share card.
assets/icon-512.png
assets/og-image.png
tests/*.js              NOT SERVED. Node scripts. Never referenced by index.html.
*.md                    NOT SERVED. Documentation.
fetch-media.sh          NOT SERVED. Convenience script for local use only.
```

`sw.js` **must** sit at the repository root. A service worker registered at
`/cprcoach/sw.js` can only find its replacement at that exact path; in `lang/` it can
never uninstall itself.

---

## 4. Architecture

Single page, no framework, no build step, no bundler. Three inline `<script>` blocks in
`index.html`, in order:

1. **`SVG = {}`** — an empty map, retained as the fallback slot for imagery (§11).
2. **The English language pack** — `registerLang("en", {...})`. Inline so the emergency
   path never waits on a fetch.
3. **The application** — state, audio, speech, flow, dispatcher console, video.

No persistence of any kind: no accounts, cookies, `localStorage`, `sessionStorage`, or
analytics.

---

## 5. State model

A single object `S` holds all runtime state.

| Field | Meaning |
|---|---|
| `lang` | Interface language code |
| `who` | `adult` \| `child` \| `infant` |
| `breaths` | Whether the 30:2 cycle with ventilations is active |
| `t0` | Session start timestamp, ms |
| `count` | Compressions since the last reset (resets at 30, and on handover) |
| `total` | Compressions in the whole session; never reset |
| `cycles` | Completed sets of 30 |
| `running` | Metronome active |
| `cprStarted` | Whether compressions have ever begun — drives the re-arrest branch |
| `aedStep` | Index into the AED sequence, 0–4 |
| `log` | Array of `{at, ts, label}` handover events |
| `muted` | Sound toggle |
| `lastSwapPrompt` | Elapsed seconds at the last two-minute rescuer prompt |
| `dLang` `dCode` `dLink` `dStep` `dT0` | Dispatcher console state |
| `peer` `stream` `feeds` `sel` `vision` `seenRate` | Video state |

### Phase

`phase` is a separate variable and is the authority for timing-sensitive behaviour:
whether the metronome ticks the counter, whether a language change re-speaks a cue,
whether the logo is tappable.

```
idle → triage → compress ⇄ breaths
                  ↓  ↑
                 aed
                  ↓
                watch → idle
```

Values: `idle`, `triage`, `compress`, `breaths`, `aed`, `watch`.

`phase` starts at `idle`. It once started at `compress`, which made the home screen
behave as though CPR were already running (§19).

---

## 6. The rescuer flow

Twelve screens; one visible at a time. `show(id)` swaps them, sets the header mode, arms
the double-tap guard, and writes a step marker into the handover log.

### 6.1 Why a step can never be skipped

Consecutive screens deliberately place their answers in the same position — the red "No"
is the second button on both the responsiveness and breathing questions. A panicked
rescuer tapping fast, a mobile ghost click, or a replayed event could otherwise fire twice
and skip an entire question. **Two independent defences:**

**(a) Buttons disarm on every screen change.** `armScreen()` sets `disabled` on every
button of a newly shown screen and clears it after **400 ms**. A disabled button cannot
receive a click in any browser — no listener to bypass, no event-ordering subtlety.

**(b) The state machine decides, not the DOM event.**

```js
function step(from, to, fn){
  if(current !== from){ trace("REJECTED "+from+"->"+to); return false; }
  if(fn) fn();
  if(to) show(to);
  return true;
}
```

A handler firing while the app is not on its declared origin screen does nothing. A
duplicated, delayed or replayed event cannot advance the flow, whatever produced it.

An earlier attempt used a capture-phase listener calling `stopPropagation()`. It depended
on event ordering and was not reliable enough. Do not go back to it.

### 6.2 Step numbering and the transition trace

Every emergency screen shows **"Step N of 6"**, generated from one array:

```js
const FLOW = ["s-resp","s-breath","s-who","s-call","s-prep","s-cpr"];
```

This is evidence, not decoration. If a user reports a skipped step, the number on screen
says immediately whether the app jumped 2 → 4 or whether the screen appeared and simply
was not registered.

The handover log also records every visit as `→ step 3/6 who`.

`?debug=1` opens an on-screen transition trace logging every screen change *and every
rejected event*. **Ask for this trace rather than a description when a flow bug is
reported.**

### 6.3 Persistent header

| Screen | Left | Right |
|---|---|---|
| `s-home` | Logo + "CPR Coach" | Dispatcher link, language select |
| `s-resp` | — (first step, no back) | Sound, language |
| `s-breath` `s-who` `s-call` `s-prep` `s-code` | Back button | Sound, language |
| `s-cpr` `s-aed` `s-alive` | "Elapsed" + clock | Sound, language |
| `s-hand` | Logo (tappable → home) | Sound, language |
| `s-console` | "Elapsed" + clock | Sound, language, Exit |

**Back navigation is deliberately asymmetric.** Back exists only on the triage questions,
where mis-tapping "No" on responsiveness is a real and recoverable error. During
compressions and AED there is **no way off the screen** except an explicit clinical
outcome. The logo is tappable only when `phase === "idle"`.

```js
const BACK = {"s-breath":"s-resp","s-who":"s-breath","s-call":"s-who",
              "s-prep":"s-call","s-code":"s-cpr"};
```

### 6.4 `s-home` — Landing

Headline, one large red **SOMEONE COLLAPSED** button, the beta disclaimer, and the full
translated CPR article (which serves SEO and pre-reading). The dispatcher link is a small
text link in the header — deliberately small, because a large button competes with the
emergency action.

Tapping the primary button unlocks audio, records `t0`, clears the log, sets
`phase = "triage"`, requests a screen wake lock, and speaks question 1.

### 6.5 `s-resp` — Step 1: responsiveness

*"Shout at them and squeeze their shoulder. Any response?"*

- **Yes — they moved or spoke** → `s-alive`
- **No — nothing at all** → `s-breath`

### 6.6 `s-breath` — Step 2: breathing

*"Watch their chest for 10 seconds. Are they breathing normally?"*

Carries an explicit warning, because **agonal breathing is the single largest cause of
missed cardiac arrest**: *"Gasping, snoring or irregular gulps are not normal breathing.
That is the sound of a heart that has stopped. If you are unsure, choose No."*

- **Yes — steady and regular** → `s-alive`
- **No, or I'm not sure** → `s-who`

Uncertainty is bundled into "No" by design. Ambiguity must resolve toward treating it as
arrest.

### 6.7 `s-who` — Step 3: patient age

The **only** question whose answer changes the protocol, which is why it earns a place.
It sets three things at once:

| | Hand placement | Depth | Ventilation |
|---|---|---|---|
| Adult | Two hands, heel on centre of chest, elbows locked | ~5 cm | Off — compression-only |
| Child | One hand, heel on centre of chest | ~⅓ chest depth | On — 30:2 |
| Infant | Two fingers, centre of chest below nipple line | ~4 cm | On — 30:2, **neutral airway** |

**Rationale for the ventilation default.** Compression-only CPR is what guidance
recommends for untrained lay rescuers with an adult. Children and infants arrest
predominantly from respiratory causes, so breaths matter more; the app switches
automatically rather than asking a second question.

### 6.8 `s-call` — Step 4: call for help

*"Call an ambulance. Put the phone on speaker."* Plus the crowd instruction: *"If anyone
else is there, point at one person and say: you call, you find a defibrillator."* Naming
one specific person defeats the bystander effect.

Both **Done — next step** and **I'm alone and can't call yet** advance. The app never
blocks progress on the call being made.

### 6.9 `s-prep` — Step 5: positioning

Three numbered steps, spoken as one instruction:

1. Flat on the back on the floor. **Not a bed or sofa — it must be hard.**
2. Kneel beside the chest. Tilt the head back, lift the chin.
3. Open or cut away clothing so you can see the bare chest.

### 6.10 `s-cpr` — Step 6: compressions

**On entry:** counters reset, the age-appropriate image loads, three sentences are spoken
in sequence (placement → depth → "push hard and fast"), then the metronome starts after
**3800 ms** — long enough for the spoken instruction to finish first.

**The whole viewport is the metronome.** A red wash pulses at 110/min at 16% opacity,
visible in peripheral vision from across a room without reading anything. Under
`prefers-reduced-motion` it degrades to a border flash.

#### Cue rotation

Every 30 compressions in compression-only mode, one of six lines is spoken:

1. Let the chest come all the way back up between pushes.
2. If the chest is not moving down, push deeper.
3. Do not stop. Continue until trained help takes over.
4. Keep the same speed. Two pushes every second.
5. This can take much longer than you expect. Continue.
6. Do not stop to check for breathing unless they move or wake.

**No praise.** Every line is a technique correction or a persistence instruction. Telling
someone "you're doing well" when their compressions may be too shallow reinforces the
error. See §18.

#### Two-minute rescuer prompt

Every **120 s** of elapsed time the cue is overridden with: *"Two minutes. If someone can
take over, swap now. Do not pause for more than a few seconds."* Compression depth
degrades measurably from fatigue after about two minutes; the caveat exists because a slow
handover costs more than tired compressions.

#### Rescue breaths (`phase = "breaths"`)

Triggered at every 30th compression when `S.breaths` is true. The metronome stops. Total
window **10.2 s** against a guideline ceiling of 10 s off the chest.

| t | Counter | Adult / child | Infant |
|---|---|---|---|
| 0 s | — | Stop. Tilt the head back. Lift the chin. | Stop. Keep the head level. Do not tilt it far back. |
| 2.6 s | 1 / 2 | Pinch the nose. Cover their mouth with yours. Blow one second. Watch the chest rise. | Cover their mouth **and nose** with your mouth. Puff gently for one second. Watch the chest rise. |
| 6.6 s | 2 / 2 | Let the chest fall. Blow once more. | Let the chest fall. One more gentle puff. |
| 10.2 s | — | Back to compressions now. *(beat restarts automatically)* | same |

**The infant variant is a clinical requirement, not a nicety.** Over-extending an infant's
neck occludes the airway; the head must stay neutral, and the seal covers mouth and nose
together. The app previously used the adult instruction for infants, which was wrong
(§19).

#### Controls

| Control | Effect |
|---|---|
| ⚡ Defibrillator | → `s-aed`, stops the beat |
| 🫁 They're breathing | → `s-alive`, `phase = "watch"` |
| 🤝 Handing over | Stays on screen. Resets the counter and the two-minute timer, clears pending breath timers, speaks *"You are the responder now. Same speed, same depth."* **Elapsed clock and total keep running** so the record stays intact. |
| 🤲/🫁 Breaths toggle | Switches compression-only ⇄ 30:2 |
| 🚑 Paramedics here | → `s-hand`. The most likely handover moment. |
| 📹 Join dispatcher video | → `s-code`. Last and least prominent; optional. |

### 6.11 `s-code` — Join dispatcher video

Six-digit numeric input, pre-filled from `?code=NNNNNN`. Every failure mode (no network,
no library, no camera, dispatcher unreachable) produces a message ending in *"Keep
pushing"* and returns the rescuer to compressions. **Video can never block CPR.**

### 6.12 `s-aed` — Defibrillator

Five steps, advanced manually:

1. Turn it on. Do exactly what it says. *(Keep pushing while someone else opens it.)*
2. Bare the chest. Wipe it dry if wet.
3. Stick the pads exactly as pictured on the pads. *(One upper right, one lower left.)*
4. Nobody touch them. Let it analyse. *(Say it out loud: stand clear.)*
5. If it says shock, press the button. Then push again immediately.

Each screen carries a bare `N / 5` progress count. It deliberately does not use the
`Step N of 6` wording of the triage flow — this is a detour inside step 6, not a seventh
step, and reusing the phrasing would imply the rescuer had lost their place.

Steps 1–4 advance on a button labelled **Next**. Step 5 is labelled **⚡ Done — back to
compressions** instead, because it is the only press that writes a clinical event
(`Shock delivered or advised`) into the handover record; a bare arrow gave the rescuer no
way to know that. On step 5 the quiet **↩ Back to compressions** button is hidden, since it
reaches the same screen while silently dropping the shock from the record the paramedics
read — offering both made that entry a coin flip. No dead end results: the amber button
returns to compressions either way.

Step 5 returns to `s-cpr` and **restarts the beat automatically** — resuming compressions
immediately post-shock is the point, and the app does not wait for a tap to prove it.
**↩ Back to compressions** is available on steps 1–4.

**Open for clinical review:** an AED that reports *no shock advised* currently logs the
same event as one that delivered a shock. Splitting step 5 in two would fix the record but
adds a decision mid-resuscitation, which §2 resists. Not resolved here.

### 6.13 `s-alive` — Recovery position

*"Roll them onto their side, head tilted back, mouth pointing down."*

**They stopped breathing — restart** is **conditional**:

- If `S.cprStarted` — compressions were already given — go straight back to `s-cpr`. The
  rescuer already knows the age, has called, and the patient is already flat with the
  airway open. Repeating those steps would cost seconds.
- Otherwise — they responded, or were breathing normally, so triage was never completed —
  run the skipped steps: `s-who` → `s-call` → `s-prep` → `s-cpr`.

### 6.14 `s-hand` — Handover record

Reachable from `s-alive` and, critically, from `s-cpr` and `s-aed` via **🚑 Paramedics
here**. A crew arriving mid-resuscitation is the most likely handover moment; an earlier
version had no route to the record from the compression screen at all.

**Format.** A date header, then one row per event: wall-clock `HH:MM:SS`, the label, and
elapsed time as a small suffix. A new date header is inserted if the session crosses
midnight. Paramedics record wall time, not stopwatch time.

**Share** uses the Web Share API where available — AirDrop, WhatsApp, email — falling back
to the clipboard. **Copy** puts it on the clipboard. The exported text ends with *"guidance
only, not a clinical record."*

#### Event vocabulary

Every label the log can contain:

```
Collapse reported
Responded to voice
Unresponsive
Breathing normally
Not breathing normally — arrest assumed
Patient: adult | child | infant
Ambulance called
Rescuer alone, call pending
Positioned flat, airway opened
Compressions started
Switched to 30:2 with breaths | Switched to compression-only
Rescuer changed
Defibrillator on scene
Shock delivered or advised
Breathing returned
Re-arrest — compressions resumed
Deteriorated — arrest assumed
Paramedics took over
Video joined, code NNNNNN
Camera stopped by rescuer
→ step N/6 <screen>
```

---

## 7. Dispatcher console

Reachable from the small home link or directly via `?role=dispatcher`, which a dispatch
centre can bookmark so an experienced call-taker never sees the home screen.

Single column, ordered by what the dispatcher actually *does*.

### 7.1 Script card — the primary element

Boxed in solid ink at the top, because reading the script aloud is the main action. Six
steps, each with the line to say and a coaching note.

| # | Say | Coaching note |
|---|---|---|
| 1 | Is he awake? Shout his name and squeeze his shoulder. | Wait for a clear yes or no. Nothing else yet. |
| 2 | Look at his chest. Is he breathing normally? Gasping does not count. | This is where recognition most often fails. Push back once on a vague answer. |
| 3 | Help is on the way. Start pushing on his chest right now. | Do not ask age, history or address again. |
| 4 | Put him flat on his back on the floor. Kneel beside him, heel of your hand in the centre of his chest. | Position and hand placement in one sentence. |
| 5 | Push down hard, twice a second, and do not stop until I tell you. | Start the beat. Count aloud with them for the first ten. |
| 6 | Two minutes. If someone else is there, swap over now. | Prompt a compressor change every two minutes. |

Designed against the known failure mode: dispatchers asking unnecessary questions — age,
history, address — instead of driving to compressions.

### 7.2 The two languages

They are not duplicates.

- **Header language** — everything the dispatcher sees, *including the script text*.
- **"Caller speaks" dropdown** — what the Play button speaks, and the language a sent link
  opens in.

The script always renders in the dispatcher's language. An earlier version rendered it in
the caller's language, leaving an English-speaking call-taker with a Hindi caller staring
at Devanagari, able only to press Play. **The Play button is always shown; English is not
a special case.**

**Language names follow the same rule.** `langName(code, inLocale)` uses
`Intl.DisplayNames`, so the caller's language is named *in the dispatcher's language* — an
English call-taker sees "Play in Tamil", a Hindi one "तमिल". The native name is appended
in the dropdown for recognition. The rescuer's own picker leads with native names, because
someone looking for their own language recognises it in its own script.

### 7.3 Milestones

Two large buttons that display their own captured value and turn green when pressed:
**Arrest recognised** and **First compression**. These are the two measures with the
strongest evidence base in telephone CPR. They are buttons *and* readouts — one element
per fact, rather than a control plus a separate card.

### 7.4 Video

Always visible, never behind an accordion. Compact row: six-digit code, 🔗 Copy link,
📹 Open video. The stage renders only once a session is opened, so an idle console shows
no dead black rectangle.

Multi-party: every rescuer who enters the code appears as a tile. Tap a tile to enlarge it
— one person can hold the camera while another compresses.

**Rate estimate.** Frame differencing on a 48×36 downsample of the selected feed. Peaks
detected against an adaptive threshold (`mean × 1.55 + 1.5`) with a 330 ms refractory
period; rate is the median of the last 8 intervals. Overlaid on the video because it is an
attribute of the feed, not an independent metric. Turns red outside **95–130/min**, and
shows "No compressions seen" after **4 s** of stillness.

**Rate only. Depth is not measured** — that would require clinical validation and would
make this regulated medical device software (CDSCO in India, FDA in the US).

### 7.5 Metronome

A quiet secondary control reading "▶ Metronome · 110/min", amber while running. Not a
primary action: the beat plays on the *dispatcher's* speaker, so its real use is helping
the call-taker count aloud in time.

**Why 110 is fixed.** Guidelines specify 100–120. 110 is the midpoint, so it stays inside
the window when a rescuer drifts either way. It is not exposed as a setting because
choosing a number is a decision the dispatcher does not need to make, and every control
competes with the script. Change `BPM` in `index.html` if a reviewer wants a different
value.

---

## 8. Audio

**Metronome.** Web Audio with lookahead scheduling — a 25 ms polling loop schedules clicks
up to 150 ms ahead against `AudioContext.currentTime`. `setInterval` drifts by seconds
over a ten-minute resuscitation and is not used.

Two failure modes are handled explicitly:

- **Suspended context.** If `state !== "running"` the scheduler calls `resume()`, updates
  the health indicator, and retries at 120 ms rather than stalling. A stalled scheduler
  previously produced total silence with no recovery.
- **Drift.** If `nextBeat` falls behind `currentTime` it re-anchors, which happens after
  backgrounding.

Click is a band-passed square burst: 880 Hz normally, 1250 Hz on every tenth beat, gain
0.62 / 0.85.

**Background survival.** A silent looping `<audio>` element holds the OS audio session.
Two things were wrong with the first implementation and both silenced the metronome on
desktop:

1. The silence was a **zero-length WAV**. Some browsers refuse or stall on a malformed
   zero-sample loop. It is now a real one second of 8 kHz silence generated at runtime.
2. The element was created **before** the beat started, and on desktop Safari an
   `HTMLAudioElement` can take the audio session away from the `AudioContext`. It now
   starts 600 ms *after* the beat is running, and if the context is found suspended
   afterwards the element **tears itself down and resumes the context**.

**Audio health indicator.** The 🔊 control shows ⚠ whenever the `AudioContext` is not
running. Tapping it in that state retries the context rather than muting.

**Caveat:** behaviour during a live phone call is unverified on low-end Android.

---

## 9. Speech

`SpeechSynthesisUtterance` at rate 0.97. Utterances are **queued, not cancelled** —
cancelling mid-sentence was cutting words out of the rescue-breath instructions. A watchdog
pauses and resumes the synthesiser every 9 s to work around a Chrome defect where speech
dies silently after about 15 s. If no voice exists for the selected locale, it falls back
to the default voice but keeps the native text.

---

## 10. Languages

Six: English, हिन्दी, ಕನ್ನಡ, தமிழ், Español, العربية.

English is inline in `index.html` and always present. The others are separate files loaded
lazily on selection, 6–8 KB each, requested as `lang/xx.js?v=BUILD`.

**The version query is required.** GitHub Pages caches `lang/*.js` at its CDN; an earlier
build shipped empty packs, and without the query the CDN can serve those indefinitely.

**Why the list is hardcoded rather than auto-discovered.** A static host cannot list a
directory, so discovery would need a network round-trip before the language picker could
render — on the path to a life-saving screen. `LANG_INDEX` costs nothing and cannot fail.

Packs whose code matches a device language are prefetched at browser idle.

### Pack schema

49 top-level keys.

```
name, code (BCP-47), dir ("ltr"|"rtl")
homeH, start, startSub, disclaimer
q1, q1y, q1n, q2, q2w, q2y, q2n, q3, adult, child, infant
callH, callP, called, alone
prepH, prep[3], prepDone
aedBtn, aliveBtn, swap, breathsOn, breathsOff, videoBtn, videoLive
codeH, codeNote, codeGo, codeBack
aliveH, aliveP, restart, handH, handH2, aedBack, aedDone, newRescuer
say: { place{adult,child,infant}, depth{adult,child,infant}, go, keep[6],
       swap2min, b1,b2,b3, bi1,bi2,bi3, resume, aed, clear, shock, prep }
aedSteps[5]  { h, n, art }
dScript[6]   { s, e }
ui{34 keys}  elapsed, exit, next, back, sayThis, callerSpeaks, playIn, codeFor,
             copyLink, openVideo, endVideo, waiting, noComp, arrestRec, firstComp,
             metronome, rescuer, copy, startOver, dispatcher, step, of, lastOne,
             medics, share, copied, yourLang, searchLang, link, unavailable,
             needSix, noNet, noCam, noReach
article      { h, p, s[7] }
```

### Adding a language

1. Copy `lang/es.js` → `lang/xx.js`; translate every string.
2. Add `{code:"xx", name:"Native", en:"English name"}` to `LANG_INDEX` in `index.html`.
3. Add an `hreflang` line in `<head>`.
4. Run `node tests/check-langs.js`.

`dir:"rtl"` for right-to-left scripts. `code` must be a BCP-47 tag the speech engine
recognises (`hi-IN`, `ar-SA`).

### Pack integrity gate

Because English is inline, **a broken or empty pack fails silently** — the app keeps
working in English and language switching simply stops, with no error anywhere. This has
happened twice (§19).

`tests/check-langs.js` verifies, for every code in `LANG_INDEX`: the file exists, is
non-trivially sized, calls `registerLang` with the right code, parses, actually registers,
and has complete key parity with English including array lengths. **Run it before every
commit.**

At runtime, a pack that loads but registers nothing usable logs to the console and marks
its option with ✕ in the picker. It does not fail quietly.

---

## 11. Imagery

`SVG` is empty — no hand-drawn diagrams. Real photographs and animations are declared in
`MEDIA` and stored in `images/`:

| Slot | File | Shown on |
|---|---|---|
| `handsAdult`, `handsChild` | `Chest_compressions.gif` | compression screen, adult and child |
| `handsInfant` | `Infant_two_finger_CPR.png` | compression screen, infant |
| `breathInfant` | `Infant_Mouth_to_Mouth-and-Nose_Breathing.png` | rescue-breath pause, infant |

`art()` loads the file and shows it only on success, so a missing or slow file costs
nothing — the screen carries text and voice. Images cap at 34vh (24vh on short screens) so
they never crowd the counter, and tapping one opens it full screen over a dark backdrop.
The overlay closes on any tap and after 20 s, and the metronome, voice and count keep
running behind it — looking at a picture must never pause the resuscitation. Page-wide
pinch-zoom stays disabled (`user-scalable=no`); a rescuer with wet or shaking hands must
not be able to zoom the buttons out of reach. `tests/audit-flow.js` asserts every path in `MEDIA` exists on
disk, which prevents the 404 class of bug.

**Three conditions before any image ships:**

1. **Licence verified** — CC0, public domain, CC BY or CC BY-SA only.
2. **Checked against the protocol text.** An image demonstrating a technique differently
   from the spoken instruction is a safety defect. Any number written on an image must
   match the app exactly.
3. **Unambiguous at a glance**, at arm's length, to someone who has never done CPR. If it
   needs a caption, it fails.

Attribution lives in `CREDITS.md` and `README.md`, never on screen. `CREDITS.md` also lists
the eight slots still worth filling, in priority order — `pads` and `recovery` first.

**Outstanding:** `Chest_compressions.gif` is CC BY 3.0 and its author is not yet recorded.
Both infant images carry burnt-in English text, which breaks the multilingual rule and
should be cropped before release.

---

## 12. Video

PeerJS, loaded from CDN **on demand only** — the CPR path never touches the network. The
dispatcher opens a session with peer ID `cprcoach-room-<code>`; each rescuer entering the
code calls it. Multi-party by construction.

**Production requirements not yet met:** the public PeerJS broker is demo-grade; a real
deployment needs its own PeerServer or an SFU, plus TURN servers for callers behind carrier
NAT.

---

## 13. URL parameters

| Parameter | Effect |
|---|---|
| `?lang=xx` | Opens directly in that language |
| `?code=NNNNNN` | Pre-fills the dispatcher video code |
| `?role=dispatcher` | Opens straight into the console |
| `?debug=1` | Shows the transition trace and the build stamp |

---

## 14. Privacy

No accounts, cookies, storage or analytics. No third-party scripts on the emergency path.
The handover log lives in memory and is destroyed on reset. Location is never requested.
Camera is requested only when the rescuer explicitly enters a dispatcher code. PeerJS is
fetched only when video is opened.

---

## 15. Caching — currently disabled, and why

**There is no active service worker.** `sw.js` is a self-uninstalling stub, and the page
also unregisters any worker and deletes any cache on load.

Two successive caching bugs each presented as *the app randomly losing steps*:

1. **Cache-first for the document.** Returning users got a stale app shell paired with
   freshly fetched language files.
2. **The worker could pin itself.** `sw.js` is not a document, so it fell into the
   cache-first branch — an old worker could keep serving its own stale copy, meaning
   published fixes never reached the device at all.

The second is the dangerous class: it makes every subsequent fix unverifiable, because you
cannot tell whether a change failed or simply never arrived.

**Offline support returns only when the UI stops changing daily**, and must then be built
as: precache with a build hash in the cache name, `updateViaCache: "none"` on registration,
network-first for both the document *and* `sw.js`, and an explicit version check in the
page. Until then, correctness beats offline.

**Debugging rule: when two devices disagree, compare the build stamp first** — `?debug=1`
reveals it.

---

## 16. SEO

Title, description, keywords, canonical, seven `hreflang` tags, Open Graph and Twitter
cards, inline SVG favicon. JSON-LD carries both `WebApplication` and a full `HowTo` schema.
The translated article below the fold is what actually ranks.

**The `HowTo` schema means search engines may surface these CPR steps to people who never
open the page.** Those strings must have clinical sign-off *before* the site is indexed.

---

## 17. Testing

All scripts are Node, live in `tests/`, and are never served.

```
npm install jsdom
node tests/check-spec.js     # THIS DOCUMENT against the code — every constant, screen,
                             # event label, phase and URL parameter
node tests/check-langs.js    # packs load, parse, register, full key parity
node tests/audit-flow.js     # screen graph, dead ends, clinical rules, MEDIA paths
node tests/test.js           # 85 assertions: flow, controls, console, localisation
node tests/adversarial.js    # 14 assertions: ghost clicks, double taps, replayed events
node tests/verify-flow.js    # prints every screen as a user sees it, with step numbers
```

**`check-spec.js` keeps this document honest.** It verifies every number quoted here
against the source — beat delay, breath timings, swap interval, disarm window, click
frequencies and gains, scheduler intervals, video thresholds — plus the screen list, the
`FLOW` and `BACK` maps, the pack schema counts, every `mark()` label against the event
vocabulary, every `phase` value, and every `MEDIA` path. A specification used as project
context is worse than none when it drifts, so drift is now a test failure.

`adversarial.js` fires the event patterns a real browser produces that a naive "one click
per screen" harness never sees. **It is the suite that matters for the step-skipping class
of bug.** Both DOM suites wait real time rather than only advancing a virtual clock — that
flaw once let a bug hide.

---

## 18. Decision log

Ideas tried and rejected, or considered and declined. **Do not reintroduce these without
new evidence.**

| Decision | Reasoning |
|---|---|
| **No hand-drawn SVG diagrams** | Tried, ambiguous, removed. A rescuer who misreads a diagram is worse off than one who only hears the instruction. |
| **No praise in the cues** | "You're doing well" reinforces whatever they are doing, including doing it wrong. Corrections and persistence only. |
| **No compression *depth* measurement** | Requires clinical validation; makes this regulated medical device software. |
| **No AI on the clinical path** | The protocol must be deterministic, versioned and testable. |
| **No back button during compressions or AED** | One mis-tap with shaking hands loses the beat. |
| **Metronome rate fixed at 110** | A number the dispatcher does not need to choose; every control competes with the script. |
| **Language list hardcoded, not auto-discovered** | Discovery needs a network round-trip before the picker can render. |
| **Native `<select>` for both language pickers** | Replaced a custom sheet with search rows. One tap, platform picker on mobile, far less to break. |
| **Dispatcher script renders in the dispatcher's language** | Rendering it in the caller's language left the call-taker unable to read what they were about to say. |
| **Build stamp hidden unless `?debug=1`** | It does not help anyone survive. |
| **Small dispatcher link, not a button** | A large button competes with the emergency action. |
| **Attribution off-screen** | CC BY permits credit "in any reasonable manner"; on-screen text during a resuscitation fails design law 1. |
| **Caching disabled for now** | Correctness beats offline while the UI changes daily. |

---

## 19. Bug history — root causes

Each of these was fixed, and several recurred. **Read this before debugging anything that
looks familiar.**

| Symptom | Root cause | Guard now in place |
|---|---|---|
| Steps skipped on mobile | Consecutive screens place answers in the same position; one touch fired twice | 400 ms button disarm + `step(from,to)` origin gate; `adversarial.js` |
| "Fixes never arrive", steps missing | Service worker served a stale copy of *itself* | Service worker removed entirely; page self-heals |
| Language switching silently stops | Build script `open(p,"w").write(f(open(p).read()))` truncated all packs to 0 bytes — Python opens for writing before reading | `tests/check-langs.js` gate; runtime ✕ marker |
| Language switching stops after deploy | CDN serving previously-cached empty packs | `?v=BUILD` on every pack request |
| Metronome silent on desktop | Zero-length silent WAV, and the keep-alive element stealing the audio session from `AudioContext` | Real 1 s silence; keep-alive starts after the beat and self-disables |
| Metronome silent, no recovery | Scheduler stalled when the context was suspended | Retry loop + ⚠ health indicator |
| Rescue-breath words cut off | Each `say()` cancelled the previous mid-sentence | Utterances queued, not cancelled |
| Home screen spoke "Push hard and fast" | `phase` initialised to `"compress"` | Starts at `"idle"`; speech double-gated on phase *and* screen |
| Handover froze the counter | Cue blanked without resetting `count` | Full state reset on swap |
| Dispatcher panels touching | An edit consumed `.d-say`'s closing `</div>`, nesting every panel inside it | `audit-flow.js` counts div balance |
| 404 on a GIF | `MEDIA` referenced a file that was never downloaded | `audit-flow.js` asserts every `MEDIA` path exists |
| Infants told to tilt the head back | Adult ventilation script applied to infants; over-extension occludes an infant airway | Separate `bi1`–`bi3` infant strings |

---

## 20. Deliberately not built

| | Why |
|---|---|
| Choking, bleeding, stroke, drowning protocols | Cardiac arrest first, end to end, before broadening |
| AED location map | An unverified AED map is worse than none |
| Practice / training mode | Second pillar, not yet built |
| Account, history, cloud sync | Nothing to gain, privacy to lose |
| Own signalling server | Needed for production video; not yet built |

---

## 21. Known limitations

1. **All non-English strings are machine-quality.** Highest-priority fix.
2. **No clinical sign-off**, no version-controlled protocol document, no named medical
   director. This blocks everything else.
3. **PeerJS uses a public broker.** Not production-grade.
4. **Audio during a live phone call is unverified** on low-end Android.
5. **The six-step dispatcher script is unvalidated.** It may need splitting into a
   recognition script and a coaching script — a real dispatcher should judge.
6. **Speech voices for Indian languages are absent on many devices**, so text is native but
   audio may fall back to English.
7. **Offline is currently disabled** (§15).
8. **Images carry burnt-in English text** and one lacks recorded attribution (§11).

---

## 22. Before public release

1. Named medical director. Protocol mapped against current AHA and Indian Resuscitation
   Council guidance, with a version number committed to the repository.
2. Native-speaker review of every string, then clinical review of the back-translation.
3. Field testing: low-end Android, 2G, a stairwell, direct sunlight, one-handed.
4. Accessibility pass: screen reader, contrast, touch targets, reduced motion.
5. Complete image attribution; crop burnt-in text; compress files.
6. Rebuild offline support properly (§15).
7. Only then remove the beta badge and allow indexing.

---

## 23. Change checklist

Run through this for **every** change, however small.

- [ ] `node tests/check-spec.js` passes — this document still matches the code
- [ ] `node tests/check-langs.js` passes — no empty or partial packs
- [ ] `node tests/audit-flow.js` passes — no dead ends, all `MEDIA` paths exist
- [ ] `node tests/test.js` passes (85 assertions)
- [ ] `node tests/adversarial.js` passes (14 assertions)
- [ ] `node tests/verify-flow.js` prints all six steps in order
- [ ] Every new string added to all six language packs
- [ ] Nothing added between recognition and first compression
- [ ] No praise language introduced into any cue
- [ ] Every new flow transition goes through `step(from, to, fn)`
- [ ] `BUILD` bumped in `index.html`
- [ ] Emergency path still works with the network disabled
- [ ] Tested in portrait, landscape and desktop
- [ ] This document updated in the same commit
