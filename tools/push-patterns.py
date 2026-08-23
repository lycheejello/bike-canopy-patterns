#!/usr/bin/env python3
"""push-patterns.py — compile + push this repo's patterns to a Pixelblaze.

The Pixelblaze compiles patterns in its web editor; this does the same over the
network via pixelblaze-client, which fetches the device's own compiler, compiles
each source, and saves it to flash. Use it to flash a fresh Pixelblaze (bike 2,
spare) without pasting every pattern by hand.

Patterns land on the device with a "0_" prefix — `breathe` becomes `0_breathe` —
so this repo's patterns sort to the top of the device's pattern list, above
whatever else is on it. Repo directories stay unprefixed.

OVERWRITE BEHAVIOUR. This replaces what is on the device rather than piling up
duplicates:
  * a pattern already named `0_<name>` is saved back onto ITS OWN id, so the id,
    playlist entries and UI slider positions survive
  * legacy copies of the SAME pattern under an older name (`breathe`,
    `split-test-150`, ...) are deleted
  * ⚠️ nothing else on the device is touched. Patterns this repo does not know
    about are never deleted.
Pass --no-clean to keep the legacy copies.

No pixel map is pushed — the build is a single strip on the native output, split
by index. See docs/layout.md.

The device's own LED count is what selects the 150 px or 300 px build, and this
tool does not touch it. Set it in the Pixelblaze web UI (Settings -> LED count).

Usage (always via the repo venv):
    .venv/bin/python tools/push-patterns.py --ip 192.168.4.1     # AP mode: laptop on the PB's wifi
    .venv/bin/python tools/push-patterns.py --ip 192.168.1.42    # client mode: its LAN IP (discover.electromage.com)
    .venv/bin/python tools/push-patterns.py                       # auto-discover on the LAN
    .venv/bin/python tools/push-patterns.py --activate split-test
    .venv/bin/python tools/push-patterns.py --dry-run             # show the plan, touch nothing

Setup once (must be Apple's python — see README):
    /usr/bin/python3 -m venv --symlinks .venv && .venv/bin/pip install pixelblaze-client
"""
import argparse
import base64
import json
import sys
from pathlib import Path

from pixelblaze import Pixelblaze

REPO = Path(__file__).resolve().parent.parent

# The repo directory name IS the device-side pattern name, prefix included:
# patterns/0_breathe/ -> "0_breathe" on the device. Prefixes order the list in
# the Pixelblaze UI (0_ = the main set, 1_ = audio-reactive), and
# keeping them in the directory name means what you see in the repo is what is on
# the device, with no naming rule hidden in this script.
PREFIX = ""

# Older device-side names for the same patterns, cleaned up on push so the list
# does not accumulate duplicates every time something is renamed. Keyed by the
# repo directory name. The unprefixed name is added automatically.
LEGACY_NAMES = {
    "0_split-test": ["split-test-150", "split-test-300", "split-test"],
    "0_breathe": ["breathe"],
    "0_beacon": ["beacon"],
    "0_drift": ["drift"],
    # Prefix convention: 0_ is the main set, 1_ is the audio-reactive lane.
    # ⚠️ The 1_ patterns are being worked on separately — do not fold them into
    # 0_ just because the ports currently run from internal oscillators.
    "0_twinkle-bounce": ["1_twinkle-bounce", "0_composite"],
}


def canon(device_name):
    """Normalise a device-side pattern name for matching.

    The Pixelblaze web editor happily saves `0_Beacon` where this tool writes
    `0_beacon`, and an exact-match lookup then creates a twin instead of
    overwriting. Fold case and drop the prefix so both map to `beacon`.
    """
    n = device_name.strip()
    if n.lower().startswith(PREFIX.lower()):
        n = n[len(PREFIX):]
    return n.lower()

# Minimal valid 1x1 JPEG — the UI thumbnail. Patterns run fine without a real
# preview; this just keeps the Web UI from choking on an empty image.
PLACEHOLDER_JPEG = base64.b64decode(
    "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRof"
    "Hh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAAB"
    "AAAAAAAAAAAAAAAAAAAACP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AfwD/2Q=="
)


def load_controls(pattern_dir):
    """Slider positions checked into the repo for this pattern, or None."""
    f = pattern_dir / "controls.json"
    if not f.exists():
        return None
    return json.loads(f.read_text())


def apply_controls(pb, pid, name, controls):
    """Write slider positions for one pattern.

    ⚠️ setActiveControls only ever targets the ACTIVE pattern, so each one has to
    be made active in turn. This matters more than it looks: a stored slider
    position always beats the `export var` initialiser in the source, so a
    pattern pushed WITHOUT its controls inherits whatever the device had in that
    slot — which on a fresh save can be uninitialised garbage (1e+22, 3.9e-38).
    That is what makes a freshly-flashed second device render nothing.
    """
    pb.setActivePattern(pid, saveToFlash=False)
    pb.setActiveControls(controls, saveToFlash=True)


def discover(want_name=None):
    """Find a Pixelblaze on the LAN.

    Devices are identified by their DEVICE NAME (Settings -> Name), not by IP:
    IPs come from DHCP and swap between the two bikes on any lease renewal, so
    pinning a bike to an address is a trap. Pass --name to target one.
    """
    print("discovering Pixelblazes on the LAN (3s)…")
    found = []
    try:
        for dev in Pixelblaze.EnumerateDevices(timeout=3000):
            ip = getattr(dev, "ipAddress", None) or str(dev)
            # ⚠️ Close it. A Pixelblaze accepts ONE websocket at a time, so a
            # probe left open here makes the real connection below fail.
            name = "?"
            probe = None
            try:
                probe = Pixelblaze(ip)
                name = probe.getDeviceName()
            except Exception:
                pass
            finally:
                # ⚠️ The method is _close(), not close(). This was written as
                # probe.close() inside a bare except, so every probe silently
                # stayed open and the real connection below then failed with
                # "connection lost" — a Pixelblaze accepts one websocket at a time.
                if probe is not None:
                    try: probe._close()
                    except Exception: pass
            found.append((name, ip))
            print(f"  found: {name}  @ {ip}")
    except Exception as e:
        print(f"  discovery failed: {e}")

    if not found:
        return None
    if want_name:
        for name, ip in found:
            if name and name.lower() == want_name.lower():
                return ip
        print(f"  ! no device named {want_name!r} — seen: {[n for n, _ in found]}")
        return None
    if len(found) > 1:
        print(f"  ! {len(found)} devices on the LAN; pass --name to pick one "
              f"({', '.join(n for n, _ in found)})")
        return None
    return found[0][1]


def main():
    ap = argparse.ArgumentParser(description="Push this repo's patterns to a Pixelblaze.")
    ap.add_argument("--ip", help="Pixelblaze IP (e.g. 192.168.4.1 in AP mode). Omit to auto-discover.")
    ap.add_argument("--name", help="target the Pixelblaze with this device name (Settings -> Name)")
    ap.add_argument("--activate", default="0_breathe",
                    help="pattern to set active after push, exactly as named ('' to skip)")
    ap.add_argument("--no-clean", action="store_true",
                    help="keep legacy/unprefixed copies of these patterns on the device")
    ap.add_argument("--dry-run", action="store_true",
                    help="print what would happen; connect but change nothing")
    ap.add_argument("--save-controls", action="store_true",
                    help="read slider positions OFF the device into the repo, then exit")
    ap.add_argument("--no-controls", action="store_true",
                    help="push source only; leave slider positions on the device alone")
    args = ap.parse_args()

    dirs = sorted(d for d in (REPO / "patterns").iterdir() if d.is_dir())
    paths = []
    for d in dirs:
        js = sorted(d.glob("*.js"))
        if len(js) != 1:
            print(f"  ! {d.name}: {len(js)} .js files, expected 1 — skipped")
            continue
        paths.append(js[0])
    if not paths:
        sys.exit("no patterns found under patterns/*/*.js")

    ip = args.ip or discover(args.name)
    if not ip:
        sys.exit("no Pixelblaze found — pass --ip <addr> (192.168.4.1 if you're on its wifi), "
                 "or --name to pick between several.")

    print(f"connecting to {ip} …")
    pb = Pixelblaze(ip)

    # Say plainly which device this is before writing to it. chipId is the
    # immutable hardware serial; the name is what you set and what --name matches.
    #
    # ⚠️ Report the EXPANDER channel, not the top-level colorOrder. The strip runs
    # off the Output Expander, so the native-output setting in config is unused —
    # reading it reports a colour order that has no effect on anything.
    try:
        cfg = pb.getConfigSettings()
        chans = []
        for row in (pb.getConfigExpander().get("expanders") or [{}])[0].get("rows", {}).values():
            for ch in row:
                if ch.get("count", 0) > 0:
                    chans.append(f"ch{ch['channel']} {ch['count']}px {ch['options']}")
        print(f"  device: {pb.getDeviceName()!r}  chipId {cfg.get('chipId')}  "
              f"{cfg.get('pixelCount')} px  expander: {', '.join(chans) or 'none'}")
    except Exception as e:
        print(f"  (couldn't read device identity: {e})")

    # --save-controls: capture the look you dialled in on this device, so the
    # repo carries it and the next device comes up identical.
    if args.save_controls:
        live = {n: i for i, n in pb.getPatternList(True).items()}
        saved = 0
        for path in paths:
            name = path.parent.name
            pid = live.get(name)
            if not pid:
                print(f"  · {name:16} not on this device, skipped")
                continue
            got = pb.getPatternControls(pid) or {}
            ctl = got.get("controls", {}).get(pid, got.get(pid, got))
            if not isinstance(ctl, dict) or not ctl:
                print(f"  · {name:16} no controls stored")
                continue
            out = {k: v for k, v in sorted(ctl.items())}
            (path.parent / "controls.json").write_text(json.dumps(out, indent=2) + "\n")
            print(f"  ✓ {name:16} saved {len(out)} control(s)")
            saved += 1
        print(f"done — {saved} controls.json written.")
        return

    # Everything currently on the device, grouped by normalised name so case
    # variants and prefix variants of the same pattern collapse together.
    device = pb.getPatternList(True)
    by_canon = {}
    for pid, name in device.items():
        by_canon.setdefault(canon(name), []).append((name, pid))
    print(f"device has {len(device)} pattern(s)")

    ok = 0
    keep_ids = set()
    for path in paths:
        name = path.parent.name          # directory name = device pattern name
        source = path.read_text()

        # Overwrite whichever existing entry matches, preferring an exact name
        # hit so a correctly-named pattern keeps its id.
        matches = by_canon.get(canon(name), [])
        pid = None
        for dname, dpid in matches:
            if dname == name:
                pid = dpid
                break
        if pid is None and matches:
            pid = matches[0][1]

        if args.dry_run:
            was = next((d for d, i in matches if i == pid), None)
            print(f"  · {name:16} {'overwrite ' + repr(was) + ' id ' + pid if pid else 'create'}")
            # Mark it kept here too, or the cleanup plan below lists the very
            # pattern this run would have written.
            if pid:
                keep_ids.add(pid)
            ok += 1
            continue
        try:
            newid = pb.savePattern(previewImage=PLACEHOLDER_JPEG, sourceCode=source,
                                   name=name, id=pid, allowCache=True)
            print(f"  ✓ {name:16} {'overwrote' if pid else 'created'} (id {newid or pid})")
            keep_ids.add(newid or pid)
            ok += 1
        except Exception as e:
            print(f"  ✗ {name:16} FAILED: {e}")

    # Remove older copies of OUR patterns only. Anything this repo does not know
    # about is left alone.
    if not args.no_clean:
        stale = []
        for path in paths:
            stem = path.parent.name
            for key in [canon(stem)] + [canon(x) for x in LEGACY_NAMES.get(stem, [])]:
                for dname, dpid in by_canon.get(key, []):
                    # Only ever a different copy of a pattern we just wrote.
                    if dpid not in keep_ids and (dname, dpid) not in stale:
                        stale.append((dname, dpid))
        for old, pid in stale:
            if args.dry_run:
                print(f"  · delete stale {old!r} (id {pid})")
                continue
            try:
                pb.deletePattern(pid)
                print(f"  🗑 deleted stale {old!r} (id {pid})")
            except Exception as e:
                print(f"  ! couldn't delete {old!r}: {e}")
        if not stale:
            print("  (no stale copies to clean up)")

    # Slider positions, after every source push so the ids are settled.
    if not args.no_controls and not args.dry_run:
        live = {n: i for i, n in pb.getPatternList(True).items()}
        for path in paths:
            name = path.parent.name
            controls = load_controls(path.parent)
            if not controls or name not in live:
                continue
            try:
                apply_controls(pb, live[name], name, controls)
                print(f"  🎛 {name:16} {len(controls)} control(s) applied")
            except Exception as e:
                print(f"  ! {name:16} controls FAILED: {e}")
    elif args.dry_run:
        for path in paths:
            c = load_controls(path.parent)
            if c:
                print(f"  · {path.parent.name:16} would apply {len(c)} control(s)")

    if args.activate:
        target = args.activate
        if args.dry_run:
            print(f"  · would activate {target}")
        else:
            try:
                pb.setActivePatternByName(target, saveToFlash=True)
                print(f"  ▶ active pattern: {target}")
            except Exception as e:
                print(f"  ! couldn't activate {target}: {e}")

    print(f"done — {ok}/{len(paths)} patterns {'planned' if args.dry_run else 'pushed'}.")


if __name__ == "__main__":
    main()
