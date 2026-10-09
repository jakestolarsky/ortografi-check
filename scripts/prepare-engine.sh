#!/usr/bin/env bash
# Builds the Java engine and stages it as a Tauri resource (PLAN.md sections 11-12):
#
#   src-tauri/resources/engine/
#     runtime/                 jlink-trimmed Java runtime for THIS OS/arch (JVM flags built in)
#     ortografi-engine.jar     adapter (manifest Class-Path: lib/*.jar)
#     lib/*.jar                LanguageTool + dependencies (kept as separate JARs, LGPL)
#     engine-manifest.json     adapter/LanguageTool/runtime versions + sha256 per file
#                              (written by engine-java/scripts/jlink-runtime.sh; required)
#
# Needs JDK 21 (jlink, jdeps) and Maven on PATH. Runs `mvn package` without tests (the engine
# workflow runs them). Linux, macOS, Windows (Git Bash). Run via `pnpm prepare-engine`; it is
# also part of tauri.conf.json beforeBuildCommand.
#
#   scripts/prepare-engine.sh            build + stage
#   scripts/prepare-engine.sh --if-missing   skip when a staged engine is already present
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/src-tauri/resources/engine"
case "$(uname -s)" in MINGW* | MSYS* | CYGWIN*) JAVA_EXE=java.exe ;; *) JAVA_EXE=java ;; esac

if [ "${1:-}" = "--if-missing" ] && [ -f "$DEST/ortografi-engine.jar" ] && [ -f "$DEST/runtime/bin/$JAVA_EXE" ] \
  && [ -f "$DEST/engine-manifest.json" ]; then
  echo "prepare-engine: already staged in $DEST"
  exit 0
fi

cd "$ROOT/engine-java"
# Remove stale dependency JARs first: `package` adds to target/lib but never deletes, so JARs
# dropped from the pom (e.g. by the #21 trim) would otherwise still be staged.
rm -rf target/lib
mvn -B -ntp -q package -DskipTests
JAR=$(ls target/ortografi-engine-*.jar | head -n 1)

# Keep the placeholder; replace everything else.
find "$DEST" -mindepth 1 ! -name .gitkeep -exec rm -rf {} + 2>/dev/null || true
mkdir -p "$DEST/lib"
# Build into target/runtime: only that output also writes target/engine-manifest.json, so the
# manifest describes exactly the runtime that is staged.
rm -f target/engine-manifest.json
scripts/jlink-runtime.sh
if [ ! -f target/engine-manifest.json ]; then
  echo "prepare-engine: ERROR: engine-java/target/engine-manifest.json is missing." >&2
  echo "  engine-java/scripts/jlink-runtime.sh should write it (engine-java/README.md, 'Engine manifest')." >&2
  echo "  Refusing to stage an engine without a manifest." >&2
  exit 1
fi
cp -R target/runtime "$DEST/runtime"
cp "$JAR" "$DEST/ortografi-engine.jar"
cp target/lib/*.jar "$DEST/lib/"
cp target/engine-manifest.json "$DEST/engine-manifest.json"
# jlink leaves legal/ files read-only; tauri-build's resource copy then fails on the next
# build ("Permission denied") when it overwrites them.
chmod -R u+w "$DEST"

# Sanity: the staged runtime starts the staged JAR and reports ready.
READY=$(printf '{"protocol":1,"type":"shutdown"}\n' | "$DEST/runtime/bin/$JAVA_EXE" -jar "$DEST/ortografi-engine.jar" 2>/dev/null | head -n 1)
case "$READY" in *'"type":"ready"'*) ;; *) echo "prepare-engine: staged engine did not send ready: $READY"; exit 1 ;; esac

du -sh "$DEST" "$DEST/runtime" "$DEST/lib" 2>/dev/null || true
echo "prepare-engine: staged $(basename "$JAR") into $DEST"
