// pulse-toxic — acid green up the mast, ultraviolet overhead.
//
// ⚠️ GENERATED FILE — DO NOT EDIT.
// Built from patterns/1_pulse/pulse.js by tools/gen-variants.mjs:
//   drive   audio (streamed over the WebSocket API)
//   palette toxic
// Everything else is shared with the source. Edit the source and re-run;
// edits here are overwritten and --check will fail on them.
//
// Adapted from pixelblaze-audio/patterns/beat.js, which slams the whole strip
// bright on each beat and lets it fall. That is the right call for a flat strip
// and the wrong one here: flashing everything at once throws away the fact that
// this build has a VERTICAL mast under a horizontal canopy. A beat that travels
// reads as the bike being struck at the seat and ringing out overhead.
//
//   spine   a band climbing the mast from its foot, one per beat — the pulse
//           starts HERE, at the bottom of the spine, not at the seat
//   canopy  blooms when the front reaches the top, then falls away
//   seat    a low swell underneath: present on the beat, never the event
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

// ---- the pulse -------------------------------------------------------
// `travel` is the wavefront's position: 0 at the seat, 1 at the top of the
// mast, and beyond 1 while the canopy blooms. It only resets on a NEW beat.
var travel = 9                  // >1 and past the bloom: nothing in flight at boot

export var travelMs = 280       // seat to canopy
export function sliderTravel(v) { v = clamp(v, 0, 1); travelMs = 120 + v * 580 }

export var bandWidth = 0.35     // how much of the mast the front covers
export function sliderWidth(v) { v = clamp(v, 0, 1); bandWidth = 0.08 + v * 0.6 }

export var bloomMs = 420        // canopy fall time after the front arrives
export function sliderBloom(v) { v = clamp(v, 0, 1); bloomMs = 120 + v * 900 }

// How far the seat lifts on a beat. Not a control: it exists to stay UNDER the
// band, and a slider that can raise it past that would only let the seat take
// the launch back.
var SEAT_LIFT = 0.18


// ---- BEGIN DRIVE ----
// ⚠️ EVERYTHING TO THE `END DRIVE` MARKER IS SWAPPED PER FAMILY by
// tools/gen-variants.mjs. `1_` is driven by streamed audio; `2_` runs off an
// internal metronome with a BPM slider and no audio at all.
//
// A drive block owes the shared mechanism below exactly two things:
//   * set `travel = 0` at the instant a beat lands
//   * maintain `eLevel` (0..1), which every palette reads for its colour
// Anything else it declares is private to that family.
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

var lastBeat = 0               // previous frame's `beat`, for edge detection

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
// ---- END DRIVE ----

export function beforeRender(delta) {
  layout()

  // ⚠️ Advance BEFORE drive(), not after. drive() resets travel to 0 when a beat
  // lands, so advancing afterwards moves the front off the foot of the mast in
  // the same frame — at 60fps that is ~6% up the spine, and the pulse visibly
  // starts partway up instead of at the bottom. This order means a beat landing
  // this frame renders at exactly 0.
  travel = travel + delta / travelMs
  // Stop it growing without bound between beats: hours of drift would eventually
  // reach the 16.16 fixed-point ceiling, and nothing reads `travel` past the
  // bloom anyway.
  if (travel > 9) travel = 9

  drive(delta)
}

export function render(index) {
  zoneAt(index)

  // ---- palette: toxic --------------------------------------------------
  // This palette is substituted in by tools/gen-variants.mjs; every other
  // line comes from patterns/1_pulse/pulse.js. Edit that, not this.
  // ---- BEGIN PALETTE ----
  // ⚠️ Green and purple sit half the colour wheel apart, so INTERPOLATING
  // between them sweeps through cyan and blue and arrives reading as neither.
  // The two hues are assigned per ZONE instead, and the switch lands on the top
  // of the mast — a real physical corner — so the hard edge reads as the
  // structure of the bike rather than as a gradient that went wrong.
  //
  // Each side still drifts a little with loudness so neither is a flat swatch:
  // green toward yellow-green, purple toward magenta.
  var h = zone == CANOPY ? 0.78 + eLevel * 0.04 : 0.30 - eLevel * 0.04
  var sat = 1
  // Green sits where the eye is most sensitive, so it reads brighter than the
  // purple at the same value — the floor is held low so the mast does not wash
  // out the canopy it is feeding.
  var glow = 0.015 + eLevel * 0.08
  // ---- END PALETTE ----

  var v = glow

  if (zone == SEAT) {
    // ⚠️ A low swell, NOT a flash. `zpos` is deliberately unused here, so the
    // whole seat lifts together — and at full brightness that reads as a bright
    // block igniting, which makes the SEAT look like the origin and steals the
    // launch from the mast. The pulse is meant to read as starting at the foot
    // of the spine, so the seat only acknowledges the beat: it tops out well
    // under the band and is gone before the front is a third of the way up.
    v = glow + SEAT_LIFT * clamp(1 - travel * 2.5, 0, 1)
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
