# Credits

## Illustrations

The ten built-in line drawings (`SVG` in `index.html`) are original to this project
and are released to the **public domain (CC0)**. They are inline, work offline, and
are the fallback whenever a photo or animation is unavailable.

## Photographic and animated media

Files in `assets/img/`, downloaded by `fetch-media.sh`. Each is used under the
licence stated below. Attribution is given here and in `README.md` rather than on
screen, because nothing appears during an emergency that does not help the rescuer.

Files live in `images/`.

| File | Slot | Source | Licence | Status |
|---|---|---|---|---|
| `Chest_compressions.gif` | `handsAdult`, `handsChild` | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Chest_compressions.gif) | CC BY 3.0 — **attribution required** | ⚠️ author not yet recorded |
| `Infant_two_finger_CPR_jpg.webp` | `handsInfant` | supplied by maintainer | ⚠️ **unverified** | must confirm before public release |
| `CPR_Infant_Mouth_To_Nose.png` | `breathInfant` | supplied by maintainer | ⚠️ **unverified** | contains burnt-in English text |

### Outstanding issues with the current images

1. **`Chest_compressions.gif` is CC BY 3.0, not public domain.** Attribution and a link
   to the licence are required. Open the Commons file page, copy the author's name into
   the table above, and keep this file in the repository.
2. **The two infant images have no recorded source.** If either came from a stock library
   or a training provider's website, it cannot be published without permission. Record
   where each came from, or replace both with Commons equivalents.
3. **`CPR_Infant_Mouth_To_Nose.png` has English text burnt into the image**
   ("Mouth-to-Nose-and-Mouth Breathing"). That breaks the multilingual rule — a Tamil
   rescuer sees English on screen — and adds text that does not help them act. Crop the
   caption off before release.
4. **`Chest_compressions.gif` has Thai text burnt into the frame.** Same problem. Crop it,
   or find a clean version.
5. **`Chest_compressions.gif` is 339 KB and the infant PNG is 395 KB.** Both load only
   when their screen appears, so they never delay the first compression, but they should
   be compressed before release — a 400 KB image on 2G is 30 seconds.

### Clinical review still required

Each image must be checked against the spoken instruction it accompanies. The adult GIF
must show a hand position and depth consistent with "heel of one hand in the centre of
the chest, about 5 cm". The infant photo must show two fingers below the nipple line.

### Adding more media

1. Find the file on [Commons: Cardiopulmonary resuscitation](https://commons.wikimedia.org/wiki/Category:Cardiopulmonary_resuscitation).
2. **Open the file page and read the licence.** Accept only CC0, public domain,
   CC BY or CC BY-SA. Reject anything non-commercial, no-derivatives or fair-use.
3. Record file, source URL, author and licence in the table above.
4. Add a `dl` line to `fetch-media.sh`.
5. Add one entry to `MEDIA` in `index.html`, keyed by illustration name:
   `pads:"aed-pad-placement.png"`.
6. Run `node test.js`.

Keys available: `shoulder`, `chest`, `flat`, `tilt`, `handsAdult`, `handsChild`,
`handsInfant`, `breath`, `pads`, `recovery`.

**A note on CC BY-SA.** Share-alike obliges you to license *adaptations of that image*
under the same terms. Using it unmodified alongside your own work does not affect the
licence of the rest of the app, but prefer CC BY or CC0 where a choice exists.

**Clinical caution.** An image that demonstrates a technique differently from the
spoken instruction is worse than no image. Every file must be checked against the
protocol text before it ships.
