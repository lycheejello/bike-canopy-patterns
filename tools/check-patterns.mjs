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
//   * a streamed pattern whose var names do not match what the app sends
//   * an idle fallback that never engages, or engages while the stream is alive
//
// Every pattern is swept across both builds (150 and 300 px) and across extreme
// canopy splits, because both are meant to be dragged live in the UI rather than
// settled in source. Patterns that expose a flip toggle are swept both ways too;
// the rest have nothing to flip, so sweeping them would only run everything
// twice.

import { readdirSync, existsSync, readFileSync } from "node:fs";
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
  { label: "min-canopy", pos: { seat: 1, spine: 1, canopy: 0 } },
  { label: "max-canopy", pos: { seat: 0, spine: 0, canopy: 1 } },
];
// Flip positions. Only swept for patterns that actually expose a flip toggle —
// see `flips` below. Sweeping it for the others runs every configuration twice
// for nothing, and the second pass differs only by module state carried over
// from the first, which reads as a real difference when it is an artefact.
const FLIPS = [0, 1];
const FRAMES = 300;      // ~5s at 60fps — long enough to cross the 2.5s stall timer
const DT = 1000 / 60;

// The `1_` patterns are driven over the WebSocket API: a browser does the FFT
// and pushes bass/mid/treble/level/beat with setVars at ~40 Hz, already 0..1.
// These scenarios stand in for that stream.
//
//   no-stream  nothing is ever written — app closed, or another pattern active
//   quiet      the stream is ALIVE but the room is quiet (must NOT read as idle)
//   music      a 2 Hz kick with hats on the offbeat and moving mids
//   loud       everything near full scale, to prove nothing clips or goes NaN
const AUDIO = ["no-stream", "quiet", "music", "loud"];

// ⚠️ The names below are the wire contract with the app. A typo here or in a
// pattern means setVars silently lands nowhere, which looks exactly like "the
// audio is broken" on the bike. See pixelblaze-audio/README.md.
const STREAMED = ["bass", "mid", "treble", "level", "beat"];

function streamFrame(scenario, tMs) {
  const t = tMs / 1000;
  const jitter = () => globalThis.random(1) * 0.01;   // real audio never sits still
  if (scenario === "quiet") {
    return { bass: jitter(), mid: jitter(), treble: jitter(), level: jitter(), beat: 0 };
  }
  const kick = Math.pow(1 - ((t * 2) % 1), 6);          // 2 Hz kick
  const hat = Math.pow(1 - ((t * 4 + 0.5) % 1), 12);    // hats on the offbeat
  const scale = scenario === "loud" ? 1 : 0.55;
  return {
    bass: Math.min(1, (0.15 + kick * 0.8) * scale + jitter()),
    mid: Math.min(1, (0.3 + 0.3 * Math.sin(t)) * scale + jitter()),
    treble: Math.min(1, (0.05 + hat * 0.7) * scale + jitter()),
    level: Math.min(1, (0.25 + kick * 0.4 + hat * 0.2) * scale + jitter()),
    // The app sends `beat` already detected and already decaying.
    beat: Math.pow(1 - ((t * 2) % 1), 3) * (scenario === "loud" ? 1 : 0.9),
  };
}

// ⚠️ ES module exports are READ-ONLY from outside, so a plain import gives no
// way to push a value in the way setVars does — `mod.bass = 0.5` throws. Append
// accessors instead: the assignment then happens INSIDE the module, where it
// mutates the real binding. Loaded from a data: URL so nothing is written to
// the repo.
async function loadPattern(file) {
  const src = readFileSync(file, "utf8");
  const streamed = STREAMED.filter((n) =>
    new RegExp(`^export var ${n}\\b`, "m").test(src));
  let text = src;
  if (streamed.length) {
    const acc = streamed
      .map((n) => `  set ${n}(v) { ${n} = v }, get ${n}() { return ${n} }`)
      .join(",\n");
    text += `\nexport const __stream = {\n${acc}\n};\n`;
  }
  const url = "data:text/javascript;base64," + Buffer.from(text).toString("base64");
  const mod = await import(url);
  return { mod, streamed };
}

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
function exercise(mod, pixelCount, mix, flip, build, audio, label, problems) {
  globalThis.pixelCount = pixelCount;
  rngState = 12345;                    // same sequence for every configuration
  // Drive the zone fractions the way the UI sliders do.
  if (mix.pos) {
    mod.sliderSeat?.(mix.pos.seat);
    mod.sliderSpine?.(mix.pos.spine);
    mod.sliderCanopy?.(mix.pos.canopy);
  }
  mod.sliderBuild?.(build);
  if (typeof mod.toggleFlipSweep === "function") mod.toggleFlipSweep(flip);

  // Diagnostics pin themselves to a build length via targetCount and size their
  // zones to that, not to the device. Everything else follows pixelCount.
  // targetCount > 0 means the diagnostic is pinned to a build length; 0 or
  // absent means it follows the device.
  const target = mod.targetCount > 0 ? mod.targetCount : pixelCount;
  let litPastTarget = 0, everLit = 0, peak = 0, vSum = 0, vCount = 0;
  const swatches = new Set();

  clockMs = 0;
  let idleFrames = 0, prevSig = null, movedFrames = 0, idleMoved = 0, idleSigFrames = 0;
  for (let f = 0; f < FRAMES; f++) {
    clockMs += DT;
    // "no-stream" deliberately writes NOTHING, leaving the vars frozen at 0 —
    // that is exactly what a closed app looks like to the pattern.
    if (mod.__stream && audio !== "no-stream") {
      const frame = streamFrame(audio, clockMs);
      for (const k of Object.keys(frame))
        if (k in mod.__stream) mod.__stream[k] = frame[k];
    }
    mod.beforeRender?.(DT);
    const nowIdle = !!(mod.__stream && mod.idle);
    if (nowIdle) idleFrames++;

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
      vSum += v; vCount++;
    }

    // Does the picture actually move frame to frame? A frozen strip and a
    // moving one can have identical mean brightness.
    //
    // ⚠️ Movement is tracked SEPARATELY for frames where the idle fallback is
    // engaged. Before the stall timer expires the pattern is still faithfully
    // rendering a stream of zeros, and one with no autonomous component (
    // sparkle) is legitimately dark and still there. Mixing those frames in
    // measures the timer, not the animation.
    const sig = out.reduce((a, px) => a + px[2], 0);
    const moved = prevSig !== null && Math.abs(sig - prevSig) > 1e-6;
    if (moved) movedFrames++;
    if (nowIdle && prevSig !== null) { idleSigFrames++; if (moved) idleMoved++; }
    prevSig = sig;
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

  return {
    peak, swatches: swatches.size, lit: everLit / FRAMES,
    mean: vSum / Math.max(vCount, 1),
    idleFrac: idleFrames / FRAMES,
    movedFrac: movedFrames / FRAMES,
    idleMovedFrac: idleSigFrames ? idleMoved / idleSigFrames : 1,
  };
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

  let mod, streamed;
  try {
    ({ mod, streamed } = await loadPattern(file));
  } catch (e) {
    // The message can embed the whole data: URL, so keep only the first line.
    problems.push(`${dir}: failed to load — ${String(e.message).split("\n")[0].slice(0, 200)}`);
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
  const flips = typeof mod.toggleFlipSweep === "function" ? FLIPS : [0];

  // Only the streamed patterns have an audio dimension to sweep.
  const isAudio = streamed.length > 0;
  const scenarios = isAudio ? AUDIO : ["none"];
  const byScenario = {};

  const peaks = [];
  for (const px of PIXEL_COUNTS)
    for (const mix of MIXES)
      for (const flip of flips)
        for (const build of builds)
          for (const audio of scenarios) {
            const tag = isAudio ? ` audio=${audio}` : "";
            const label = `${dir} @${px}px mix=${mix.label} flip=${flip} build=${buildName[build]}${tag}`;
            // ⚠️ Catch here. A pattern that throws at runtime — a typo'd
            // variable, a bad index — otherwise takes the whole run down with a
            // stack trace and no indication of WHICH pattern did it. Report it
            // as a problem against this pattern and carry on to the next.
            let r;
            try {
              r = exercise(mod, px, mix, flip, build, audio, label, problems);
            } catch (e) {
              problems.push(`${label}: threw during render — ${e.message}`);
              break;
            }
            if (!r) continue;
            if (flip === 0 && mix.label === "defaults") {
              if (px === PIXEL_COUNTS[0] && build === builds[0]) byScenario[audio] = r;
              peaks.push(isAudio
                ? `${px}px ${tag.trim().padEnd(17)} peak ${r.peak.toFixed(2)}  mean ${r.mean.toFixed(3)}  idle ${(r.idleFrac * 100).toFixed(0)}%  moving ${(r.movedFrac * 100).toFixed(0)}%  idle-anim ${(r.idleMovedFrac * 100).toFixed(0)}%`
                : `${px}px ${buildName[build].padEnd(7)} peak ${r.peak.toFixed(2)}  lit ${Math.round(r.lit)}px  ${r.swatches} colours`);
            }
          }

  // ---- streaming assertions -----------------------------------------
  if (isAudio) {
    // ⚠️ The wire contract. setVars matches on NAME, so a pattern that spells a
    // var differently from the app receives nothing and simply never reacts —
    // with no error anywhere. This is the single most likely way for the audio
    // to be "broken" on the bike, and it is invisible without this check.
    const missing = ["bass", "mid", "treble", "level"].filter((n) => !streamed.includes(n));
    if (missing.length)
      problems.push(`${dir}: does not export ${missing.join(", ")} — setVars from the app cannot reach it`);

    const quiet = byScenario["quiet"], music = byScenario["music"];
    const loud = byScenario["loud"], dead = byScenario["no-stream"];

    // Reacts to the stream at all.
    if (quiet && music && Math.abs(music.mean - quiet.mean) < 0.01)
      problems.push(`${dir}: mean brightness barely moves between quiet (${quiet.mean.toFixed(3)}) and music (${music.mean.toFixed(3)}) — the stream is not driving this pattern`);

    // A live-but-quiet stream must NOT be mistaken for a dead one. This is the
    // false-positive side of the stall detector, and getting it wrong means the
    // bike drops to the idle animation every time a track goes quiet.
    if (quiet && quiet.idleFrac > 0.02)
      problems.push(`${dir}: idle engaged for ${(quiet.idleFrac * 100).toFixed(0)}% of a LIVE but quiet stream — the stall detector is firing on quiet audio`);
    if (music && music.idleFrac > 0)
      problems.push(`${dir}: idle engaged during music — the stall detector is firing on live audio`);

    // A dead stream must reach the fallback and keep moving.
    if (dead) {
      if (dead.idleFrac < 0.2)
        problems.push(`${dir}: idle only reached on ${(dead.idleFrac * 100).toFixed(0)}% of frames with no stream at all — the fallback never engaged`);
      if (dead.idleMovedFrac < 0.9)
        problems.push(`${dir}: output static on ${(100 - dead.idleMovedFrac * 100).toFixed(0)}% of frames while idle was ENGAGED — the fallback animation is frozen`);
    }

    // Full scale must not clip to a flat wall of light.
    if (loud && music && loud.mean > 0.98)
      problems.push(`${dir}: mean brightness ${loud.mean.toFixed(3)} at full scale — the pattern saturates instead of keeping structure`);
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
console.log(`\n${checked} pattern(s) OK across ${PIXEL_COUNTS.join("/")} px, ${MIXES.length} zone mixes, all build pins, ${AUDIO.length} stream scenarios, and both flips where a flip toggle exists.`);
