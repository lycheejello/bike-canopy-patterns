// pulse-toxic — acid green through to yellow — the loudest of the set.
//
// ⚠️ GENERATED FILE — DO NOT EDIT.
// Built from patterns/1_pulse/pulse.js by tools/gen-variants.mjs. Only the
// palette block below differs from the source; every other line is shared.
// Edit the source and re-run the generator; edits here are overwritten and
// `node tools/gen-variants.mjs --check` will fail on them.
//
// Adapted from pixelblaze-audio/patterns/beat.js, which slams the whole strip
// bright on each beat and lets it fall. That is the right call for a flat strip
// and the wrong one here: flashing everything at once throws away the fact that
// this build has a VERTICAL mast under a horizontal canopy. A beat that travels
// reads as the bike being struck at the seat and ringing out overhead.
//
//   seat    a short flash where the pulse is born
//   spine   a band climbing the mast, one per beat
//   canopy  blooms when the front reaches the top, then falls away
//
// The travel time is a control, so the arrival can be tuned to land with the
// music rather than always racing ahead of it.

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
// STREAMED IN, not sensed. A browser running the app in pixelblaze-audio runs
// bass-flux onset detection and pushes these over the Pixelblaze WebSocket API
// with `setVars` at ~40 Hz, already normalised 0..1. `beat` arrives as a pulse:
// ~1 on a hit, decaying toward 0. Beat sensitivity is tuned in the app, not
// here.
//
// ⚠️ setVars only reaches the ACTIVE pattern. Sitting in the device's list is
// not enough — a pattern that is not the running one receives nothing.
export var beat = 0

// ⚠️ `level` is declared for a reason that is not visual, and removing it would
// break the pattern in a way that is hard to see. The stall detector below
// needs a signal that MOVES whenever the stream is alive. `beat` does not: in
// an ambient passage with no kick it sits at exactly 0 for many seconds while
// the app is streaming perfectly happily, and a beat-only stall check would
// call that a dead stream and drop to the idle animation mid-track.
// It earns its place visually too, as the resting glow between hits.
export var level = 0

var eLevel = 0

function envelope(target, current, delta, fall) {
  return target > current ? target : current + (target - current) * min(1, delta / fall)
}

// ---- idle fallback ----------------------------------------------------
// When the stream stops the vars FREEZE at their last values rather than
// dropping to zero, so checking for zero would never notice. Watch for them not
// CHANGING instead. Silence reads as stalled too, which is what we want.
// ⚠️ A safety net, not a mode. To make a dead stream obvious instead, delete
// driveIdle(), `stallMs`, `lastSum`, `idlePhase`, `idle` and the stall block.
var stallMs = 0
var lastSum = -1
var idlePhase = 0

// Exported so the Pixelblaze editor shows it live: 0 means frames are arriving,
// 1 means nothing is. The fastest way to tell "the stream is dead" from "the
// track has no kick right now" without guessing from the LEDs.
export var idle = 0

// ---- the pulse -------------------------------------------------------
// `travel` is the wavefront's position: 0 at the seat, 1 at the top of the
// mast, and beyond 1 while the canopy blooms. It only resets on a NEW beat.
var travel = 9                  // >1 and past the bloom: nothing in flight at boot
var lastBeat = 0

export var travelMs = 280       // seat to canopy
export function sliderTravel(v) { v = clamp(v, 0, 1); travelMs = 120 + v * 580 }

export var bandWidth = 0.35     // how much of the mast the front covers
export function sliderWidth(v) { v = clamp(v, 0, 1); bandWidth = 0.08 + v * 0.6 }

export var bloomMs = 420        // canopy fall time after the front arrives
export function sliderBloom(v) { v = clamp(v, 0, 1); bloomMs = 120 + v * 900 }

function driveIdle(delta) {
  eLevel = 0.20 + 0.30 * wave(time(17 / 65.535))
  // Synthesise an onset roughly every 2.4 s so the mast still fires with no
  // stream. time() is a sawtooth, so a wrap to a SMALLER value is the tick.
  var ph = time(2.4 / 65.535)
  if (ph < idlePhase) travel = 0
  idlePhase = ph
}

function drive(delta) {
  var sum = level + beat
  if (sum == lastSum) {
    stallMs = stallMs + delta
    if (stallMs > 2500) idle = 1
  } else {
    stallMs = 0
    idle = 0
  }
  lastSum = sum

  if (idle) {
    driveIdle(delta)
    return
  }

  eLevel = envelope(level, eLevel, delta, 250)

  // ⚠️ Fire on the RISING EDGE, not on the value. `beat` is a decaying pulse,
  // so its magnitude alone cannot tell "a new hit just landed" from "the last
  // one is still fading" — comparing against the previous frame is the only way
  // to see an onset. The margin ignores stream jitter on the way down.
  if (beat > lastBeat + 0.08) travel = 0
  lastBeat = beat
}

export function beforeRender(delta) {
  layout()
  drive(delta)

  travel = travel + delta / travelMs
  // Stop it growing without bound between beats: hours of drift would eventually
  // cost float precision, and nothing reads `travel` past the bloom anyway.
  if (travel > 9) travel = 9
}

export function render(index) {
  zoneAt(index)

  // ---- palette: toxic --------------------------------------------------
  // This palette is substituted in by tools/gen-variants.mjs. Every other
  // line of this file is identical to patterns/1_pulse/pulse.js — to change
  // anything but the colours, edit that and re-run the generator.
  // ---- BEGIN PALETTE ----
  // Acid green sliding to yellow. Green sits where the eye is most sensitive,
  // so this reads brighter than the others at the same value — the glow floor
  // is held lower to compensate rather than letting it wash out.
  var h = 0.30 - eLevel * 0.13
  var sat = 1
  var glow = 0.015 + eLevel * 0.08
  // ---- END PALETTE ----

  var v = glow

  if (zone == SEAT) {
    // A short flash where the pulse is born, gone by the time the front is a
    // third of the way up.
    v = max(glow, clamp(1 - travel * 3, 0, 1))
  } else if (zone == SPINE) {
    // Triangular band centred on the front. Falls to nothing at bandWidth, so
    // the mast is dark ahead of and behind the pulse.
    var d = abs(zpos - travel)
    if (d < bandWidth) v = max(glow, 1 - d / bandWidth)
  } else {
    // The bloom starts the instant the front reaches the top (travel == 1) and
    // falls over bloomMs. Expressed from `travel` rather than a second timer, so
    // there is no way for the two to disagree about when the beat landed.
    if (travel >= 1) {
      var age = (travel - 1) * travelMs   // ms since arrival
      v = max(glow, clamp(1 - age / bloomMs, 0, 1))
    }
  }

  hsv(h, sat, clamp(v, 0, 1))
}
