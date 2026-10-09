#!/usr/bin/env bash
# Builds the Java engine and stages it as a Tauri resource (PLAN.md sections 11-12):
#
#   src-tauri/resources/engine/
#     runtime/                 jlink-trimmed Java runtime for THIS OS/arch (JVM flags built in)
#     ortografi-engine.jar     adapter (manifest Class-Path: lib/*.jar)
#     lib/*.jar                LanguageTool + dependencies (kept as separate JARs, LGPL)
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

if [ "${1:-}" = "--if-missing" ] && [ -f "$DEST/ortografi-engine.jar" ] && [ -f "$DEST/runtime/bin/$JAVA_EXE" ]; then
  echo "prepare-engine: already staged in $DEST"
  exit 0
fi

cd "$ROOT/engine-java"
mvn -B -ntp -q package -DskipTests
JAR=target/ortografi-engine.jar

# Keep the placeholder; replace everything else.
find "$DEST" -mindepth 1 ! -name .gitkeep -exec rm -rf {} + 2>/dev/null || true
mkdir -p "$DEST/lib"
scripts/jlink-runtime.sh "$DEST/runtime"
cp "$JAR" "$DEST/ortografi-engine.jar"
cp target/lib/*.jar "$DEST/lib/"

# Sanity: the staged runtime starts the staged JAR and reports ready.
READY=$(printf '{"protocol":1,"type":"shutdown"}\n' | "$DEST/runtime/bin/$JAVA_EXE" -jar "$DEST/ortografi-engine.jar" 2>/dev/null | head -n 1)
case "$READY" in *'"type":"ready"'*) ;; *) echo "prepare-engine: staged engine did not send ready: $READY"; exit 1 ;; esac

du -sh "$DEST" "$DEST/runtime" "$DEST/lib" 2>/dev/null || true
echo "prepare-engine: staged $(basename "$JAR") into $DEST"
