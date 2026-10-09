#!/usr/bin/env sh
# Phase-0 trimmed runtime for the adapter (PLAN.md section 11, step 2). Module list from
#   jdeps --ignore-missing-deps --multi-release 21 --print-module-deps \
#     --class-path "engine-java/target/lib/*" engine-java/target/ortografi-engine-0.0.1-phase0.jar
# plus jdk.charsets/jdk.localedata (pl locale). Verified only against the TEMPORARY sample;
# reflection/service-loaded modules must still be checked against the full corpus.
set -eu
OUT="${1:-build/jre}"
jlink --add-modules java.base,java.compiler,java.desktop,java.naming,java.scripting,java.sql,jdk.management,jdk.unsupported,jdk.charsets,jdk.localedata \
  --include-locales=en,pl --strip-debug --no-man-pages --no-header-files --compress=zip-6 --output "$OUT"
