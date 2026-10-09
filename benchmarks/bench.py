#!/usr/bin/env python3
"""Phase-0 engine benchmark: stdin/stdout adapter vs official LanguageTool HTTP server 6.8.

Same JDK, same machine, same TEMPORARY sample, same JVM flags per comparison.
Cold start: N fresh processes; "ready" = adapter `ready` line / first HTTP 200 on
/v2/languages; "first result" = ready + first check of pl-1k (rules are loaded lazily).
Warm: one process, WARMUP checks, then RUNS timed checks per sample, measured client-side
(round trip including JSON / HTTP). Each request appends a unique sentence so no result
cache can short-circuit it. RSS/HWM read from /proc after the warm runs (Linux).
Usage: bench.py <out.json> [cold_runs] [warm_runs]
       bench.py --50k <results.json> [cold_runs] [warm_runs]
         adds "results_50k" to an existing results file: cold = spawn -> first 50k result,
         warm = 5 warm-up + N timed 50k checks, RSS/HWM after.
"""
import json, os, pathlib, socket, statistics, subprocess, sys, time, urllib.parse, urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
JAVA = os.path.join(os.environ["JAVA_HOME"], "bin", "java")
SAMPLES = {n: (ROOT / "benchmarks/sample-temporary" / f"pl-{n}.txt").read_text("utf-8") for n in ("1k", "10k")}
TEXT_50K = (ROOT / "benchmarks/sample-temporary/pl-50k.txt").read_text("utf-8")
ADAPTER_CP = f"{ROOT}/engine-java/target/ortografi-engine-0.0.1-phase0.jar"
SERVER_CP = {
    "http-minimal": f"{ROOT}/benchmarks/http-server-6.8/target/lib/*",
    "http-full": f"{ROOT}/benchmarks/http-server-6.8/full/target/lib/*",
}
WARMUP = 10


def free_port():
    s = socket.socket(); s.bind(("127.0.0.1", 0)); p = s.getsockname()[1]; s.close(); return p


def pct(xs, q):
    xs = sorted(xs); k = (len(xs) - 1) * q; f = int(k); c = min(f + 1, len(xs) - 1)
    return xs[f] + (xs[c] - xs[f]) * (k - f)


def summary(xs):
    return {"n": len(xs), "p50": round(pct(xs, .5), 1), "p95": round(pct(xs, .95), 1),
            "mean": round(statistics.mean(xs), 1), "min": round(min(xs), 1), "max": round(max(xs), 1)}


def mem(pid):
    out = {}
    for line in open(f"/proc/{pid}/status"):
        k, v = line.split(":", 1)
        if k in ("VmRSS", "VmHWM"):
            out[k] = round(int(v.split()[0]) / 1024, 1)  # MiB
    return out


class AdapterProc:
    def __init__(self, jvm_flags):
        self.t0 = time.perf_counter()
        self.p = subprocess.Popen([JAVA, *jvm_flags, "-jar", ADAPTER_CP], stdin=subprocess.PIPE,
                                  stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, encoding="utf-8")
        assert json.loads(self.p.stdout.readline())["type"] == "ready"
        self.ready_ms = (time.perf_counter() - self.t0) * 1000
        self.n = 0

    def check(self, text):
        self.n += 1
        self.p.stdin.write(json.dumps({"protocol": 1, "type": "check", "id": str(self.n), "docVersion": self.n,
                                       "settingsVersion": 1, "text": text}) + "\n")
        self.p.stdin.flush()
        r = json.loads(self.p.stdout.readline())
        assert r["type"] == "result", r
        return [(i["start"], i["end"], i["ruleId"]) for i in r["issues"]]

    def close(self):
        self.p.stdin.write('{"protocol":1,"type":"shutdown"}\n'); self.p.stdin.flush(); self.p.wait(30)


class ServerProc:
    def __init__(self, variant, jvm_flags):
        self.port = free_port()
        self.t0 = time.perf_counter()
        self.p = subprocess.Popen([JAVA, *jvm_flags, "-cp", SERVER_CP[variant], "org.languagetool.server.HTTPServer",
                                   "--port", str(self.port)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        while True:
            try:
                urllib.request.urlopen(f"http://127.0.0.1:{self.port}/v2/languages", timeout=1).read(); break
            except Exception:
                if self.p.poll() is not None: raise RuntimeError("server died")
                time.sleep(0.01)
        self.ready_ms = (time.perf_counter() - self.t0) * 1000

    def check(self, text):
        data = urllib.parse.urlencode({"language": "pl-PL", "text": text}).encode()
        r = json.loads(urllib.request.urlopen(f"http://127.0.0.1:{self.port}/v2/check", data, timeout=60).read())
        return [(m["offset"], m["offset"] + m["length"], m["rule"]["id"]) for m in r["matches"]]

    def close(self):
        self.p.terminate(); self.p.wait(30)


def start(option, flags):
    return AdapterProc(flags) if option == "adapter" else ServerProc(option, flags)


def bench(option, flags, cold_runs, warm_runs):
    ready, first = [], []
    for _ in range(cold_runs):
        e = start(option, flags)
        e.check(SAMPLES["1k"])
        first.append((time.perf_counter() - e.t0) * 1000)
        ready.append(e.ready_ms)
        e.close()
    e = start(option, flags)
    res = {"option": option, "jvm_flags": flags, "cold_ready_ms": summary(ready), "cold_first_result_1k_ms": summary(first)}
    issues = {k: e.check(v) for k, v in SAMPLES.items()}
    res["issues"] = {k: len(v) for k, v in issues.items()}
    res["issue_list"] = issues
    for name, text in SAMPLES.items():
        for i in range(WARMUP): e.check(text + f" Rozgrzewka {i}.")
        ts = []
        for i in range(warm_runs):
            t = time.perf_counter(); e.check(text + f" Numer próby {i}."); ts.append((time.perf_counter() - t) * 1000)
        res[f"warm_{name}_ms"] = summary(ts)
    res["memory_after_warm_mib"] = mem(e.p.pid)
    e.close()
    return res


def bench_50k(option, flags, cold_runs, warm_runs):
    first = []
    for _ in range(cold_runs):
        e = start(option, flags)
        e.check(TEXT_50K)
        first.append((time.perf_counter() - e.t0) * 1000)
        e.close()
    e = start(option, flags)
    issues = e.check(TEXT_50K)
    for i in range(5): e.check(TEXT_50K + f" Rozgrzewka {i}.")
    ts = []
    for i in range(warm_runs):
        t = time.perf_counter(); e.check(TEXT_50K + f" Numer próby {i}."); ts.append((time.perf_counter() - t) * 1000)
    res = {"option": option, "jvm_flags": flags, "cold_first_result_50k_ms": summary(first),
           "warm_50k_ms": summary(ts), "issues_50k": len(issues), "issue_list_50k": issues,
           "memory_after_warm_mib": mem(e.p.pid)}
    e.close()
    return res


def main_50k(path, cold, warm):
    configs = [("adapter", []), ("adapter", ["-Xmx256m", "-XX:+UseSerialGC"]),
               ("http-minimal", []), ("http-minimal", ["-Xmx256m", "-XX:+UseSerialGC"]), ("http-full", [])]
    out = []
    for opt, flags in configs:
        print("running 50k", opt, flags, file=sys.stderr, flush=True)
        out.append(bench_50k(opt, flags, cold, warm))
    data = json.loads(pathlib.Path(path).read_text("utf-8"))
    data["results_50k"] = out
    data["meta_50k"] = {"date": time.strftime("%Y-%m-%d %H:%M %Z"), "cold_runs": cold, "warm_runs": warm,
                        "sample_utf16_units": len(TEXT_50K.encode("utf-16-le")) // 2,
                        "note": "adapter now includes the NFC layer (sample is already NFC)"}
    pathlib.Path(path).write_text(json.dumps(data, ensure_ascii=False, indent=1), "utf-8")


if __name__ == "__main__" and len(sys.argv) > 1 and sys.argv[1] == "--50k":
    main_50k(sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 15, int(sys.argv[4]) if len(sys.argv) > 4 else 30)
    sys.exit(0)

if __name__ == "__main__":
    out = sys.argv[1]; cold = int(sys.argv[2]) if len(sys.argv) > 2 else 30; warm = int(sys.argv[3]) if len(sys.argv) > 3 else 30
    configs = [("adapter", []), ("http-minimal", []), ("http-full", []),
               ("adapter", ["-Xmx256m", "-XX:+UseSerialGC", "-XX:TieredStopAtLevel=1"]),
               ("adapter", ["-Xmx256m", "-XX:+UseSerialGC"]),
               ("http-minimal", ["-Xmx256m", "-XX:+UseSerialGC"])]
    results = []
    for opt, flags in configs:
        print("running", opt, flags, file=sys.stderr, flush=True)
        results.append(bench(opt, flags, cold, warm))
    meta = {"date": time.strftime("%Y-%m-%d %H:%M %Z"), "java": subprocess.run([JAVA, "-version"], capture_output=True, text=True).stderr.strip(),
            "cpu": next(l.split(":", 1)[1].strip() for l in open("/proc/cpuinfo") if l.startswith("model name")),
            "nproc": os.cpu_count(), "kernel": os.uname().release,
            "samples_utf16_units": {k: len(v.encode("utf-16-le")) // 2 for k, v in SAMPLES.items()}}
    pathlib.Path(out).write_text(json.dumps({"meta": meta, "results": results}, ensure_ascii=False, indent=1), "utf-8")
