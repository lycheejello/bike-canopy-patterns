// gen-variants.mjs — build the colour variants of 1_pulse from 1_pulse itself.
//
//   node tools/gen-variants.mjs           write patterns/1_pulse-<name>/
//   node tools/gen-variants.mjs --check   fail if any variant is stale
//
// Why this exists. A Pixelblaze stores control positions PER PATTERN, so a
// palette picked with a slider gives the bike exactly one pulse look at a time
// and a playlist cannot rotate through them. Separate patterns fix that — but
// hand-copying a 230-line pattern four times means the next fix to the pulse
// mechanism has to be made four times, and the copies drift.
//
// So the mechanism lives in ONE place, patterns/1_pulse/pulse.js, and the
// variants are generated from it. Only the palette block differs. Change the
// travel maths, the rising-edge detection, the layout — anything at all — then
// re-run this, and every variant follows.
//
// ⚠️ The generated files are NOT hand-editable. They carry a banner saying so,
// and --check will fail if one has been edited or left stale. Run --check
// before pushing to a device: a stale variant means the bike is running a copy
// of a bug that was already fixed in the source.

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_DIR = "1_pulse";
const SOURCE = join(REPO, "patterns", SOURCE_DIR, "pulse.js");

const BEGIN = "  // ---- BEGIN PALETTE ----";
const END = "  // ---- END PALETTE ----";

// Each palette is the whole body between the markers. `eLevel` is the smoothed
// loudness, 0..1. Set `h`, `sat` and `glow`; everything else about the pattern
// is shared and must not be repeated here.
const PALETTES = [
  {
    name: "ember",
    blurb: "banked coals — deep red at rest, opening to orange as it drives.",
    body: `  // Deep red at rest, opening toward orange under load. Narrow hue span on
  // purpose: embers read as heat, and a wide sweep would turn them into a
  // rainbow and lose that.
  var h = 0.02 + eLevel * 0.08
  var sat = 1
  var glow = 0.03 + eLevel * 0.10`,
  },
  {
    name: "ice",
    blurb: "cold blue that goes white-hot on the loudest hits.",
    body: `  // Cold blue that burns out to WHITE on the hardest hits — the punch comes
  // from saturation dropping, not from hue moving, so the colour stays icy
  // while the peak still reads as a flash.
  var h = 0.52 + eLevel * 0.06
  var sat = 1 - eLevel * 0.55
  var glow = 0.02 + eLevel * 0.12`,
  },
  {
    name: "toxic",
    blurb: "acid green up the mast, ultraviolet overhead.",
    body: `  // ⚠️ Green and purple sit half the colour wheel apart, so INTERPOLATING
  // between them sweeps through cyan and blue and arrives reading as neither.
  // The two hues are assigned per ZONE instead, and the switch lands on the top
  // of the mast — a real physical corner — so the hard edge reads as the
  // structure of the bike rather than as a gradient that went wrong.
  //
  // Each side still drifts a little with loudness so neither is a flat swatch:
  // green toward yellow-green, purple toward magenta.
  var h = zone == CANOPY ? 0.78 + eLevel * 0.04 : 0.30 - eLevel * 0.04
  var sat = 1
  // Green sits where the eye is most sensitive, so it reads brighter than the
  // purple at the same value — the floor is held low so the mast does not wash
  // out the canopy it is feeding.
  var glow = 0.015 + eLevel * 0.08`,
  },
];

// ---- build one variant's source --------------------------------------
function render(src, palette) {
  const a = src.indexOf(BEGIN);
  const b = src.indexOf(END);
  if (a < 0 || b < 0) {
    console.error(`${SOURCE}: palette markers not found — expected ${BEGIN.trim()} / ${END.trim()}`);
    process.exit(1);
  }

  let out = src.slice(0, a + BEGIN.length) + "\n" + palette.body + "\n" + src.slice(b);

  // Replace the source's own palette heading so the generated file does not
  // claim to be the palette it no longer has.
  out = out.replace("  // ---- palette: dusk ---", `  // ---- palette: ${palette.name} ---`);

  // The source's note about how substitution works is addressed to whoever
  // edits the SOURCE. Leaving it in a generated file tells the reader to edit
  // a block that the banner above just told them not to touch, so swap it for
  // a pointer back to where the editing actually happens.
  const meta = out.indexOf("  // ⚠️ EVERYTHING BETWEEN THESE MARKERS");
  if (meta >= 0) {
    out = out.slice(0, meta) +
      `  // This palette is substituted in by tools/gen-variants.mjs. Every other\n` +
      `  // line of this file is identical to patterns/${SOURCE_DIR}/pulse.js — to change\n` +
      `  // anything but the colours, edit that and re-run the generator.\n` +
      out.slice(out.indexOf(BEGIN));
  }

  // The first line is the pattern's title comment; retitle it and stamp the banner.
  const lines = out.split("\n");
  lines[0] = `// pulse-${palette.name} — ${palette.blurb}`;
  lines.splice(1, 0,
    "//",
    "// ⚠️ GENERATED FILE — DO NOT EDIT.",
    `// Built from patterns/${SOURCE_DIR}/pulse.js by tools/gen-variants.mjs. Only the`,
    "// palette block below differs from the source; every other line is shared.",
    "// Edit the source and re-run the generator; edits here are overwritten and",
    "// `node tools/gen-variants.mjs --check` will fail on them.");
  return lines.join("\n");
}

// ---- walk the palettes ------------------------------------------------
const check = process.argv.includes("--check");
const src = readFileSync(SOURCE, "utf8");
let stale = 0, wrote = 0;

for (const palette of PALETTES) {
  const dir = join(REPO, "patterns", `${SOURCE_DIR}-${palette.name}`);
  const file = join(dir, `pulse-${palette.name}.js`);
  const want = render(src, palette);
  const have = existsSync(file) ? readFileSync(file, "utf8") : null;

  if (have === want) {
    console.log(`  · ${SOURCE_DIR}-${palette.name}: up to date`);
    continue;
  }
  if (check) {
    console.error(`  ✗ ${SOURCE_DIR}-${palette.name}: ${have === null ? "missing" : "STALE — source changed, or the file was hand-edited"}`);
    stale++;
    continue;
  }
  mkdirSync(dir, { recursive: true });
  // A rename of the source would otherwise leave the old .js behind, and the
  // check harness rejects a directory holding two of them.
  for (const f of readdirSync(dir))
    if (f.endsWith(".js") && f !== `pulse-${palette.name}.js`) rmSync(join(dir, f));
  writeFileSync(file, want);
  console.log(`  ✓ ${SOURCE_DIR}-${palette.name}: written`);
  wrote++;
}

if (check) {
  if (stale) {
    console.error(`\n${stale} variant(s) stale. Run: node tools/gen-variants.mjs`);
    process.exit(1);
  }
  console.log(`\n${PALETTES.length} variant(s) match the source.`);
} else {
  console.log(`\n${wrote} written, ${PALETTES.length - wrote} already current.`);
  if (wrote) console.log("Run tools/gen-controls.mjs next — the new variants have no controls.json yet.");
}
