# grub-bike-patterns

Pixelblaze pattern code for the **8-Bit Bunny grub mutant bikes** (Burning Man 2026).
Two cloth-skinned grub bikes, each a Pixelblaze v3 XL + Output Expander driving
8 body stringers (360 px) + 2 eye clusters (32 px).

Planning, gear, wiring, and build schedule live in the Obsidian vault, **not here**:
`~/Develop/burningman/Projects/LED Bikes - Pixelblaze.md`. This repo is *only* the
pattern source so it gets normal per-line git history.

## Layout

```
maps/
  grub-3d.js      # Pixelblaze mapper function — paste into the device Mapper tab
  grub-3d.json    # generated coords for the offline emulator (node tools/gen-map.mjs)
patterns/
  peristalsis/    # signature head->tail wave (starter pattern present)
  breathing/      # whole-body slow brighten/dim
  heartbeat/      # double-pulse from mid-body
  bioluminescence/# cool random twinkle
  eyes/           # blink / glance / glare (16px clusters)
tools/
  gen-map.mjs     # regenerate maps/grub-3d.json from the geometry constants
```

`.epe` files are not committed by hand — they come from backing up a real
Pixelblaze. When hardware lands, pull them with the sync tooling below; the
canonical artifact is the `.epe` (JSON: source + name + id + preview), and the
`.js` is extracted from it so git diffs cleanly.

## Develop with no hardware (now)

Patterns are a subset of JavaScript: `beforeRender(delta)` + `render3D(index, x, y, z)`,
using built-ins like `hsv()`, `time()`, `wave()`, `triangle()`, `clamp()`.

1. Generate the pixel map: `node tools/gen-map.mjs`
2. Open the browser emulator **pb_emu** (pixelblaze-pattern-emulator):
   https://forum.electromage.com/t/pattern-emulator-for-dev-without-hardware/4673
3. Load `maps/grub-3d.json` as the map and a pattern from `patterns/` to render
   it live in 3D. This is enough to dial in the peristalsis wave before any LED
   exists.

The grub body is a genuine 3D shape (8 stringers around a tapering bulge), so
use the 3D map — head->tail math depends on it.

## Sync with hardware (later)

- **pb-sync** — pull/push patterns, extract `.js` from `.epe` for version control:
  https://github.com/brandon-fryslie/pb-sync
- **pixelblaze-client** (Python, WebSocket) — automate push/pull over LAN:
  https://github.com/zranger1/pixelblaze-client
- Example patterns to learn the dialect:
  https://github.com/jvyduna/pb-examples
- Docs: https://electromage.com/docs

## Pixel index layout (must match the Output Expander config)

| Indices | Zone | Output |
|---|---|---|
| 0–359 | 8 body stringers (45 px each, stringer 0 = 0–44) | Expander ch 1–8 |
| 360–391 | 2 eye clusters (16 px each) | Pixelblaze native, ch 0 |

Patterns assume this order. Configure each expander channel's start index to match.
