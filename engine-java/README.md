# engine-java — LanguageTool PL stdin/stdout adapter (phase 0 experiment)

Minimal Java process around `org.languagetool:language-pl:6.8` (PLAN.md sections 2, 4, 5).
Protocol v1 is defined by Ortografi Desktop's `contracts/v1/protocol.schema.json` (PR #8). Until
that merges, a copy lives in `src/test/resources/contracts/` and `ProtocolContractTest` validates
real adapter output, the shared examples and the corpus fixtures against it.

## Build and test

Requires Temurin 21 (measured with 21.0.12.1+1) and Maven 3.9.

```sh
mvn test            # 89 JUnit 5 tests; LanguageToolCheckerTest runs the real pinned engine
mvn package         # target/ortografi-engine-0.0.1-phase0.jar + target/lib/*.jar (engine JARs kept separate, LGPL)
java -jar target/ortografi-engine-0.0.1-phase0.jar
scripts/jlink-runtime.sh --check      # pinned runtime-modules.txt still covers jdeps output
scripts/jlink-runtime.sh target/runtime
python3 scripts/smoke_test.py --java target/runtime/bin/java --compare-java "$JAVA_HOME/bin/java"
```

CI: `.github/workflows/engine.yml` runs all of the above on ubuntu, macOS and Windows.

## Protocol v1 (JSON lines, UTF-8)

One JSON object per line each way; text newlines are escaped inside JSON. Requests are
processed sequentially by one `JLanguageTool` instance. stdout carries protocol messages
only (`System.out` is redirected to stderr at startup); stderr carries logs and never user text.

```text
<- {"protocol":1,"type":"ready","engineVersion":"6.8","language":"pl-PL"}
-> {"protocol":1,"type":"check","id":"r1","docVersion":7,"settingsVersion":3,"text":"Wiem że kotaa."}
<- {"protocol":1,"type":"result","id":"r1","docVersion":7,"settingsVersion":3,"engineVersion":"6.8",
    "status":"complete","analysisMs":12.3,"issues":[{"start":4,"end":4,"ruleId":"BRAK_PRZECINKA_ZE",
    "category":"punctuation","engineCategory":"PUNCTUATION","issueType":"typographical",
    "message":"Przed spójnikiem „że” stawiamy przecinek: „Wiem, że”.","replacements":[","]}, …]}
-> {"protocol":1,"type":"shutdown"}
```

- `start`/`end` are **UTF-16 code units** (Java/JavaScript string indexes), `end` exclusive.
  Rust must not treat them as UTF-8 byte offsets.
- The engine analyses an **NFC copy** of the text (`NormalizingChecker` + `NfcText`); ranges
  are mapped back to the original, which is never altered. Replacements are re-expressed
  for the original range: words the fix doesn't touch keep their original form, and an edited
  word is written in NFC (e.g. `Wiem z\u0307e` → `Wiem, z\u0307e`; `gdan\u0301sk` → `Gdańsk`).
- `category` is the product category (`spelling` | `punctuation` | `grammar` | `style` |
  `other`) from `CategoryMapper`, the only place mapping happens (per-rule overrides for
  `SKROTY_Z_KROPKA`, `JEDNOSTKA_LICZBA` and the inflection entries of `PL_SIMPLE_REPLACE`); `engineCategory` is
  LanguageTool's category ID.
- **Insertions are zero-length** (`start == end`): when every replacement only inserts text at
  one point at a word boundary, the range is that point and the replacements are the inserted
  text (`"Wiem że"` 0..7 → `"Wiem, że"` becomes 4..4 → `","`). Insertions inside a word
  (`Poszłem` → `Poszedłem`, `wogóle` → `w ogóle`) stay whole-word replacements
  (`InsertionNarrowingChecker`).
- `message` is **plain text**: LanguageTool's `<suggestion>x</suggestion>` becomes `„x”`
  (`PlainMessage`). The UI must still never render it as HTML.
- A `check` needs `docVersion` and `settingsVersion` as integers ≥ 0. If either is missing or
  not such a number, the answer is `MALFORMED_REQUEST`, and the value is never copied through.
- Errors: `{"type":"error","id":…|null,"code":…,"detail":…}` with codes
  `MALFORMED_REQUEST`, `UNSUPPORTED_PROTOCOL`, `UNKNOWN_TYPE`, `TEXT_TOO_LONG`
  (limit 100,000 UTF-16 units; never truncates), `ENGINE_ERROR` (no user text echoed). An error
  answering a check carries that check's `docVersion` and `settingsVersion` together, when both
  are valid; errors not tied to a parseable check (`id: null`) carry neither. `TIMEOUT` and
  `ENGINE_UNAVAILABLE` come from the Rust supervisor, never from the adapter.
- The process exits 0 on `shutdown` or end of stdin.

## Corpus run (engine-result JSONL v1.0, tests/corpus/FORMAT.md)

```sh
java -cp "target/ortografi-engine-0.0.1-phase0.jar:target/lib/*" pl.ortografi.engine.CorpusRunner \
  ../tests/corpus/data/phase0-starter.jsonl > results.jsonl
node tests/corpus/tools/score.mjs --corpus 'tests/corpus/data/*.jsonl' --results results.jsonl --split dev [--match exact]
```

Never run `--split heldout` while tuning.

Known gaps: response-time limit/cancellation, message-size limit at the reader.

## Changes in phase 1 (for Desktop: Rust side and contracts/)

- Zero-length insertion ranges (`start == end`) now occur in results. Insert at `start`.
- `message` no longer contains `<suggestion>` markup.
- Errors answering a check now carry `docVersion` + `settingsVersion`.
- Stricter: a `check` with a missing, null, string, fractional or negative version is now
  `MALFORMED_REQUEST` (it used to return a result with `null` versions).
- New rule IDs: `ORTOGRAFI_PRZECINEK_PODMIOT_ORZECZENIE` (category `punctuation`).
- Recommended JVM flags changed: see the decision doc's memory section.
