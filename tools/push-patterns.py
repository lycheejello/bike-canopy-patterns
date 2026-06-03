#!/usr/bin/env python3
"""push-patterns.py — compile + push the grub patterns and pixel map to a Pixelblaze.

The Pixelblaze compiles patterns in its web editor; this does the same over the
network via pixelblaze-client (which fetches the device's own compiler, compiles
each pattern/source, and saves it). Use it to flash a fresh Pixelblaze (bike 2,
spare) without pasting every pattern by hand.

Usage (always via the repo venv):
    .venv/bin/python tools/push-patterns.py --ip 192.168.4.1     # AP mode: laptop on the PB's wifi
    .venv/bin/python tools/push-patterns.py --ip 192.168.1.42    # client mode: its LAN IP (discover.electromage.com)
    .venv/bin/python tools/push-patterns.py                       # auto-discover on the LAN
    .venv/bin/python tools/push-patterns.py --no-map --activate breathing

Setup once:
    python3.13 -m venv .venv && .venv/bin/pip install pixelblaze-client
"""
import argparse
import base64
import glob
import sys
from pathlib import Path

from pixelblaze import Pixelblaze

REPO = Path(__file__).resolve().parent.parent

# Minimal valid 1x1 JPEG — the UI thumbnail. Patterns run fine without a real
# preview; this just keeps the Web UI from choking on an empty image.
PLACEHOLDER_JPEG = base64.b64decode(
    "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRof"
    "Hh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAAB"
    "AAAAAAAAAAAAAAAAAAAACP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AfwD/2Q=="
)


def discover():
    """Return the IP of the first Pixelblaze found on the LAN, or None."""
    print("discovering Pixelblazes on the LAN (2.5s)…")
    try:
        for dev in Pixelblaze.EnumerateDevices(timeout=2500):
            ip = getattr(dev, "ipAddress", None) or str(dev)
            print(f"  found: {ip}")
            return ip
    except Exception as e:
        print(f"  discovery failed: {e}")
    return None


def main():
    ap = argparse.ArgumentParser(description="Push grub patterns + map to a Pixelblaze.")
    ap.add_argument("--ip", help="Pixelblaze IP (e.g. 192.168.4.1 in AP mode). Omit to auto-discover.")
    ap.add_argument("--activate", default="peristalsis", help="pattern to set active after push ('' to skip)")
    ap.add_argument("--no-map", action="store_true", help="don't push the pixel map")
    args = ap.parse_args()

    patterns = sorted(glob.glob(str(REPO / "patterns" / "*" / "*.js")))
    if not patterns:
        sys.exit("no patterns found under patterns/*/*.js")

    ip = args.ip or discover()
    if not ip:
        sys.exit("no Pixelblaze found — pass --ip <addr> (192.168.4.1 if you're on its wifi).")

    print(f"connecting to {ip} …")
    pb = Pixelblaze(ip)

    ok = 0
    for path in patterns:
        name = Path(path).stem
        source = Path(path).read_text()
        try:
            pid = pb.savePattern(previewImage=PLACEHOLDER_JPEG, sourceCode=source, name=name, allowCache=True)
            print(f"  ✓ {name:16} (id {pid})")
            ok += 1
        except Exception as e:
            print(f"  ✗ {name:16} FAILED: {e}")

    if not args.no_map:
        mapf = REPO / "maps" / "grub-3d.js"
        if mapf.exists():
            try:
                pb.setMapFunction(mapf.read_text())
                print(f"  ✓ map: {mapf.name}")
            except Exception as e:
                print(f"  ✗ map FAILED: {e}")
        else:
            print(f"  ! no map at {mapf}")

    if args.activate:
        try:
            pb.setActivePatternByName(args.activate, saveToFlash=True)
            print(f"  ▶ active pattern: {args.activate}")
        except Exception as e:
            print(f"  ! couldn't activate {args.activate}: {e}")

    print(f"done — {ok}/{len(patterns)} patterns pushed.")


if __name__ == "__main__":
    main()
