// Breathing — whole-body slow brighten/dim, like a grub at rest (~6/min).
//
// Uniform across the whole body: brightness rises and falls on a smooth sine,
// never reaching full dark (the grub keeps a faint glow). Eyes breathe a touch
// softer so the head reads as alive but calm.
//
// Map: maps/grub-3d.js  ·  Vault: Projects/LED Bikes - Pixelblaze.md
// STUB: first pass — tune rate/floor on real LEDs.

var BODY_PIXELS = 360

var bodyHue = 0.33        // grub green
var breathsPerMin = 6
var floorBright = 0.12    // minimum glow — never fully off
var phase = 0
var level = floorBright

// UI sliders (defaults sit at 0.5)
export function sliderRate(v)  { breathsPerMin = 2 + v * 12 }   // 2..14 /min  (~8 default)
export function sliderFloor(v) { floorBright = v * 0.4 }        // 0..0.4      (0.2 default)

export function beforeRender(delta) {
  phase = (phase + delta / 1000 * (breathsPerMin / 60)) % 1
  var b = wave(phase)                                  // 0..1 smooth sine
  level = floorBright + (1 - floorBright) * b
}

export function render3D(index, x, y, z) {
  if (index >= BODY_PIXELS) {                          // eyes: softer breath
    hsv(bodyHue, 0.6, level * 0.7)
    return
  }
  hsv(bodyHue, 0.9, level)
}
