# CPR Coach — Functional Specification

Version of record for the beta prototype. Describes every screen, control, timing
constant and behaviour currently implemented, plus what is deliberately absent.

**Status: beta. Not clinically approved.** Every clinical string requires review by a
resuscitation clinician and a native speaker before public promotion.

---

## 1. Purpose and design laws

The product exists to shorten the time between a person collapsing and the first chest
compression. Everything else is secondary.

**Six rules the code follows.** Any proposed change should be checked against them.

1. **Nothing on screen unless it helps someone survive.** No branding, no engagement
   prompts, no marketing copy during an emergency.
2. **The emergency path never waits on the network.** English, the state machine, the
   audio and every illustration are inline in `index.html`. Nothing on the critical
   path can fail to load.
3. **Audio-first.** The rescuer's hands and eyes are busy. Every instruction is spoken;
   the screen is a secondary channel.
4. **No AI on the clinical path.** The protocol is a deterministic state machine.
   Machine learning appears only in optional, non-critical features (video rate estimate).
5. **Never delay compressions.** No feature may sit between recognition and the first
   push. Optional features (video) are reachable only *after* compressions start.
6. **No praise, only correction.** Encouragement reinforces whatever the rescuer is
   doing, including doing it wrong.

### Quantified targets

| Metric | Target |
|---|---|
| Taps from landing to first compression | 5 |
| Questions asked before compressions | 3 |
| Time to interactive, cold, 3G | < 2 s |
| Compression rate | 110/min (guideline window 100–120) |
| Pause for two rescue breaths | ≤ 10 s |
| Works with no network after first visit | Yes, fully |
| Guard window after any screen change | 450 ms |

---

## 2. File structure

```
index.html              App shell. Contains: meta/SEO, all CSS, all SVG illustrations,
                        the complete English language pack, and the application logic.
                        Self-sufficient — will run alone with English only.
lang/hi.js kn.js        Additional language packs. Loaded lazily on selection.
lang/ta.js es.js ar.js  Each calls registerLang(code, pack).
lang/manifest.json      Informational list of packs. Not used at runtime.
sw.js                   Service worker. Network-first for HTML, cache-first for assets.
manifest.webmanifest    PWA metadata; makes the app installable to a home screen.
assets/icon-192.png     PWA icons.
assets/icon-512.png
assets/og-image.png     Link-preview card for WhatsApp and social shares.
test.js                 Headless DOM regression suite. 55 assertions.
README.md               Hosting and contribution notes.
SPEC.md                 This document.
```

---

## 3. Global state

A single object `S` holds all runtime state. There is no persistence — nothing is
written to disk, no cookies, no localStorage, no analytics.

| Field | Meaning |
|---|---|
| `lang` | Interface language code |
| `who` | `adult` \| `child` \| `infant` |
| `breaths` | Whether the 30:2 cycle with rescue breaths is active |
| `t0` | Session start timestamp (ms) |
| `count` | Compressions since the last reset (resets at 30 or on handover) |
| `total` | Compressions in the whole session, never reset |
| `cycles` | Completed sets of 30 |
| `running` | Metronome active |
| `aedStep` | Index into the AED sequence, 0–4 |
| `log` | Array of `{at, label}` handover events |
| `muted` | Sound toggle |
| `lastSwapPrompt` | Elapsed seconds at the last two-minute rescuer prompt |
| `dLang`, `dCode`, `dLink`, `dStep`, `dT0` | Dispatcher console state |
| `peer`, `stream`, `feeds`, `sel`, `vision`, `seenRate` | Video state |

### Phase

A separate `phase` variable gates timing-sensitive behaviour. Values:

`idle` → `triage` → `compress` ⇄ `breaths` / `aed` → `watch` → `idle`

`phase` is the authority for whether the metronome ticks the counter, whether the
language picker speaks a cue on change, and whether the logo is tappable. It starts at
`idle`; a previous bug initialised it to `compress`, which made the home screen behave
as though CPR were already running.

---

## 4. Screens

Twelve screens, one visible at a time. `show(id)` swaps them and sets the header mode.

### 4.0 Why a step can never be skipped

Consecutive screens deliberately place their answers in the same position — the red "No"
is the second button on both the responsiveness and breathing questions. A panicked
rescuer tapping fast, a mobile ghost click, or a replayed event could otherwise fire
twice and **skip an entire question**. Two independent defences now make this impossible.

**1. Buttons disarm on every screen change.** `armScreen()` sets `disabled` on every
button of a newly shown screen and clears it after 400 ms. A disabled button cannot
receive a click in any browser — there is no listener to bypass and no event-ordering
subtlety. An earlier attempt used a capture-phase listener calling `stopPropagation()`;
that depended on event ordering and was not reliable enough for this.

**2. The state machine, not the DOM event, decides what happens next.** Every flow
transition runs through:

```js
function step(from, to, fn){
  if(current !== from) return false;   // wrong screen: ignore entirely
  if(fn) fn();
  if(to) show(to);
  return true;
}
```

A handler firing while the app is not on its declared origin screen does nothing at all.
A duplicated, delayed or replayed event therefore cannot advance the flow, whatever
produced it.

`adversarial.js` exercises exactly these cases: ghost clicks at 300 ms, three clicks in
one frame, stale handlers from one and two screens back, and an attempt to jump straight
to compressions from the call step.

### 4.0b Step numbering and the transition trace

Every emergency screen carries a visible **"Step N of 6"**, generated from a single
declared array:

```js
const FLOW=["s-resp","s-breath","s-who","s-call","s-prep","s-cpr"];
```

This is not decoration. It is evidence. If a user reports a skipped step, the number on
screen says immediately whether the app jumped 2 → 4 or whether the screen appeared and
was simply not registered.

**The handover log records the screen path.** Every visit to a numbered screen is written
into the record as `→ step 3/6 who`, so the summary shown to paramedics doubles as proof
of the route the app actually took.

**`?debug=1` opens an on-screen transition trace.** It logs every screen change with a
timestamp *and every rejected event*, e.g. `REJECTED s-who->s-call (app is on s-call)`.
Anyone reporting a flow bug should be asked for this trace rather than a description.

### 4.1 Persistent header

Present on every screen. Three zones.

| Screen | Left | Right |
|---|---|---|
| `s-home` | Logo + "CPR Coach" | Dispatcher link, language |
| `s-resp` | — (no back; first step) | Sound, language |
| `s-breath`, `s-who`, `s-call`, `s-prep`, `s-code` | Back arrow | Sound, language |
| `s-cpr`, `s-aed`, `s-alive` | "Elapsed" + clock | Sound, language |
| `s-hand` | Logo (tappable → home) | Sound, language |
| `s-console` | "Elapsed" + clock | Sound, language, Exit |

**Back navigation is deliberately asymmetric.** A back button during compressions is a
hazard — one mis-tap with shaking hands and the rescuer loses the beat. Back exists only
on the triage questions, where mis-tapping "No" on responsiveness is a real and
recoverable error. During compressions and AED there is **no way off the screen** except
an explicit clinical outcome. The logo is tappable only when `phase === "idle"`.

**Language picker.** Opens a sheet below the header. Rows show the native name plus the
Latin name (हिन्दी *Hindi*) — someone who cannot read Devanagari cannot find Hindi in a
Devanagari-only list. Device languages sort to the top. A search field appears
automatically once `LANG_INDEX.length > 8`. Selecting a language loads its pack if
needed, re-renders every string, and — only if compressions are running on `s-cpr` —
re-speaks the current cue in the new language.

---

### 4.2 `s-home` — Landing

| Element | Behaviour |
|---|---|
| Headline | "If someone has collapsed, start here." |
| **SOMEONE COLLAPSED** | Primary red button, ≥150px tall. Starts the session. |
| Beta disclaimer | Legal notice; only shown pre-emergency |
| Article | Full CPR guidance in prose, translated. Serves both SEO and pre-reading. |
| Credit line | Illustration provenance and protocol basis |
| Dispatcher (header) | Small text link. Deliberately small — a large button competes with the emergency action. |

Tapping the primary button: unlocks audio, records `t0`, clears the log, sets
`phase = "triage"`, requests a screen wake lock, shows `s-resp`, speaks question 1.

---

### 4.3 `s-resp` — Question 1 of 3: responsiveness

*"Shout at them and squeeze their shoulder. Any response?"* Illustration: rescuer
shaking a supine person's shoulder.

- **Yes — they moved or spoke** (green) → `s-alive`. Logged "Responded to voice".
- **No — nothing at all** (red) → `s-breath`. Logged "Unresponsive".

---

### 4.4 `s-breath` — Question 2 of 3: breathing

*"Watch their chest for 10 seconds. Are they breathing normally?"*

Carries an explicit warning, because **agonal breathing is the single largest cause of
missed cardiac arrest**: *"Gasping, snoring or irregular gulps are not normal breathing.
That is the sound of a heart that has stopped. If you are unsure, choose No."*

- **Yes — steady and regular** → `s-alive`.
- **No, or I'm not sure** → `s-who`. Logged "Not breathing normally — arrest assumed".

The uncertainty case is bundled into "No" by design. Ambiguity must resolve toward
treating it as arrest.

---

### 4.5 `s-who` — Question 3 of 3: patient age

*"Who are you helping?"* Three buttons: adult or teenager, child (1 year to puberty),
baby under 1 year.

This is the **only** question whose answer changes the protocol, which is why it earns a
place. It sets three things at once:

| | Hand placement | Depth | Breaths |
|---|---|---|---|
| Adult | Two hands, heel on centre of chest, elbows locked | ~5 cm | Off (compression-only) |
| Child | One hand, heel on centre of chest | ~⅓ chest depth | On (30:2) |
| Infant | Two fingers, centre of chest below nipple line | ~4 cm | On (30:2) |

**Rationale for the breath default.** Compression-only CPR is what guidance recommends
for untrained lay rescuers with an adult. Children and infants arrest predominantly from
respiratory causes, so breaths matter more — the app switches automatically rather than
asking a second question.

---

### 4.6 `s-call` — Call for help

*"Call an ambulance. Put the phone on speaker."*

Includes the crowd instruction: *"If anyone else is there, point at one person and say:
you call, you find a defibrillator. Then come straight back."* Naming one specific person
defeats the bystander effect.

- **Done — next step** → `s-prep`. Logged "Ambulance called".
- **I'm alone and can't call yet** → `s-prep`. Logged "Rescuer alone, call pending".

Both go forward. The app never blocks progress on the call being made.

---

### 4.7 `s-prep` — Positioning

Three numbered steps, each with its own illustration, spoken as one instruction:

1. Flat on the back on the floor. **Not a bed or sofa — it must be hard.**
2. Kneel beside the chest. Tilt the head back, lift the chin.
3. Open or cut away clothing to expose the bare chest.

**Ready — start pushing** → `s-cpr`. Logged "Positioned flat, airway opened".

---

### 4.8 `s-cpr` — Compressions (the core screen)

**On entry:** `phase = "compress"`, counters reset, hand-placement illustration matched to
patient age, three sentences spoken in sequence (placement → depth → "push hard and
fast"), then the metronome starts after **3800 ms** — enough time for the spoken
instruction to finish before the beat begins.

| Element | Behaviour |
|---|---|
| Progress bar | Fills over 30 compressions; turns green during breaths |
| Illustration | Hand placement for the selected age; swaps to mouth-to-mouth during breaths |
| Counter | Huge tabular numeral, 1…30 then repeating |
| Cue line | Rotating corrective guidance |
| Elapsed clock | In the header |

**The whole viewport is the metronome.** A red wash pulses at 110/min at 16% opacity —
visible in peripheral vision from across a room without reading anything. Under
`prefers-reduced-motion` it degrades to a border flash.

#### Cue rotation

Every 30 compressions in compression-only mode, one of six corrective lines is spoken:

1. Let the chest come all the way back up between pushes.
2. If the chest is not moving down, push deeper.
3. Do not stop. Continue until trained help takes over.
4. Keep the same speed. Two pushes every second.
5. This can take much longer than you expect. Continue.
6. Do not stop to check for breathing unless they move or wake.

**No praise.** Every line is either a technique correction or a persistence instruction.
Telling someone "you're doing well" when their compressions may be too shallow actively
reinforces the error.

#### Two-minute rescuer prompt

Every **120 seconds** of elapsed time, the cue is overridden with: *"Two minutes. If
someone can take over, swap now. Do not pause for more than a few seconds."* Compression
depth degrades measurably from fatigue after about two minutes; the caveat about not
pausing is there because a slow handover costs more than tired compressions.

#### Rescue breaths (`phase = "breaths"`)

Triggered at every 30th compression when `S.breaths` is true. The metronome stops. Total
window is **10.2 seconds**, against a guideline ceiling of 10 seconds off the chest.

| t | Counter | Spoken |
|---|---|---|
| 0 s | — | Stop. Tilt the head back. Lift the chin. |
| 2.6 s | 1 / 2 | Pinch the nose. Cover their mouth with yours. Blow one second. Watch the chest rise. |
| 6.6 s | 2 / 2 | Let the chest fall. Blow once more. |
| 10.2 s | — | Back to compressions now. *(beat restarts automatically)* |

The green countdown bar drains over the window so the rescuer can see the pause ending.

#### Controls

| Control | Effect |
|---|---|
| ⚡ **Defibrillator** | → `s-aed`. Stops the beat. Logged. |
| 🫁 **They're breathing** | → `s-alive`. `phase = "watch"`. Logged. |
| 🤝 **Handing over** | Stays on screen. Resets counter to 0, clears pending breath timers, resets the two-minute timer, speaks *"You are the responder now. Same speed, same depth."* then the push cue. **The elapsed clock and total keep running** so the record stays intact. Restarts the beat if it had stopped. |
| 🤲/🫁 **Breaths toggle** | Switches between compression-only and 30:2. Logged. |
| 📹 **Join dispatcher video** | → `s-code`. Placed last and least prominent; optional. |

---

### 4.9 `s-code` — Join dispatcher video

Six-digit numeric input, pre-filled if the page was opened from a dispatcher link
(`?code=NNNNNN`).

**Connect** → lazily loads PeerJS from CDN → requests the rear camera → calls the
dispatcher's peer ID `cprcoach-room-<code>`. On success returns to `s-cpr` with the video
button showing "📹 ● live". Every failure mode (no network, no library, no camera,
dispatcher unreachable) produces a message ending in *"Keep pushing"* and returns the
rescuer to compressions. **Video can never block CPR.**

---

### 4.10 `s-aed` — Defibrillator

Five steps, advanced manually, each with an illustration and a spoken instruction:

1. Turn it on. Do exactly what it says. *(Keep pushing while someone else opens it.)*
2. Bare the chest. Wipe it dry if wet. *(Cut clothing, remove metal.)*
3. Stick the pads exactly as pictured on the pads. *(One upper right, one lower left.)*
4. Nobody touch them. Let it analyse. *(Say it out loud: stand clear.)*
5. If it says shock, press the button. Then push again immediately.

Step 5 returns to `s-cpr` and restarts the beat automatically — resuming compressions
immediately post-shock is the point, and the app does not wait for a tap to prove it.
**↩ Back to compressions** is available at any step.

---

### 4.11 `s-alive` — Recovery position

*"Roll them onto their side, head tilted back, mouth pointing down."* Illustration of the
recovery position, plus the instruction to restart compressions immediately if breathing
stops or turns to gasping.

- **They stopped breathing — restart** → **conditional**:
  - If compressions were already given this session (`S.cprStarted`), go straight back
    to `s-cpr`. The rescuer already knows the patient's age, has called, and the patient
    is already flat with the airway open — repeating those steps would cost seconds.
  - If CPR was never started (they responded, or were breathing normally), run the steps
    that were skipped: `s-who` → `s-call` → `s-prep` → `s-cpr`.
- **Show this to the crew** → `s-hand`.

---

### 4.12 `s-hand` — Handover summary

Timestamped list of every logged event, plus the total compressions guided and the rate.
Designed to be held up to arriving paramedics.

Events captured: collapse reported, responsiveness result, breathing result, patient age,
ambulance called or alone, positioning done, compressions started, rescuer changed,
protocol switched, defibrillator on scene, shock delivered, breathing returned,
re-arrest, video joined.

Reachable from **`s-alive`** and, critically, from **`s-cpr` and `s-aed` via
"🚑 Paramedics here"** — a crew arriving mid-resuscitation is the most likely handover
moment, and an earlier version had no route to the record from the compression screen at
all.

**Format.** A date header, then one row per event with wall-clock `HH:MM:SS`, the label,
and elapsed time as a small suffix. A new date header is inserted if the session crosses
midnight. Paramedics record wall time, not stopwatch time.

**Share** uses the Web Share API where available — AirDrop, WhatsApp, email — so the crew
can take the record onto their own device. **Copy** puts it on the clipboard. Both fall
back to the clipboard. The exported text carries the line *"guidance only, not a clinical
record"*.

---

## 5. Dispatcher console (`s-console`)

Reachable from the small home link, or directly via `?role=dispatcher` — which a dispatch
centre can bookmark so an experienced call-taker never sees the home screen.

Single column, ordered by what the dispatcher actually *does*.

### 5.1 Script card (the primary element)

Boxed in solid ink at the top, because reading the script aloud is the dispatcher's main
action. Six steps, each with the line to say and a coaching note.

| # | Say | Coaching note |
|---|---|---|
| 1 | Is he awake? Shout his name and squeeze his shoulder. | Wait for a clear yes or no. Nothing else yet. |
| 2 | Look at his chest. Is he breathing normally? Gasping does not count. | This is where recognition most often fails. Push back once on a vague answer. |
| 3 | Help is on the way. Start pushing on his chest right now. | Do not ask age, history or address again. |
| 4 | Put him flat on his back on the floor. Kneel beside him, heel of your hand in the centre of his chest. | Position and hand placement in one sentence. |
| 5 | Push down hard, twice a second, and do not stop until I tell you. | Start the beat. Count aloud with them for the first ten. |
| 6 | Two minutes. If someone else is there, swap over now. | Prompt a compressor change every two minutes. |

The script is designed against the known failure mode: dispatchers asking unnecessary
questions (age, history, address) instead of driving to compressions.

### 5.2 The two languages

They are not duplicates.

- **Header language** — everything the dispatcher sees, *including the script text*.
- **"Caller speaks" dropdown** — what the Play button speaks, and the language a sent
  link opens in.

The script always renders in the dispatcher's language. An earlier version rendered it in
the caller's language, which left an English-speaking call-taker with a Hindi caller
staring at Devanagari, able only to press Play. The Play button is always shown; English
is not a special case.

**Language names follow the same rule.** `langName(code, inLocale)` uses
`Intl.DisplayNames` so the caller's language is named *in the dispatcher's language* —
an English call-taker sees "Play in Tamil", a Hindi one sees "तमिल". The native name is
appended in the dropdown for recognition. The rescuer's own picker shows native names
first, because someone looking for their own language recognises it in its own script.

**Both pickers are native `<select>` elements.** The custom sheet with search rows was
replaced: one tap, scrolls to any length, uses the platform picker on mobile, and there
is far less of it to break.

### 5.3 Milestones

Two large buttons that display their own captured value and turn green when pressed:
**Arrest recognised** and **First compression**. These are the two measures with the
strongest evidence base in telephone-CPR quality. They are buttons *and* readouts — one
element for one fact rather than a separate control and card.

### 5.4 Video

Always visible, never behind an accordion. Compact row: six-digit code, 🔗 Link, 📹 Open
video. The stage only renders once a session is opened, so an idle console shows no dead
black rectangle.

Multi-party: every rescuer who enters the code appears as a tile. Tap a tile to enlarge
it. One person can hold the camera while another compresses.

**Rate estimate.** Frame-differencing on a 48×36 downsample of the selected feed. Peaks
are detected against an adaptive threshold (`mean × 1.55 + 1.5`) with a 330 ms refractory
period; rate is the median of the last 8 intervals. Overlaid on the video because it is
an attribute of the feed, not an independent metric. Turns red outside **95–130/min**, and
shows "No compressions seen" after **4 seconds** of stillness.

Rate only. **Depth is not measured** — that would require clinical validation and would
make this regulated medical device software.

### 5.5 Metronome

A quiet secondary control reading "▶ Metronome · 110/min", amber while running. It is not
a primary action: the beat plays on the *dispatcher's* speaker, so its real use is helping
the call-taker count aloud in time.

**Why 110 is fixed.** Guidelines specify 100–120. 110 is the midpoint, so it stays inside
the window when a rescuer drifts either way. It is not exposed as a setting because
choosing a number is a decision the dispatcher does not need to make, and every control
competes with the script. Change `BPM` in `index.html` if a reviewer wants a different
value.

---

## 6. Audio subsystem

**Metronome.** Web Audio with lookahead scheduling — a 25 ms polling loop schedules clicks
up to 150 ms ahead against `AudioContext.currentTime`. `setInterval` drifts by seconds
over a ten-minute resuscitation and is not used.

Two failure modes are handled explicitly:
- **Suspended context.** If `state !== "running"` the scheduler waits and retries at
  120 ms rather than stalling. A stalled scheduler previously produced total silence with
  no recovery.
- **Drift.** If `nextBeat` falls behind `currentTime` it re-anchors, which happens after
  backgrounding.

Click is a band-passed square burst, 880 Hz normally and 1250 Hz on every tenth beat,
gain 0.62 / 0.85.

**Background survival — and the conflict it caused.** A silent looping `<audio>` element
holds the OS audio session so the beat survives backgrounding. Two things were wrong with
the first implementation and both silenced the metronome on desktop:

1. The silence was a **zero-length WAV**. Some browsers refuse or stall on a malformed
   zero-sample loop. It is now a real one second of 8 kHz silence, generated at runtime.
2. The element was created **before** the beat started, and on desktop Safari an
   `HTMLAudioElement` can take the audio session away from the `AudioContext`. It now
   starts 600 ms *after* the beat is running, and if the context is found suspended
   afterwards the element **tears itself down and resumes the context** — the metronome
   matters more than background playback.

**Audio health indicator.** The 🔊 control shows ⚠ whenever the `AudioContext` is not
running. Tapping it in that state retries the context rather than muting. A silent
failure is now a visible one.

**Caveat: during a live phone call the OS may still duck or suspend browser audio.** This
still needs testing on low-end Android before being relied upon.

**Speech.** `SpeechSynthesisUtterance` at rate 0.97. Utterances are **queued, not
cancelled** — cancelling mid-sentence was cutting words out of the rescue-breath
instructions. A watchdog pauses and resumes the synthesiser every 9 seconds to work around
a Chrome defect where speech dies silently after about 15 seconds. If no voice exists for
the selected locale, it falls back to the default voice but keeps the native text.

**Mute.** The 🔊 toggle in the header silences both the beat and speech. Hidden on home.

---

## 7. Language system

English is inline in `index.html` and is always present. Other packs are separate files
loaded lazily on selection, roughly 8–17 KB each.

**Why the list is hardcoded and not auto-discovered.** A static host cannot list a
directory, so discovery would need a network round-trip before the language picker could
render — on the path to a life-saving screen. `LANG_INDEX` costs nothing and cannot fail.

Packs whose code matches a device language are prefetched at browser idle.

### Adding a language

1. Copy `lang/es.js` → `lang/xx.js`, translate every string.
2. Add `{code:"xx", name:"Native", en:"English name"}` to `LANG_INDEX`.
3. Add `./lang/xx.js` to `CORE` in `sw.js`, bump `V`.
4. Add an `hreflang` line in `<head>`.
5. Run `node test.js`.

`dir:"rtl"` for right-to-left scripts. `code` must be a BCP-47 tag the speech engine
recognises (`hi-IN`, `ar-SA`).

### Pack contents

`say` (spoken instructions, incl. per-age placement and depth), `prep` (positioning steps
paired with illustration keys), `aedSteps`, `dScript`, `ui` (21 chrome strings), `article`
(SEO prose), plus every button and question label. **All 6 packs are verified for complete
key parity by `test.js`.**

---

## 7a. Language pack integrity

English is inline in `index.html`; the other five are separate files. This means **a
broken or empty language pack fails silently** — the app keeps working in English and
language switching simply stops responding, with no error anywhere.

This happened: a build script used `open(p,"w").write(transform(open(p).read()))`, and
Python opens the file for writing *before* evaluating the argument, so all five packs
were truncated to zero bytes and shipped that way.

`tests/check-langs.js` is the gate. For every code in `LANG_INDEX` it verifies the file
exists, is non-trivially sized, calls `registerLang` with the right code, parses, actually
registers, and has complete key parity with English including array lengths. **Run it
before every commit.**

## 8. Imagery

**`SVG` is empty — no hand-drawn diagrams.** Real photographs and animations are used
instead, declared in `MEDIA` and stored in `images/`:

| Slot | File | Shown on |
|---|---|---|
| `handsAdult`, `handsChild` | `Chest_compressions.gif` | compression screen, adult and child |
| `handsInfant` | `Infant_two_finger_CPR_jpg.webp` | compression screen, infant |
| `breathInfant` | `CPR_Infant_Mouth_To_Nose.png` | rescue-breath pause, infant |

`art()` loads the file and shows it only on success, so a missing or slow file costs
nothing — the screen simply carries text and voice. Images are capped at 26vh (18vh on
short screens) so they never crowd the compression counter. `tests/audit-flow.js` asserts
every path in `MEDIA` exists on disk, which prevents the 404 class of bug.

**Outstanding: no image currently in the repository has verified provenance, and two carry
burnt-in text in a language the user may not read.** See `CREDITS.md`.

### Why hand-drawn diagrams were removed

An ambiguous diagram is worse than no diagram:
a rescuer who misreads it is worse off than one who only hears the instruction, and on a
screen governed by "nothing that does not help someone survive", a confusing picture fails
that test outright. Text and voice carry the protocol on their own.

**The slot remains open for real photographs and animations.** `MEDIA` maps a key to a
filename in `assets/img/`; `art()` loads it and shows it only on success, so a missing or
slow file costs nothing. `fetch-media.sh` downloads candidates from Wikimedia Commons and
`CREDITS.md` records licences.

Three conditions before any image ships:

1. **Licence verified** on its Commons page — CC0, public domain, CC BY or CC BY-SA only.
2. **Checked against the protocol text.** An image demonstrating a technique differently
   from the spoken instruction is a safety defect.
3. **Unambiguous at a glance**, at arm's length, to someone who has never done CPR. If it
   needs a caption, it fails.

Attribution lives in `CREDITS.md` and `README.md`, never on screen.

---

## 8a. Build identification

`BUILD` is stamped into `index.html` and rendered next to the beta disclaimer on the home
screen. When two devices behave differently, **check the build string first** — mismatched
builds across devices previously presented as steps randomly disappearing.

The page also reloads itself automatically when a new service worker version activates,
but **only while `phase === "idle"`** — never during a resuscitation.

## 9. Caching — currently disabled, and why

**There is no active service worker.** `sw.js` is a self-uninstalling stub, and the page
also unregisters any worker and deletes any cache on load.

The history matters. Two successive caching bugs each presented as *the app randomly
losing steps*:

1. **Cache-first for the document.** Returning users got a stale app shell paired with
   freshly-fetched language files.
2. **The worker could pin itself.** `sw.js` is not a document, so it fell into the
   cache-first branch — an old worker could keep serving its own stale copy, meaning
   published fixes never reached the device at all.

The second is the dangerous class of bug: it makes every subsequent fix unverifiable,
because you cannot tell whether a change failed or simply never arrived.

**Offline support returns only when the UI stops changing daily**, and when it does it
must be built as: precache with a build hash in the cache name, `updateViaCache: "none"`
on registration, network-first for both the document *and* `sw.js`, and an explicit
version check in the page. Until then, correctness beats offline.

The PWA manifest is retained so the app can still be installed to a home screen.

**Debugging rule: when two devices disagree, compare the build stamp first.** It renders
beside the logo on the home screen.

---

## 10. Privacy

No accounts, no cookies, no localStorage, no analytics, no third-party scripts on the
emergency path. The handover log lives in memory and is destroyed on reset. Location is
never requested. Camera is requested only when the rescuer explicitly enters a dispatcher
code. PeerJS is fetched from a CDN **only** when video is opened.

---

## 11. SEO

Title, description, keywords, canonical, seven `hreflang` tags, Open Graph and Twitter
cards, inline SVG favicon. JSON-LD carries both `WebApplication` and a full `HowTo` schema.

**The `HowTo` schema means search engines may surface these CPR steps to people who never
open the page.** Those strings must have clinical sign-off *before* the site is indexed,
not after. The translated article below the fold is what actually ranks.

`?lang=xx` opens directly in a language; `?code=NNNNNN` pre-fills the video code;
`?role=dispatcher` opens the console.

---

## 12. Deliberately not built

| | Why |
|---|---|
| Compression **depth** measurement | Needs clinical validation; makes this a regulated device (CDSCO / FDA) |
| AI diagnosis or triage | Clinical path must be deterministic, versioned and testable |
| Choking, bleeding, stroke, drowning protocols | Cardiac arrest first, end to end, before broadening |
| AED location map | An unverified AED map is worse than none |
| Practice / training mode | Second pillar, not yet built |
| Account or history | Nothing to gain, privacy to lose |
| Own signalling server | PeerJS public broker is demo-grade only |

---

## 13. Known limitations

1. **All non-English strings are machine-quality.** Highest-priority fix. Roughly 126 UI
   strings plus full clinical content per language.
2. **PeerJS uses a public broker.** Production needs an own PeerServer or SFU, plus TURN
   for callers behind carrier NAT.
3. **Audio behaviour during a live phone call is unverified** on low-end Android.
4. **The six-step dispatcher script is unvalidated.** It may need splitting into a
   recognition script and a coaching script — a real dispatcher should judge.
5. **Speech voices for Indian languages are absent on many devices**, so text is native
   but audio may fall back.
6. **No clinical sign-off, no version-controlled protocol document, no named medical
   director.** This is the blocker for everything else.

---

## 14. Before public release

1. Named medical director. Protocol mapped against current AHA and Indian Resuscitation
   Council guidance, with a version number committed to the repo.
2. Native-speaker review of every string, then clinical review of the back-translation.
3. Field testing: low-end Android, 2G, a stairwell, direct sunlight, one-handed.
4. Accessibility pass: screen reader, contrast, touch targets, reduced motion.
5. Only then remove the beta badge and allow indexing.

---

## 15. Change checklist

Run through this for **every** change, however small:

- [ ] `node tests/test.js` passes (82 assertions)
- [ ] `node tests/adversarial.js` passes (14 assertions)
- [ ] `node tests/check-langs.js` passes — no empty or partial packs
- [ ] `node tests/audit-flow.js` passes — no dead ends
- [ ] `node tests/verify-flow.js` prints all six steps in order
- [ ] `BUILD` bumped in `index.html`
- [ ] Key parity across all 6 language packs
- [ ] No new string hardcoded in English
- [ ] Nothing added between recognition and first compression
- [ ] No praise language introduced into any cue
- [ ] Every new flow transition goes through `step(from, to, fn)`
- [ ] `BUILD` bumped and verified on the deployed page
- [ ] Emergency path still works with the network disabled
- [ ] No service worker reintroduced without the safeguards in §9
- [ ] Tested in portrait, landscape, and desktop
- [ ] Tested with a screen reader if UI structure changed
