# bike-canopy-patterns

Pixelblaze pattern code for the **8-Bit Bunny shade-canopy bikes** (Burning Man 2026).
Two cruisers, each with a shade canopy and one Pixelblaze v3 XL driving a single
WS2815 run divided into three zones along its length: **seat**, **spine** (the
vertical mast), **canopy**.

Planning, gear, wiring, and build schedule live in the Obsidian vault, not here:
`~/Develop/burningman/Projects/LED Bikes - Pixelblaze.md`. This repo is only the
pattern source, so it gets normal per-line git history.

> **The grub is dead.** The sculpted larval body, hoop/PVC armature, spandex skin
> and programmable eyes were cut in full. The old peristalsis / heartbeat / eyes
> patterns, the 3D pixel map, and the armature viewers are in git history if any
> of it is ever wanted back.

## Layout

```
patterns/
  split-test/ diagnostic: flat colour per zone, with a build pin for the 150/300 A/B
  breathe/    signature idle: slow whole-bike swell, spine trailing the canopy
  beacon/     riding: steady ground pool + a comet down the spine
  drift/      parked: slow hue travel, no event
docs/
  layout.md   the strip layout, the split idiom, zone intent, power
tools/
  check-patterns.mjs   run every pattern headless, assert it renders sanely
  push-patterns.py     compile + push all patterns to a Pixelblaze over wifi
```

No `maps/`. Single strip on the native output, no Output Expander, no pixel map,
no per-bike geometry.

## The layout

```
0 ──[ seat ]──[ spine ]──[ canopy ]── pixelCount-1
    ^             ^           ^
    data-in    VERTICAL    horizontal,
    at seat    mast        overhead
```

**Index 0 is at the seat.** The strip climbs the vertical mast, turns at the top,
and runs out along the canopy, which is the long zone.

| | seat | spine | canopy |
|---|---|---|---|
| fraction | 0.10 | 0.23 | 0.65 |
| 150 px | 15 | 35 | 100 |
| 300 px | 30 | 70 | 200 |

Measured off the built bike and confirmed unchanged at 300 px — same path,
double density. The proportions are geometry, not a pixel count. Full zone table
in [`docs/layout.md`](docs/layout.md).

- **150 px vs 300 px** is chosen by the device's own *Settings → LED count*.
  `pixelCount` is a Pixelblaze built-in, so the same source runs either build.
- **Zone sizes** are normalised fractions on UI sliders, so a build change is a
  drag, not an edit.

## Start with the split test

On a new build or a re-route, push `split-test` first. Flat colour, one per
zone, no animation:

```
split-test on a 150 px strip               (1 char = 5 px)
  MMMMMCCCCCCCCCCCCAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
  ^    ^           ^
  seat spine       canopy
  index 0                              far end
```

| Colour | Zone |
|---|---|
| **Magenta** | seat (index 0 end) |
| **Cyan** | spine |
| **Amber** | canopy (far end) |
| **Red** | ⚠️ the strip is *shorter* than the build under test |

The zones identify the ends by themselves, so there are no separate head/tail
markers.

**The Build slider** does the 150-vs-300 A/B. Zone sizes are fractions, so the
picture at a given build looks the same on either strip — only the pixel counts
scale. What the pin buys you is seeing *one* build on the *other* strip:

| Build slider | on a 150 px strip | on a 300 px strip |
|---|---|---|
| left — follow device | full test | full test |
| middle — pin 150 | full test | first 150 lit, **rest dark** — what a 150 build looks like |
| right — pin 300 | ⚠️ red cap: truncated, canopy runs off the end | full test |

Drag the zone sliders until the boundaries land where you want them on the real
bike. ⚠️ It reports the hardware **as wired**, so what you see is what the strip
actually is.

## Check patterns without hardware

```
node tools/check-patterns.mjs
```

Stubs the Pixelblaze builtins and renders every pattern for ~4s at both 150 and
300 px, across three zone mixes and both sweep directions, asserting no NaN
pixels, nothing out of 0..1, that the strip lights at all, that a pinned
diagnostic goes dark past its own length, and that the diagnostics show four
distinct zone colours at every build pin. It catches the divide-by-zero you get when a slider
squeezes a zone down to one pixel. It is not a visual preview — for that, paste
into the Pixelblaze web editor, or use pb_emu:
https://forum.electromage.com/t/pattern-emulator-for-dev-without-hardware/4673

## Push to a Pixelblaze

```
# once — must be Apple's python, see the warning below
/usr/bin/python3 -m venv --symlinks .venv && .venv/bin/pip install pixelblaze-client

.venv/bin/python tools/push-patterns.py --ip 192.168.4.1   # AP mode: laptop on the PB's wifi
.venv/bin/python tools/push-patterns.py                     # auto-discover on the LAN
.venv/bin/python tools/push-patterns.py --activate beacon
```

Pushes every `patterns/*/*.js`, compiling each through the device's own compiler,
then sets the active pattern (default `breathe`) and saves to flash.

⚠️ **Build the venv from Apple's `/usr/bin/python3`, not Homebrew.** macOS Local
Network privacy blocks Homebrew Python from reaching the LAN, and the failure
looks like the Pixelblaze being offline. `/usr/bin/python3`, `nc`, `curl`, and
browsers are exempt. A `NotOpenSSLWarning` from urllib3 on this Python is
harmless — the Pixelblaze connection is plain `ws://` on the local net.

⚠️ **A venv is not relocatable.** If this directory is ever renamed or moved,
delete `.venv` and rebuild it, or every command above fails with `bad interpreter`.

## Device settings that are not pattern code

- **Color order `GRB`**, set on the **Output Expander channel**, not the top-level
  device setting. The strip runs on expander ch0, so the native-output
  `colorOrder` in the config is unused and reading it is misleading.
- **WS2815 is 12V.** Strip → 12V, Pixelblaze → 5V via the Mini Buck, grounds common.
  Never power the strip from USB 5V.
- **LED count** → 150 or 300. This is the knob that picks the build.

## House rules for new patterns

- **Slow breathe, not rave.** From the vault, and it is the whole aesthetic.
- **Aim the canopy down.** Light under the canopy hits the rider and the ground.
- **Palette is open.** The violet + cold-white house palette died with the
  cult-temple program; there is nothing left to match. `sliderHue` and
  `sliderSaturation` cover the full range on every art pattern.
- ⚠️ **Brown is a warm hue at low value; beige is a warm hue at middling
  saturation.** If it looks muddy or nude, that is the cause — see
  [`docs/layout.md`](docs/layout.md).
- **Keep a floor on any breathing zone.** A cycle that parks at black reads as
  restarting rather than as breathing.
- **Watch the duty cycle.** At 300 px the strip does not finish one night on a
  16Ah brick, so patterns do not sit at full white. End renders with `v * v`.
- **Copy the layout block verbatim** from `docs/layout.md` — Pixelblaze patterns
  are single files with no imports, so the zone logic is duplicated by design.
