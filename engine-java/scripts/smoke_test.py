#!/usr/bin/env python3
"""End-to-end smoke test of the stdin/stdout adapter process (protocol v1).

Starts `<java> -jar target/ortografi-engine-*.jar`, checks `ready`, a Unicode case (NFD Polish,
emoji, ZWJ, CRLF), the TEMPORARY samples, a protocol error, and a clean exit on `shutdown`.
With --compare-java it runs the same requests on a second runtime (e.g. the full JDK) and
fails unless every issue list is identical. Writes nothing but a report to stdout.

  python scripts/smoke_test.py --java target/runtime/bin/java [--compare-java $JAVA_HOME/bin/java]
"""
import argparse, glob, json, os, pathlib, subprocess, sys, time

HERE = pathlib.Path(__file__).resolve().parent.parent
SAMPLES = HERE.parent / "benchmarks" / "sample-temporary"
UNICODE = "Zaz\u0307o\u0301łc\u0301 😀 👨‍👩‍👧 Wiem że kotaa.\r\nPoszłem do sklepu, np po chleb."


def resolve(java):
    if os.path.exists(java): return java
    if os.path.exists(java + ".exe"): return java + ".exe"
    sys.exit(f"java not found: {java}")


def run(java, texts):
    jar = sorted(glob.glob(str(HERE / "target" / "ortografi-engine-*.jar")))[0]
    t0 = time.perf_counter()
    p = subprocess.Popen([resolve(java), "-jar", jar], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                         stderr=subprocess.PIPE)
    def send(obj):
        p.stdin.write((json.dumps(obj, ensure_ascii=False) + "\n").encode("utf-8")); p.stdin.flush()
    def recv():
        line = p.stdout.readline()
        if not line: sys.exit("adapter closed stdout; stderr:\n" + p.stderr.read().decode("utf-8", "replace"))
        assert line.endswith(b"\n")
        return json.loads(line.decode("utf-8"))
    ready = recv()
    assert ready["type"] == "ready" and ready["protocol"] == 1 and ready["engineVersion"] == "6.8", ready
    ready_ms = (time.perf_counter() - t0) * 1000
    results = {}
    for name, text in texts.items():
        send({"protocol": 1, "type": "check", "id": name, "docVersion": 1, "settingsVersion": 1, "text": text})
        r = recv()
        assert r["type"] == "result" and r["id"] == name and r["status"] == "complete", r
        results[name] = [(i["start"], i["end"], i["ruleId"], i["category"], i["replacements"][:3]) for i in r["issues"]]
    send({"protocol": 2, "type": "check", "id": "bad", "text": "x"})
    err = recv()
    assert err["type"] == "error" and err["code"] == "UNSUPPORTED_PROTOCOL", err
    send({"protocol": 1, "type": "shutdown"})
    rest = p.stdout.read()
    assert rest == b"", f"unexpected stdout after shutdown: {rest[:200]!r}"
    assert p.wait(30) == 0
    return ready_ms, results


def utf16(s, a, b):
    return s.encode("utf-16-le")[2 * a:2 * b].decode("utf-16-le")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--java", required=True)
    ap.add_argument("--compare-java")
    a = ap.parse_args()
    texts = {"unicode": UNICODE}
    for n in ("1k", "10k", "50k"):
        f = SAMPLES / f"pl-{n}.txt"
        if f.exists(): texts[n] = f.read_text(encoding="utf-8")
    ready_ms, res = run(a.java, texts)
    got = {utf16(UNICODE, s, e): (rule, cat) for s, e, rule, cat, _ in res["unicode"]}
    expect = {"kotaa": "spelling", "Wiem że": "punctuation", "Poszłem": "grammar", "np": "punctuation"}
    for frag, cat in expect.items():
        assert frag in got and got[frag][1] == cat, f"expected {frag!r} as {cat}; got {got}"
    assert not any("Za" in k for k in got), f"NFD 'Zażółć' must not be flagged: {got}"
    print(f"OK {a.java}: ready in {ready_ms:.0f} ms; issues " + ", ".join(f"{k}={len(v)}" for k, v in res.items()))
    if a.compare_java:
        _, ref = run(a.compare_java, texts)
        for k in texts:
            if ref[k] != res[k]:
                sys.exit(f"MISMATCH on {k}: {a.java} vs {a.compare_java}")
        print(f"OK identical issue lists vs {a.compare_java} on: " + ", ".join(texts))


if __name__ == "__main__":
    main()
