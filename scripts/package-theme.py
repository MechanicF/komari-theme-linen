#!/usr/bin/env python3
"""Create a minimal, verified Komari theme archive."""
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile
import json

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
RELEASE = ROOT / "release"
MANIFEST = ROOT / "komari-theme.json"
PREVIEW = ROOT / "preview.svg"

if not DIST.is_dir() or not (DIST / "index.html").is_file():
    raise SystemExit("Build dist/ first with npm run build")
metadata = json.loads(MANIFEST.read_text(encoding="utf-8"))
if metadata.get("short") != "Linen" or not metadata.get("configuration", {}).get("data"):
    raise SystemExit("Linen theme manifest or managed settings are missing")
if not PREVIEW.is_file():
    raise SystemExit("Theme preview is missing")

archive = RELEASE / f"komari-theme-linen-{metadata['version']}.zip"
RELEASE.mkdir(parents=True, exist_ok=True)
files = [MANIFEST, PREVIEW, *sorted(path for path in DIST.rglob("*") if path.is_file())]
with ZipFile(archive, "w", compression=ZIP_DEFLATED, compresslevel=9) as bundle:
    for path in files:
        bundle.write(path, path.relative_to(ROOT).as_posix())

with ZipFile(archive) as bundle:
    bad_member = bundle.testzip()
    names = set(bundle.namelist())
    required = {"komari-theme.json", "preview.svg", "dist/index.html"}
    if bad_member or not required.issubset(names):
        archive.unlink(missing_ok=True)
        raise SystemExit(f"Invalid theme package (bad member: {bad_member!r})")
    if any(name.startswith(("src/", "node_modules/")) for name in names):
        archive.unlink(missing_ok=True)
        raise SystemExit("Source files were unexpectedly added to the upload package")
print(f"Created and verified {archive.relative_to(ROOT)} ({archive.stat().st_size:,} bytes; {len(names)} files)")
