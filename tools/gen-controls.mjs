// gen-controls.mjs — derive each pattern's controls.json from its OWN defaults.
//
//   node tools/gen-controls.mjs
//
// Why this exists. A Pixelblaze stores a slider POSITION per pattern and hands
// it back on load, and that stored position always beats the `export var`
// initialiser in the source. So the defaults written in a pattern only apply
// until a control exists — after that the device's copy wins, and on a fresh
// save that copy can be uninitialised garbage (1e+22, 1.985 and 3.9e-38 have all
// come back off real hardware). A pattern pushed to a new device without its
// controls therefore does NOT come up looking like the source says it should.
//
// So the repo has to carry the positions too. Rather than hand-inverting every
// slider's mapping and letting the two drift apart, this searches for them:
//
//   1. load the pattern and snapshot its exported vars — those ARE the defaults
//   2. for each slider, poke it to find which var it drives
//   3. binary-search the position 0..1 that reproduces the default
//
// Change a default in the source, re-run this, and controls.json follows. The
// source stays the single place a default is written down.

import { readdirSync, existsSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
let rng = 1;
Object.assign(globalThis, {
  time: () => 0,
  wave: (v) => (Math.sin(v * 2 * Math.PI) + 1) / 2,
  triangle: (v) => { const f = ((v % 1) + 1) % 1; return f < 0.5 ? f * 2 : 2 - f * 2; },
  clamp: (v, lo, hi) => Math.min(Math.max(v, lo), hi),
  floor: Math.floor, ceil: Math.ceil, abs: Math.abs,
  max: Math.max, min: Math.min, sqrt: Math.sqrt, pow: Math.pow,
  random: () => { rng = (rng * 1664525 + 1013904223) >>> 0; return rng / 4294967296; },
  array: (n) => new Float64Array(n),
  PI2: Math.PI * 2,           // Pixelblaze builtin: 2π
  hsv: () => {}, rgb: () => {},
  pixelCount: 150,
});

const numericVars = (mod) =>
  Object.fromEntries(Object.entries(mod).filter(([, v]) => typeof v === "number"));

let wrote = 0;
for (const dir of readdirSync(join(REPO, "patterns")).sort()) {
  const dirPath = join(REPO, "patterns", dir);
  let js;
  try { js = readdirSync(dirPath).filter((f) => f.endsWith(".js")); } catch { continue; }
  if (js.length !== 1) continue;

  const mod = await import(pathToFileURL(join(dirPath, js[0])).href);
  const defaults = numericVars(mod);
  const controls = {};

  for (const [fname, fn] of Object.entries(mod)) {
    if (typeof fn !== "function") continue;

    if (fname.startsWith("toggle")) {
      // A toggle drives a 0/1 var; its default IS that var's initial value.
      //
      // ⚠️ Probe with BOTH 0 and 1. Poking only with 1 finds nothing when the
      // default is already 1 — no var changes, the driven var is never
      // identified, and the toggle silently records as 0, inverting it.
      fn(0); const lo = numericVars(mod);
      fn(1); const hi = numericVars(mod);
      const key = Object.keys(lo).find((k) => lo[k] !== hi[k]);
      if (!key) { fn(0); continue; }
      const want = defaults[key] ? 1 : 0;
      fn(want);                                // leave it at the source default
      controls[fname] = want;
      continue;
    }
    if (!fname.startsWith("slider")) continue;

    // Which var does this slider drive? Poke both ends and see what moved.
    const base = numericVars(mod);
    fn(0); const lo = numericVars(mod);
    fn(1); const hi = numericVars(mod);
    const key = Object.keys(base).find((k) => lo[k] !== hi[k]);
    if (!key) { fn(0.5); continue; }

    const target = defaults[key];
    const at = (v) => { fn(v); return numericVars(mod)[key]; };
    const a = at(0), b = at(1);

    let pos;
    if (target <= Math.min(a, b)) pos = a < b ? 0 : 1;
    else if (target >= Math.max(a, b)) pos = a < b ? 1 : 0;
    else {
      let x0 = 0, x1 = 1;                       // monotonic: bisect
      for (let i = 0; i < 60; i++) {
        const mid = (x0 + x1) / 2;
        const inc = b > a;
        if ((at(mid) < target) === inc) x0 = mid; else x1 = mid;
      }
      pos = (x0 + x1) / 2;
    }
    controls[fname] = Math.round(Math.min(1, Math.max(0, pos)) * 1e9) / 1e9;
    at(pos);                                    // leave the module at its default
  }

  if (!Object.keys(controls).length) { console.log(`  · ${dir}: no controls`); continue; }
  const sorted = Object.fromEntries(Object.entries(controls).sort());
  writeFileSync(join(dirPath, "controls.json"), JSON.stringify(sorted, null, 2) + "\n");
  console.log(`  ✓ ${dir}: ${Object.keys(sorted).length} control(s)`);
  wrote++;
}
console.log(`\n${wrote} controls.json written from source defaults.`);
