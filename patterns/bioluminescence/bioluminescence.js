// Bioluminescence drift — slow cool twinkles (green -> blue), deep-sea larva.
//
// Each pixel sparkles on its own slow cycle, seeded from its index so no two
// pixels are in phase. Brightness is pushed through a power curve so most pixels
// sit near-dark and only a few peak at a time — sparse, drifting glints. Hue
// drifts independently between green and blue across the body.
//
// Map: maps/grub-3d.js  ·  Vault: Projects/LED Bikes - Pixelblaze.md
// STUB: first pass — tune speed/sparsity on real LEDs.

var BODY_PIXELS = 360

var t = 0
var twSpeed = 0.12      // twinkle speed
var sparsity = 3.0      // higher = fewer, sharper sparkles
var hueLo = 0.33        // green
var hueHi = 0.62        // blue

export function sliderSpeed(v)    { twSpeed = 0.03 + v * 0.30 }  // 0.03..0.33 (0.18 default)
export function sliderSparsity(v) { sparsity = 1.5 + v * 5 }     // 1.5..6.5   (4 default)

export function beforeRender(delta) {
  t += delta / 1000
}

export function render3D(index, x, y, z) {
  // per-pixel phase + rate from the index (golden-ratio spread keeps them apart)
  var phase = frac(index * 0.61803)
  var rate  = 0.6 + frac(index * 0.293) * 0.8
  var tw = wave(t * twSpeed * rate + phase)        // 0..1 slow oscillation
  tw = pow(tw, sparsity)                            // crush mids -> sparse peaks

  // slow independent hue drift, green <-> blue
  var hue = hueLo + (hueHi - hueLo) * wave(t * 0.04 + frac(index * 0.137))

  if (index >= BODY_PIXELS) {                       // eyes: calm cool glow
    hsv(hue, 0.7, 0.05 + tw * 0.30)
    return
  }
  hsv(hue, 0.85, 0.02 + tw * 0.98)
}
