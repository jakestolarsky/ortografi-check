#!/usr/bin/env bash
# Linux AppImage with the bundled engine (BUILDING.md "Linux AppImage").
#
# linuxdeploy (run by `tauri build --bundles appimage`) scans every ELF file in the AppDir. The
# jlink runtime is self-contained, so that scan is wrong for it twice over: it stops on
# `libjvm.so` (in runtime/lib/server, not on any search path), and it rewrites the runtime's
# rpaths, which breaks the sha256 sums in engine-manifest.json. So:
#
#   1. tauri build with LINUXDEPLOY_EXCLUDED_LIBRARIES for the JVM libraries (lets linuxdeploy
#      finish; the GTK/WebKit deployment is unchanged);
#   2. replace usr/lib/Ortografi/engine in the AppDir with the untouched staged engine;
#   3. check every file against engine-manifest.json;
#   4. repack the AppDir with linuxdeploy-plugin-appimage (appimagetool), the same tool Tauri uses.
#
# Needs what `pnpm tauri build` needs on Linux plus dpkg-dev (the GTK plugin calls
# dpkg-architecture). APPIMAGE_EXTRACT_AND_RUN=1 makes it work without FUSE (containers, CI).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export APPIMAGE_EXTRACT_AND_RUN=1
export LINUXDEPLOY_EXCLUDED_LIBRARIES="libjvm.so*;libjli.so*;libjava.so*"

#   scripts/build-appimage.sh                build + repack
#   scripts/build-appimage.sh --repack-only  only steps 2-4 on an existing AppDir
[ "${1:-}" = "--repack-only" ] || pnpm tauri build --bundles appimage

OUTDIR="$ROOT/src-tauri/target/release/bundle/appimage"
APPDIR="$OUTDIR/Ortografi.AppDir"
ENGINE="$APPDIR/usr/lib/Ortografi/engine"
STAGED="$ROOT/src-tauri/resources/engine"
[ -d "$ENGINE" ] || { echo "build-appimage: no engine in $ENGINE" >&2; exit 1; }

rm -rf "$ENGINE"
cp -a "$STAGED" "$ENGINE"
rm -f "$ENGINE/.gitkeep"
(cd "$ENGINE" && python3 - <<'PY'
import hashlib, json, sys
man = json.load(open("engine-manifest.json"))
m = man["sha256"]
# Until engine PR #23 the manifest names the JAR ortografi-engine-<v>.jar; it is staged as
# ortografi-engine.jar either way.
path = lambda k: "ortografi-engine.jar" if k == man["adapter"]["jar"] else k
bad = [k for k, v in m.items() if hashlib.sha256(open(path(k), "rb").read()).hexdigest() != v]
if bad:
    sys.exit("build-appimage: files differ from engine-manifest.json: " + ", ".join(bad[:10]))
print(f"build-appimage: {len(m)} engine files match engine-manifest.json")
PY
)

PLUGIN="${TAURI_CACHE:-$HOME/.cache/tauri}/linuxdeploy-plugin-appimage.AppImage"
[ -x "$PLUGIN" ] || { echo "build-appimage: $PLUGIN not found (tauri build downloads it)" >&2; exit 1; }
OUT=$(ls "$OUTDIR"/*.AppImage | head -n 1)
rm -f "$OUT"
(cd "$OUTDIR" && LDAI_OUTPUT="$(basename "$OUT")" OUTPUT="$(basename "$OUT")" ARCH=x86_64 "$PLUGIN" --appdir "$APPDIR")
[ -f "$OUT" ] || { echo "build-appimage: repack did not produce $OUT" >&2; exit 1; }
echo "build-appimage: $OUT ($(stat -c %s "$OUT") bytes)"
