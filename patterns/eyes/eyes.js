// Eyes — expression engine for the two 16-px (4x4) head clusters.
//
// On the real bike ONE Pixelblaze runs ONE pattern across all 392 px, so this
// eye logic ultimately gets folded into whichever body pattern is active (drop
// it into their `index >= BODY_PIXELS` branch). This standalone file exists to
// develop and tune the expressions in the emulator: it renders a calm idle body
// for context and gives the eyes the full behavior set.
//
// The two eyes are independent pixel ranges (left 360..375, right 376..391), so
// each is driven from its OWN state. Design choice: gaze stays COUPLED by
// default (both pupils track together = "looking at something"), with a
// divergence knob for cross/wall-eyed character; blinks are slightly desynced
// for liveliness; winks are fully independent; glare is a shared whole-face
// reaction.
//
// Pixel layout (per maps/grub-3d.js): within an eye, local = index - base;
// row = local/4 (0 bottom..3 top), col = local%4 (0 left..3 right).
//
// Glare is fired by the "Bump" trigger (+ an auto-demo every ~9s). On hardware
// with the Sensor Expansion Board, replace that with an accelerometer threshold.
//
// Map: maps/grub-3d.js  ·  Vault: Projects/LED Bikes - Pixelblaze.md
// STUB: first pass — tune timings/positions on real LEDs.

var BODY_PIXELS = 360
var pupilR = 1.4          // pupil radius in grid units

var eyeHue = 0.30         // creature yellow-green
var t = 0

// shared state
var glare = 0             // whole-face anger 0..1, decays
var sleepy = 0
var parked = 0            // idle / asleep — eyes closed
var pupY = 1.5            // vertical gaze (shared)
var divergence = 0        // <0 cross-eyed, 0 coupled, >0 wall-eyed
var blinkPeriod = 4
var blinkDur = 0.16
var glanceAmp = 0.6
var autoBumpClock = 0
var blinkClock = 0

// per-eye state (L / R)
var openL = 1,  openR = 1
var pupXL = 1.5, pupXR = 1.5
var winkClockL = 999, winkClockR = 999   // large = not winking

// --- controls ---
export function sliderBlinkRate(v)  { blinkPeriod = 6 - v * 4 }  // 2..6 s   (4 default)
export function sliderGlance(v)     { glanceAmp = v * 1.2 }      // 0..1.2   (0.6 default)
export function sliderDivergence(v) { divergence = (v - 0.5) * 2 } // -1..1 (0 = coupled)
export function toggleSleepy(v)     { sleepy = v }
export function toggleParked(v)     { parked = v }
export function triggerBump()       { glare = 1 }               // simulate accel jolt
export function triggerWinkLeft()   { winkClockL = 0 }
export function triggerWinkRight()  { winkClockR = 0 }

// openness for one eye: periodic blink, optionally overridden by an active wink
function eyeOpen(periodicClock, winkClock, rest) {
  var o = rest
  if (periodicClock < blinkDur) o = rest * abs(periodicClock / blinkDur * 2 - 1)
  if (winkClock < blinkDur) {
    var w = rest * abs(winkClock / blinkDur * 2 - 1)
    o = min(o, w)
  }
  return o
}

export function beforeRender(delta) {
  var dt = delta / 1000
  t += dt

  glare = max(0, glare - dt / 1.2)

  // auto-demo glare so the emulator shows it without clicking (skip if asleep).
  // On hardware: read `accelerometer` and trigger on a jolt instead.
  autoBumpClock = autoBumpClock + dt
  if (autoBumpClock > 9) {
    autoBumpClock = 0
    if (!parked) glare = 1
  }

  var rest = 1
  if (sleepy) rest = 0.45
  if (parked) rest = 0.02

  // shared blink clock; right eye reads it a touch later (desync = alive)
  blinkClock = blinkClock + dt
  if (blinkClock > blinkPeriod) blinkClock = blinkClock - blinkPeriod
  var cR = blinkClock - 0.04
  if (cR < 0) cR = cR + blinkPeriod

  winkClockL = winkClockL + dt
  winkClockR = winkClockR + dt
  openL = eyeOpen(blinkClock, winkClockL, rest)
  openR = eyeOpen(cR, winkClockR, rest)

  // coupled gaze + divergence; slight shared vertical drift
  var glance = glanceAmp * (wave(t * 0.11) * 2 - 1)
  pupY = 1.5 + 0.3 * (wave(t * 0.05 + 0.3) * 2 - 1)
  pupXL = 1.5 + glance - divergence / 2
  pupXR = 1.5 + glance + divergence / 2
}

// draw one 4x4 eye pixel from that eye's state (glare is shared)
function drawEye(row, col, openV, px) {
  var hue = mix(eyeHue, 0.0, glare)
  var sat = mix(0.75, 1.0, glare)
  var aperture = mix(openV, 1, glare * 0.8)
  var pxg = mix(px, 1.5, glare)             // glare recenters the pupil (stare)
  var lid = clamp(aperture * 2 - abs(row - 1.5), 0, 1)
  var d = hypot(col - pxg, row - pupY)
  var pupil = clamp(1 - d / pupilR, 0, 1)
  var sclera = mix(0.10, 0.30, glare)       // eye-white glows hot when angry
  var v = (sclera + pupil * 0.95) * lid
  hsv(hue, sat, clamp(v, 0, 1))
}

export function render3D(index, x, y, z) {
  if (index < BODY_PIXELS) {                // calm idle body for context
    var bodyV = parked ? 0.03 : 0.06 + 0.04 * wave(t * 0.1)
    hsv(0.33, 0.8, bodyV)
    return
  }

  var ei = index - BODY_PIXELS
  var eye = floor(ei / 16)                   // 0 left, 1 right
  var local = ei % 16
  var row = floor(local / 4)                 // 0 bottom .. 3 top
  var col = local % 4                        // 0 left .. 3 right

  if (eye == 0) drawEye(row, col, openL, pupXL)
  else          drawEye(row, col, openR, pupXR)
}
