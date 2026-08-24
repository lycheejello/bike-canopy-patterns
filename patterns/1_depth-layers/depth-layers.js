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
// STREAMED IN, not sensed. There is no mic and no Sensor Expansion Board: a
// browser running the app in pixelblaze-audio does the FFT and pushes these
// over the Pixelblaze WebSocket API with `setVars` at ~40 Hz. Declaring them as
// exported vars is the entire hookup — the names here must match the names the
// app sends.
//
// They arrive ALREADY NORMALISED 0..1, and `beat` is already a detected onset
// pulse. So there is deliberately no gain, no AGC and no beat detection in this
// file: the app owns all three and its own sliders are where they get tuned.
// Re-deriving any of it here would just fight the thing upstream of it.
//
// ⚠️ setVars only reaches the ACTIVE pattern. A pattern sitting in the device's
// list that is not the running one receives nothing at all — it is not broken,
// it is just not the one being streamed to.
export var bass = 0
export var mid = 0
export var treble = 0
export var level = 0
export var beat = 0             // snaps to 1 on a bass onset, then decays

// Smoothed with an INSTANT RISE and an exponential fall, which is the idiom the
// upstream patterns use. A transient has to land on the frame it arrives and
// then ease out; averaging it on the way up turns every hit to mush.
//
// ⚠️ The fall times are per band and deliberately unequal. Cymbals have to be
// snappy or hi-hats smear into a wash, while overall level wants to be slow or
// the whole strip flickers. These are the upstream values for this pattern.
var FALL_BASS = 150, FALL_MID = 250, FALL_TREBLE = 80,  FALL_LEVEL = 350, FALL_BEAT = 140

var eBass = 0, eMid = 0, eTreble = 0, eLevel = 0, eBeat = 0

function envelope(target, current, delta, fall) {
  return target > current ? target : current + (target - current) * min(1, delta / fall)
}

// ---- idle fallback ----------------------------------------------------
// If the stream stops — app closed, phone asleep, someone made another pattern
// active — the vars FREEZE at their last values rather than dropping to zero, so
// checking for zero would never notice. Watch for them not CHANGING instead:
// real audio jitters every single frame, so a bit-identical reading held for
// seconds means nothing is arriving.
//
// A genuinely silent room reads as stalled too, which is the behaviour we want:
// dead stream and dead silence should both land on something moving rather than
// on a frozen strip.
// ⚠️ A safety net, not a mode. To make a dead stream obvious instead, delete
// driveIdle(), `stallMs`, `lastSum`, `idle`, and the stall block in drive().
var stallMs = 0
var lastSum = -1

// Exported so the Pixelblaze editor shows it live: 0 means frames are arriving,
// 1 means nothing is. That is the fastest way to tell "the stream is dead" from
// "the stream is fine and the track is quiet" without guessing from the LEDs.
export var idle = 0

function driveIdle(delta) {
  // Incommensurate periods, so the combination takes hours to repeat rather
  // than visibly re-syncing every few seconds the way round numbers would.
  eLevel  = 0.30 + 0.45 * wave(time(17 / 65.535))
  eBass   = 0.20 + 0.55 * wave(time(23 / 65.535))
  eMid    = 0.25 + 0.40 * wave(time(13 / 65.535))
  eTreble = 0.15 + 0.35 * wave(time(31 / 65.535))
  // time() is a sawtooth, so 1 - sawtooth is a decay and the wrap is a free
  // sharp attack — the same shape the app's beat pulse has.
  var ph = 1 - time(2.4 / 65.535)
  eBeat = ph * ph * ph
}

function drive(delta) {
  var sum = bass + mid + treble + level + beat
  if (sum == lastSum) {
    stallMs = stallMs + delta
    if (stallMs > 2500) idle = 1
  } else {
    stallMs = 0
    idle = 0
  }
  lastSum = sum

  if (idle) { driveIdle(delta); return }

  eBass   = envelope(bass,   eBass,   delta, FALL_BASS)
  eMid    = envelope(mid,    eMid,    delta, FALL_MID)
  eTreble = envelope(treble, eTreble, delta, FALL_TREBLE)
  eLevel  = envelope(level,  eLevel,  delta, FALL_LEVEL)
  eBeat   = envelope(beat,   eBeat,   delta, FALL_BEAT)
}

// Per-pixel sparkle, as in the original's foreground layer. ⚠️ Pixelblaze arrays
// are fixed size and cannot grow at runtime, so allocate once here from
// pixelCount, never inside beforeRender.
var spark = array(pixelCount)
var tSlow = 0                   // slow treble baseline; transients are the excess over it

export var sparkleRate = 0.3    // sparkle density on a hit; 0 = off
export function sliderSparkle(v) { v = clamp(v, 0, 1); sparkleRate = v * 0.8 }

export function beforeRender(delta) {
  layout()
  drive(delta)

  // ⚠️ Ignite on treble TRANSIENTS, not on sustained highs — upstream's
  // mechanism, restored. A slow baseline tracks where treble has been sitting
  // and only the EXCESS above it counts as a hit, so a wall of hi-hats does not
  // hold the whole strip permanently lit the way a plain threshold would.
  tSlow = tSlow + (eTreble - tSlow) * min(1, delta / 500)
  var transient = max(0, eTreble - tSlow)
  var decay = 1 - min(1, delta / 120)
  var ignite = transient > 0.04 ? transient * sparkleRate : 0
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
  var amp = clamp(lin * lin * (1 + f * 0.8) * (0.3 + eLevel * 0.9), 0, 1)

  var h, s, v
  var sp = spark[index]
  if (sp > 0.01) {
    // Icy accent, never pure white — the original deliberately kept a tint so
    // sparkles read as part of the palette instead of as blown-out pixels.
    h = 0.6
    s = 1 - sp * 0.75
    v = max(amp, sp * 0.85)
  } else {
    h = 0.66 - f * 0.66 + eBass * 0.05
    s = 1
    v = amp
  }

  if (zone == SEAT) v = v * 0.35
  else if (zone == SPINE) v = v * 0.8

  hsv(h, s, clamp(v, 0, 1))
}
