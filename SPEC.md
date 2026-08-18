# CPR Coach — Project Specification

**Build of record: `2026-08-18a`** · Status: **beta, not clinically approved**

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
                        language pack, the state machine, the flow, the audio and
                        the console. Runs alone, in English, with every js/ module
                        missing — degraded, but never broken (§4).
sw.js                   SERVED. Must be at the ROOT. A self-uninstalling stub (§15).
manifest.webmanifest    SERVED. PWA metadata; makes the app installable.
js/speech.js            SERVED. The speech engine (§9).
js/caselog.js           SERVED. Dispatcher case log (§7.8).
js/video.js             SERVED. Video session: rooms, joining, playback (§12).
js/relay.js             SERVED. Play-on-caller's-phone, and the shared channel (§12.1).
js/mirror.js            SERVED. Caller state on the console (§7.6).
js/interval.js          SERVED. Recognition → first compression (§7.7).
js/haptic.js            SERVED. Optional vibration metronome (§8.1).
lang/hi.js kn.js ta.js  SERVED. Additional language packs, loaded lazily on selection.
lang/es.js ar.js
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

**Load order in `index.html` is not free.** `js/video.js` must load before `js/relay.js`,
which must load before `js/mirror.js`; `js/interval.js` and `js/haptic.js` may sit
anywhere after the application script.

---

## 4. Architecture

Single page, no framework, no build step, no bundler. Three inline `<script>` blocks in
`index.html`, in order:

1. **`SVG = {}`** — an empty map, retained as the fallback slot for imagery (§11).
2. **The English language pack** — `registerLang("en", {...})`. Inline so the emergency
   path never waits on a fetch.
3. **The application** — state, flow, audio, imagery, dispatcher console.

Seven further files in `js/` are fetched separately (§3).

### One behaviour, one owner

Every module here began as a fix for a defect in `index.html`, and each was added by
overwriting the original — `js/speech.js` assigns `window.say`, `js/video.js` reassigns
two click handlers. For a period **both implementations shipped**: the superseded code
sat in `index.html`, unreachable but not harmless. The nine-second pause/resume speech
watchdog was the clearest case. `js/speech.js` neutralised it on Android, where it had
done its damage, and on every desktop it went on firing against that engine's own queue.

The rule now: **when a module takes over a behaviour, the original is deleted, and a
comment in its place names the owner.** `tests/check-spec.js` asserts the four removals
stay removed.

### What survives a missing module

A separate file can fail to arrive. Design law 7 says a feature that is not working must
say so, and a button that silently does nothing says nothing at all. So `index.html` ends
with a **module check** that runs 1.5 s after load: any control whose owner is absent is
withdrawn rather than left as a trap, and the names of the missing modules go to the
console and to the `?debug=1` trace.

| Missing | Consequence |
|---|---|
| `js/speech.js` | Falls back to a bare `say()` kept in `index.html` for this purpose only. Imperfect voice, no Android workarounds, but the app still speaks. |
| `js/video.js` | 📹 Share my camera is hidden; the console's Open video is disabled. |
| `js/caselog.js` | No dispatcher case log. The rescuer's handover record is unaffected. |
| `js/relay.js` | Play plays on the console only. |
| `js/mirror.js` | No caller-state card. |
| `js/interval.js` | No recognition→first-compression readout. Both milestone buttons still work. |
| `js/haptic.js` | No vibration toggle. Indistinguishable from a device without the Vibration API, and equally harmless. |

**Speech is the only exception to "delete the original", and it is deliberate.** Speech is
on the emergency path and the app is audio-first (law 4), so a rescuer hearing imperfect
speech is better off than one hearing none. That fallback is a last resort, not an
alternative implementation: it has no voice picker, no queue and no watchdog, and speech
defects are fixed in `js/speech.js`.

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

### 7.6 Caller's app — what the caller's phone reports

**Owner: `js/mirror.js`.** Sits between the milestones and the video.

Before this, the console was blind unless the caller shared video. The caller's own handset
already knew things the dispatcher did not: the patient's age band, how far through the six
steps they were, whether compressions had started at all, and how long since the collapse
was reported. That state now rides the data channel `js/relay.js` already opens (§12.1) —
a second connection would have repeated the 900 ms negotiation delay that path needed on
slow mobile networks.

One object, at most once every **700 ms**, and only while a rescue is running on the
caller's device:

```
{ k:"cs", who, scr, ph, cpr, br, el, tot }
```

Elapsed and total change every second by definition, so they are excluded from the change
test and carried by a **5 s heartbeat** instead. Without that the channel would carry a
message every 700 ms for the whole resuscitation.

**The card says "reports", and the wording is load-bearing.** Every value is what the
caller's *app* believes, because somebody tapped a button. It is not confirmation of
anything at the patient's side, and a dispatcher must not read it as such. Every case-log
entry it writes is prefixed `Caller app reports`.

**A row is omitted rather than guessed.** `S.who` starts `null`, not `"adult"`. The patient
row does not appear until the caller has answered `s-who`. Defaulting it meant the console
displayed a patient type the caller had never stated — the same class of error as showing
an emergency number that might be wrong (§20).

Three failure states, never a blank card: **no link** says so in words; **stale** greys the
dot and dims the values after **12 s**; and **relay not updated** names the file to fix,
for the case where `window.relayBus` is missing.

The rescuer's handover record gains exactly one line per session,
`Status shared with control room` — not one per update, because the record paramedics read
has to stay readable.

### 7.7 Recognition → first compression

**Owner: `js/interval.js`.** A slim readout directly beneath the two milestone buttons.

The console captured both timestamps and never showed the thing they exist to measure. The
readout is inert until recognition is marked, then counts up live, then stops and holds the
interval when first compression is marked. A number appearing afterwards is an audit tool;
a number climbing during the call is a prompt, and the prompt is the point.

First compression marked *before* recognition is a data-entry error, not a negative
interval: the readout shows `—:—` rather than something wrong.

**The colour thresholds are placeholders and are not from any guideline.** `WARN_S = 60`
and `BAD_S = 120` at the top of the file exist so the readout has some visible grammar
rather than none. **They are the first thing a medical reviewer should replace or delete.**

### 7.8 Case log

**Owner: `js/caselog.js`.** A 📋 button beside Exit, opening an overlay with Copy and
Share.

The rescuer got a handover record; the dispatcher got nothing. Every fact on the console
was displayed and then discarded — including the two milestone timestamps, which were
written into a button label and nowhere else.

Event labels are **English regardless of interface language**, matching the rescuer's log.
A record read by quality assurance, a medical director or a court should not vary by who
happened to take the call. Only seven chrome strings are localised.

The record survives Exit, so a call-taker who exits before copying can still retrieve it. A
new console session clears it. It lives in memory and dies with the tab; persisting it is a
policy decision, not a coding one.

A once-a-second watcher records three things not attached to any button: how many cameras
are connected, the observed compression rate, and how long the chest was left alone —
hands-off time being the quality measure that matters most after the two milestones.

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

### 8.1 Haptic metronome

**Owner: `js/haptic.js`.** A 📴 / 📳 toggle in the header beside the sound control,
**off by default**.

Vibrates once per compression on the same beat as the click — **40 ms**, and **90 ms** on
every tenth beat, mirroring the audio accent. It hangs off the existing `onBeat`, so it
cannot drift away from the click, and it stops when the metronome stops. It fires only on
`s-cpr` while `phase === "compress"`: the console metronome plays on the dispatcher's own
speaker, and buzzing a call-taker's desk phone helps nobody.

Three reasons it exists, in order of how likely they are to matter: the audio may not be
reaching anyone (see the caveat above — a handset against an ear, on speaker, or on a call
that has taken the audio session); a deaf or hard-of-hearing rescuer gets no rhythm cue at
all beyond the flashing wash; and a rescuer who muted the sound deliberately still needs
the tempo.

**Nothing switches it on except a tap.** An earlier draft engaged it automatically when the
app was muted or the audio context had failed. That was wrong, and the reasoning is worth
keeping: a phone that starts vibrating in someone's hand during a resuscitation, for a
reason they did not cause and cannot see, is frightening at the worst possible moment, and
a rescuer startled into pausing compressions has been harmed by the feature meant to help
them. Audio failure is already reported by the ⚠ on the sound control, which is the right
place for it — it says what is wrong and leaves the response to the rescuer.

**Platform.** `navigator.vibrate` is Android/Chromium only; iOS Safari has never
implemented it. On a device without it the file adds no control at all, because a
permanently dead toggle on every iPhone is noise.

**Cost.** Around 110 pulses a minute drains the battery measurably and warms the phone over
a ten-minute resuscitation. That is the correct trade at the moment it is needed, and one
more reason the default is off.

---

## 9. Speech

**Owner: `js/speech.js`.** It installs `window.say()` over the fallback in `index.html`
and changes nothing else.

Three Android Chrome defects produced the three symptoms that were reported, and each is
answered separately:

**Truncation mid-sentence.** Chrome abandons any single utterance running past roughly
fifteen seconds. Text is split at sentence boundaries — including the Devanagari danda
`।` and the Arabic full stop `۔` and question mark `؟` — so no utterance is ever long
enough to trip it. Runs with no punctuation are hard-capped at **150 characters**;
fragments under **14** are folded back into the previous piece so delivery is not chopped.

**Overlapping sentences.** `speechSynthesis.cancel()` is asynchronous, and the old code
called `speak()` on the next line, racing it. Exactly one utterance is now in flight at a
time, driven by an internal queue, with a settling delay after every cancel — **220 ms**
on Android, **140 ms** elsewhere — and a short gap between utterances, **110 ms** on
Android, **45 ms** elsewhere.

**Poor voice quality.** The old code took the first voice whose language tag matched, which
on Android is often a low-fidelity fallback even when a better voice is installed. Voices
are now scored: exact region match +40, a name matching the quality list +30, a name
matching the novelty/low-fidelity list −70, Google TTS on Android +25.

`onend` is not trusted on its own, because on Android it sometimes never fires. Two
independent detectors close an utterance: a silence poll every **350 ms** after a 1200 ms
grace period, and an absolute guard at `1500 ms + 160 ms per character`.

Rate is **1.0 on Android** — its engines resample non-integer rates and the result is
muddier — and **0.97 elsewhere**, which was chosen for clarity.

**The nine-second pause/resume watchdog has been removed** from `index.html`. It existed
for the fifteen-second defect that splitting now solves, and it fought this engine's queue
on every platform where it was not disarmed. See §4 and §19.

`speechReport()` in the browser console lists every voice the device offers and which one
this app would choose. It is the only reliable way to tell a browser problem from a
missing system voice, and it is what to ask for in a bug report.

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

**Owner: `js/video.js`**, which replaced the room and joining handlers in `index.html`
outright. Three defects it fixes:

- **Any error tore down the stage.** The console's handler reacted to every PeerJS error
  identically, by hiding the video stage. Most are not fatal: `peer-unavailable` means one
  peer could not be reached while the room is still open and any connected camera is still
  streaming. `js/relay.js` opens a second, data-only connection back to each camera, and
  when that fails — common without TURN — it raises exactly this non-fatal error. The relay
  did not break the video; it tripped a trapdoor that was already there. Only genuinely
  fatal error types now end a session; the rest are logged as warnings.
- **The room did not exist until the dispatcher pressed 📹.** A caller entering the code
  first called a peer ID that had not been created, failed, and could not recover, because
  the failed Peer was left in place and a retry stacked another on top. The room now opens
  with the console (§14 discloses what that costs), and the caller cleans up and can retry.
  If the room ID is already taken on the public broker, a new six-digit code is issued
  rather than failing the call.
- **The stage did not always start playing.** Assigning `srcObject` is not playing. Safari
  will leave a muted autoplay element on its first black frame if it was hidden when the
  stream arrived. `play()` is now called explicitly, three times over the first second.

### 12.1 Instruction relay and the shared channel

**Owner: `js/relay.js`.** The console's existing 🔊 Play button does one job in two places:
it reads the current script line aloud on the console speaker as before, and — when the
caller's camera is connected — the caller's own handset reads the same line aloud in the
caller's own language at the same time.

**One button, not two.** An earlier version added a separate "Speak on caller's phone".
That asked the dispatcher to choose, mid-resuscitation, between two nearly identical
controls — the sort of decision §2 exists to remove — and when no camera was connected it
read "Caller's phone not connected", which is alarming to a dispatcher already talking to
that caller by telephone. Nothing is wrong in that situation. The absence of a video link
is never reported as a fault.

**No text crosses the connection — only a step number, 0 to 5.** The caller's phone speaks
the line from its own language pack. Three things follow, and they are the reason it is
built this way rather than by sending words: the caller can only ever hear one of the six
clinically reviewed lines, so a dispatcher cannot improvise a medical instruction through
this channel by accident or otherwise; nothing needs translating in transit, so no
mistranslation can reach a resuscitation; and a dispatcher who speaks no Tamil still
delivers correct Tamil. The caller also announces its language, so the "Caller speaks"
dropdown stops being a guess.

**`window.relayBus`** lets a second module ride the same connection rather than opening
another. It keeps its own connection map, copies every incoming message to subscribers, and
lets subscribers send. Messages are namespaced by their `k` field and each handler ignores
keys it does not own: `say`, `hello` and `said` belong to `js/relay.js`, `cs` belongs to
`js/mirror.js` (§7.6).

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
Both logs — the rescuer's handover record and the dispatcher's case log — live in memory
and die with the tab. **Location is never requested.**

**The rescuer's side is unchanged and stays minimal.** The camera is requested only when
the rescuer explicitly types a six-digit code and taps Connect. PeerJS is fetched only at
that moment. Nothing on the CPR path touches the network.

**The console's side is not minimal, and this is a deliberate trade.** Opening the
dispatcher console now opens the video room immediately, rather than waiting for the
📹 button. That means the console, on open:

- fetches `peerjs@1.5.4` from `unpkg.com`, and
- holds an open connection to the **public PeerJS broker** at `0.peerjs.com` for as long
  as the console is on screen.

The reason is a defect, not a feature: a caller who entered the code before the dispatcher
had pressed 📹 called a room that did not yet exist, failed, and could not retry (§19).
Opening the room with the console means the code is live from the moment it can be read
aloud.

**What that costs.** The broker sees a room identifier and the IP addresses of everyone in
it. It is a third party, it is demo-grade infrastructure, and it is not covered by any
agreement. No media and no application data pass through it — WebRTC is peer-to-peer once
introduced — but the introduction itself is visible to it. A dispatch centre with a
confidentiality obligation should read that sentence carefully and run its own PeerServer
before deploying this (§12).

**What crosses the peer connection.** Video, one way, camera to console. Then two small
JSON channels and nothing else: a step number 0–5 with its acknowledgement (§12.1), and
the caller state snapshot (§7.6). No free text can cross in either direction, by design.

The console's video room can be closed at any time with the 📹 control, which tears down
both the room and the broker connection.

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
| Speech paused and restarted itself on desktop | The 9 s pause/resume watchdog in `index.html` survived the move to `js/speech.js`, which disarmed it on Android only, and fought that engine's queue everywhere else | Watchdog deleted; `check-spec.js` asserts it cannot return |
| Console reported a patient age nobody had given | `S.who` initialised to `"adult"`, so `js/mirror.js` mirrored it before `s-who` was ever answered | `S.who` starts `null`; the card omits the row until answered |
| Hindi console showed an English script | `applyLang()` never called `dRender()`, so `?role=dispatcher&lang=hi` gave Hindi chrome over English script lines — the exact failure §7.2 exists to prevent | `applyLang()` ends with `dRender()` |
| Screen stayed lit after the session ended | The wake lock was requested and never released | `letSleep()` on both exits from a session |
| Clock timers multiplied | `beginCPR()` starts `tickClock()`, and every re-arrest left another chain running for the rest of the session | Single stored handle, cleared on entry; same for `dClock()` |
| Over-time readout in an off-palette red | `js/interval.js` referenced `var(--red)`, which is not declared; the fallback hex was a red used nowhere else | Uses `var(--pulse)`, the app's own alarm colour |

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
9. **The dispatcher console holds an open connection to a public third-party broker**
   for as long as it is on screen (§14). Acceptable for a demonstration; not acceptable
   for a dispatch centre with a confidentiality obligation.
10. **Seven separate `js/` requests.** Harmless on HTTP/2, which GitHub Pages serves —
    they share one connection — but each is a file that can fail to arrive. §4 defines
    what happens when one does.
11. **The §7.7 colour thresholds are invented**, not drawn from any guideline.
12. **`user-scalable=no`** blocks pinch zoom, which fails WCAG 1.4.4.
13. **Images total roughly 980 KB**, heavy against the stated 2G target.

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
- [ ] `node tests/test-modules.js` passes (55 assertions)
- [ ] `node tests/adversarial.js` passes (14 assertions)
- [ ] `node tests/verify-flow.js` prints all six steps in order
- [ ] Every new string added to all six language packs
- [ ] Nothing added between recognition and first compression
- [ ] No praise language introduced into any cue
- [ ] Every new flow transition goes through `step(from, to, fn)`
- [ ] `BUILD` bumped in `index.html`
- [ ] Emergency path still works with the network disabled
- [ ] Tested in portrait, landscape and desktop
- [ ] No behaviour now has two implementations — if a module took one over, the
      original is deleted and a comment names the owner (§4)
- [ ] Any new module is listed in §3, loaded in the right order, and covered by the
      module check at the foot of `index.html`
- [ ] This document updated in the same commit
