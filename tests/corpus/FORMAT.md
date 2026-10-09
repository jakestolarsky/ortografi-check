# Polish quality corpus: format v1

Status: **draft, phase 0**. Owner: corpus work (`tests/corpus/`). Feedback welcome from the engine/adapter side.

This directory holds the Polish (`pl-PL`) quality corpus described in PLAN.md §10:
manually annotated examples with the *expected* issues and *acceptable* fixes. It is
not a copy of any engine's response, and nothing here depends on message wording.

All examples are original sentences written for this project (no copyrighted or
third-party data). Every example is unreviewed until a person with strong Polish
punctuation knowledge has verified it (`review_status`).

## Files

| Path | Purpose |
|---|---|
| `tests/corpus/data/*.jsonl` | Dev examples, one JSON object per line (canonical source): `phase0-starter.jsonl`, `phase1-dev.jsonl`, `phase2-dev.jsonl` |
| `tests/corpus/data/heldout/*.jsonl` | Held-out examples (`split: "heldout"`), never used for tuning |
| `tests/corpus/schema/corpus-example.v1.schema.json` | JSON Schema for one corpus line |
| `tests/corpus/schema/engine-result.v1.schema.json` | JSON Schema for one line of engine output fed to the scorer |
| `tests/corpus/tools/validate.mjs` | Validator: schema rules + UTF-16 range consistency |
| `tests/corpus/tools/score.mjs` | Scorer: precision / recall / F1 per category and overall |
| `tests/corpus/tools/corpus-lib.mjs`, `scoring.mjs` | Shared validation and scoring logic (importable) |
| `tests/corpus/tools/markup.mjs` | Optional authoring helper: inline markup → JSONL lines |
| `tests/corpus/tools/*.test.mjs` | Tests (`node --test tests/corpus/tools/`), incl. `data.test.mjs` which validates the committed corpus and checks the PLAN.md §10 control cases |

Tools are plain Node.js ESM (Node ≥ 20), no dependencies. JavaScript strings are
UTF-16, the same layout the app contract uses, so offsets need no conversion.

## Positions: UTF-16 code units

* `start` and `end` are **UTF-16 code-unit offsets** into `text`, `end` exclusive
  (`text.slice(start, end)` in JS, `text.substring(start, end)` in Java).
* Rust/Python consumers must convert: Python `len()` counts code points, Rust `str`
  indexes are UTF-8 bytes. Each example therefore carries `text_utf16_length` as a
  cross-check.
* A range must not split a surrogate pair. Splitting a base letter from a following
  combining mark (NFD text) is reported as a validator warning.
* `start == end` is a **zero-length range** (an insertion point), used for a missing
  comma or missing period. The insertion happens at that offset.
* Text is stored exactly as the engine receives it: line endings (`\n`, `\r\n`),
  NBSP, emoji, ZWJ sequences and decomposed (NFD) letters are kept verbatim. No
  normalization is applied anywhere in the tools.

## Corpus line (schema version `1.1`; `1.0` lines remain valid)

```json
{"schema_version":"1.0","id":"p0-0034","text":"Kupiłem chleb, i mleko.","text_utf16_length":23,
 "issues":[{"start":13,"end":14,"original":",","category":"punctuation","subcategory":"punctuation.extra_comma",
            "fixes":[""],"required":true}],
 "corrected_text":"Kupiłem chleb i mleko.","tags":["control","plan-s10"],"split":"dev",
 "release_critical":true,"needs_human_review":false,"review_status":"unreviewed",
 "source":"original","notes":"PLAN.md §10 control: incorrect comma before 'i'."}
```

| Field | Type | Meaning |
|---|---|---|
| `schema_version` | `"1.0"` | Format version. Minor bump = additive optional fields; major bump = breaking. Tools reject unknown majors. |
| `id` | string | Stable unique id, `^[a-z0-9]+(-[a-z0-9]+)*$`. Never reused after deletion. |
| `text` | string | Exact input text. |
| `text_utf16_length` | int | `text.length` in UTF-16 code units (cross-check). |
| `issues` | array | Expected issues; `[]` = a correct (clean) example. |
| `corrected_text` | string? | `text` after applying the **first** fix of every required issue that has fixes. Required when any required issue has fixes; validator recomputes it. |
| `tags` | string[] | Free-form coverage tags (`control`, `unicode`, `crlf`, `reform-2026`, `emoji`, …). |
| `split` | `"dev"` \| `"heldout"` | `heldout` examples must not be used for rule tuning (PLAN.md §10). |
| `release_critical` | bool | Must pass for 1.0 (all required issues found, top fix acceptable, no false positives). |
| `needs_human_review` | bool | Difficult or ambiguous; a Polish punctuation expert must confirm before it gates anything. |
| `review_status` | `"unreviewed"` \| `"verified"` \| `"disputed"` | Human review outcome. |
| `source` | string | `original` for examples written for this project; otherwise a license-compatible source id. |
| `notes` | string? | Rule reference / reasoning for the annotation (English or Polish). |

### Issue

| Field | Type | Meaning |
|---|---|---|
| `start`, `end` | int | UTF-16 range, `0 ≤ start ≤ end ≤ text_utf16_length`. |
| `original` | string | Must equal `text.slice(start, end)` (`""` for zero-length). Guards against off-by-one ranges. |
| `category` | `"spelling"` \| `"punctuation"` \| `"grammar"` \| `"style"` | The three error categories (PLAN.md §6), plus `style` (format 1.1+): a style suggestion, not an error (PLAN.md §1). A `style` issue must have `required: false` and its line must use `schema_version` ≥ `1.1`. |
| `subcategory` | string | Dotted, starts with the category, e.g. `spelling.o_u`, `spelling.rz_z`, `spelling.ch_h`, `spelling.nie`, `spelling.capitalization`, `spelling.diacritics`, `spelling.typo`, `spelling.compound`, `spelling.reform_2026`, `punctuation.missing_comma`, `punctuation.extra_comma`, `punctuation.spacing`, `punctuation.whitespace`, `punctuation.abbreviation`, `punctuation.quotes`, `grammar.inflection`, `grammar.agreement`, `grammar.comparative`, `grammar.idiom`, `grammar.numeral`, `grammar.preposition`, `grammar.negation`, `grammar.aspect`, `grammar.pronoun`, `punctuation.optional_comma`, `style.pronoun`, `style.colloquial`. Open list. |
| `fixes` | string[] | Acceptable replacements for `[start, end)`, best first. `""` = delete. `[]` = a warning without a ready fix (PLAN.md §1). |
| `required` | bool | `false` = optional/acceptable flag: reporting it is neither rewarded nor penalized, missing it is not a miss. |
| `notes` | string? | Per-issue note. |

Expected issues must not overlap each other (zero-length issues may touch a range edge).

### Deletion ranges

A **deletion** (an unnecessary comma or other punctuation mark) is annotated as:

* the range covers **only the deleted punctuation mark**, e.g. the comma alone
  (`end - start == 1` for a comma), never the surrounding words or spaces;
* `fixes` is `[""]`;
* the following space **stays** in the text (so `chleb, i` becomes `chleb i`).

Example (`p0-0001`, "Kupiłem chleb, i mleko."): `start 13, end 14, original ",", fixes [""]`.

Spacing errors are a different subcategory: `punctuation.spacing` (" ," → ",") and
`punctuation.whitespace` ("  " → " ") replace a range that includes the space.

Scoring: under the default `overlap` match, an engine may mark a wider span (for example
`, i` → ` i`) and still get credit, because fixes are compared by resulting text. Under
`--match exact` the predicted range must be exactly the comma. The data test checks every
`punctuation.extra_comma` issue against this convention.

## Splits: dev and held-out

PLAN.md §10 asks for data kept out of rule tuning. Every example has a permanent `split`:

* **`dev`**: use freely for tuning engine rules, category overrides, thresholds and adapter
  behavior. Files directly under `data/`.
* **`heldout`**: evaluation only. Files under `data/heldout/`; the validator rejects a
  `heldout` example outside that directory and a `dev` example inside it.

Policy:

1. **Tune only on dev.** Do not change rules, overrides, dictionaries or thresholds to fix a
   specific held-out failure. Run the scorer with `--split dev` while iterating.
2. **Evaluate held-out at milestones** (engine version change, end of a phase, before
   release) with `--split heldout`, record the numbers in `docs/decisions/` or
   `benchmarks/results/`, and compare with the previous held-out run.
3. **Inspect aggregate numbers, not individual held-out sentences.** If a held-out
   failure exposes a corpus error (wrong annotation), fix the annotation and note it; the
   example stays held-out.
4. **Assignments are permanent.** An example never moves between splits; ids are never
   reused. If held-out data is used for tuning by mistake, mark it in `notes` and add
   fresh held-out examples to replace it.
5. **How new examples are assigned.** About 70/30 dev/held-out, stratified by
   (no-issue sentence or category of the first issue) × `release_critical`. Within each
   stratum, new examples are ordered by `sha256("ortografi-split-v1:" + id)` and the
   first ones fill the stratum's 30% held-out quota. Phase 0 examples (`p0-*`) were
   already used for tuning before the split existed, so they all stay `dev`; the quota
   for each stratum was filled from new examples only.
   Phase 2 (`p2-*`) was split the same way within its own new examples, with strata
   (no-issue sentence or subcategory of the first issue) × `release_critical`. Existing
   examples were not moved.

## Engine result line (input to the scorer), schema version `1.0`

One JSON object per line, one line per corpus example:

```json
{"schema_version":"1.0","id":"p0-0034","status":"complete","engine":"languagetool-pl 6.8",
 "issues":[{"start":12,"end":14,"category":"punctuation","rule_id":"PL_COMMA_X","replacements":["b"]}]}
```

* `status`: `complete` | `incomplete` | `error`. Non-complete results are reported
  separately and their expected issues count as misses (an incomplete result must not
  look clean, PLAN.md §4).
* `issues[].start/end`: UTF-16 offsets into the corpus `text` (same convention).
* `issues[].category`: one of the three categories when known; anything else is
  scored as its own category (e.g. `style`, `other`). Adapter-side category mapping is
  the adapter's job (PLAN.md §9); the scorer does not reclassify by message text.
* `issues[].replacements`: suggestions in engine order; may be empty.
* `rule_id`, `message`, and extra fields are allowed and ignored by scoring.
* A corpus example with no result line is reported as `missing` (counted as misses).

## Protocol v1 input (engine stdout as-is)

The scorer and `validate.mjs --engine` also accept engine protocol v1 messages exactly as
defined in `contracts/v1/protocol.schema.json` and `contracts/README.md`, so an engine run
can be piped straight from the adapter's stdout. Both formats may be mixed in one file;
a line is treated as v1 when it has `protocol` and no `schema_version`.

* **Mapping to examples.** The check request `id` is `corpus-<example id>`, e.g.
  `corpus-p0-0003`. This is a test-tooling convention (`contracts/tools/build-examples.mjs`
  and the corpus runner), not part of the protocol, which treats `id` as opaque. The scorer strips the
  `corpus-` prefix; an id without it is used as the example id unchanged. `docVersion` and
  `settingsVersion` are not used for mapping (the stale filter is the app's job, not the
  scorer's). Two answers for the same example are an error.
* **`result`** becomes a scorer line with `status: complete`; `issues[].start/end`
  (UTF-16, end exclusive, `start == end` = insertion), `category`, `ruleId` and
  `replacements` carry over unchanged. Unknown fields, `protocol` other than `1`, `status`
  other than `complete`, and categories outside the schema enum are rejected.
* **`error` with an `id`** becomes `status: error` for that example (counted as misses,
  reported under incomplete/error results). An `error` with `id: null`, and `ready`,
  `check` and `shutdown` lines, are skipped.
* **Deletions** (contracts decision): an issue whose replacements are all `""` deletes
  its whole `[start, end)` range, in any category and of any length. Removing an
  unnecessary comma (`end = start + 1`, contracts README) is just the common example; the
  scorer does not reject other deletions in engine output.

Example fixture: `tests/corpus/tools/fixtures/v1-results.jsonl`.

## Scoring

1. **Range match.** A predicted issue *can* match an expected one when their ranges
   overlap; with a zero-length range on either side, touching counts
   (`p.start ≤ e.end && e.start ≤ p.end`). `--match exact` requires identical ranges.
2. **Fix acceptance is text-based.** A replacement is accepted when applying it at the
   predicted range yields the **same full text** as applying some acceptable fix at the
   expected range. So `chleb, i` → `chleb i` over a wider range is equivalent to
   deleting the comma. Engines may mark different spans for the same edit.
3. **Assignment.** One-to-one greedy assignment by score
   (exact range > top replacement accepted > any accepted > category agreement > overlap).
   Category is *not* required for a match; disagreements are counted
   (`category_mismatches`). `--strict-category` requires it.
4. **Counts.** Matched required issue → TP (counted under the expected category).
   Unmatched required → FN. Unmatched prediction → FP (under the predicted category).
   Matches to optional issues are neutral.
5. **Annotated optional and style issues.** `required: false` issues (including every
   `style` issue) are neutral: an engine that flags them, under any category, gets no
   TP or FP, and an engine that does not flag them gets no FN. A sentence whose
   issues are all optional counts as **clean** for the false-positive rate. Use this
   for "acceptable either way" cases such as an optional comma. The report lists
   `expected_non_error` (how many annotated `style` issues the engine flagged).
6. **Non-error categories.** Predictions whose `category` is a string outside
   `spelling` / `punctuation` / `grammar` (e.g. `style`, `other`) are **not scored**:
   they cannot match expected issues and do not count as TP/FP. They are reported per
   category under `excluded_categories` (total, and how many fell on no-issue
   sentences). They **do** count toward the false-positive rate on clean sentences,
   which is split into `with_error_category_fp` and `with_only_excluded_category`;
   a style/other prediction that lands on an annotated optional issue is not a false alarm.
   They do not fail a release-critical example. Predictions with no category are still
   scored (as `unknown`). `--score-all-categories` restores the scoring-1.0 behavior.
7. **Metrics** per category and overall: precision, recall, F1; for TPs with fixes,
   top-suggestion accuracy and any-suggestion accuracy. Clean set: number and share of
   clean examples with ≥ 1 false positive (PLAN.md target ≤ 2%, report absolute count).
   Release-critical failures are listed by id.

Scores describe this corpus only, never Polish in general (PLAN.md §10).

## Commands

```sh
node tests/corpus/tools/validate.mjs 'tests/corpus/data/**/*.jsonl'
node tests/corpus/tools/validate.mjs --engine results.jsonl --corpus 'tests/corpus/data/**/*.jsonl'
# while tuning (dev only):
node tests/corpus/tools/score.mjs --corpus 'tests/corpus/data/**/*.jsonl' --results results.jsonl --split dev
# at milestones:
node tests/corpus/tools/score.mjs --corpus 'tests/corpus/data/**/*.jsonl' --results results.jsonl --split heldout
# --corpus takes several files and/or quoted globs (`*`, `?`, `**`) until the next option.
# options: [--json] [--match exact] [--strict-category] [--score-all-categories] [--fail-on-release-critical]
node --test tests/corpus/tools/
```

## Authoring helper (optional)

`markup.mjs` converts inline markup into a JSONL line so nobody counts offsets by hand:

* `{{wrong=>fix1|fix2@sub.category}}` replacement; `{{,=>@punctuation.extra_comma}}` deletion;
  `{{=>,@punctuation.missing_comma}}` insertion; `{{span!@grammar.x}}` warning without fix;
  prefix `?` (`{{?…}}`) marks an optional issue.

The JSONL file stays the single source of truth; markup is only an input aid.

## Changelog

* **Corpus format 1.1** (PR #3 review): new `style` category for annotated style
  issues (always `required: false`, line `schema_version` ≥ 1.1). Older 1.0 lines
  stay valid. Schema `corpus-example.v1.schema.json` updated.
* **Scoring 1.2** (PR #3 review): expected non-error issues are always neutral; clean =
  no required issue; style/other predictions on annotated optional issues are not
  clean-sentence false alarms; `expected_non_error` in the report. `score.mjs` and
  `validate.mjs` take several files and globs after `--corpus`.
* **Result input: protocol v1** (phase 3): `score.mjs` and `validate.mjs --engine` accept
  `contracts/v1` messages (`result`, `error`) next to corpus result lines; see
  "Protocol v1 input". Scoring rules unchanged (still 1.2).
* **Phase 3 data**: 50 dev (`phase3-dev.jsonl`, 40 grammar errors + 10 clean grammar
  controls) and 10 held-out (`heldout/phase3-heldout.jsonl`, 7 errors + 3 clean) grammar
  examples, added because grammar recall was the weakest category in Engine's PR #18 dev
  run (41.2%). New subcategories: `grammar.case_government`, `grammar.participle`.

* **Corpus format 1.0**: unchanged in the first phase-1 commit (no schema change). The `split` field
  existed from the start; phase 1 only assigns `heldout`.
* **Scoring 1.1** (phase 1): `style`/`other` and any other non-error engine categories
  are reported separately and excluded from precision and recall, but still count
  toward the clean-sentence false-positive rate. Added `--split`,
  `--score-all-categories`, and `scoring_version` plus split counts in the report.
  The validator now checks that each `split` matches the file's directory.
* **Scoring 1.0** (phase 0): initial version.
