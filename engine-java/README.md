# engine-java — LanguageTool PL stdin/stdout adapter (phase 0 experiment)

Minimal Java process around `org.languagetool:language-pl:6.8` (PLAN.md sections 2, 4, 5).
Experimental: protocol v1 below is a phase-0 sketch, not the final versioned contract
(that belongs in `contracts/` in phase 1).

## Build and test

Requires Temurin 21 (measured with 21.0.12.1+1) and Maven 3.9.

```sh
mvn test            # 43 JUnit 5 tests; LanguageToolCheckerTest runs the real pinned engine
mvn package         # target/ortografi-engine-0.0.1-phase0.jar + target/lib/*.jar (engine JARs kept separate, LGPL)
java -jar target/ortografi-engine-0.0.1-phase0.jar
```

## Protocol v1 (JSON lines, UTF-8)

One JSON object per line each way; text newlines are escaped inside JSON. Requests are
processed sequentially by one `JLanguageTool` instance. stdout carries protocol messages
only (`System.out` is redirected to stderr at startup); stderr carries logs and never user text.

```text
<- {"protocol":1,"type":"ready","engineVersion":"6.8","language":"pl-PL"}
-> {"protocol":1,"type":"check","id":"r1","docVersion":7,"settingsVersion":3,"text":"Wiem że kotaa."}
<- {"protocol":1,"type":"result","id":"r1","docVersion":7,"settingsVersion":3,"engineVersion":"6.8",
    "status":"complete","analysisMs":12.3,"issues":[{"start":0,"end":7,"ruleId":"BRAK_PRZECINKA_ZE",
    "category":"punctuation","engineCategory":"PUNCTUATION","issueType":"typographical","message":"…","replacements":["Wiem, że"]}, …]}
-> {"protocol":1,"type":"shutdown"}
```

- `start`/`end` are **UTF-16 code units** (Java/JavaScript string indexes), `end` exclusive.
  Rust must not treat them as UTF-8 byte offsets.
- The engine analyses an **NFC copy** of the text (`NormalizingChecker` + `NfcText`); ranges
  are mapped back to the original, which is never altered. Replacements are NFC.
- `category` is the product category (`spelling` | `punctuation` | `grammar` | `style` |
  `other`) from `CategoryMapper`, the only place mapping happens; `engineCategory` is
  LanguageTool's category ID.
- Errors: `{"type":"error","id":…|null,"code":…,"detail":…}` with codes
  `MALFORMED_REQUEST`, `UNSUPPORTED_PROTOCOL`, `UNKNOWN_TYPE`, `TEXT_TOO_LONG`
  (limit 100,000 UTF-16 units; never truncates), `ENGINE_ERROR` (no user text echoed).
- The process exits 0 on `shutdown` or end of stdin.

## Corpus run (engine-result JSONL v1.0, tests/corpus/FORMAT.md)

```sh
java -cp "target/ortografi-engine-0.0.1-phase0.jar:target/lib/*" pl.ortografi.engine.CorpusRunner \
  ../tests/corpus/data/phase0-starter.jsonl > results.jsonl
node tests/corpus/tools/score.mjs --corpus tests/corpus/data/phase0-starter.jsonl --results results.jsonl
```

Known gaps (phase 1+): message markup (`<suggestion>…</suggestion>` appears in LT messages),
response-time limit/cancellation, message-size limit at the reader, JSON schema in `contracts/`.
