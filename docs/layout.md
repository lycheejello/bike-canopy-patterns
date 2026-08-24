# Strip layout

One Pixelblaze v3 XL per bike, **one continuous WS2815 run on the native output**.
The strip runs on Output Expander channel 0. No pixel map, no per-bike geometry.

```
PB native output
 └─ strip  0 .. pixelCount-1

    0 ──[ seat ]──[ spine ]──[ canopy ]── pixelCount-1
        ^                                ^
        data-in, at the seat    far end, over the front
```

**Index 0 is at the seat.** The run goes back to front: up the frame, through the
transition, then out along the canopy, which is the long zone.

## Zones

| | Seat | Spine | Canopy |
|---|---|---|---|
| Where | Rear, at index 0 | **Vertical** mast, seat up to the canopy | Overhead, horizontal |
| Job | Places the back of the bike | Legible at distance and head-on | Ground light + presence |
| Share | 10% | 23% | 65% |
| At 150 px | 15 | 35 | 100 |
| At 300 px | 30 | 70 | 200 |
| At 294 px (dense seat) | **144** | 39 | 111 |
| Motion | Least | Rises — carries the sharper event | Slow, wide, low contrast |

**The spine is vertical.** Motion along it reads as rising or falling, not as
travelling forward, and patterns aim events up it toward the canopy. Vertical
motion is also why `beacon` works at distance: nothing else out there rises, and
a climbing mark stays legible head-on where a side-facing line disappears.

The fractions above are measured off the built bike and **confirmed unchanged at
300 px** — same path, double density. The proportions are geometry, so they only
move if the run itself is re-routed.

There is no seam zone. It was ~2 px at the 150 build, too short to blend
anything, and it earned its keep nowhere — the spine and canopy meet directly.

## Why sizes are fractions — and the one build where the seat is not

The build is not committed to a pixel count, and the zone proportions are still
being felt out on a real bike. So no pattern hardcodes the run length:

- **`pixelCount`** is a Pixelblaze built-in, read from the device's own
  *Settings → LED count*. Set it there and every pattern follows. No source
  edit, no separate branches.
- **Zone sizes are normalised fractions** on UI sliders, now set to the measured
  values off the built bike. Drag them if the build changes.

### ⚠️ The mixed-pitch build (294 px)

Fractions work because pitch is uniform: a tenth of the pixels is a tenth of the
bike. **That stops being true when one segment is denser than the rest.**

The 294 px build puts a **144 px high-density strip at index 0 as the seat**,
with the existing 150 px sparse run carrying the spine and canopy after it. Those
144 dense pixels cover far less of the bike than 144 sparse ones would, so sizing
the seat as a fraction of the run would put the seat/spine boundary metres from
where it physically belongs.

So on that build the seat is a **pixel count**, not a fraction, and only the
spine and canopy — which share one pitch — are still split proportionally,
across what is left after the seat. On a uniform build that is algebraically the
same as the old formula, so there is one code path rather than two that drift.

Two consequences worth knowing:

- **`sliderSeat` does nothing on the 294 build.** The seat is physically the
  dense strip; its length is not ours to choose.
- **The build is detected from `pixelCount`** (150 / 294 / 300 are distinct), not
  from a control. A per-device control would be silently reverted on the next
  flash, because `push-patterns.py` rewrites control positions from
  `controls.json` on every push.

If the dense segment changes length, edit `DENSE_SEAT` / `DENSE_TOTAL` — they sit
together at the top of `layoutFor()` in every pattern, and the check harness
sweeps 294 alongside 150 and 300.

## The idiom

Every pattern opens with this block. Copy it verbatim.

```js
// ---- strip layout ----------------------------------------------------
// One continuous run, seat end first. Index 0 is at the SEAT; the far end of
// the strip is the outboard end of the CANOPY.
//
//   0 ──[ seat ]──[ spine ]──[ canopy ]── pixelCount-1
//       ^             ^           ^
//       data-in    VERTICAL    horizontal,
//       at the     mast, up    overhead
//       seat       to the canopy
//
// The spine runs VERTICALLY up the mast, so motion along it reads as rising or
// falling, not as travelling forward. Patterns aim events up it toward the
// canopy.
//
// Sizes are fractions of the whole run and are normalised, so the same source
// runs 150 px and 300 px. The one exception is the 294 px mixed-pitch build,
// where the seat is a fixed 144 px because that segment is denser — see
// "The mixed-pitch build" above.
//
// ⚠️ Every slider clamps its input. The device stores a control position per
// pattern and hands it back on load, and a stored position can be stale or
// uninitialised garbage — 1e+22, 1.985 and 3.9e-38 have all come back off real
// hardware. Unclamped, those flow straight into hues and zone fractions and the
// pattern renders as dead or as noise.
export var seatFrac   = 0.10     // seat end
export var spineFrac  = 0.23     // the vertical mast, seat up to the canopy
export var canopyFrac = 0.65     // overhead, the long run

export function sliderSeat(v)    { v = clamp(v, 0, 1); seatFrac   = 0.01 + v * 0.30 }
export function sliderSpine(v)   { v = clamp(v, 0, 1); spineFrac  = 0.05 + v * 0.60 }
export function sliderCanopy(v)  { v = clamp(v, 0, 1); canopyFrac = 0.05 + v * 0.90 }

var SEAT = 0, SPINE = 1, CANOPY = 2

var zone = 0, zpos = 0           // set by zoneAt()
var b1 = 0, b2 = 0               // seat|spine, spine|canopy
var runLength = 0                // pixels the zones are laid out across

// Lay the zones out across `n` pixels. The diagnostic passes its own pinned
// build length here; everything else passes the device's pixelCount.
function layoutFor(n) {
  runLength = n
  var total = seatFrac + spineFrac + canopyFrac
  b1 = floor(n * seatFrac / total)
  b2 = b1 + floor(n * spineFrac / total)

  // Rounding can push a boundary past the end. Clamp forward so they can never
  // invert and hand a negative width to a divide below.
  if (b1 > n) b1 = n
  if (b2 > n) b2 = n
}

function layout() { layoutFor(pixelCount) }

// Sets `zone` and `zpos` (0..1 along that zone) for a strip index.
// max(w - 1, 1) guards the divide when a slider squeezes a zone to one pixel;
// without it the divide by zero renders the whole strip NaN, i.e. black.
function zoneAt(index) {
  var i = index

  if (i < b1) { zone = SEAT; zpos = i / max(b1 - 1, 1) }
  else if (i < b2) { zone = SPINE; zpos = (i - b1) / max(b2 - b1 - 1, 1) }
  else { zone = CANOPY; zpos = (i - b2) / max(runLength - b2 - 1, 1) }
}
```

`beforeRender(delta)` calls `layout()` first. `render(index)` then calls
`zoneAt(index)` and branches on `zone`, using `zpos` as its 0..1 position:

```js
export function render(index) {
  zoneAt(index)
  if (zone == SEAT) { ... }
  else if (zone == SPINE) { ... }
  else { ... }                     // CANOPY
}
```

`max(w - 1, 1)` in `zoneAt` matters: at an extreme slider position a zone can hit
one pixel, and the divide by zero renders the whole strip NaN, which shows up as
the strip going black rather than as an error.

`layoutFor(n)` exists so the diagnostics can lay their zones out across a pinned
build length instead of the device's. Nothing else should call it.

## The diagnostic

`split-test` is flat colour, one per zone:

| Colour | Zone |
|---|---|
| **Magenta** | seat (index 0 end) |
| **Cyan** | spine |
| **Amber** | canopy (far end) |
| **Red** | ⚠️ strip is *shorter* than the build under test |

The zones identify the ends on their own, so there are no separate head/tail
markers.

Zone sizes are fractions, so a given build looks the same on a 150 px and a
300 px strip — only the counts scale. One pattern therefore covers both. Its
**Build** slider pins the layout to a specific length (left = follow the device,
middle = 150, right = 300), which is what lets you see one build on the other
strip: pin 150 on a 300 px run and the first 150 light while the rest go dark.
That is the A/B for the count decision. `layoutFor(n)` exists for exactly this
and nothing else should call it.

⚠️ **It reports the hardware as wired**, so what you see is what the strip is.

## Colour

Every art pattern exposes hue over the **whole wheel** and saturation over the
**whole range**. Nothing is clamped to a warm band.

| Pattern | Hue controls |
|---|---|
| `breathe` | `sliderHue` + `sliderHueSpread` — one base, drifting seat → canopy |
| `beacon` | `sliderSeatHue`, `sliderSpineHue`, `sliderCanopyHue` — independent per zone |
| `drift` | `sliderHueOffset` + `sliderHueSpan` — a travelling gradient |

⚠️ Think twice before setting `beacon`'s seat hue to red. The mandatory rear
light is separate and independently powered; red art lighting at the back of the
bike invites reading it as the legal one.

⚠️ **Brown and beige are not hues, they are failure modes of warm hues:**

| What you see | Cause | Fix |
|---|---|---|
| **Brown / muddy** | a warm hue (≈0.0–0.15) held at low *value* | raise brightness, or move the hue off orange |
| **Beige / nude** | a warm hue at middling *saturation* | push saturation high, or drop it a long way toward white — the middle is the bad place |

`beacon`'s canopy is the one place saturation is deliberately pulled down, since
it is functional ground light. That is `canopySat`, a fraction of `sat`, on its
own slider. At a warm hue it will go beige in the middle of its range; take it
low for near-white or leave it high for colour.

Defaults now sit off the warm band (`breathe` ≈ 0.78, `beacon` ≈ 0.55) rather
than in amber. The vault's rule still stands: palette is open, pick for
visibility and taste.

## Breath shape

`breathe` uses a **plain sine**, deliberately un-eased. Easing it toward the ends
parked the bottom of the cycle near black for about half the period, and with the
`v * v` gamma on top the fall became invisible — it read as "brighten, then
restart" rather than as a cycle. Every zone also keeps a floor around 45% of its
own swing, so the dim phase is dim, never off.

## Device settings (not pattern code)

- **Color order `GRB`** for the WS2815 strip. This is the Pixelblaze default —
  leave it alone.
- **WS2815 is 12V.** Strip → 12V, Pixelblaze → 5V via the Mini Buck, grounds
  common. Never power the strip from USB 5V.
- **LED count** → 150 or 300. This is the knob that picks the build.
