#!/usr/bin/env python3
"""Fake engine-java adapter speaking protocol v1 JSON lines, for supervisor tests.

argv[1] = startup mode: ok | noready | badready | crash
argv[2] = contracts/v1/examples dir (a check whose id is "corpus-<x>" is answered with
          the bytes of corpus-<x>-result.json, unchanged).
Text markers in a check: SLOW (sleep 5 s), GARBAGE (invalid line), CRASH (exit 3),
WRONGID (answers another id), NOVERS (error without versions), STARTS:<path> (append
one line to <path> on startup, to count spawns; read from env FAKE_SPAWN_LOG).
"""
import json, os, sys, time

mode = sys.argv[1]
examples = sys.argv[2]
log = os.environ.get("FAKE_SPAWN_LOG")
if log:
    with open(log, "a") as f:
        f.write("spawn\n")
print("fake engine starting", file=sys.stderr, flush=True)
if mode == "crash":
    sys.exit(2)
if mode == "noready":
    time.sleep(30)
    sys.exit(0)
out = sys.stdout
out.write('{"protocol":1,"type":"ready","engineVersion":"6.8","language":"pl-PL"}\n' if mode == "ok"
          else '{"protocol":1,"type":"ready","engineVersion":"6.8"}\n')
out.flush()
for line in sys.stdin:
    req = json.loads(line)
    if req["type"] == "shutdown":
        if log:
            with open(log, "a") as f:
                f.write("shutdown\n")
        break
    text, rid = req["text"], req["id"]
    if rid.startswith("corpus-"):
        with open(os.path.join(examples, rid + "-result.json"), "rb") as f:
            sys.stdout.buffer.write(f.read().rstrip(b"\n") + b"\n")
            sys.stdout.buffer.flush()
        continue
    if "CRASH" in text:
        sys.exit(3)
    if "SLOW" in text:
        time.sleep(5)
    if "GARBAGE" in text:
        out.write("this is not json\n"); out.flush(); continue
    if "NOVERS" in text:
        out.write(json.dumps({"protocol": 1, "type": "error", "id": rid, "code": "ENGINE_ERROR",
                              "detail": "x"}) + "\n"); out.flush(); continue
    res = {"protocol": 1, "type": "result", "id": "other" if "WRONGID" in text else rid,
           "docVersion": req["docVersion"], "settingsVersion": req["settingsVersion"],
           "engineVersion": "6.8", "status": "complete", "analysisMs": 1.0, "issues": []}
    out.write(json.dumps(res, ensure_ascii=False) + "\n"); out.flush()
