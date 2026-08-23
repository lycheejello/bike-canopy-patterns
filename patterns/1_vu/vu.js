// vu — a loudness meter for the bike, driven by streamed `level` alone.
//
// Adapted from pixelblaze-audio/patterns/vu-bar.js, which fills one flat strip
// end to end. This build is not a flat strip, and the adaptation is the whole
// point: the SPINE is a vertical mast, so a bar climbing it reads as a real
// meter standing up in the air, the way a mixing-desk VU does. Filling the
// whole run instead would put most of the bar overhead where its height means
// nothing.
//
//   spine   the bar. Height = loudness, green at the bottom through amber to
//           red at the top, with a peak-hold tip that sinks back down.
//   canopy  pulses with the same loudness, in the colour the bar has reached,
//           so the overhead glow says "how loud" without needing to be read.
//   seat    a dim ember of the same colour — present, never competing.
//
// Everything takes its colour from ONE ramp, so the bike reads as a single
// instrument rather than three things that happen to move together.

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

// ---- audio -----------------------------------------------------------
// STREAMED IN, not sensed. A browser running the app in pixelblaze-audio does
// the FFT and pushes values over the Pixelblaze WebSocket API with `setVars` at
// ~40 Hz, already normalised 0..1. Declaring the exported var is the hookup —
// the name here must match the name the app sends.
//
// ⚠️ Only `level` is declared. The app sends bass/mid/treble/beat in the same
// frame, but a pattern that never reads them would just put dead names in the
// device's variable list. This one is a loudness meter and nothing else.
//
// ⚠️ setVars only reaches the ACTIVE pattern. Sitting in the device's list is
// not enough — a pattern that is not the running one receives nothing.
export var level = 0

// Instant rise, ~120 ms fall — upstream's value, and fast on purpose. A meter
// has to track; smoothing it the way an ambient pattern is smoothed turns the
// bar into a slow blob that never reaches the transients it exists to show.
var FALL_LEVEL = 120

var eLevel = 0

function envelope(target, current, delta, fall) {
  return target > current ? target : current + (target - current) * min(1, delta / fall)
}

// ---- idle fallback ----------------------------------------------------
// When the stream stops the var FREEZES at its last value rather than dropping
// to zero, so checking for zero would never notice. Watch for it not CHANGING
// instead: real audio jitters every frame, so a bit-identical reading held for
// seconds means nothing is arriving. Silence reads as stalled too, which is
// what we want — a dead stream and a dead room should both land on something
// moving rather than on a frozen bar.
// ⚠️ A safety net, not a mode. To make a dead stream obvious instead, delete
// driveIdle(), `stallMs`, `lastLevel`, `idle` and the stall block in drive().
var stallMs = 0
var lastLevel = -1

// Exported so the Pixelblaze editor shows it live: 0 means frames are arriving,
// 1 means nothing is. The fastest way to tell "the stream is dead" from "the
// track is quiet" without guessing from the LEDs.
export var idle = 0

function driveIdle(delta) {
  // A slow sweep the bar can ride, so an unattended bike still reads as a meter
  // rather than as a stuck bar. Deliberately not a round period.
  eLevel = 0.15 + 0.45 * wave(time(17 / 65.535))
}

function drive(delta) {
  if (level == lastLevel) {
    stallMs = stallMs + delta
    if (stallMs > 2500) idle = 1
  } else {
    stallMs = 0
    idle = 0
  }
  lastLevel = level

  if (idle) { driveIdle(delta); return }
  eLevel = envelope(level, eLevel, delta, FALL_LEVEL)
}

// ---- the meter -------------------------------------------------------
// Peak hold sinks at a fixed RATE rather than decaying exponentially, so it
// falls at a readable, constant speed instead of hanging near the top and then
// rushing the last of the way down.
var peak = 0

export var peakFall = 1200      // ms for the peak marker to sink from full to zero
export function sliderPeakFall(v) { v = clamp(v, 0, 1); peakFall = 400 + v * 3600 }

export var canopyDepth = 0.8    // how hard the canopy pulses with loudness
export function sliderCanopyPulse(v) { v = clamp(v, 0, 1); canopyDepth = v }

export function beforeRender(delta) {
  layout()
  drive(delta)
  peak = eLevel > peak ? eLevel : max(eLevel, peak - delta / peakFall)
}

// The VU ramp, shared by every zone: green (0.33) at the bottom, through amber,
// to red (0) at the top. `t` is height up the bar, 0..1.
function vuHue(t) { return 0.33 * (1 - clamp(t, 0, 1)) }

export function render(index) {
  zoneAt(index)

  if (zone == SPINE) {
    // ⚠️ The peak marker is sized from the SPINE's pixel count, not the whole
    // run. Using the run would make the marker a fraction of a pixel wide on a
    // short spine and it would flicker in and out as `peak` slid between
    // pixels. max(..., 1) also guards the divide when a slider squeezes the
    // spine down to a single pixel.
    var spineLen = max(b2 - b1, 1)
    var dotW = 1 / max(spineLen - 1, 1)

    if (peak > 0.01 && abs(zpos - peak) < dotW * 0.75) {
      // Near-white tip, tinted by where the peak sits, so it stays legible
      // against the lit bar underneath it.
      hsv(vuHue(peak), 0.35, 1)
    } else if (zpos < eLevel) {
      hsv(vuHue(zpos), 1, 1)
    } else {
      hsv(0, 0, 0)
    }
    return
  }

  if (zone == CANOPY) {
    // Squared, so the canopy has contrast between quiet and loud rather than
    // sitting at a constant half-lit wash. The floor keeps it present when the
    // music drops out entirely.
    var v = 0.05 + eLevel * eLevel * canopyDepth
    hsv(vuHue(eLevel), 1, clamp(v, 0, 1))
    return
  }

  // Seat: a dim ember of the same colour. Low enough that it never competes
  // with the bar, which is the thing meant to be read.
  hsv(vuHue(eLevel), 1, clamp(0.03 + eLevel * 0.12, 0, 1))
}
