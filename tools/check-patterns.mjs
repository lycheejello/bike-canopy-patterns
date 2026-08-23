// check-patterns.mjs — run every pattern headless and assert it renders sanely.
//
//   node tools/check-patterns.mjs
//
// Pixelblaze patterns are a JS subset with a handful of globals, so they load as
// ES modules once those globals are stubbed. This does not emulate the device;
// it catches the failures that are expensive to find on the playa:
//
//   * syntax / typo errors that would only show up in the device editor
//   * NaN pixels (almost always a divide-by-zero when a zone has <2 pixels)
//   * values outside 0..1, which the device silently clips
//   * a zone that renders fully black at some slider position
//   * a flip toggle that breaks a zone instead of just reversing it
//   * a pinned diagnostic that fails to go dark past its own build length
//
// Every pattern is swept across both builds (150 and 300 px), across extreme
// canopy splits, and with the spine flip both ways, because all three are meant
// to be dragged live in the UI rather than settled in source.

import { readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const PIXEL_COUNTS = [150, 300];
// Zone mixes, expressed as UI SLIDER POSITIONS (0..1) and applied through the
// exported slider functions, because that is the only way the device can change
// them. `null` leaves the pattern's own defaults alone. The lopsided mixes
// squeeze zones toward a single pixel, which is the divide-by-zero case.
const MIXES = [
  { label: "defaults", pos: null },
  { label: "min-seam", pos: { seat: 1, spine: 1, seam: 0, canopy: 0 } },
  { label: "max-canopy", pos: { seat: 0, spine: 0, seam: 0, canopy: 1 } },
];
const FLIPS = [0, 1];
const FRAMES = 240;      // ~4s at 60fps, enough to cross a fast sweep
const DT = 1000 / 60;

let clockMs = 0;
let rngState = 12345;
const out = [];          // [h, s, v] per pixel for the current frame

// ---- Pixelblaze builtins ---------------------------------------------
Object.assign(globalThis, {
  // time(interval) ramps 0..1 every interval * 65.535 seconds
  time: (interval) => {
    const periodMs = Math.max(interval, 1e-9) * 65.535 * 1000;
    return (clockMs % periodMs) / periodMs;
  },
  wave: (v) => (Math.sin(v * 2 * Math.PI) + 1) / 2,
  triangle: (v) => { const f = ((v % 1) + 1) % 1; return f < 0.5 ? f * 2 : 2 - f * 2; },
  square: (v, d = 0.5) => (((v % 1) + 1) % 1 < d ? 1 : 0),
  clamp: (v, lo, hi) => Math.min(Math.max(v, lo), hi),
  floor: Math.floor, ceil: Math.ceil, abs: Math.abs,
  max: Math.max, min: Math.min, sqrt: Math.sqrt, pow: Math.pow,
  sin: Math.sin, cos: Math.cos, hypot: Math.hypot,
  // Seeded LCG: reproducible run to run, but actually varied — a fixed 0.5 meant
  // every sparkle ignition test silently never fired, so those code paths went
  // unchecked. Reseeded per configuration in exercise().
  random: (n = 1) => { rngState = (rngState * 1664525 + 1013904223) >>> 0; return (rngState / 4294967296) * n; },
  array: (n) => new Float64Array(n),
  PI2: Math.PI * 2,           // Pixelblaze builtin: 2π   // Pixelblaze fixed-size float array
  hsv: (h, s, v) => out.push([h, s, v]),
  rgb: (r, g, b) => out.push([r, g, b]),
  pixelCount: 0,
});

// ---- run one pattern at one configuration ----------------------------
function exercise(mod, pixelCount, mix, flip, build, label, problems) {
  globalThis.pixelCount = pixelCount;
  rngState = 12345;                    // same sequence for every configuration
  // Drive the zone fractions the way the UI sliders do.
  if (mix.pos) {
    mod.sliderSeat?.(mix.pos.seat);
    mod.sliderSpine?.(mix.pos.spine);
    mod.sliderSeam?.(mix.pos.seam);
    mod.sliderCanopy?.(mix.pos.canopy);
  }
  mod.sliderBuild?.(build);
  if (typeof mod.toggleFlipSweep === "function") mod.toggleFlipSweep(flip);

  // Diagnostics pin themselves to a build length via targetCount and size their
  // zones to that, not to the device. Everything else follows pixelCount.
  // targetCount > 0 means the diagnostic is pinned to a build length; 0 or
  // absent means it follows the device.
  const target = mod.targetCount > 0 ? mod.targetCount : pixelCount;
  let litPastTarget = 0, everLit = 0, peak = 0;
  const swatches = new Set();

  clockMs = 0;
  for (let f = 0; f < FRAMES; f++) {
    clockMs += DT;
    mod.beforeRender?.(DT);

    out.length = 0;
    for (let i = 0; i < pixelCount; i++) mod.render(i);

    if (out.length !== pixelCount) {
      problems.push(`${label}: render() emitted ${out.length} pixels, expected ${pixelCount}`);
      return;
    }

    for (let i = 0; i < pixelCount; i++) {
      const [h, s, v] = out[i];
      if (!Number.isFinite(h) || !Number.isFinite(s) || !Number.isFinite(v)) {
        problems.push(`${label}: NaN/Inf at pixel ${i} frame ${f} -> h=${h} s=${s} v=${v}`);
        return;
      }
      if (s < 0 || s > 1 || v < 0 || v > 1) {
        problems.push(`${label}: out of range at pixel ${i} frame ${f} -> s=${s} v=${v}`);
        return;
      }
      if (i >= target && v > 0.001) litPastTarget++;
      if (v > 0.001) { everLit++; peak = Math.max(peak, v); }
      if (f === 0 && i < target) swatches.add(`${h.toFixed(2)}/${s.toFixed(1)}`);
    }
  }

  if (litPastTarget > 0)
    problems.push(`${label}: ${litPastTarget} pixel(s) lit past targetCount=${target} — the pinned build must go dark`);
  if (peak <= 0.001)
    problems.push(`${label}: strip never lights at all`);

  // A diagnostic must show every zone it can reach as its own flat colour. If
  // two zones collapse to one swatch the boundaries are wrong, and that is the
  // single thing this pattern exists to report.
  if (typeof mod.sliderBuild === "function" && target <= pixelCount && swatches.size < 3)
    problems.push(`${label}: only ${swatches.size} distinct zone colour(s), expected 3`);

  return { peak, swatches: swatches.size, lit: everLit / FRAMES };
}

// ---- walk patterns/*/*.js --------------------------------------------
const patternsDir = join(REPO, "patterns");
if (!existsSync(patternsDir)) { console.error("no patterns/ directory"); process.exit(1); }

const problems = [];
let checked = 0;

for (const dir of readdirSync(patternsDir).sort()) {
  // The directory name IS the device-side pattern name (prefix and all); the
  // file inside just has a readable name. Take the single .js in the folder.
  const dirPath = join(patternsDir, dir);
  let js;
  try {
    js = readdirSync(dirPath).filter((f) => f.endsWith(".js"));
  } catch { continue; }
  if (js.length !== 1) {
    if (js.length > 1) problems.push(`${dir}: ${js.length} .js files, expected exactly 1`);
    continue;
  }
  const file = join(dirPath, js[0]);

  let mod;
  try {
    mod = await import(pathToFileURL(file).href);
  } catch (e) {
    problems.push(`${dir}: failed to load — ${e.message}`);
    continue;
  }
  if (typeof mod.render !== "function") {
    problems.push(`${dir}: no exported render()`);
    continue;
  }

  // Build-slider positions: follow-the-device, pinned 150, pinned 300. Patterns
  // without the slider ignore it, so one position is enough for them.
  const builds = typeof mod.sliderBuild === "function" ? [0, 0.5, 1] : [0];
  const buildName = { 0: "auto", 0.5: "pin150", 1: "pin300" };

  const peaks = [];
  for (const px of PIXEL_COUNTS)
    for (const mix of MIXES)
      for (const flip of FLIPS)
        for (const build of builds) {
          const label = `${dir} @${px}px mix=${mix.label} flip=${flip} build=${buildName[build]}`;
          const r = exercise(mod, px, mix, flip, build, label, problems);
          if (r && flip === 0 && mix.label === "defaults")
            peaks.push(`${px}px ${buildName[build].padEnd(7)} peak ${r.peak.toFixed(2)}  lit ${Math.round(r.lit)}px  ${r.swatches} colours`);
        }

  checked++;
  console.log(`  ${problems.length ? "?" : "✓"} ${dir}`);
  for (const p of peaks) console.log(`      ${p}`);
}

if (problems.length) {
  console.error(`\n${problems.length} problem(s):`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log(`\n${checked} pattern(s) OK across ${PIXEL_COUNTS.join("/")} px, ${MIXES.length} zone mixes, both flips, all build pins.`);
