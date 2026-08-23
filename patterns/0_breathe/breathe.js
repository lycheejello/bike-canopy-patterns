// breathe — the signature idle pattern. A slow swell that walks the whole run,
// warm and brightest overhead, dimmest at the seat, with the spine trailing the
// canopy so the bike reads as one body rather than four strips end to end.
//
// This is the one that runs most of the night. Deliberately boring up close;
// what it does is make the bike legible from across the playa.

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

// ---- controls --------------------------------------------------------
// Hue and saturation cover the FULL range. A warm hue held at low value is what
// reads as brown, and a warm hue at low saturation is what reads as beige, so
// both of those are choices to make here rather than limits baked into the code.
export var period = 12          // seconds per breath
export var bright = 0.55        // ceiling — see docs/layout.md
export var hue = 0.78           // base hue, whole wheel available
export var hueSpread = 0.08     // seat -> canopy travel, signed
export var sat = 0.9            // whole range available

export function sliderBreathPeriod(v) { v = clamp(v, 0, 1); period = 4 + v * 20 }
export function sliderBrightness(v) { v = clamp(v, 0, 1); bright = clamp(v, 0.05, 1) }
export function sliderHue(v) { v = clamp(v, 0, 1); hue = v }
export function sliderHueSpread(v) { v = clamp(v, 0, 1); hueSpread = (v - 0.5) * 0.6 }
export function sliderSaturation(v) { v = clamp(v, 0, 1); sat = v }

// ---- state -----------------------------------------------------------
var swell = 0        // 0..1 canopy breath
var swellBack = 0    // same breath, phase-lagged for spine + seat
var ripple = 0       // slow travelling offset down the spine

export function beforeRender(delta) {
  layout()

  // wave() over time() gives a sine in 0..1. time()'s argument is in units of
  // 65.535s, so period/65.535 makes `period` read as seconds.
  var phase = time(period / 65.535)
  swell = wave(phase)
  swellBack = wave(phase - 0.08)        // back of the bike lags ~8% of a breath
  ripple = time(period / 65.535 * 2)

  // Left as a plain sine on purpose. Easing it toward the ends made the fall
  // invisible: the bottom of the cycle sat near black for half the period, and
  // combined with the v*v below the whole thing read as "brighten, then restart"
  // instead of as a cycle. Rise and fall get equal time.
}

export function render(index) {
  zoneAt(index)
  var h = hue
  var v = 0

  // Every zone keeps a floor well off zero. The swing still reads clearly once
  // v is squared below, and nothing ever parks at black long enough to look
  // like the pattern restarted.
  if (zone == SEAT) {
    // Lowest of the four. Enough to place the back of the bike, no more.
    h = hue
    v = bright * 0.32 * (0.45 + 0.55 * swellBack)
  } else if (zone == SPINE) {
    // A shallow ripple crawling up the mast keeps the spine alive at low
    // brightness, where a flat fade just reads as "the light is dying".
    var r = 0.85 + 0.15 * wave(zpos * 0.5 - ripple)
    h = hue + hueSpread * 0.5
    v = bright * 0.65 * r * (0.45 + 0.55 * swellBack)
  } else {
    // Brighten toward the middle so the pool of light under the rider has a
    // centre and the fabric edges fall off rather than cutting.
    var centre = 1 - abs(zpos - 0.5) * 2
    centre = 0.45 + 0.55 * centre * centre
    h = hue + hueSpread
    v = bright * centre * (0.45 + 0.55 * swell)
  }

  hsv(h, sat, v * v)   // squared: perceptual dim, and it saves power
}
