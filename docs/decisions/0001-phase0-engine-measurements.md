# 0001 — Phase 0: LanguageTool PL engine, stdin/stdout adapter vs official HTTP server

Status: **adapter is the leading option**, pending macOS/Windows *timing* runs on reference hardware
(not yet a final decision). Linux x64 only, TEMPORARY sample, shared
cloud VM. macOS/Windows, the quality corpus and the 30-launch protocol on reference hardware
are still to come (PLAN.md sections 2, 11, 15).

## Setup

| Item | Value |
|---|---|
| Date | 2026-10-09 19:35 CEST |
| Machine | Shared cloud VM, "Intel(R) Xeon(R) Processor", 8 vCPU, 16 GB RAM (other workloads running → noisy), Debian 13, kernel 6.12 |
| Java | Temurin 21.0.12.1+1 (full JDK for timings; jlinked runtime checked separately) |
| Engine | `org.languagetool:language-pl:6.8` (+ `languagetool-core:6.8`) from Maven Central |
| Adapter | `engine-java/` — JSON lines over stdin/stdout, one `JLanguageTool` instance |
| HTTP reference | Official `org.languagetool.server.HTTPServer` from `languagetool-server:6.8`. No 6.8 ZIP exists on languagetool.org (latest listed ZIP is 6.6; `LanguageTool-stable.zip` is dated 2025-03-27), so the server is assembled from Maven Central (`benchmarks/http-server-6.8/`). |
| HTTP "minimal" | `language-all` excluded, `language-pl` added. **The server cannot start with PL alone**: its static `CommonWordsDetector` hard-requires the `es`, `ca` and `pt` modules (`ExceptionInInitializerError` otherwise), so those three extra languages are bundled too. |
| HTTP "full" | `languagetool-server:6.8` as published (pulls `language-all`) |
| Sample | `benchmarks/sample-temporary/` — **TEMPORARY**, unannotated; 1,089 and 10,453 UTF-16 units |
| Harness | `benchmarks/bench.py` (raw data: `benchmarks/results/phase0-linux-x64.json`) |

Method: cold = 30 fresh processes each. "Ready" = adapter `ready` line / first HTTP 200 on
`/v2/languages`. "First result" = spawn → first check of the 1k text returned (LanguageTool
loads rules lazily, so this is the honest "engine usable" number). Warm = same process,
10 warm-up checks, then 30 timed checks, client-side round trip (JSON or HTTP included);
each request gets a unique trailing sentence so no cache can answer it. RSS/HWM from
`/proc/<pid>/status` after the warm runs. Default JVM flags unless stated.

## Results (ms are p50 / p95; memory in MiB)

| Option | JVM flags | Cold "ready" | Cold first result (1k) | Warm 1k | Warm 10k | RSS after warm (peak) |
|---|---|---|---|---|---|---|
| **Adapter** | default | 1080 / 1284 | **2004 / 2375** | **37 / 40** | **309 / 342** | 457 (458) |
| HTTP minimal | default | 709 / 764 | 2332 / 2416 | 142 / 172 | 423 / 469 | 662 (662) |
| HTTP full | default | 1187 / 1292 | 2836 / 3010 | 149 / 180 | 446 / 506 | 583 (585) |
| **Adapter** | `-Xmx256m -XX:+UseSerialGC` | 1122 / 1277 | 1994 / 2274 | **32 / 38** | **268 / 289** | **268 (270)** |
| Adapter | `-Xmx256m -XX:+UseSerialGC -XX:TieredStopAtLevel=1` | 1030 / 1224 | 2044 / 2263 | 55 / 57 | 491 / 524 | 201 (201) |
| HTTP minimal | `-Xmx256m -XX:+UseSerialGC` | 719 / 781 | 2320 / 2504 | 164 / 197 | 424 / 545 | 397 (400) |

Result parity: on both texts all options returned **identical issue lists** (same UTF-16
start/end and rule IDs; 6 issues on 1k, 49 on 10k).

### 50k-unit texts (added 2026-10-09 20:30 CEST)

`benchmarks/sample-temporary/pl-50k.txt` (49,357 UTF-16 units, TEMPORARY). Same VM and JDK as
above; the adapter now includes the NFC layer (the sample is already NFC, so it costs only an
`isNormalized` scan). Cold = 15 fresh processes, spawn → first 50k result. Warm = 5 warm-up
+ 30 timed checks. `bench.py --50k`; raw data under `results_50k` in the results JSON.

| Option | JVM flags | Cold first result (50k) | Warm 50k | RSS after warm (peak) |
|---|---|---|---|---|
| **Adapter** | default | 3947 / 4145 | **1423 / 1539** | 551 (559) |
| **Adapter** | `-Xmx256m -XX:+UseSerialGC` | **3714 / 3905** | **1321 / 1410** | **379 (379)** |
| HTTP minimal | default | 4326 / 4603 | 1598 / 1718 | 656 (656) |
| HTTP minimal | `-Xmx256m -XX:+UseSerialGC` | 4149 / 4262 | 1476 / 1586 | 403 (405) |
| HTTP full | default | 4827 / 5062 | 1617 / 1740 | 753 (753) |

- All options returned the same 231 issues (identical ranges and rule IDs).
- PLAN.md section 11 goal "50,000 units p95 < 3 s": met by every option on this VM (adapter
  p95 1.41–1.54 s). With a 50k text the fixed HTTP overhead matters less (adapter ~10 % faster).
- `-Xmx256m` ran 50k texts without OutOfMemoryError, but the adapter's peak RSS rises to
  379 MiB (268 MiB at 10k). Java alone is above the 350 MiB whole-app goal at 50k, so heap and
  GC tuning (or a lower 50k limit) is still an open item.

### Size

| Payload | Installed | tar.gz |
|---|---|---|
| Adapter: our JAR (11 KB) + 86 runtime JARs | 51.5 MiB | 47.9 MiB |
| HTTP minimal: 119 JARs | 84.7 MiB | 79.6 MiB |
| HTTP full (as published): 172 JARs | 250.8 MiB | 243.7 MiB |
| Full Temurin 21 JDK (for reference) | 346 MiB | — |
| jlinked runtime for the adapter (`engine-java/scripts/jlink-runtime.sh`) | 60.4 MiB | 37.0 MiB |
| **Adapter bundle: jlinked runtime + JARs** | **112.0 MiB** | **85.0 MiB** |

The runtime is built by `engine-java/scripts/jlink-runtime.sh` from the pinned module list
`engine-java/runtime-modules.txt`: 8 modules from `jdeps --print-module-deps`, plus
`jdk.charsets` and `jdk.localedata` (`--include-locales=en,pl`, `--strip-debug`,
`--compress=zip-6`). `jlink-runtime.sh --check` fails if jdeps ever needs a module that is
not on the list. `engine-java/scripts/smoke_test.py --compare-java` ran the adapter on
the jlinked runtime and on the full JDK. Both produced **identical issue lists** for a
Unicode/NFD/CRLF case and for the 1k, 10k and 50k samples (4, 6, 49 and 231 issues), and
CI repeats this on every OS.

CI run 37973864667 (2026-10-09 20:31 CEST) ran on GitHub-hosted runners with Temurin
21.0.12.1+1 and passed on all three OSes. In each it ran 52/52 tests, the jdeps check, and an
identical-output smoke test (jlink vs full JDK) on unicode, 1k, 10k and 50k:

| Runner | jlink runtime, installed | tar.gz | + adapter JARs (51.5 / 47.9 MiB) = bundle |
|---|---|---|---|
| ubuntu-latest (x64) | 60.4 MiB | 37.0 MiB | ≈112 MiB / ≈85 MiB |
| macos-latest (arm64) | 52.7 MiB | 33.6 MiB | ≈104 MiB / ≈81 MiB |
| windows-latest (x64) | 49.2 MiB | 33.5 MiB | ≈101 MiB / ≈81 MiB |

The JARs are platform-independent. The "ready" times in CI logs (1.5–2.2 s) come from shared
runners and are not benchmark data. macOS Intel was not covered (`macos-latest` is arm64).
CI pins Temurin `21.0.12+101` (= 21.0.12.1+1) and fails if any other build is resolved.

A jlinked runtime for the HTTP server was not built (it needs at least `jdk.httpserver` too).


Biggest adapter JARs: `grpc-netty-shaded` 10.1 MB, `fastutil-core` 6.3, `language-pl` 5.3,
`guava` 2.9, `proto-google-common-protos` 2.6, `lucene-core` 2.3, `languagetool-core` 1.9.
`language-pl` itself is small; most size comes from `languagetool-core` transitive deps
(gRPC/protobuf/remote-rule/metrics stacks) that a local PL checker likely never touches.
These are candidates for exclusion in phase 5, **only** after corpus checks.

## Observations

1. **Warm latency:** the adapter is ~105–130 ms faster per request. The HTTP server has a
   **fixed ~97 ms overhead per check**: its own log reports ~97 ms "Handled request" even
   for a 4-word sentence, while transport is not the cause (`/v2/languages` answers in
   ~1 ms). Cause not investigated (may be configurable); it is paid on every check.
2. **Cold start:** the HTTP port opens earlier, but the first real result arrives later
   (2.3–2.8 s vs 2.0 s). Both meet the "< 3 s" goal on this VM at p50; HTTP full misses at p95.
3. **Memory:** default heap sizing (¼ of 16 GB) inflates RSS for both. With `-Xmx256m` +
   SerialGC the adapter is 268 MiB with *better* latency; C1-only reaches 201 MiB at the
   cost of ~60 % slower analysis. The HTTP server at the same flags is ~130 MiB larger.
   The plan's 350 MiB is for the **whole app** (WebView + Rust + Java), so even 268 MiB for
   Java alone is tight. 50k texts ran fine at `-Xmx256m`, but peak RSS was 379 MiB (see the 50k table).
4. **Size:** the HTTP option cannot be trimmed to PL only: it needs the extra `es`, `ca`
   and `pt` language modules just to start, and carries ~33 MiB more JARs than the adapter
   even then.
5. **Budgets vs PLAN.md section 11** (this VM, TEMPORARY sample): 1k warm p95 37–40 ms
   (goal 250) ✔; 10k p95 289–342 ms (goal 800) ✔; 50k p95 1.41–1.54 s (goal 3 s) ✔.
6. **Unicode:** offsets are UTF-16 in both options (emoji counted as 2 units), verified by
   tests with emoji, ZWJ sequences, non-BMP letters, Polish diacritics and combining marks.
   **Finding:** LanguageTool 6.8 flags Polish words typed in decomposed form (NFD, e.g.
   `z` + U+0307) as misspellings, while NFC is accepted (pinned by a characterization
   test on the raw engine). **Resolved in the adapter:** `NormalizingChecker` hands the
   engine an NFC *copy* and maps every range back to the original UTF-16 offsets via
   `NfcText` (segments = starter + combining marks; ranges never split a surrogate pair or
   a letter from its marks). The request text is never altered (PLAN.md section 4).
   Replacements are returned in NFC, so accepting a fix stores that fragment as NFC.
   The timings above were taken before this layer; it adds an `isNormalized` scan
   (microseconds for already-NFC text) and a per-segment pass only for non-NFC text.
7. LanguageTool messages contain inline markup (`<suggestion>…</suggestion>`); the UI must
   treat it as controlled markup, never HTML (PLAN.md section 13).

## Corpus scores (phase-0 starter corpus)

Corpus: `tests/corpus/data/phase0-starter.jsonl` from `corpus/phase0` @ `a0a9b62` (67
examples, 24 clean, all `unreviewed`, all `dev`). Engine: the adapter's production checker
(NFC layer + LanguageTool PL 6.8, default rules), via
`java -cp "target/ortografi-engine-0.0.1-phase0.jar:target/lib/*" pl.ortografi.engine.CorpusRunner <corpus.jsonl>`
→ engine-result JSONL v1.0 (validated with `validate.mjs --engine`: 0 errors, 0 warnings).
Raw output: `benchmarks/results/corpus-phase0-starter.*`.

| Category (default overlap match) | TP | FP | FN | Precision | Recall | F1 | Top-1 | Any |
|---|---|---|---|---|---|---|---|---|
| spelling | 19 | 0 | 4 | 100.0 % | 82.6 % | 90.5 % | 84.2 % | 100.0 % |
| punctuation | 15 | 0 | 3 | 100.0 % | 83.3 % | 90.9 % | 80.0 % | 80.0 % |
| grammar | 1 | 0 | 2 | 100.0 % | 33.3 % | 50.0 % | 100.0 % | 100.0 % |
| **overall** | **35** | **0** | **9** | **100.0 %** | **79.5 %** | **88.6 %** | 82.9 % | 91.4 % |

- Clean set: **0/24** examples with a false positive (target ≤ 2 %).
- Release-critical failures: **p0-0004** ("Mój starszy brat, pracuje w szpitalu." —
  comma between subject and predicate is not detected).
- `--strict-category`: **identical** to the default (overall P 100 % / R 79.5 % / F1 88.6 %,
  0 category disagreements) after the per-rule overrides below. Before them: F1 81.0 %,
  3 disagreements.
- `--match exact`: overall F1 55.7 %; release-critical failures p0-0001, p0-0003, p0-0004.
  LanguageTool marks comma issues over word spans (`Wiem że` → `Wiem, że`, `chleb, i`),
  while the corpus uses the minimal span or a zero-length insertion point. The default
  scorer accepts this through text-equivalent fixes; the UI's insertion marker (PLAN.md
  section 6) will need a span-to-insertion-point reduction.
- Without the NFC layer (raw engine): spelling precision 79.2 % (5 FP), clean set 1/24
  (4.2 %, p0-0062 NFD). The normalization fixes all of those.
- Misses (FN): reform-2026 capitalization/`nie` cases (p0-0020, -0021, -0022), street-name
  capitalization (p0-0031), inflection/agreement (p0-0033, -0035), `dr.` abbreviation
  (p0-0048), ASCII quotes (p0-0049), subject–predicate comma (p0-0004). LanguageTool 6.8
  predates the 2026 rules, as expected.
- Some missing-comma detections come from `ZDANIA_ZLOZONE`, a sentence-wide warning with no
  replacement, not a pinpointed insertion (p0-0039, -0040, -0041).

Scores describe this 67-example corpus only, not Polish in general (PLAN.md section 10).

### Category mapping (one place: `CategoryMapper`)

Order: per-rule override → LanguageTool category ID table → issue-type fallback. Never by
message text. `style` and `other` are kept in the output (style is not counted as an error).

| Rule-level overrides (requested by the corpus owner) | Product category |
|---|---|
| `SKROTY_Z_KROPKA` (all 7 sub-rules: abbreviation needs a dot, e.g. `np` → `np.`) | punctuation |
| `JEDNOSTKA_LICZBA` (all 4 sub-rules: space after number/year, `o` → `°`) | punctuation |
| `PL_SIMPLE_REPLACE`, **only** matches whose text is one of 12 inflection entries | grammar |

| LanguageTool category IDs | Product category |
|---|---|
| TYPOS, SPELLING, CASING, PHONETICS, PRAWDOPODOBNE_LITEROWKI | spelling |
| PUNCTUATION, TYPOGRAPHY | punctuation |
| GRAMMAR, GENDER, SYNTAX, WORD_ORDER | grammar |
| STYLE, REDUNDANCY, SEMANTICS, CONFUSED_WORDS | style (not counted as errors) |
| MISC, NUMBERS (other than JEDNOSTKA_LICZBA) | other |
| unknown ID | from issue type (misspelling → spelling, grammar → grammar, typographical/whitespace → punctuation, style → style), else other |

**PL_SIMPLE_REPLACE was not overridden wholesale.** In language-pl 6.8 it is
`org/languagetool/rules/pl/replace.txt`: 227 context-free "wrong=right" entries, described
in its header as rare typos the speller misses. Almost all are spelling: typos and missing
diacritics (`piatek`, `sie`, `juz`, `dzis`), joined/split words (`wogle`, `narazie`,
`poprostu`), foreign-name declension (`Stevowi` → `Steve’owi`, ~50 entries), `-ii` endings
(`kopi`, `aleji`). Only 12 entries are wrong inflected forms: `szłem`, `poszłem`,
`chłopcowi`, `bratowi`, `synie`, `domie`, `akcesorii`, `akwarii`, `centr`, `lubieć`,
`obiedwie`, `Europom`. LanguageTool reports no sub-rule ID for these, so the override keys
on (rule ID, lower-cased matched text in the NFC copy). That stays clean because the rule
matches exactly one listed word. A test fails if a listed entry disappears from the
engine's list, e.g. on upgrade.

Review: OrBity approved the 12-entry list ([PR #2 comment](https://github.com/jakestolarsky/ortografi-check/pull/2#issuecomment-6086442770)).
Borderline entries left as spelling (also approved): `mięli` → `mieli`, `lekażów` → `lekarzy`
(typo plus wrong form), `dojąć` → `dojść`, `sposobowy` → `sposoby`.

## Open items

- **Memory at 50k:** with `-Xmx256m -XX:+UseSerialGC` the adapter's peak RSS is **379 MiB** on
  a 50k-unit text. That is over the **350 MiB** goal for the *whole app* (WebView + Rust +
  Java; PLAN.md section 11) before the WebView and Rust are even counted. Options to measure:
  smaller heap or a different GC, a lower automatic-analysis limit, or chunked analysis
  (only if it keeps wider-context rules intact).
- **No macOS Intel coverage:** CI's `macos-latest` runner and all measurements so far are
  arm64 or Linux x64. A separate Intel package is planned (PLAN.md section 12), so it needs
  its own CI runner or hardware run.

## Leading option

On Linux the adapter is faster per check (no fixed ~97 ms server overhead), uses less memory,
ships smaller (no extra es/ca/pt modules), returns the same results, and now handles NFD
input. It also stays ahead at 50k-unit texts. **The stdin/stdout adapter is the leading
option.** CI (`.github/workflows/engine.yml`) builds and tests it, and smoke-tests it on the
jlinked runtime, on ubuntu, macOS and Windows. Still pending before the final decision:
timing and memory runs on macOS ARM/Intel and Windows reference hardware, ≥30 cold launches
there, and the 50k memory question above.

## Reproduce

```sh
export JAVA_HOME=/path/to/temurin-21.0.12.1+1
(cd engine-java && mvn package)
(cd benchmarks/http-server-6.8 && mvn package) && (cd benchmarks/http-server-6.8/full && mvn package)
python3 benchmarks/bench.py benchmarks/results/phase0-linux-x64.json 30 30
python3 benchmarks/bench.py --50k benchmarks/results/phase0-linux-x64.json 15 30
(cd engine-java && scripts/jlink-runtime.sh --check && scripts/jlink-runtime.sh target/runtime \
  && python3 scripts/smoke_test.py --java target/runtime/bin/java --compare-java "$JAVA_HOME/bin/java")
```
