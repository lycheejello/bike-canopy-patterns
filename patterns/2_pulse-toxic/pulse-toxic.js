// pulse-toxic (bpm) — acid green up the mast, ultraviolet overhead.
//
// ⚠️ GENERATED FILE — DO NOT EDIT.
// Built from patterns/1_pulse/pulse.js by tools/gen-variants.mjs:
//   drive   bpm (an internal metronome, no audio)
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
// ---- metronome --------------------------------------------------------
// NO AUDIO AT ALL. The beat comes from a clock, so this family needs nothing
// streaming to it and nothing plugged into it. Run it when there is no phone on
// the bike, or when the music is coming from somewhere the app cannot hear.
//
// There is no `idle` var here and no stall detection: with no stream to lose,
// there is nothing to fall back FROM.
export var bpm = 120
export function sliderBPM(v) { v = clamp(v, 0, 1); bpm = 40 + v * 140 }

// Stands in for loudness, which is what every palette reads to pick its colour.
export var intensity = 0.7
export function sliderIntensity(v) { v = clamp(v, 0, 1); intensity = v }

// How fast intensity breathes, in swells per second. At 0 the LFO stops and
// intensity is held flat — so this one slider covers steady, slow drift and
// obvious pulsing, rather than needing a separate on/off.
// Squared, because everything interesting is at the slow end and a linear
// mapping would bunch it all into the first tenth of the travel.
export var lfoRate = 0.0526     // ≈ one swell every 19 s
export function sliderLFO(v) { v = clamp(v, 0, 1); lfoRate = v * v * 0.5 }

// Lock the pulse to the beat: half the beat climbing the mast, half blooming
// overhead, so each pulse finishes exactly as the next one lands — no overlap
// and no dead gap. ⚠️ While this is on, sliderTravel AND sliderBloom do
// nothing: locking defines both halves, so there is nothing left for them to
// set. Off by default, so the shipped look does not change under anyone.
export var lockToBeat = 0
export function toggleLockToBeat(v) {
  lockToBeat = v
  // Hand the sliders back what they last asked for, rather than stranding the
  // pattern on whatever the lock happened to compute the instant it went off.
  if (!v) {
    travelMs = freeTravelMs
    bloomMs = freeBloomMs
  }
}

// What the sliders last set, remembered so unlocking can restore it.
var freeTravelMs = 280
var freeBloomMs = 420

var eLevel = 0
var beatPhase = 0
var lfoPhase = 0

function drive(delta) {
  if (lockToBeat) {
    // ⚠️ 1000 / (bpm / 60), NOT 60000 / bpm — same fixed-point trap as below.
    // Largest intermediate here is 1500, well inside range.
    var half = 1000 / (bpm / 60) / 2
    travelMs = half
    bloomMs = half
  } else {
    // Track the sliders while unlocked so the toggle has something to restore.
    freeTravelMs = travelMs
    freeBloomMs = bloomMs
  }

  // ⚠️ NOT `delta / (60000 / bpm)`, which is the obvious way to write this and
  // is silently broken. Pixelblaze arithmetic is 16.16 FIXED POINT and wraps
  // near ±32767, so the literal 60000 comes out as -5536, the division goes
  // negative, beatPhase counts DOWN and never reaches 1 — the pattern sits
  // there lit and perfectly still. Measured on hardware: 60000/120 evaluates to
  // -46.13, not 500. Keep every intermediate small; this form is seconds times
  // beats-per-second and never exceeds ~4.
  //
  // Accumulate PHASE rather than comparing elapsed time against a stored beat
  // start: the BPM slider is meant to be dragged while the pattern runs, and a
  // phase accumulator simply changes rate when it moves, where recomputing from
  // a start time would make the next beat jump early or stall.
  beatPhase = beatPhase + delta / 1000 * (bpm / 60)
  if (beatPhase >= 1) {
    // floor() rather than -1: a long frame can cross more than one beat, and
    // subtracting a single beat would leave phase above 1 and fire again next
    // frame — stuttering instead of just dropping the beat it missed.
    beatPhase = beatPhase - floor(beatPhase)
    travel = 0
  }

  // ⚠️ A running phase, not time(), because the rate is a live control: changing
  // the argument to time() mid-flight jumps the output, where advancing a phase
  // just changes how fast it moves.
  if (lfoRate <= 0) {
    // Held flat rather than frozen wherever the wave happened to stop, which
    // would leave the bike at an arbitrary brightness depending on when the
    // slider was touched.
    eLevel = clamp(intensity, 0, 1)
  } else {
    lfoPhase = lfoPhase + delta / 1000 * lfoRate
    // ⚠️ Wrap it. wave() is periodic in 1, so this is exact — and without it the
    // phase climbs forever and hits the 16.16 fixed-point ceiling after a few
    // hours of running, which on a bike means overnight.
    if (lfoPhase >= 1) lfoPhase = lfoPhase - floor(lfoPhase)
    eLevel = clamp(intensity * (0.55 + 0.45 * wave(lfoPhase)), 0, 1)
  }
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
