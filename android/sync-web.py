#!/usr/bin/env python3
"""Copy the exact PWA files into the Android APK assets (or verify the snapshot)."""

from pathlib import Path
import argparse
import sys

repo = Path(__file__).resolve().parent.parent
target = repo / "android/app/src/main/assets/www"
icon = repo / "android/app/src/main/res/drawable-nodpi/launcher.png"
files = ["index.html", "style.css", "app.js", "rates.js", "quotes.js",
         "currencies.js", "i18n.js", "sw.js", "manifest.json", "icon.svg",
         "icon-192.png", "icon-512.png"]
files += [str(file.relative_to(repo)) for file in sorted((repo / "locales").glob("*.js"))]

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--check", action="store_true", help="fail if assets differ from the PWA")
args = parser.parse_args()

stale = []
for source_name, destination in [(name, target / name) for name in files] + [
    ("icon-192.png", icon)
]:
    original = (repo / source_name).read_bytes()
    if args.check:
        if not destination.exists() or destination.read_bytes() != original:
            stale.append(str(destination.relative_to(repo)))
    else:
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(original)

if stale:
    print("Android assets differ from web source:\n" + "\n".join(stale), file=sys.stderr)
    sys.exit(1)
print("Android web assets match the repository PWA." if args.check else "Android web assets updated.")
