// drift — ambient colour travel for parked / lounge hours. No event, no pulse,
// just a slow hue gradient crawling the length of the run. The gradient is
// global rather than per-zone, so the four zones read as one object; only
// brightness is zoned, weighted toward the canopy.
//
// Use when the bike is standing still and is scenery rather than a vehicle.

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

// ⚠️ Dense build only: the mast measures 9 sparse pixels longer than the shared
// fractions give it. Applied as a PIXEL offset rather than by raising
// spineFrac, because the fractions are shared with the uniform builds — the
// equivalent fraction change would also move the 300 px bike's spine by 16 px,
// and 9 sparse pixels is not the same length of bike as 16 dense ones.
var DENSE_SPINE_BONUS = 9

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
// Hue and saturation cover the FULL range. `hueOffset` parks the gradient at a
// chosen part of the wheel; set cycle long and it effectively becomes a static
// palette pick.
export var bright = 0.45        // parked: the lowest of the three
export var cycle = 90           // seconds for the palette to travel once
export var hueOffset = 0        // where on the wheel the gradient starts
export var hueSpan = 0.35       // how much of the wheel is on the bike at once
export var sat = 0.85

export function sliderBrightness(v) { v = clamp(v, 0, 1); bright = clamp(v, 0.05, 1) }
export function sliderCycleSeconds(v) { v = clamp(v, 0, 1); cycle = 20 + v * 160 }
export function sliderHueOffset(v) { v = clamp(v, 0, 1); hueOffset = v }
export function sliderHueSpan(v) { v = clamp(v, 0, 1); hueSpan = v }
export function sliderSaturation(v) { v = clamp(v, 0, 1); sat = v }

// ---- state -----------------------------------------------------------
var base = 0     // 0..1 hue origin, walks the wheel
var shimmer = 0  // very slow brightness wander, keeps it from looking frozen

export function beforeRender(delta) {
  layout()
  base = time(cycle / 65.535)
  shimmer = 0.88 + 0.12 * wave(time(cycle / 65.535 / 3))
}

export function render(index) {
  zoneAt(index)

  // Global position along the whole run, so the gradient crosses zone
  // boundaries without seams.
  var g = index / max(runLength - 1, 1)

  var v = bright
  if (zone == SEAT) v = bright * 0.35
  else if (zone == SPINE) v = bright * 0.6
  else v = bright * (0.7 + 0.3 * (1 - abs(zpos - 0.5) * 2))

  hsv(hueOffset + base + g * hueSpan, sat, v * v * shimmer)
}
