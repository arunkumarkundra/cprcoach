# Hosting on GitHub Pages — a practical guide

Everything below can be done in the GitHub web interface. No terminal required.

---

## 1. Where each file must live

```
index.html              ← must be at the repository ROOT
sw.js                   ← must be at the repository ROOT
manifest.webmanifest    ← root
lang/en is inline; lang/hi.js kn.js ta.js es.js ar.js
assets/icon-192.png  icon-512.png  og-image.png
tests/*.js              ← tidiness only; never loaded by the browser
*.md                    ← documentation; never loaded by the browser
```

**`sw.js` must be at the root.** An old service worker registered at
`/cprcoach/sw.js` can only find its replacement at that exact path. If `sw.js`
sits in `lang/`, the old worker can never uninstall itself.

---

## 2. Moving a file into a folder, in the GitHub web UI

There is no drag-and-drop. You rename the file to include the folder:

1. Open the file in your repository (for example `test.js`).
2. Click the **pencil** icon (Edit this file).
3. Click into the **filename box** at the top and change it from
   `test.js` to `tests/test.js`.
4. Scroll down, click **Commit changes**.

GitHub creates the `tests/` folder automatically. Repeat for
`adversarial.js`, `verify-flow.js`, `check-langs.js`, `audit-flow.js`.

**Does it matter?** Not functionally. Those five files are Node scripts. Nothing
in `index.html` references them, so a browser never downloads them. Moving them
is housekeeping, not a fix. If you would rather leave them at the root, the app
works identically.

**`sw.js` does matter.** Move it from `lang/sw.js` to `sw.js` the same way.

---

## 3. Adding an image without a terminal

`fetch-media.sh` is a convenience script for people working locally. On GitHub
web, do this instead:

1. Open the image page on Wikimedia Commons, e.g.
   `https://commons.wikimedia.org/wiki/File:Chest_compressions.gif`
2. **Read the licence box.** Accept only CC0, public domain, CC BY or CC BY-SA.
   Reject anything non-commercial, no-derivatives or fair use.
3. Click the image to open the full-size file, then right-click → **Save image as**
   and save it to your computer.
4. In your repository, click **Add file → Upload files**.
5. Before uploading, rename the saved file to something predictable, e.g.
   `chest-compressions.gif`.
6. Drag it into the upload box. In the commit box, type the target path
   `assets/img/chest-compressions.gif` — or upload it, then edit its filename
   to add the `assets/img/` prefix as in step 2 above.
7. Edit `index.html` and change:
   ```js
   const MEDIA={};
   ```
   to
   ```js
   const MEDIA={handsAdult:"chest-compressions.gif"};
   ```
8. Record the file, author and licence in `CREDITS.md`.

Available keys for `MEDIA`: `shoulder`, `chest`, `flat`, `tilt`, `handsAdult`,
`handsChild`, `handsInfant`, `breath`, `pads`, `recovery`.

If a file listed in `MEDIA` is missing, the app simply shows nothing there. It
will not break, and it will not 404 as long as `MEDIA` and the folder agree.

---

## 4. After every change

1. Wait about a minute for GitHub Pages to rebuild.
2. Hard-reload the page: **Shift-click reload**, or Safari → Develop → Empty Caches.
3. Check the **build stamp** next to the logo on the home screen. It must match
   the `BUILD` constant in `index.html`. If it does not, you are looking at an old
   copy and any bug you see may already be fixed.
4. If a flow problem appears, open the site with **`?debug=1`** appended to the URL
   and send the on-screen trace.
