// twinkle-bounce — one behaviour per zone, running at the same time:
//
//   SEAT    solid colour, no motion
//   SPINE   beacon-style meteor
//   CANOPY  twinkle bounce — sliding hue/brightness bands
//
// The canopy carries the stock "color twinkle bounce" mechanism: ONE oscillating
// phase shift feeds both hue and brightness, so the bands slide back and forth
// and the dark gaps slide with them. Separate waves would just be two patterns
// overlaid. The meteor is lifted from 0_beacon, so a fix there is worth carrying
// across by hand.
//
// ⚠️ The zones are deliberately NOT blended into each other. That is the point of
// this one: three distinct behaviours sharing a strip. For the zones reading as
// a single object instead, that is 0_breathe.
//
// ⚠️ The canopy bands are in CANOPY-relative position, so `cycles` means bands
// across the canopy and the look holds on both the 150 and 300 px builds. The
// original used raw pixel index, which ties the spatial frequency to pixel
// density and makes the two bikes disagree.

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

// ---- global ----------------------------------------------------------
export var bright = 0.7
export function sliderBrightness(v) { v = clamp(v, 0, 1); bright = clamp(v, 0.05, 1) }

// ---- seat: solid -----------------------------------------------------
export var seatHue = 0.88
export var seatSat = 0.9
export var seatLevel = 0.3      // relative to global brightness

export function sliderSeatHue(v) { v = clamp(v, 0, 1); seatHue = v }
export function sliderSeatSat(v) { v = clamp(v, 0, 1); seatSat = v }
export function sliderSeatLevel(v) { v = clamp(v, 0, 1); seatLevel = v }

// ---- spine: beacon's comet -------------------------------------------
export var spineHue = 0.55
export var spineSat = 0.9
export var sweepWidth = 0.35
export var flipSweep = 1        // 1 = falls toward the SEAT (default), 0 = climbs

export function sliderSpineHue(v) { v = clamp(v, 0, 1); spineHue = v }
export function sliderSpineSat(v) { v = clamp(v, 0, 1); spineSat = v }
export function sliderSweepWidth(v) { v = clamp(v, 0, 1); sweepWidth = 0.05 + v * 0.6 }
export function toggleFlipSweep(v) { flipSweep = v }

// ⚠️ There is no sweep-speed control any more. The meteor is LOCKED to the
// canopy bounce (see beforeRender), so `sliderBounceRate` sets the tempo of both
// and an independent speed slider could only break the sync.

// ---- canopy: twinkle-bounce ------------------------------------------
export var canopyHue = 0        // offset; the bands supply their own spread
export var canopySat = 1
export var cycles = 14          // bands across the CANOPY (not the whole run)
export var depth = 5
export var bounceRate = 0.05
export var driftRate = 0.10

export function sliderCanopyHue(v) { v = clamp(v, 0, 1); canopyHue = v }
export function sliderCanopySat(v) { v = clamp(v, 0, 1); canopySat = v }
export function sliderCanopyCycles(v) { v = clamp(v, 0, 1); cycles = 3 + v * 40 }
export function sliderBounceDepth(v) { v = clamp(v, 0, 1); depth = v * 12 }
export function sliderBounceRate(v) { v = clamp(v, 0, 1); bounceRate = 0.01 + v * 0.18 }
export function sliderHueDrift(v) { v = clamp(v, 0, 1); driftRate = v * 0.4 }

// ---- state -----------------------------------------------------------
var head = 0      // meteor position along the spine, 0..1
var t1 = 0        // bounce oscillator
var drift = 0     // slow canopy hue travel

export function beforeRender(delta) {
  layout()

  // One clock for both zones. bouncePhase runs 0..1 over a bounce period.
  var bouncePhase = time(bounceRate)
  t1 = bouncePhase * PI2

  // The canopy bands reverse where sin(t1) is at its extremes, i.e. at
  // bouncePhase 0.25 and 0.75 — twice per period. Launching a meteor at exactly
  // those points is what ties the two zones together: the meteor leaves the
  // moment the bands turn around.
  //
  // Shifting by 0.25 puts phase 0 at the first turnaround, and the 0.5 modulus
  // makes the meteor run its full length between one turnaround and the next.
  // Deriving it this way rather than running a second timer at "about the right
  // speed" means it can never drift out of sync, however the rate is changed.
  head = ((bouncePhase - 0.25 + 1) % 0.5) / 0.5

  drift = driftRate > 0 ? time(driftRate) : 0
}

export function render(index) {
  zoneAt(index)
  var h, s, v

  if (zone == SEAT) {
    h = seatHue
    s = seatSat
    v = bright * seatLevel

  } else if (zone == SPINE) {
    h = spineHue
    s = spineSat

    var t = zpos
    if (flipSweep) t = 1 - t

    // Signed distance BEHIND the head, wrapped — the tail has to trail the
    // direction of travel or it is a moving blob, not a comet.
    var behind = head - t
    if (behind < 0) behind += 1
    var lit = clamp(1 - behind / sweepWidth, 0, 1)
    lit = lit * lit

    v = bright * (0.12 + 0.88 * lit)

  } else {
    // twinkle-bounce, in CANOPY-relative position so `cycles` means bands across
    // the canopy and stays the same on the 150 and 300 builds.
    var arg = zpos * cycles + depth * sin(t1)
    h = 1 + sin(arg) + drift + canopyHue      // hsv() wraps outside 0..1
    s = canopySat
    var bv = (1 + sin(arg)) / 2
    v = bright * bv * bv * bv * bv            // gamma, as in the original
  }

  hsv(h, s, v)
}
