import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateExample, validateCorpus, splitsSurrogatePair, splitsCombiningMark, computeCorrectedText, parseJsonl, validateEngineResult } from './corpus-lib.mjs';

const base = (over = {}) => ({
  schema_version: '1.0', id: 't-1', text: 'Wiem że tak.', text_utf16_length: 12,
  issues: [{ start: 4, end: 4, original: '', category: 'punctuation', subcategory: 'punctuation.missing_comma', fixes: [','], required: true }],
  corrected_text: 'Wiem, że tak.', tags: [], split: 'dev', release_critical: false, needs_human_review: false,
  review_status: 'unreviewed', source: 'original', ...over,
});
const errs = (ex) => validateExample(ex).errors;

test('valid example passes', () => assert.deepEqual(errs(base()), []));

test('text_utf16_length must equal UTF-16 length, not code points', () => {
  const text = 'Kot 🐈 śpi.'; // emoji = 2 UTF-16 units, 1 code point
  assert.equal(text.length, 11);
  assert.equal([...text].length, 10);
  const ex = base({ text, text_utf16_length: 10, issues: [], corrected_text: undefined });
  assert.match(errs(ex).join(), /text_utf16_length 10 != actual UTF-16 length 11/);
  assert.deepEqual(errs({ ...ex, text_utf16_length: 11 }), []);
});

test('range out of bounds is rejected', () => {
  const ex = base({ issues: [{ ...base().issues[0], start: 12, end: 13 }] });
  assert.match(errs(ex).join(), /out of bounds/);
  assert.match(errs(base({ issues: [{ ...base().issues[0], start: 5, end: 4 }] })).join(), /out of bounds/);
  assert.match(errs(base({ issues: [{ ...base().issues[0], start: -1 }] })).join(), /out of bounds/);
});

test('original must match the UTF-16 slice', () => {
  const ex = base({ issues: [{ ...base().issues[0], original: 'x' }] });
  assert.match(errs(ex).join(), /original "x" != text.slice/);
});

test('offset inside a surrogate pair is an error', () => {
  const text = 'A😀B';
  assert.equal(splitsSurrogatePair(text, 2), true);
  assert.equal(splitsSurrogatePair(text, 1), false);
  assert.equal(splitsSurrogatePair(text, 3), false);
  const ex = base({ text, text_utf16_length: 4, corrected_text: undefined,
    issues: [{ start: 2, end: 3, original: text.slice(2, 3), category: 'spelling', subcategory: 'spelling.typo', fixes: [], required: true }] });
  assert.match(errs(ex).join(), /splits a surrogate pair/);
});

test('lone surrogate in text is an error', () => {
  const ex = base({ text: 'a\ud83d b', text_utf16_length: 4, issues: [], corrected_text: undefined });
  assert.match(errs(ex).join(), /lone surrogate/);
});

test('offset before a combining mark is a warning', () => {
  const text = 'ło\u0301d'; // ł o ◌́ d
  assert.equal(splitsCombiningMark(text, 2), true);
  const ex = base({ text, text_utf16_length: 4, corrected_text: undefined,
    issues: [{ start: 1, end: 2, original: 'o', category: 'spelling', subcategory: 'spelling.typo', fixes: [], required: true }] });
  const r = validateExample(ex);
  assert.deepEqual(r.errors, []);
  assert.match(r.warnings.join(), /combining mark/);
});

test('corrected_text is recomputed and required', () => {
  assert.match(errs(base({ corrected_text: 'Wiem że tak.' })).join(), /corrected_text mismatch/);
  assert.match(errs(base({ corrected_text: undefined })).join(), /corrected_text is required/);
});

test('computeCorrectedText applies required first fixes right-to-left', () => {
  const ex = { text: 'Ksiązka ktora', issues: [
    { start: 0, end: 7, fixes: ['Książka'], required: true },
    { start: 7, end: 7, fixes: [','], required: true },
    { start: 8, end: 13, fixes: ['która'], required: false },
  ] };
  assert.equal(computeCorrectedText(ex), 'Książka, ktora');
});

test('overlapping issues, no-op fixes, bad categories are rejected', () => {
  const i0 = { start: 0, end: 4, original: 'Wiem', category: 'spelling', subcategory: 'spelling.typo', fixes: ['Wie'], required: true };
  const i1 = { start: 2, end: 6, original: 'em ż', category: 'spelling', subcategory: 'spelling.typo', fixes: ['x'], required: true };
  assert.match(errs(base({ issues: [i0, i1], corrected_text: undefined })).join(), /overlap/);
  assert.match(errs(base({ issues: [{ ...i0, fixes: ['Wiem'] }], corrected_text: undefined })).join(), /no-op/);
  assert.match(errs(base({ issues: [{ ...i0, category: 'style', subcategory: 'style.x' }], corrected_text: undefined })).join(), /category must be one of/);
  assert.match(errs(base({ issues: [{ ...base().issues[0], fixes: [''] }], corrected_text: undefined })).join(), /zero-length range is a no-op/);
});

test('unsupported schema major and unknown fields are rejected', () => {
  assert.match(errs(base({ schema_version: '2.0' })).join(), /unsupported schema_version major 2/);
  assert.match(errs(base({ extra: 1 })).join(), /unknown field "extra"/);
});

test('duplicate ids are rejected across the corpus', () => {
  const r = validateCorpus([{ line: 1, value: base() }, { line: 2, value: base() }]);
  assert.match(r.errors.join(), /duplicate id/);
});

test('parseJsonl handles CRLF files and reports bad lines', () => {
  assert.equal(parseJsonl('{"a":1}\r\n\r\n{"a":2}\r\n').length, 2);
  assert.throws(() => parseJsonl('{"a":1}\n{oops}\n', 'f'), /f:2: invalid JSON/);
});

test('engine results are range-checked against the corpus text', () => {
  const ex = base();
  const ok = { schema_version: '1.0', id: 't-1', status: 'complete', issues: [{ start: 0, end: 4, replacements: ['Wiem,'] }] };
  assert.deepEqual(validateEngineResult(ok, ex), []);
  assert.match(validateEngineResult({ ...ok, issues: [{ start: 0, end: 99 }] }, ex).join(), /out of bounds/);
  assert.match(validateEngineResult({ ...ok, status: 'done' }, ex).join(), /status must be one of/);
});

test('split must match file location', async () => {
  const { checkSplitLocation } = await import('./corpus-lib.mjs');
  const dev = { line: 1, value: base({ split: 'dev' }) };
  const held = { line: 2, value: base({ id: 't-2', split: 'heldout' }) };
  assert.deepEqual(checkSplitLocation('data/a.jsonl', [dev]), []);
  assert.deepEqual(checkSplitLocation('data/heldout/b.jsonl', [held]), []);
  assert.match(checkSplitLocation('data/a.jsonl', [held]).join(), /expected "dev"/);
  assert.match(checkSplitLocation('data/heldout/b.jsonl', [dev]).join(), /expected "heldout"/);
});
