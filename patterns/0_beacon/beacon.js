// beacon — the "someone is riding at me" pattern. The canopy holds a steady,
// honest pool of ground light; a comet runs the vertical mast and hands off to
// the canopy. `flipSweep` reverses it to fall canopy -> seat instead.
//
// Vertical motion is why this works at distance. Nothing else out there rises,
// so a climbing mark is legible from much further off than the same comet run
// horizontally, and it stays legible head-on where a side-facing line vanishes.
//
// Not a substitute for the mandatory white front / red rear lights. Those are
// separately USB-powered and ship regardless. This is art lighting that happens
// to be legible, which is not the same thing as being a safety light.

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
// runs 150 px and 300 px. Nothing here assumes a pixel count.
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

// ⚠️ MIXED PITCH. On the dense build the seat is a 144 px HIGH-DENSITY strip,
// so it covers far less of the bike than 144 sparse pixels would. Sizing it as a
// fraction of the run — which is what every other build does, and what the rest
// of this file's comments assume — would put the seat/spine boundary metres from
// where it physically belongs. So on that build the seat is a PIXEL COUNT, and
// only the spine and canopy, which share one pitch, are still split by fraction.
//
// The split is taken over what is LEFT after the seat rather than over the whole
// run. That is not a special case: it is algebraically identical to the old form
// on a uniform build, so there is one code path rather than two that can drift.
//
// ⚠️ Detected from the pixel count, because the alternative is a per-device
// control and push-patterns.py rewrites control positions from controls.json on
// every push — a per-device setting would silently revert on the next flash.
// The three builds have three distinct counts, so this is unambiguous:
//   150  uniform          294  144 dense seat + 150 sparse          300  uniform
//
// ⚠️ On the dense build sliderSeat does nothing: the seat is physically the
// dense strip and its length is not ours to choose.
var DENSE_SEAT = 144
var DENSE_TOTAL = 294

// ⚠️ Dense build only: the mast measures 10 sparse pixels longer than the shared
// fractions give it. Applied as a PIXEL offset rather than by raising
// spineFrac, because the fractions are shared with the uniform builds — the
// equivalent fraction change would also move the 300 px bike's spine, and a
// sparse pixel is not the same length of bike as a dense one.
var DENSE_SPINE_BONUS = 10

// Lay the zones out across `n` pixels. The diagnostic passes its own pinned
// build length here; everything else passes the device's pixelCount.
function layoutFor(n) {
  runLength = n

  var seatPx
  if (n == DENSE_TOTAL) seatPx = DENSE_SEAT
  else seatPx = floor(n * seatFrac / (seatFrac + spineFrac + canopyFrac))

  var rest = n - seatPx
  var split = spineFrac + canopyFrac

  b1 = seatPx
  b2 = b1 + floor(rest * spineFrac / split)
  if (n == DENSE_TOTAL) b2 = b2 + DENSE_SPINE_BONUS

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

// ---- controls --------------------------------------------------------
// Each zone picks its own hue, full wheel, on its own slider.
//
// Saturation: `sat` covers the seat and spine; the canopy has its own
// `canopySat` and the two are INDEPENDENT, not nested. It used to be a fraction
// of `sat`, which meant the canopy could never reach full saturation — at the
// top of its range it only ever got as far as `sat`.
//
// ⚠️ The canopy is functional ground light, so low saturation there buys you
// something the other zones do not want: closer to usable white. But a *warm*
// hue at middling saturation is exactly what reads as beige, so take it a long
// way down or leave it high.
//
// ⚠️ Think twice before setting the seat hue to red. The mandatory rear light is
// a separate, independently powered thing, and a red glow at the back of the
// bike that is actually art lighting invites reading it as the legal one.
export var bright = 0.7         // beacon runs hotter than breathe, by design
export var sweepPeriod = 3.5    // seconds for one comet run
export var sweepWidth = 0.35    // fraction of the mast the tail covers
// Which way the comet travels. A look, not a wiring correction.
export var flipSweep = 0        // 0 = climbs seat->canopy, 1 = falls canopy->seat
export var hueSeat = 0.88       // rear presence
export var hueSpine = 0.55      // the climbing comet
export var hueCanopy = 0.10     // ground light
export var sat = 0.9            // seat / spine, full range
export var canopySat = 0.75     // canopy, full range, independent of sat

export function sliderBrightness(v) { v = clamp(v, 0, 1); bright = clamp(v, 0.05, 1) }
// Fast end is 1/1.3 s, i.e. 30% quicker than the 1 s floor it used to have.
// Slow end unchanged at 9 s, and the 3.5 s default is unchanged too — only the
// top of the range moved, so the slider's resting look is the same.
export function sliderSweepSpeed(v) { v = clamp(v, 0, 1); sweepPeriod = 0.769 + (1 - v) * 8.231 }
export function sliderSweepWidth(v) { v = clamp(v, 0, 1); sweepWidth = 0.05 + v * 0.6 }
export function toggleFlipSweep(v) { flipSweep = v }
export function sliderSeatHue(v) { v = clamp(v, 0, 1); hueSeat = v }
export function sliderSpineHue(v) { v = clamp(v, 0, 1); hueSpine = v }
export function sliderCanopyHue(v) { v = clamp(v, 0, 1); hueCanopy = v }
export function sliderSaturation(v) { v = clamp(v, 0, 1); sat = v }
export function sliderCanopySat(v) { v = clamp(v, 0, 1); canopySat = v }

// ---- state -----------------------------------------------------------
var head = 0     // 0..1 position of the comet head along the spine

export function beforeRender(delta) {
  layout()
  head = time(sweepPeriod / 65.535)
}

export function render(index) {
  zoneAt(index)
  var v = 0
  var s = sat
  var h = hueSpine

  if (zone == SEAT) {
    h = hueSeat
    v = bright * 0.25            // low rear presence, steady
  } else if (zone == SPINE) {
    h = hueSpine

    // Mirroring the coordinate reverses the head's travel AND the tail with it,
    // which is what keeps the comet a comet. Negating the time instead would
    // move the head the other way but leave the tail out in front of it.
    var t = zpos
    if (flipSweep) t = 1 - t

    // How far this pixel sits BEHIND the head, wrapped into 0..1. Signed, not
    // abs() — the tail has to trail the direction of travel, so a pixel the
    // head has already passed lights and one it has not stays dark. A symmetric
    // falloff here is a blob that happens to move, which reads as a glowing
    // lump rather than as something going somewhere.
    var behind = head - t
    if (behind < 0) behind += 1

    var lit = clamp(1 - behind / sweepWidth, 0, 1)
    lit = lit * lit              // bright head, quick decay

    // Floor keeps the whole mast faintly present between climbs, so the bike
    // still has a vertical line when the head is at the top of the mast.
    v = bright * (0.12 + 0.88 * lit)
  } else {
    // Flat and steady. A canopy that pulses while you are trying to see the
    // ground is worse than one that just stays on.
    h = hueCanopy
    var edge = 1 - abs(zpos - 0.5) * 2
    v = bright * (0.55 + 0.45 * edge)
    s = canopySat                // independent: reaches a full 1.0 on its own
  }

  hsv(h, s, v * v)
}
