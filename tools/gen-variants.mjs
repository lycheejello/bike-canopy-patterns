// gen-variants.mjs — build every pulse variant from the one hand-written pulse.
//
//   node tools/gen-variants.mjs           write the variant directories
//   node tools/gen-variants.mjs --check   fail if any variant is stale
//
// Why this exists. A Pixelblaze stores control positions PER PATTERN, so a
// palette chosen with a slider gives the bike one look at a time and a playlist
// cannot rotate through them. Separate patterns fix that — but hand-copying a
// 230-line pattern eight times means the next fix to the pulse mechanism has to
// be made eight times, and the copies drift.
//
// So the mechanism lives in ONE place, patterns/1_pulse/pulse.js, and everything
// else is generated from it along two axes:
//
//   DRIVE    where the beat comes from.  1_ = streamed audio, 2_ = a metronome
//            with a BPM slider and no audio at all.
//   PALETTE  the colour.  dusk (the source's own), ember, ice, toxic.
//
// 2 drives x 4 palettes = 8 patterns, of which 1_pulse is the hand-written
// source and the other 7 are generated. Change the travel maths, the bloom, the
// layout — re-run, and all seven follow.
//
// ⚠️ Generated files are NOT hand-editable. They carry a banner saying so, and
// --check fails if one has been edited or left stale. Run --check before pushing
// to a device: a stale variant means the bike is running a copy of a bug that
// was already fixed in the source.

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_DIR = "1_pulse";
const SOURCE = join(REPO, "patterns", SOURCE_DIR, "pulse.js");

const P_BEGIN = "  // ---- BEGIN PALETTE ----";
const P_END = "  // ---- END PALETTE ----";
const D_BEGIN = "// ---- BEGIN DRIVE ----";
const D_END = "// ---- END DRIVE ----";

// ---- the palette axis -------------------------------------------------
// A palette ASSIGNS exactly `h`, `sat` and `glow`. It may READ `eLevel` and —
// because zoneAt() has run by then — `zone`, `zpos` and `travel`.
// `dusk` is not listed: it is read out of the source, so the source stays the
// single definition of its own look.
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
    blurb: "cold blue that goes white-hot on the hardest hits.",
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

// ---- the drive axis ---------------------------------------------------
// A drive owes the shared mechanism two things: set `travel = 0` when a beat
// lands, and maintain `eLevel` (0..1) for the palettes. `audio` is not listed —
// it is read out of the source.
const DRIVES = [
  {
    prefix: "2",
    name: "bpm",
    note: "an internal metronome, no audio",
    body: `// ---- metronome --------------------------------------------------------
// NO AUDIO AT ALL. The beat comes from a clock, so this family needs nothing
// streaming to it and nothing plugged into it. Run it when there is no phone on
// the bike, or when the music is coming from somewhere the app cannot hear.
//
// There is no \`idle\` var here and no stall detection: with no stream to lose,
// there is nothing to fall back FROM.
export var bpm = 120
export function sliderBPM(v) { v = clamp(v, 0, 1); bpm = 40 + v * 140 }

// Stands in for loudness, which is what every palette reads to pick its colour.
// A slow swell rather than a constant, so the colour still breathes. The period
// is deliberately not a multiple of any sane BPM, so the swell and the beat
// never visibly lock together into one repeating gesture.
export var intensity = 0.7
export function sliderIntensity(v) { v = clamp(v, 0, 1); intensity = v }

var eLevel = 0
var beatPhase = 0

function drive(delta) {
  // ⚠️ Accumulate PHASE rather than comparing elapsed time against a stored
  // beat start. The BPM slider is meant to be dragged while the pattern runs,
  // and a phase accumulator simply changes rate when it moves; recomputing from
  // a start time would make the next beat jump early or stall.
  beatPhase = beatPhase + delta / (60000 / bpm)
  if (beatPhase >= 1) {
    // floor() rather than -1: a long frame can cross more than one beat, and
    // subtracting a single beat would leave phase above 1 and fire again next
    // frame — stuttering instead of just dropping the beat it missed.
    beatPhase = beatPhase - floor(beatPhase)
    travel = 0
  }

  eLevel = clamp(intensity * (0.55 + 0.45 * wave(time(19 / 65.535))), 0, 1)
}`,
  },
];

// ---- extract a marked block from the source ---------------------------
function slice(src, begin, end, what) {
  const a = src.indexOf(begin);
  const b = src.indexOf(end);
  if (a < 0 || b < 0) {
    console.error(`${SOURCE}: ${what} markers not found — expected ${begin} / ${end}`);
    process.exit(1);
  }
  return { a, b, body: src.slice(a + begin.length + 1, b) };
}

// ---- build one variant's source ---------------------------------------
function render(src, drive, palette) {
  let out = src;
  if (drive.body !== null) {
    const d = slice(out, D_BEGIN, D_END, "drive");
    out = out.slice(0, d.a + D_BEGIN.length + 1) + drive.body + "\n" + out.slice(d.b);
  }

  const p = slice(out, P_BEGIN, P_END, "palette");
  out = out.slice(0, p.a + P_BEGIN.length) + "\n" + palette.body + "\n" + out.slice(p.b);

  // Retitle the palette heading so a generated file does not claim a palette it
  // no longer has.
  out = out.replace(/  \/\/ ---- palette: \w+ ---/, `  // ---- palette: ${palette.name} ---`);

  // The palette marker note is addressed to whoever edits the SOURCE. Left in a
  // generated file it tells the reader to edit a block the banner just told them
  // not to touch, so swap it for a pointer. (The DRIVE note needs no such
  // handling: it lives inside the swapped region, and where it survives — the
  // audio family — it is descriptive rather than an instruction.)
  const warn = out.indexOf("  // ⚠️ EVERYTHING BETWEEN THESE MARKERS");
  if (warn >= 0) {
    out = out.slice(0, warn) +
      "  // This palette is substituted in by tools/gen-variants.mjs; every other\n" +
      `  // line comes from patterns/${SOURCE_DIR}/pulse.js. Edit that, not this.\n` +
      out.slice(out.indexOf(P_BEGIN));
  }

  const lines = out.split("\n");
  const title = palette.name === "dusk" ? "pulse" : `pulse-${palette.name}`;
  lines[0] = `// ${title}${drive.name === "audio" ? "" : ` (${drive.name})`} — ${palette.blurb}`;
  lines.splice(1, 0,
    "//",
    "// ⚠️ GENERATED FILE — DO NOT EDIT.",
    `// Built from patterns/${SOURCE_DIR}/pulse.js by tools/gen-variants.mjs:`,
    `//   drive   ${drive.name} (${drive.note})`,
    `//   palette ${palette.name}`,
    "// Everything else is shared with the source. Edit the source and re-run;",
    "// edits here are overwritten and --check will fail on them.");
  return lines.join("\n");
}

// ---- walk drives x palettes -------------------------------------------
const check = process.argv.includes("--check");
const src = readFileSync(SOURCE, "utf8");

// The source IS audio+dusk, so both are read out of it rather than declared.
const duskBody = slice(src, P_BEGIN, P_END, "palette").body.replace(/\n$/, "");
const allPalettes = [
  { name: "dusk", blurb: "blue at rest, warming as the music lifts.", body: duskBody, isSource: true },
  ...PALETTES.map((p) => ({ ...p, isSource: false })),
];
const allDrives = [
  { prefix: "1", name: "audio", note: "streamed over the WebSocket API", body: null },
  ...DRIVES,
];

let stale = 0, wrote = 0, skipped = 0;

for (const drive of allDrives) {
  for (const palette of allPalettes) {
    // audio + dusk is the hand-written source itself.
    if (drive.body === null && palette.isSource) { skipped++; continue; }

    const base = palette.name === "dusk" ? "pulse" : `pulse-${palette.name}`;
    const dirName = `${drive.prefix}_${base}`;
    const dir = join(REPO, "patterns", dirName);
    const file = join(dir, `${base}.js`);
    const want = render(src, drive, palette);
    const have = existsSync(file) ? readFileSync(file, "utf8") : null;

    if (have === want) { console.log(`  · ${dirName}: up to date`); continue; }
    if (check) {
      console.error(`  ✗ ${dirName}: ${have === null ? "missing" : "STALE — source changed, or the file was hand-edited"}`);
      stale++;
      continue;
    }
    mkdirSync(dir, { recursive: true });
    // A rename would otherwise leave the old .js behind, and the check harness
    // rejects a directory holding two of them.
    for (const f of readdirSync(dir))
      if (f.endsWith(".js") && f !== `${base}.js`) rmSync(join(dir, f));
    writeFileSync(file, want);
    console.log(`  ✓ ${dirName}: written`);
    wrote++;
  }
}

const total = allDrives.length * allPalettes.length - skipped;
if (check) {
  if (stale) {
    console.error(`\n${stale} of ${total} variant(s) stale. Run: node tools/gen-variants.mjs`);
    process.exit(1);
  }
  console.log(`\n${total} variant(s) match the source.`);
} else {
  console.log(`\n${wrote} written, ${total - wrote} already current (${SOURCE_DIR} is the source).`);
  if (wrote) console.log("Run tools/gen-controls.mjs next — new variants have no controls.json yet.");
}
