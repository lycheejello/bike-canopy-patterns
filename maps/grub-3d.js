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
//   - Stringers wrap the TOP + SIDES only, over a 270deg arc, leaving an open
//     belly (BOTTOM_GAP) where the bike frame/wheels/rider sit. No bottom strand.
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
  var HEAD_FWD = 8         // eyes cantilever this far forward of the head
  var EYE_HALF = 1.5       // half-size of a 4x4 eye grid, inches
  var EYE_OFFSET = 2.5     // left/right offset of each eye from centerline
  var EYE_Y = 2            // vertical centre of the eye grids (grub-y)
  var BOTTOM_GAP = 90      // degrees of open belly at the bottom (bike sits here)

  var map = []

  // --- body: 8 stringers over the top + sides, open belly at the bottom ---
  // Sweep symmetric about straight-up (+y = 90deg); leave BOTTOM_GAP open at the
  // bottom. End stringers land just above the gap on each lower side.
  var arc = 360 - BOTTOM_GAP                    // degrees the stringers span
  for (var s = 0; s < STRINGERS; s++) {
    var frac = s / (STRINGERS - 1)             // 0..1 across the arc
    var deg = 90 - arc / 2 + frac * arc        // 90 = top
    var ang = deg * Math.PI / 180
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
        var ey = EYE_Y + (gy / 3 - 0.5) * 2 * EYE_HALF
        map.push([ex, ey, -HEAD_FWD])
      }
    }
  }

  return map
}
