// sparkle — ported from pixelblaze-audio/patterns/sparkle.js.
//
// A dim base glow under sharp twinkles. In the original the twinkles ignited on
// treble transients; here they ignite off the synthesised beat, so they still
// arrive in bursts rather than at a flat rate.
//
// ⚠️ Pixelblaze arrays are fixed size and cannot grow at runtime, so the
// per-pixel buffer is allocated once here from pixelCount, never in
// beforeRender. This is the one pattern in the repo that carries per-pixel state.

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

// ---- auto drive ------------------------------------------------------
// The original reads bass / mid / treble / level pushed over the websocket by a
// browser doing an FFT. There is no audio on the bike, so the same four signals
// are synthesised here from low-frequency oscillators.
//
// The periods are deliberately NOT multiples of each other. Three LFOs at 17 /
// 23 / 31 seconds only line up again after their least common multiple, so the
// combined motion takes about three hours to repeat and never reads as a loop.
// Round numbers would visibly re-sync every few seconds.
export var energy = 0.55        // master intensity, stands in for how "loud" it is
export function sliderEnergy(v) { v = clamp(v, 0, 1); energy = v }

var aLevel = 0, aBass = 0, aTreble = 0, aBeat = 0
var beatPhase = 0

export var beatPeriod = 2.4     // seconds between pulses
export function sliderBeatRate(v) { v = clamp(v, 0, 1); beatPeriod = 0.6 + (1 - v) * 5 }

function drive(delta) {
  // slow swells at incommensurate periods
  aLevel = 0.30 + 0.45 * wave(time(17 / 65.535))
  aBass = 0.20 + 0.55 * wave(time(23 / 65.535))
  aTreble = 0.15 + 0.35 * wave(time(31 / 65.535))

  // A pulse with a sharp attack and exponential decay, standing in for a beat.
  // time() is a sawtooth, so 1 - sawtooth gives the decay and the wrap gives the
  // attack for free.
  beatPhase = time(beatPeriod / 65.535)
  aBeat = 1 - beatPhase
  aBeat = aBeat * aBeat * aBeat

  aLevel = aLevel * energy
  aBass = aBass * energy
  aTreble = aTreble * energy
  aBeat = aBeat * energy
}

export var twinkle = 0.5        // how many pixels catch per burst
export function sliderTwinkle(v) { v = clamp(v, 0, 1); twinkle = v }

var spark = array(pixelCount)

export function beforeRender(delta) {
  layout()
  drive(delta)

  // ~150 ms to fade out, so a twinkle is a flash and not a lamp.
  var decay = 1 - min(1, delta / 150)
  // Gate on the beat so twinkles arrive in bursts. Squared, so quiet moments
  // stay genuinely quiet instead of drizzling.
  var ignite = aBeat > 0.10 ? aBeat * aBeat * 0.6 * twinkle : 0

  for (var i = 0; i < pixelCount; i++) {
    spark[i] = spark[i] * decay
    if (random(1) < ignite) spark[i] = 1
  }
}

export function render(index) {
  zoneAt(index)

  var baseV = clamp(aBass * aBass * 0.5 + aLevel * 0.08, 0, 0.6)
  var baseH = 0.95 - aBass * 0.12

  if (zone == SEAT) baseV = baseV * 0.4
  else if (zone == CANOPY) baseV = baseV * 1.1

  var s = spark[index]
  if (s > 0.01) {
    // Low saturation at full spark → a white-blue flash that falls back to the
    // base hue as it fades, rather than a hard white dot switching off.
    hsv(0.6, 1 - s, max(baseV, s))
  } else {
    hsv(baseH, 1, clamp(baseV, 0, 1))
  }
}
