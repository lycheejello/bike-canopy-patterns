// Peristalsis — the signature grub wave, now SEGMENTED.
//
// Two layers give a segmented-creature feel instead of a smooth slide:
//   1. Static body structure — each segment is a bright bulge with dark creases
//      at the rib lines (hula-hoop positions), plus a thin static ring at each
//      rib in a CONTRASTING accent colour (ribHue). You see segmentation even
//      when nothing moves.
//   2. A contraction wave that lights whole segments in SEQUENCE (a ring-segment
//      swells, then the next), head -> tail — actual peristalsis, not a slide.
//
// Longitudinal position comes from the pixel INDEX ((index % 45) / 44), so all 8
// strands share identical segment boundaries -> clean rings, and it's immune to
// the eye z-offset in the normalized map.
//
// Map: maps/grub-3d.js  ·  Vault: Projects/LED Bikes - Pixelblaze.md
// STUB: first pass — tune on real LEDs.

var BODY_PIXELS = 360
var PX_PER_STRINGER = 45

var bodyHue = 0.33      // grub green
var ribHue = 0.5        // rib-ring accent colour (cyan); set by slider
var speed = 0.15        // body-lengths per second the contraction travels
var waveWidth = 0.20    // how far a contraction spreads (body fraction)
var segments = 6        // body segments (match the rib count)
var ribGlow = 0.5       // brightness of the static rib rings
var segBase = 0.10      // resting glow of each segment body
var t = 0

// UI sliders (defaults sit at 0.5)
export function sliderSpeed(v)     { speed = 0.02 + v * 0.6 }      // crawl speed
export function sliderWaveWidth(v) { waveWidth = 0.06 + v * 0.30 } // contraction spread
export function sliderSegments(v)  { segments = round(4 + v * 4) } // 4..8 segments (6 default)
export function sliderRibGlow(v)   { ribGlow = v }                 // 0..1 rib-ring brightness
export function sliderRibHue(v)    { ribHue = v }                  // 0..1 rib-ring colour

export function beforeRender(delta) {
  t = (t + delta / 1000 * speed) % 1     // contraction crest, head -> tail, wrapped
}

export function render3D(index, x, y, z) {
  if (index >= BODY_PIXELS) {            // eyes: calm idle glow
    hsv(bodyHue, 0.5, 0.12)
    return
  }

  var bodyPos = (index % PX_PER_STRINGER) / (PX_PER_STRINGER - 1)  // 0 head .. 1 tail
  var seg = bodyPos * segments
  var segIdx = floor(seg)
  var segPhase = seg - segIdx                                      // 0..1 within a segment

  // static structure: fat bulge in the middle of each segment, dark at the ribs
  var bulge = sin(segPhase * PI)
  // thin bright ring exactly at each rib seam (segPhase near 0 or 1)
  var nearSeam = 1 - min(segPhase, 1 - segPhase) * 2
  var ribLine = pow(nearSeam, 6)

  // contraction wave: peaks when the crest passes THIS segment's centre, so
  // segments light one after another rather than sliding continuously
  var segCenter = (segIdx + 0.5) / segments
  var d = abs(segCenter - t)
  d = min(d, 1 - d)                       // wrap so waves repeat down the body
  var pulse = clamp(1 - d / waveWidth, 0, 1)
  pulse = pulse * pulse

  var bodyV = (segBase + pulse) * bulge   // green segment bodies
  var ribV = ribGlow * ribLine            // accent rib rings
  var totalV = clamp(bodyV + ribV, 0, 1)

  // lean hue toward the rib accent only where rib light dominates (the thin
  // seam where the body is dark), so the two colours stay clean and separate
  var w = ribV / (bodyV + ribV + 0.001)
  hsv(mix(bodyHue, ribHue, w), 0.9, totalV)
}
