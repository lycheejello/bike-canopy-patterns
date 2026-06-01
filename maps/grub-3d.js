// grub-3d — Pixelblaze 3D pixel map for the grub mutant bike.
//
// Paste this whole function into the Pixelblaze "Mapper" tab (Pixel Map editor).
// It also documents the physical geometry for the offline emulator — keep
// tools/gen-map.mjs in sync with the constants below (it re-implements this
// same math to emit maps/grub-3d.json for pb_emu).
//
// Geometry (see vault: Projects/LED Bikes - Pixelblaze.md):
//   - 8 longitudinal body stringers, 45 px each = 360 body px  (indices 0..359)
//   - 2 eye clusters, 16 px each (4x4)       = 32 eye px       (indices 360..391)
//   - Body tapers head(12" dia) -> mid(28" dia) -> tail(12" dia) over ~72".
//   - z runs 0.0 (head) -> 1.0 (tail) after normalization, so patterns can use
//     render3D's z axis directly for head->tail waves (peristalsis).
//
// INDEX ORDER MATTERS: configure the Output Expander so body stringers occupy
// indices 0..359 (stringer 0 = 0..44, stringer 1 = 45..89, ...) and the eyes
// (native output, ch 0) occupy 360..391. Patterns assume this layout.

function (pixelCount) {
  var STRINGERS = 8
  var PX_PER_STRINGER = 45
  var LENGTH = 72          // inches, head to tail
  var R_END = 6            // radius at head & tail (12" diameter)
  var R_MID = 14           // radius at mid-body bulge (28" diameter)
  var HEAD_FWD = 12        // eyes cantilever this far forward of the head
  var EYE_HALF = 3         // half-size of a 4x4 eye grid, inches
  var EYE_OFFSET = 4       // left/right offset of each eye from centerline

  var map = []

  // --- body: 8 stringers wrapped around a tapering circular cross-section ---
  for (var s = 0; s < STRINGERS; s++) {
    var ang = s * (2 * Math.PI / STRINGERS)
    for (var i = 0; i < PX_PER_STRINGER; i++) {
      var t = i / (PX_PER_STRINGER - 1)        // 0 head -> 1 tail
      var z = t * LENGTH
      var r = R_END + (R_MID - R_END) * Math.sin(Math.PI * t)   // bulge profile
      map.push([r * Math.cos(ang), r * Math.sin(ang), z])
    }
  }

  // --- eyes: two 4x4 grids on the front face, cantilevered forward ---
  // left eye at -EYE_OFFSET, right eye at +EYE_OFFSET; grid spans x and y.
  var eyeCenters = [-EYE_OFFSET, EYE_OFFSET]
  for (var e = 0; e < eyeCenters.length; e++) {
    for (var gy = 0; gy < 4; gy++) {
      for (var gx = 0; gx < 4; gx++) {
        var ex = eyeCenters[e] + (gx / 3 - 0.5) * 2 * EYE_HALF
        var ey = R_END + (gy / 3 - 0.5) * 2 * EYE_HALF
        map.push([ex, ey, -HEAD_FWD])
      }
    }
  }

  return map
}
