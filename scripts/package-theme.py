#!/usr/bin/env python3
"""Create a minimal, verified Komari theme archive."""
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile
import json
import hashlib

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
RELEASE = ROOT / "release"
MANIFEST = ROOT / "komari-theme.json"
PREVIEW = ROOT / "preview.png"

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
    required = {"komari-theme.json", "preview.png", "dist/index.html"}
    if bad_member or not required.issubset(names):
        archive.unlink(missing_ok=True)
        raise SystemExit(f"Invalid theme package (bad member: {bad_member!r})")
    if any(name.startswith(("src/", "node_modules/")) for name in names):
        archive.unlink(missing_ok=True)
        raise SystemExit("Source files were unexpectedly added to the upload package")
# Publish a Komari-compatible custom catalog alongside the installable ZIP.
repository = "https://github.com/MechanicF/komari-theme-linen"
if metadata.get("url") != repository:
    raise SystemExit("Set the theme source URL before publishing an updatable package")
entry = {key: metadata[key] for key in ("name", "short", "description", "version", "author", "url")}
entry["preview"] = repository.replace("https://github.com/", "https://raw.githubusercontent.com/") + "/main/preview.png"
entry["download"] = repository + f"/releases/download/v{metadata['version']}/{archive.name}"
entry["sha256"] = hashlib.sha256(archive.read_bytes()).hexdigest()
(ROOT / "market.json").write_text(json.dumps({"schema": 1, "themes": [entry]}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"Created and verified {archive.relative_to(ROOT)} ({archive.stat().st_size:,} bytes; {len(names)} files)")
print("Updated market.json with Release URL and archive SHA-256")
