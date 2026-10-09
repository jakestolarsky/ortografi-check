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
| `tests/corpus/data/*.jsonl` | Corpus examples, one JSON object per line (canonical source) |
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

## Corpus line (schema version `1.0`)

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
| `category` | `"spelling"` \| `"punctuation"` \| `"grammar"` | The three user-facing categories (PLAN.md §6). |
| `subcategory` | string | Dotted, starts with the category, e.g. `spelling.o_u`, `spelling.rz_z`, `spelling.ch_h`, `spelling.nie`, `spelling.capitalization`, `spelling.diacritics`, `spelling.typo`, `spelling.reform_2026`, `punctuation.missing_comma`, `punctuation.extra_comma`, `punctuation.spacing`, `punctuation.whitespace`, `punctuation.abbreviation`, `punctuation.quotes`, `grammar.inflection`, `grammar.agreement`. Open list. |
| `fixes` | string[] | Acceptable replacements for `[start, end)`, best first. `""` = delete. `[]` = a warning without a ready fix (PLAN.md §1). |
| `required` | bool | `false` = optional/acceptable flag: reporting it is neither rewarded nor penalized, missing it is not a miss. |
| `notes` | string? | Per-issue note. |

Expected issues must not overlap each other (zero-length issues may touch a range edge).

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
5. **Metrics** per category and overall: precision, recall, F1; for TPs with fixes,
   top-suggestion accuracy and any-suggestion accuracy. Clean set: number and share of
   clean examples with ≥ 1 false positive (PLAN.md target ≤ 2%, report absolute count).
   Release-critical failures are listed by id.

Scores describe this corpus only, never Polish in general (PLAN.md §10).

## Commands

```sh
node tests/corpus/tools/validate.mjs tests/corpus/data/*.jsonl
node tests/corpus/tools/validate.mjs --engine results.jsonl --corpus tests/corpus/data/phase0-starter.jsonl
node tests/corpus/tools/score.mjs --corpus tests/corpus/data/phase0-starter.jsonl --results results.jsonl [--json] [--match exact] [--strict-category] [--fail-on-release-critical]
node --test tests/corpus/tools/
```

## Authoring helper (optional)

`markup.mjs` converts inline markup into a JSONL line so nobody counts offsets by hand:

* `{{wrong=>fix1|fix2@sub.category}}` replacement; `{{,=>@punctuation.extra_comma}}` deletion;
  `{{=>,@punctuation.missing_comma}}` insertion; `{{span!@grammar.x}}` warning without fix;
  prefix `?` (`{{?…}}`) marks an optional issue.

The JSONL file stays the single source of truth; markup is only an input aid.
