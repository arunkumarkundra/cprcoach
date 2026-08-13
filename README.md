# CPR Coach

**See [SPEC.md](SPEC.md) for the complete functional specification** — every screen, control, timing constant and design decision, plus what is deliberately absent and what must happen before public release.

Zero-install CPR guidance that works offline. Open a link, tap one button, follow a voice and a beat.

**Beta. Not clinically approved.** Every instruction string needs review by a resuscitation clinician and a native speaker before this is promoted publicly.

---

## Files

```
index.html              the app. English is inline — the emergency path never waits on a fetch
lang/hi.js kn.js ta.js  other languages, loaded only when selected
lang/es.js ar.js
lang/manifest.json      optional list for tooling; the app uses LANG_INDEX in index.html
sw.js                   service worker — caches everything for offline use
manifest.webmanifest    installable to the home screen
fetch-media.sh          Downloads licensed photos/GIFs into assets/img/
CREDITS.md              Media sources, authors and licences
assets/img/             Photos and animations (optional; drawings are the fallback)
assets/icon-192.png     PWA icons
assets/icon-512.png
assets/og-image.png     link preview card for WhatsApp / social
```

## Testing

All test scripts live in `tests/` and are **Node scripts, never served to the
browser**. Run them from the repository root:

```
npm install jsdom
node tests/check-langs.js    # language packs load and match English exactly
node tests/audit-flow.js     # screen graph, dead ends, clinical transition rules
node tests/test.js           # 82 assertions: full flow, controls, console, localisation
node tests/adversarial.js    # 14 assertions: ghost clicks, double taps, replayed events
node tests/verify-flow.js    # prints every screen as a user sees it, with its step number
```

**Run `check-langs.js` before every commit.** A build script once truncated all five
language packs to zero bytes; English is inline so nothing failed loudly — language
switching simply stopped working. That gate now refuses to pass on an empty,
unparseable or incomplete pack.

`adversarial.js` fires the event patterns a real browser produces that a naive
"one click per screen" harness never sees. It is the suite that matters for the
step-skipping class of bug.

`test.js` boots the real `index.html` in a headless DOM and walks every path:
the full arrest sequence step by step, both recovery exits, the infant and
alone-rescuer branches, back navigation, all CPR-screen controls, the AED
sequence, the handover log, the dispatcher console, the double-tap guard, the
audio keep-alive safeguards, and localisation coverage. 64 assertions.
**Run it after every change.** It exists because edits in one area kept silently
breaking another.

## Reporting a flow problem

Open the app with **`?debug=1`** appended to the URL. A black transition log appears at
the bottom of the screen recording every screen change and every rejected event. Walk
the flow, then send that log — it says exactly which screens were shown and in what
order, which a description cannot.

Also check the **build stamp** beside the logo on the home page. It must match the
`BUILD` constant in `index.html`.

## Imagery

**The app ships no diagrams.** Hand-drawn line art was tried and removed — an ambiguous
diagram is worse than none. Text and voice carry the protocol.

The slot is open for real photographs. `bash fetch-media.sh` downloads licensed
candidates into `assets/img/`; map one to a screen via `MEDIA` in `index.html`. A
missing file costs nothing. See `CREDITS.md`, and read the three conditions in
SPEC.md §8 before shipping any image.

## Repository layout

```
index.html              served
sw.js                   served — must be at the ROOT (a self-uninstalling stub;
                        keep it there so old registrations find it and remove themselves)
manifest.webmanifest    served
lang/*.js               served
assets/                 served
tests/*.js              NOT served — Node scripts, run locally
*.md                    NOT served — documentation
```

`sw.js` must sit at the repository root. In an earlier deployment it was inside
`lang/`, where an existing service-worker registration could never find it.

## Caching

**There is no active service worker.** Two caching bugs each presented as the app
randomly losing steps, the second because a cached worker could serve a stale copy
of *itself* — so published fixes never reached the device and no fix could be
verified. `sw.js` is now a self-uninstalling stub and the page clears any worker
and cache on load.

Offline support returns once the UI settles, built properly. See SPEC.md §9.

**When two devices behave differently, compare the build stamp** shown next to the
logo on the home screen.

## Two languages on the dispatcher console

They are not duplicates and they do different jobs:

- **Header language** — the dispatcher's own interface, *including the script text they read*.
- **"Caller speaks" dropdown** — what the Play button speaks aloud, and the language a
  link sent to the caller opens in.

The header language governs *everything the dispatcher sees* — the script, every button,
every label. The caller's language governs only what the Play button speaks and what a
sent link opens in. The Play button is always present, whatever the two languages are:
English is not a special case, and in most of the world it will not be the default.

## Why the metronome is fixed at 110/min

Guidelines specify 100–120 compressions per minute. 110 is the midpoint, so it is the rate
that stays inside the window even when a rescuer drifts either way. It is not exposed as a
setting because choosing a number is a decision the dispatcher does not need to make, and
every control on that screen competes for attention with the script. Change `BPM` in
`index.html` if a medical reviewer wants a different value.

On the console the metronome is a secondary control, not a primary one — it plays on the
*dispatcher's* speaker, so its real use is helping the call-taker count aloud in time.

## Navigation model

A back button during an active resuscitation is a hazard, so navigation is
deliberately asymmetric:

| Screen | Header shows | Can go back |
|---|---|---|
| Home | Logo | — |
| Triage questions, position, video code | Back arrow | Yes |
| Compressions, AED, recovery | Elapsed clock | **No** |
| Handover | Logo (tap to restart) | Yes |
| Dispatcher | Clock + Exit | Exit only |

The logo is only tappable when no session is running. Once compressions start there
is no way off that screen except an explicit outcome — *they're breathing*, *defibrillator*,
or handover. Language and sound controls stay in the header on every screen.

## Hosting

Any static host. GitHub Pages works and gives you HTTPS, which is required for the
camera, the wake lock and the service worker.

**One thing to change:** search `index.html` for `arunkumarkundra.github.io/cprcoach`
and replace every occurrence with your own domain. It appears in the canonical tag,
seven hreflang tags, `og:url`, `og:image` and `twitter:image`.

## Adding a language

1. Copy `lang/es.js` to `lang/xx.js` and translate every string.
2. Add `{code:"xx",name:"Native name"}` to `LANG_INDEX` near the top of the app script in `index.html`.
3. Add `./lang/xx.js` to the `CORE` array in `sw.js` and bump `V` to force a cache refresh.
4. Add an `hreflang` line in `<head>`.

Two rules for the pack: `dir:"rtl"` for right-to-left scripts, and `code` must be a BCP-47
tag the browser's speech engine recognises (`hi-IN`, `ar-SA`).

**Why not auto-discover from the folder?** A static host cannot list a directory, so
discovery would need a fetch before the language picker could render. That is a network
round-trip on the path to a life-saving screen. The hardcoded `LANG_INDEX` costs nothing
and cannot fail. Packs themselves load lazily — only English is ever parsed at startup.

## What is real

- Deterministic state machine; no AI anywhere on the emergency path
- Web Audio metronome with lookahead scheduling and drift recovery
- Speech synthesis, queued so sentences are never cut off mid-word
- Full offline operation after first visit
- Multi-party video over PeerJS, loaded on demand only
- Compression-rate estimate from frame differencing on the selected video feed

## What is stubbed or fragile

- **PeerJS uses a public broker.** Fine for demos, not for production. A real deployment
  needs your own PeerServer or an SFU, plus TURN servers for callers behind carrier NAT.
- **Rate detection measures rate, not depth.** Depth would require validation and would
  make this a regulated medical device (CDSCO in India, FDA in the US).
- **Audio during a phone call** is best-effort. A silent keep-alive track and the Media
  Session API hold the audio focus, but the OS may still duck or suspend it. Test on the
  cheapest Android phones you can find before relying on it.
- **Translations are unreviewed.** This is the highest-priority fix.

## Before this goes anywhere real

1. Named medical director; protocol mapped against current AHA / Indian Resuscitation
   Council guidance with a version number in the repo.
2. Native-speaker review of every string, then clinical review of the back-translation.
3. Field testing on low-end Android over 2G, in a stairwell, in daylight.
4. Only then remove the beta badge and let search engines index the HowTo schema.
