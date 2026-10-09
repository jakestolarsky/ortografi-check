# 0001 — Phase 0: LanguageTool PL engine, stdin/stdout adapter vs official HTTP server

Status: **first measurement, not a decision yet.** Linux x64 only, TEMPORARY sample, shared
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
| HTTP "minimal" | `language-all` excluded, `language-pl` added. The server cannot start with PL alone: its static `CommonWordsDetector` hard-requires `es`, `ca`, `pt` → those three modules added. |
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

### Size

| Payload | Installed | tar.gz |
|---|---|---|
| Adapter: our JAR (11 KB) + 86 runtime JARs | 51.5 MiB | 47.9 MiB |
| HTTP minimal: 119 JARs | 84.7 MiB | 79.6 MiB |
| HTTP full (as published): 172 JARs | 250.8 MiB | 243.7 MiB |
| Full Temurin 21 JDK (for reference) | 346 MiB | — |
| jlinked runtime for the adapter (`benchmarks/jlink-runtime.sh`) | 60.1 MiB | 37.1 MiB |
| **Adapter + jlinked runtime** | **≈112 MiB** | **≈85 MiB** |

The jlinked runtime (10 modules from `jdeps`) ran the adapter and produced the same 49
issues on the 10k text as the full JDK. Not yet verified against a full corpus. A jlinked
runtime for the HTTP server was not built (it needs at least `jdk.httpserver` too).

Biggest adapter JARs: `grpc-netty-shaded` 10.1 MB, `fastutil-core` 6.3, `language-pl` 5.3,
`guava` 2.9, `proto-google-common-protos` 2.6, `lucene-core` 2.3, `languagetool-core` 1.9.
`language-pl` itself is small; most size comes from `languagetool-core` transitive deps
(gRPC/protobuf/remote-rule/metrics stacks) that a local PL checker likely never touches.
These are candidates for exclusion in phase 5, **only** after corpus checks.

## Observations

1. **Warm latency:** the adapter is ~105–130 ms faster per request. Transport is not the
   cause (`/v2/languages` answers in ~1 ms); the server's own log reports ~97 ms "Handled
   request" even for a 4-word sentence, i.e. fixed server-side work per check. Not
   investigated further (could be configurable).
2. **Cold start:** the HTTP port opens earlier, but the first real result arrives later
   (2.3–2.8 s vs 2.0 s). Both meet the "< 3 s" goal on this VM at p50; HTTP full misses at p95.
3. **Memory:** default heap sizing (¼ of 16 GB) inflates RSS for both. With `-Xmx256m` +
   SerialGC the adapter is 268 MiB with *better* latency; C1-only reaches 201 MiB at the
   cost of ~60 % slower analysis. The HTTP server at the same flags is ~130 MiB larger.
   The plan's 350 MiB is for the **whole app** (WebView + Rust + Java), so even 268 MiB for
   Java alone is tight; heap floor vs OOM on 50k texts must be tested.
4. **Size:** the HTTP option cannot be trimmed to PL only (needs es/ca/pt) and carries
   ~33 MiB more JARs than the adapter even then.
5. **Budgets vs PLAN.md section 11** (this VM, TEMPORARY sample): 1k warm p95 37–40 ms
   (goal 250) ✔; 10k p95 289–342 ms (goal 800) ✔; 50k not measured yet.
6. **Unicode:** offsets are UTF-16 in both options (emoji counted as 2 units), verified by
   tests with emoji, ZWJ sequences, non-BMP letters, Polish diacritics and combining marks.
   **Finding:** LanguageTool 6.8 flags Polish words typed in decomposed form (NFD, e.g.
   `z` + U+0307) as misspellings, while NFC is accepted. PLAN.md forbids silent
   normalisation; options are NFC-on-import (explicit, before versioning) or an
   NFC-with-offset-map inside the adapter. Pinned by a characterization test.
7. LanguageTool messages contain inline markup (`<suggestion>…</suggestion>`); the UI must
   treat it as controlled markup, never HTML (PLAN.md section 13).

## Preliminary leaning (not a decision)

On Linux the adapter is faster per check, uses less memory, ships smaller and returns the
same results, so it currently justifies its small maintenance cost. Confirm on macOS
ARM/Intel and Windows, with the Ortografi Corpus, 50k-unit texts and ≥30 cold launches on
reference hardware, before recording the decision.

## Reproduce

```sh
export JAVA_HOME=/path/to/temurin-21.0.12.1+1
(cd engine-java && mvn package)
(cd benchmarks/http-server-6.8 && mvn package) && (cd benchmarks/http-server-6.8/full && mvn package)
python3 benchmarks/bench.py benchmarks/results/phase0-linux-x64.json 30 30
```
