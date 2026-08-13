# Credits

## Illustrations

The ten built-in line drawings (`SVG` in `index.html`) are original to this project
and are released to the **public domain (CC0)**. They are inline, work offline, and
are the fallback whenever a photo or animation is unavailable.

## Photographic and animated media

Files in `assets/img/`, downloaded by `fetch-media.sh`. Each is used under the
licence stated below. Attribution is given here and in `README.md` rather than on
screen, because nothing appears during an emergency that does not help the rescuer.

| File | Source | Author | Licence | Used for |
|---|---|---|---|---|
| `chest-compressions.gif` | [Chest compressions.gif](https://commons.wikimedia.org/wiki/File:Chest_compressions.gif), Wikimedia Commons | See the file page | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0) | Adult compression technique |

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
