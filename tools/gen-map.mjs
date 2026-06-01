// gen-map.mjs — emit maps/grub-3d.json for the offline emulator (pb_emu).
//
// Re-implements the same geometry as maps/grub-3d.js (the on-device Pixelblaze
// mapper). KEEP THESE TWO IN SYNC. Run:  node tools/gen-map.mjs
//
// Output: a flat JSON array of [x, y, z] coordinates in inches, one per pixel,
// in the canonical index order (body 0..359, eyes 360..391). Both the
// Pixelblaze mapper and pb_emu normalize the bounding box, so raw inches are
// fine; the shape and relative spacing are what matter.

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const STRINGERS = 8;
const PX_PER_STRINGER = 45;
const LENGTH = 72; // inches, head to tail
const R_END = 6; // radius at head & tail (12" diameter)
const R_MID = 14; // radius at mid-body bulge (28" diameter)
const HEAD_FWD = 12; // eyes cantilever this far forward of the head
const EYE_HALF = 3; // half-size of a 4x4 eye grid, inches
const EYE_OFFSET = 4; // left/right offset of each eye from centerline

const map = [];

// body
for (let s = 0; s < STRINGERS; s++) {
  const ang = s * ((2 * Math.PI) / STRINGERS);
  for (let i = 0; i < PX_PER_STRINGER; i++) {
    const t = i / (PX_PER_STRINGER - 1);
    const z = t * LENGTH;
    const r = R_END + (R_MID - R_END) * Math.sin(Math.PI * t);
    map.push([r * Math.cos(ang), r * Math.sin(ang), z]);
  }
}

// eyes
for (const cx of [-EYE_OFFSET, EYE_OFFSET]) {
  for (let gy = 0; gy < 4; gy++) {
    for (let gx = 0; gx < 4; gx++) {
      const ex = cx + (gx / 3 - 0.5) * 2 * EYE_HALF;
      const ey = R_END + (gy / 3 - 0.5) * 2 * EYE_HALF;
      map.push([ex, ey, -HEAD_FWD]);
    }
  }
}

const out = join(dirname(fileURLToPath(import.meta.url)), "..", "maps", "grub-3d.json");
writeFileSync(out, JSON.stringify(map) + "\n");
console.log(`wrote ${map.length} pixels -> ${out}`);
