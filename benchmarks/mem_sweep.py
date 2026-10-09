#!/usr/bin/env python3
"""Peak memory vs latency for adapter JVM flag sets on the 50k-unit sample (Linux; RSS from /proc).

  JAVA_HOME=... python3 benchmarks/mem_sweep.py <out.json> [warm_runs] [config names...]
  JAVA_HOME=... python3 benchmarks/mem_sweep.py --100k [config names...]   # one check at the 100k limit

Per config, one process: 1 check + 5 warm-ups + N timed 50k checks interleaved with 1k checks
(an editor re-checks small and large documents), then VmHWM (peak RSS) and VmRSS. Every config
must return exactly the issues of the first config, so flags never change results.
"""
import json, os, pathlib, sys, time
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import bench

BASE = ["-XX:+UseSerialGC"]
SLIM = ["-Xss512k", "-XX:ReservedCodeCacheSize=48m", "-XX:MaxMetaspaceSize=96m"]
CONFIGS = {
    "phase0 (Xmx256m)": ["-Xmx256m", *BASE],
    "Xmx256m+slim": ["-Xmx256m", *BASE, *SLIM],
    "Xmx192m+slim": ["-Xmx192m", *BASE, *SLIM],
    "Xmx160m+slim": ["-Xmx160m", *BASE, *SLIM],
    "Xmx128m+slim": ["-Xmx128m", *BASE, *SLIM],
    "Xmx160m+slim+C1": ["-Xmx160m", *BASE, *SLIM, "-XX:TieredStopAtLevel=1"],
    "Xmx160m+slim+shrink": ["-Xmx160m", *BASE, *SLIM, "-XX:MinHeapFreeRatio=10", "-XX:MaxHeapFreeRatio=30"],
    "Xmx112m+slim": ["-Xmx112m", *BASE, *SLIM],
    "Xmx96m+slim": ["-Xmx96m", *BASE, *SLIM],
}
APPCDS = os.environ.get("APPCDS_ARCHIVE")  # built with -XX:ArchiveClassesAtExit (see decision doc)
if APPCDS:
    CONFIGS["Xmx128m+slim+AppCDS"] = ["-Xmx128m", *BASE, *SLIM, f"-XX:SharedArchiveFile={APPCDS}"]


def run(name, flags, warm):
    e = bench.AdapterProc(flags)
    ready = e.ready_ms
    issues = e.check(bench.TEXT_50K)
    for i in range(5):
        e.check(bench.TEXT_50K + f" Rozgrzewka {i}.")
    t50, t1 = [], []
    for i in range(warm):
        t = time.perf_counter(); e.check(bench.TEXT_50K + f" Numer próby {i}."); t50.append((time.perf_counter() - t) * 1000)
        t = time.perf_counter(); e.check(bench.SAMPLES["1k"] + f" Próba {i}."); t1.append((time.perf_counter() - t) * 1000)
    m = bench.mem(e.p.pid)
    e.close()
    return {"config": name, "jvm_flags": flags, "ready_ms": round(ready, 1), "warm_50k_ms": bench.summary(t50),
            "warm_1k_ms": bench.summary(t1), "memory_mib": m, "issues_50k": len(issues)}, issues


def max_text(flags):
    """One 100k-unit check (the protocol limit): must return a result, not crash or error."""
    text = (bench.TEXT_50K + "\n") * 2
    text = text[:100_000]
    e = bench.AdapterProc(flags)
    t = time.perf_counter()
    try:
        n = len(e.check(text))
        ok = True
    except Exception as ex:  # OutOfMemoryError ends as ENGINE_ERROR or a dead process
        n, ok = repr(ex)[:200], False
    ms = (time.perf_counter() - t) * 1000
    m = bench.mem(e.p.pid) if e.p.poll() is None else {}
    try:
        e.close()
    except Exception:
        e.p.kill()
    return {"ok": ok, "issues_or_error": n, "ms": round(ms, 1), "memory_mib": m}


def main():
    if sys.argv[1] == "--100k":
        for n in sys.argv[2:]:
            r = max_text(CONFIGS[n])
            print(n, json.dumps(r), file=sys.stderr, flush=True)
        return
    out = sys.argv[1]
    warm = int(sys.argv[2]) if len(sys.argv) > 2 else 20
    names = sys.argv[3:] or list(CONFIGS)
    results, ref = [], None
    for n in names:
        print("running", n, file=sys.stderr, flush=True)
        r, issues = run(n, CONFIGS[n], warm)
        if ref is None:
            ref = issues
        r["same_issues_as_first"] = issues == ref
        results.append(r)
        print(f"  HWM {r['memory_mib']['VmHWM']} MiB  50k p50/p95 {r['warm_50k_ms']['p50']}/{r['warm_50k_ms']['p95']}"
              f"  1k p50/p95 {r['warm_1k_ms']['p50']}/{r['warm_1k_ms']['p95']}  same={r['same_issues_as_first']}",
              file=sys.stderr, flush=True)
    meta = {"date": time.strftime("%Y-%m-%d %H:%M %Z"), "warm_runs": warm, "nproc": os.cpu_count(),
            "sample_utf16_units": len(bench.TEXT_50K.encode("utf-16-le")) // 2}
    pathlib.Path(out).write_text(json.dumps({"meta": meta, "results": results}, ensure_ascii=False, indent=1), "utf-8")


if __name__ == "__main__":
    main()
