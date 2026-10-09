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
CI pins Temurin `21.0.12+101.0.LTS` (= 21.0.12.1+1) and fails if any other build is resolved.

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
   Replacements are re-expressed for the original range: words the fix doesn't touch keep
   their form, and an edited word is NFC (so "Wiem że" with a decomposed "że" gets
   "Wiem, że" with "że" still decomposed). Found by the dev split's p1-0239.
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

### Suppressed false positives

`FalsePositiveFilter` drops engine matches that are known to be wrong. Each entry covers a
class of forms (rule ID plus a pattern on the matched NFC text) and has positive and
negative tests. There is one entry so far:

- `IMIONA_Z_APOSTROFAMI`: in LT 6.8, the "Locke, Braque" sub-rule (`…(c?ke|que)` + apostrophe
  + `(i?e)?m` → `…kiem`) also flags the correct form `Mike'iem` (corpus p1-0222, confirmed
  by OrBity). The filter accepts only a capitalised name ending in `-ke`/`-que` + `'iem`/`’iem`.
  `Mike'm` and `Mike'em` are still flagged, and so is every other sub-rule (`John'ie`,
  `Bentley'u`, `Andrew'em`). On dev it changes only p1-0222. The filter also accepts
  `Locke'iem` and `Braque'iem` (the rule suggests `Lockiem`/`Brakiem`). OrBity approved this:
  `Mike'iem`, `Locke'iem` and `Braque'iem` are correct ([PR #5 comment](https://github.com/jakestolarsky/ortografi-check/pull/5#issuecomment-6087694951)).

## Memory (phase 1, 2026-10-09)

Measured on the box (Linux x64, 8 vCPU, Temurin 21.0.12.1+1) with `benchmarks/mem_sweep.py`.
For each config, one process ran 1 + 5 warm-up + 20 timed 50k checks, interleaved with 1k
checks; peak = VmHWM. Every config returned exactly the same issues. Raw data:
`benchmarks/results/memory-sweep-linux-x64.json`.

Native Memory Tracking showed where the memory goes: the Java heap committed up to `-Xmx`
(252 of 318 MiB) and was mostly garbage. Code cache, metaspace and CDS were small. So the heap cap
is the lever.

| Config ("slim" = `-Xss512k -XX:ReservedCodeCacheSize=48m -XX:MaxMetaspaceSize=96m`) | Peak RSS | 50k p50 / p95 ms | 1k p50 / p95 ms |
|---|---|---|---|
| phase 0: `-Xmx256m -XX:+UseSerialGC` | 396 | 1370 / 1514 | 31.6 / 38.1 |
| `-Xmx256m` + slim | 379 | 1365 / 1565 | 32.4 / 36.2 |
| `-Xmx192m` + slim | 319 | 1354 / 1474 | 31.5 / 38.5 |
| `-Xmx160m` + slim | 290 | 1366 / 1464 | 33.0 / 36.8 |
| **`-Xmx128m` + slim (chosen)** | **249** | **1375 / 1464** | **32.9 / 35.5** |
| `-Xmx112m` + slim | 248 | 1397 / 1499 | 34.0 / 38.4 |
| `-Xmx96m` + slim | 224 | 1463 / 1566 | 34.7 / 48.0 |
| `-Xmx160m` + slim + C1 only (`TieredStopAtLevel=1`) | 227 | 2403 / 2561 | 56.7 / 67.2 |
| `-Xmx128m` + slim + AppCDS | 265 | 1398 / 1511 | 33.5 / 35.4 |

- **Chosen: `-Xmx128m -XX:+UseSerialGC` + slim**, pinned in `engine-java/jvm-options.txt` and
  baked into the jlink runtime with `--add-options`. `jlink-runtime.sh` fails if the runtime does
  not report it, and CI smoke-tests that runtime against the full JDK with identical results.
- **Headroom:** a single check at the 100k protocol limit succeeds at 128m, 112m and 96m (462
  issues, ~4.2–4.4 s, peak ≤ 233 MiB). The live set is far below 128 MiB.
- Below 128m, latency starts to rise (96m: +7% at 50k, 1k p95 48 ms). C1-only saves memory but
  costs +75% latency, so it is rejected.
- **AppCDS:** startup 966 ms vs 1163 ms (ready), but +17 MiB RSS. It is not a memory win; keep
  it as a startup option for later.
- **Chunking by paragraph (experiment, not shipped):** sending the 50k sample as 125 paragraph
  checks gave a peak of 221 MiB (−28 MiB), with the same latency and the same 231 issues. Not
  worth the risk to cross-paragraph rules now that the flags give 100 MiB of headroom.

## Held-out milestone run (phase 1, 2026-10-09 21:59 CEST)

One run on the held-out split (`tests/corpus/data/heldout/phase1-heldout.jsonl`, 94 examples,
36 clean, scoring 1.2) with the engine at PR #10 head `6ecaecb`. **No rule or code was changed
because of these results.** All tuning used dev only; held-out had not been run before.

| Category | Held-out P / R / F1 (overlap) | Dev P / R / F1 (overlap) | Held-out F1 (exact) | Dev F1 (exact) |
|---|---|---|---|---|
| grammar | 100% / 40.0% / 57.1% (2 TP, 0 FP, 3 FN) | 85.7% / 46.2% / 60.0% | 50.0% | 40.0% |
| punctuation | 100% / 81.8% / 90.0% | 100% / 82.7% / 90.5% | 66.7% | 44.7% |
| spelling | 100% / 90.6% / 95.1% | 98.2% / 76.7% / 86.2% | 95.1% | 84.0% |
| **overall** | **100% / 83.1% / 90.7%** (49 TP, 0 FP, 10 FN) | 98.1% / 76.1% / 85.7% | **81.5%** (P 89.8%, R 74.6%) | 65.3% |

- Clean-sentence false positives: **0/36 (0.0%)** in both modes (dev: 0/82).
- Release-critical failures: **none** under overlap. Under exact: p1-0161 and p1-0165. Both are
  extra commas that the engine reports on a wider span (`PODMIOT_ORZECZENIE` 9..15 → " lubi";
  `COFANIE_PRZECINKA` 0..8 → "Mimo że"). This is the same class as dev's p0-0001/p1-0160
  (deletion spans are not narrowed).
- Strict category (overlap): P 94.0% / R 79.7% / F1 86.2% (dev 81.3%). `excluded_categories`:
  none predicted on held-out.
- Held-out is small (59 scored issues; grammar has 5). Held-out is not lower than dev here, but
  that does not prove generalisation: a single example moves grammar F1 by ~10 points.

## Minimal punctuation edits (follow-up to PR #10)

Before this change, only insertions were narrowed. Now one minimal-edit step trims the common
prefix and suffix of the engine's span and the replacement, for punctuation edits only, so an
extra comma is reported as exactly the comma with `""` (corpus FORMAT.md, "Deletion ranges").
Dev only, scored with exact ranges:

- On main's corpus: overall F1 65.3% → 71.8% (punctuation 44.7% → 61.7%). 8 examples fixed, none
  regressed. The release-critical exact-range failures p0-0001 and p1-0160 are fixed.
- On corpus PR #11 (draft, `48e34b7`): F1 60.1% → 68.6%. 12 examples fixed, none regressed.
- Overlap and strict-category scores are unchanged on both corpora.

During development, two variants regressed dev and were rejected:
- **Punctuation-only insertions:** a missing space after a comma (p1-0210) was no longer a
  point insertion.
- **Also trimming removed spaces:** this broke the spacing/whitespace convention (p0-0044,
  p0-0045, p1-0202).

## Dev re-score after corpus #11 (phase 2, 2026-10-09 22:55 CEST)

Dev split only (`--split dev`; held-out not run). Corpus: main @ `8c5d21b` (#11 merged, which
changed p2-0023 and p2-0024): `phase0-starter`, `phase1-dev`, `phase2-dev`, 252 examples, 90
clean. Engine unchanged since the minimal-edit change above. Scoring 1.2 (style/other excluded
from P/R), main's `score.mjs` on `CorpusRunner` output.

| Mode | TP | FP | FN | Precision | Recall | F1 | Top-1 |
|---|---|---|---|---|---|---|---|
| overlap (default) | 117 | 2 | 47 | 98.3% | 71.3% | 82.7% | 73.5% |
| exact | 97 | 22 | 67 | 81.5% | 59.1% | 68.6% | 85.6% |
| strict category | 109 | 11 | 55 | 90.8% | 66.5% | 76.8% | 77.1% |

- Per category (overlap): grammar P 93.3% / R 41.2%, punctuation 100% / 82.5%, spelling
  98.2% / 76.7%.
- Clean-sentence false positives: **0/90 (0.0%)** (strict category: 1/90, p1-0126).
- Release-critical failures: none.
- Versus the phase-1 dev run (P 98.1% / R 76.1% / F1 85.7%, 0/82 clean): recall drops because
  the corpus grew (phase-2 examples, mostly grammar), not because the engine changed. Exact F1
  68.6% equals the earlier run on the #11 draft.
- Scoring the adapter's raw v1 output with corpus/phase3's scorer fails validation on
  p1-0206: `SKROTY_BEZ_KROPKI` deletes the period in `Mgr.` (3..4, `""`), and that validator
  requires every empty replacement to delete a comma. contracts/README.md states the rule only
  for unnecessary commas, so the validator needs to allow other one-character deletions.

## Open items

- **Memory at 50k: resolved on Linux (phase 1).** See "Memory (phase 1)" below: peak RSS is now
  **249 MiB** at 50k (was 379–396 MiB) with unchanged latency. Still to confirm on macOS and
  Windows reference hardware, where the whole-app budget (WebView + Rust) is measured.
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
there (including memory with the phase-1 flags).

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
