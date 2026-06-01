// Heartbeat — lub-dub double pulse from mid-body outward (~70 bpm).
//
// Each beat fires two thumps: a strong "lub" then a softer "dub" a beat-fraction
// later. Each thump sends a bright front travelling from the mid-body out to both
// ends, then a quiet diastole before the next beat. Red, to read as a pulse and
// stand apart from the green body patterns.
//
// Longitudinal position comes from the pixel INDEX (index % 45 / 44), not z, so
// the pulse origin sits exactly at true mid-body regardless of how the eye pixels
// shift the normalized z-range.
//
// Map: maps/grub-3d.js  ·  Vault: Projects/LED Bikes - Pixelblaze.md
// STUB: first pass — tune rate/force on real LEDs.

var BODY_PIXELS = 360
var PX_PER_STRINGER = 45

var bodyHue = 0.0       // red
var bpm = 70
var ambient = 0.06      // faint resting glow between beats
var bandWidth = 0.28    // thickness of a travelling front (half-body units)
var travel = 0.16       // seconds for a front to go centre -> end
var lubDub = 0.16       // seconds between the two thumps

var beatPhase = 0
var f1 = 0      // lub: front position
var a1 = 0      // lub: amplitude
var f2 = 0      // dub: front position
var a2 = 0      // dub: amplitude

export function sliderRate(v)  { bpm = 40 + v * 80 }          // 40..120 bpm (80 default)
export function sliderForce(v) { bandWidth = 0.15 + v * 0.40 } // pulse thickness

export function beforeRender(delta) {
  var T = 60 / bpm
  beatPhase = (beatPhase + delta / 1000 / T) % 1
  var localTime = beatPhase * T

  // lub at t=0
  var age1 = localTime
  a1 = 0
  if (age1 >= 0 && age1 <= travel) {
    f1 = age1 / travel
    a1 = 1 - age1 / travel
  }

  // dub, softer, a beat-fraction later
  var age2 = localTime - lubDub
  a2 = 0
  if (age2 >= 0 && age2 <= travel) {
    f2 = age2 / travel
    a2 = 0.7 * (1 - age2 / travel)
  }
}

export function render3D(index, x, y, z) {
  if (index >= BODY_PIXELS) {               // eyes flicker with the lub
    hsv(bodyHue, 0.9, ambient + a1 * 0.5)
    return
  }
  // distance from mid-body: 0 at centre, 1 at either end
  var d = (index % PX_PER_STRINGER) / (PX_PER_STRINGER - 1)
  d = abs(d - 0.5) * 2

  var v = ambient
  if (a1 > 0) v += a1 * max(0, 1 - abs(d - f1) / bandWidth)
  if (a2 > 0) v += a2 * max(0, 1 - abs(d - f2) / bandWidth)
  hsv(bodyHue, 0.9, clamp(v, 0, 1))
}
