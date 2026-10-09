#!/usr/bin/env bash
# Trimmed Java runtime for the adapter (PLAN.md section 11, step 2). Works on Linux, macOS and
# Windows (Git Bash). Run from engine-java/ after `mvn package`.
#
#   scripts/jlink-runtime.sh [OUT_DIR]   build the runtime (default target/runtime)
#   scripts/jlink-runtime.sh --check     fail if jdeps needs a module missing from runtime-modules.txt
#
# runtime-modules.txt is the pinned list: the `jdeps --print-module-deps` result for the adapter
# and its LanguageTool JARs, plus jdk.charsets and jdk.localedata (Polish locale data). jdeps
# cannot see reflection/ServiceLoader use, so the runtime is also verified by running the adapter
# (scripts/smoke_test.py --compare-java) against the full JDK.
#
# jvm-options.txt (memory flags, see decision doc 0001 "Memory") is baked into the runtime with
# --add-options, so `runtime/bin/java -jar …` uses them without extra arguments. The build fails
# if the runtime does not report them.
set -euo pipefail
cd "$(dirname "$0")/.."

JAR=$(ls target/ortografi-engine-*.jar | head -n 1)
case "$(uname -s)" in MINGW* | MSYS* | CYGWIN*) SEP=';' ;; *) SEP=':' ;; esac
MODULES=$(grep -v '^\s*$' runtime-modules.txt | tr -d '\r' | paste -sd, -)

if [ "${1:-}" = "--check" ]; then
  CP=$(ls target/lib/*.jar | paste -sd"$SEP" -)
  NEEDED=$(jdeps --ignore-missing-deps --multi-release 21 --print-module-deps --class-path "$CP" "$JAR" | tail -n 1 | tr -d '\r')
  echo "jdeps needs: $NEEDED"
  missing=0
  for m in ${NEEDED//,/ }; do
    if ! grep -qx "$m" <(tr -d '\r' < runtime-modules.txt); then echo "MISSING from runtime-modules.txt: $m"; missing=1; fi
  done
  exit $missing
fi

OUT="${1:-target/runtime}"
OPTIONS=$(grep -v '^\s*$' jvm-options.txt | tr -d '\r' | paste -sd' ' -)
rm -rf "$OUT"
jlink --add-modules "$MODULES" --include-locales=en,pl --add-options="$OPTIONS" \
  --strip-debug --no-man-pages --no-header-files --compress=zip-6 --output "$OUT"
FLAGS=$("$OUT/bin/java" -XX:+PrintFlagsFinal -version 2>/dev/null | tr -d '\r')
# Bash matching, not `echo | grep -q`: with pipefail, grep -q's early exit fails the pipe.
[[ "$FLAGS" =~ MaxHeapSize[[:space:]]+=[[:space:]]+134217728[[:space:]] ]] || { echo "runtime does not apply -Xmx128m"; exit 1; }
[[ "$FLAGS" =~ UseSerialGC[[:space:]]+=[[:space:]]+true[[:space:]] ]] || { echo "runtime does not apply SerialGC"; exit 1; }
echo "runtime: $OUT ($MODULES) options: $OPTIONS"
