// Peristalsis — the signature grub wave.
//
// A slow band of light travels head -> tail along the body, mimicking a grub's
// muscular contraction. Written as render3D so it reads the z-axis of the
// grub-3d pixel map (z normalized 0.0 = head, 1.0 = tail) and stays correct no
// matter how many stringers/pixels exist. Eyes (indices >= BODY_PIXELS) drop to
// a steady idle glow rather than riding the wave.
//
// Map: maps/grub-3d.js  ·  Vault: Projects/LED Bikes - Pixelblaze.md
// STUB: tune speed/width/color on real LEDs; this is the starting point.

var BODY_PIXELS = 360

var bodyHue = 0.33      // grub green
var waveWidth = 0.35    // fraction of body length the bright band spans
var speed = 0.15        // body-lengths per second
var t = 0

// UI controls — appear as sliders in the Pixelblaze editor and over the API.
// NOTE: no hsvPicker control here on purpose — an exported hsvPicker* is
// auto-invoked at load with its default (hue 0 = red), which would clobber the
// green default above. If you add a color control later, give it a neutral
// position that reproduces bodyHue = 0.33, e.g. treat the picker hue as an
// offset:  export function hsvPickerColor(h) { bodyHue = (0.33 + h) % 1 }
export function sliderSpeed(v)     { speed = 0.02 + v * 0.6 }
export function sliderWaveWidth(v) { waveWidth = 0.10 + v * 0.6 }

export function beforeRender(delta) {
  t = (t + delta / 1000 * speed) % 1     // advance the wave crest, wrapped 0..1
}

export function render3D(index, x, y, z) {
  if (index >= BODY_PIXELS) {            // eyes: calm idle glow
    hsv(bodyHue, 0.5, 0.15)
    return
  }

  // wrapped distance from this pixel to the moving crest
  var d = z - t
  d = d - floor(d)                       // -> 0..1
  d = min(d, 1 - d)                      // nearest crest in either direction

  // triangle falloff: full bright at the crest, dark at half the wave width
  var v = clamp(1 - d / (waveWidth / 2), 0, 1)
  v = v * v                              // ease the edges

  hsv(bodyHue, 0.9, v)
}
