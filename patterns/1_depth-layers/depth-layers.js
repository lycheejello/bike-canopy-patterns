// depth-layers — ported from pixelblaze-audio/patterns/depth-layers.js.
//
// The original was a TWO-STRIP pattern: a dense expander output carried a crisp
// foreground and a sparse one carried a blurry background wash behind it. This
// build is a single stripe, so there is no second layer to put anything behind.
//
// **Foreground only.** What survives is the original's foreground: a smooth
// spectrum-style gradient with sparkles riding on top. The background wash, the
// N0 split and the two-layer index maths are gone rather than faked — a blur
// layer drawn on the same pixels as the detail is not depth, it is just a
// dimmer pattern.
//
// The run is treated as one continuous surface. Zones only weight brightness at
// the very end, so the seat stays low and the canopy carries the light.

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

// Per-pixel sparkle, as in the original's foreground layer. ⚠️ Pixelblaze arrays
// are fixed size and cannot grow at runtime, so allocate once here from
// pixelCount, never inside beforeRender.
var spark = array(pixelCount)

export var sparkleRate = 0.3    // sparkle density on a hit; 0 = off
export function sliderSparkle(v) { v = clamp(v, 0, 1); sparkleRate = v * 0.8 }

export function beforeRender(delta) {
  layout()
  drive(delta)

  // Ignite off the synthesised beat so sparkles arrive in bursts, the way the
  // original fired them on treble transients rather than on sustained highs.
  var decay = 1 - min(1, delta / 120)
  var ignite = aBeat > 0.10 ? aBeat * sparkleRate : 0
  for (var i = 0; i < pixelCount; i++) {
    spark[i] = spark[i] * decay
    if (random(1) < ignite) spark[i] = 1
  }
}

export function render(index) {
  zoneAt(index)

  // One position along the whole stripe — no layer split.
  var f = index / max(runLength - 1, 1)

  // The foreground gradient. Two harmonics summed so it has structure rather
  // than being a single sweep, and a slow drift so it is never static.
  var g1 = wave(f * 1.4 - time(11 / 65.535))
  var g2 = wave(f * 2.9 + time(19 / 65.535))
  var lin = (g1 * 0.65 + g2 * 0.35)

  // High end tilt, straight from the original: the top of the gradient carried
  // little energy and stayed dim without a lift.
  var amp = clamp(lin * lin * (1 + f * 0.8) * (0.3 + aLevel * 0.9), 0, 1)

  var h, s, v
  var sp = spark[index]
  if (sp > 0.01) {
    // Icy accent, never pure white — the original deliberately kept a tint so
    // sparkles read as part of the palette instead of as blown-out pixels.
    h = 0.6
    s = 1 - sp * 0.75
    v = max(amp, sp * 0.85)
  } else {
    h = 0.66 - f * 0.66 + aBass * 0.05
    s = 1
    v = amp
  }

  if (zone == SEAT) v = v * 0.35
  else if (zone == SPINE) v = v * 0.8

  hsv(h, s, clamp(v, 0, 1))
}
