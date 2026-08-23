// split-test — diagnostic, not art. Flat colour, one per zone, so a glance tells
// you where every boundary actually landed on the real strip:
//
//   MAGENTA  seat    (index 0 end)
//   CYAN     spine
//   AMBER    canopy  (far end)
//   RED      ⚠️ the strip is SHORTER than the build under test
//
// The zones identify the ends on their own, so there are no separate head/tail
// markers. Read the boundaries off the strip, then set the zone sliders on the
// real patterns to match.
//
// ⚠️ It reports the hardware AS WIRED. A diagnostic that quietly corrected
// orientation would only ever confirm what you already assumed, which is the one
// thing it must never do.

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

// ---- the build under test --------------------------------------------
// Zone sizes are fractions, so at a given build the picture is identical whether
// the strip is 150 or 300 px — only the pixel counts scale. What pinning buys
// you is seeing ONE build on the OTHER strip: set 150 on a 300 px strip and the
// first 150 light while the rest go dark, which is exactly what a 150 build
// looks like. That is the A/B for the count decision.
//
//   Build slider:  left = follow the device   middle = 150   right = 300
export var targetCount = 0       // 0 = follow the device's LED count

export function sliderBuild(v) {
  if (v < 0.34) targetCount = 0
  else if (v < 0.67) targetCount = 150
  else targetCount = 300
}

// ---- controls --------------------------------------------------------
export var bright = 0.6

export function sliderBrightness(v) { v = clamp(v, 0, 1); bright = clamp(v, 0.05, 1) }

// ---- state -----------------------------------------------------------
var run = 0      // pixels in the build under test

export function beforeRender(delta) {
  run = targetCount
  if (run <= 0) run = pixelCount
  layoutFor(run)
}

export function render(index) {
  var v = bright * bright

  // Past the build under test: dark. This is what makes a pinned 150 read as a
  // 150 build rather than as a half-lit 300.
  if (index >= run) {
    hsv(0, 0, 0)
    return
  }

  // ⚠️ Strip is SHORTER than the build under test, so the far zones run off the
  // end. Without this you would see four plausible colours and wrongly conclude
  // the canopy simply was not wired.
  if (pixelCount < run && index >= pixelCount - 4) {
    hsv(0, 1, v)                 // RED = truncated
    return
  }

  zoneAt(index)

  if (zone == SEAT) hsv(0.83, 1, v)          // MAGENTA
  else if (zone == SPINE) hsv(0.5, 1, v)     // CYAN
  else hsv(0.08, 1, v)                       // AMBER
}
