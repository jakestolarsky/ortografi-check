import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rangesMatch, replacementAccepted, matchExample, scoreCorpus } from './scoring.mjs';

const ex = (id, text, issues, extra = {}) => ({ id, text, issues, release_critical: false, ...extra });
const iss = (start, end, category, fixes, required = true) => ({ start, end, category, fixes, required });
const res = (id, issues, status = 'complete') => [id, { schema_version: '1.0', id, status, issues }];

test('range matching: overlap, zero-length touch, exact', () => {
  assert.equal(rangesMatch({ start: 2, end: 5 }, { start: 4, end: 8 }), true);
  assert.equal(rangesMatch({ start: 2, end: 5 }, { start: 5, end: 8 }), false);
  assert.equal(rangesMatch({ start: 4, end: 4 }, { start: 0, end: 4 }), true); // insertion touching the word before
  assert.equal(rangesMatch({ start: 4, end: 4 }, { start: 4, end: 4 }), true);
  assert.equal(rangesMatch({ start: 4, end: 4 }, { start: 6, end: 9 }), false);
  assert.equal(rangesMatch({ start: 2, end: 5 }, { start: 2, end: 6 }, 'exact'), false);
});

test('fix acceptance compares resulting text, not spans', () => {
  const text = 'Kupiłem chleb, i mleko.';
  const e = iss(13, 14, 'punctuation', ['']);
  assert.equal(replacementAccepted(text, e, { start: 8, end: 14 }, 'chleb'), true);
  assert.equal(replacementAccepted(text, e, { start: 13, end: 14 }, ''), true);
  assert.equal(replacementAccepted(text, e, { start: 13, end: 14 }, ';'), false);
  const w = 'Wiem że';
  assert.equal(replacementAccepted(w, iss(4, 4, 'punctuation', [',']), { start: 0, end: 4 }, 'Wiem,'), true);
});

test('UTF-16 offsets after emoji are scored exactly', () => {
  const text = 'Prezent 🎁 i dziekuje!';
  const start = text.indexOf('dziekuje');
  assert.equal(start, 13); // 🎁 is two code units
  const corpus = [ex('e1', text, [iss(start, start + 8, 'spelling', ['dziękuję'])])];
  const good = scoreCorpus(corpus, new Map([res('e1', [{ start: 13, end: 21, category: 'spelling', replacements: ['dziękuję'] }])]), { match: 'exact' });
  assert.equal(good.overall.tp, 1);
  assert.equal(good.overall.top1_accuracy, 1);
  // A code-point-based offset (off by one) fails exact matching.
  const bad = scoreCorpus(corpus, new Map([res('e1', [{ start: 12, end: 20, category: 'spelling', replacements: ['dziękuję'] }])]), { match: 'exact' });
  assert.equal(bad.overall.tp, 0);
  assert.equal(bad.overall.fp, 1);
  assert.equal(bad.overall.fn, 1);
});

test('per-category precision, recall, F1 and suggestion accuracy', () => {
  const corpus = [
    ex('a', 'Wiem że to ważne.', [iss(4, 4, 'punctuation', [','])]),
    ex('b', 'Mój wójek.', [iss(4, 9, 'spelling', ['wujek'])]),
    ex('c', 'Kot śpi.', []),
  ];
  const results = new Map([
    res('a', [{ start: 0, end: 4, category: 'punctuation', replacements: ['Wiem,'] }]),
    res('b', [{ start: 4, end: 9, category: 'spelling', replacements: ['wójka', 'wujek'] }]),
    res('c', [{ start: 0, end: 3, category: 'spelling', replacements: ['Kto'] }]),
  ]);
  const r = scoreCorpus([...corpus], results);
  assert.deepEqual([r.categories.punctuation.tp, r.categories.punctuation.fp, r.categories.punctuation.fn], [1, 0, 0]);
  assert.deepEqual([r.categories.spelling.tp, r.categories.spelling.fp, r.categories.spelling.fn], [1, 1, 0]);
  assert.equal(r.categories.spelling.precision, 0.5);
  assert.equal(r.categories.spelling.recall, 1);
  assert.ok(Math.abs(r.categories.spelling.f1 - 2 / 3) < 1e-12);
  assert.equal(r.categories.spelling.top1_accuracy, 0);
  assert.equal(r.categories.spelling.any_accuracy, 1);
  assert.equal(r.overall.tp, 2);
  assert.equal(r.overall.fp, 1);
  assert.equal(r.clean_set.examples, 1);
  assert.equal(r.clean_set.with_false_positive, 1);
  assert.deepEqual(r.clean_set.ids, ['c']);
});

test('optional issues are neutral; missing and incomplete results count as misses', () => {
  const corpus = [
    ex('o', 'Ten problem moim zdaniem jest.', [iss(11, 11, 'punctuation', [','], false)]),
    ex('m', 'Wiem że tak.', [iss(4, 4, 'punctuation', [','])], { release_critical: true }),
    ex('i', 'Wiem że nie.', [iss(4, 4, 'punctuation', [','])]),
  ];
  const r = scoreCorpus(corpus, new Map([
    res('o', [{ start: 11, end: 11, category: 'punctuation', replacements: [','] }]),
    res('i', [{ start: 4, end: 4, category: 'punctuation', replacements: [','] }], 'incomplete'),
  ]));
  assert.equal(r.overall.tp, 0);
  assert.equal(r.overall.fp, 0);
  assert.equal(r.overall.fn, 2);
  assert.deepEqual(r.missing, ['m']);
  assert.deepEqual(r.incomplete, ['i']);
  assert.deepEqual(r.release_critical_failures.map((f) => f.id), ['m']);
});

test('one prediction cannot satisfy two expected issues; category mismatch is counted', () => {
  const text = 'Książka którą pożyczyłeś jest.';
  const corpus = [ex('x', text, [iss(7, 7, 'punctuation', [',']), iss(24, 24, 'punctuation', [','])])];
  const r = scoreCorpus(corpus, new Map([res('x', [{ start: 7, end: 7, category: 'grammar', replacements: [','] }])]));
  assert.equal(r.overall.tp, 1);
  assert.equal(r.overall.fn, 1);
  assert.equal(r.overall.category_mismatches, 1);
  const strict = scoreCorpus(corpus, new Map([res('x', [{ start: 7, end: 7, category: 'grammar', replacements: [','] }])]), { strictCategory: true });
  assert.equal(strict.overall.tp, 0);
  assert.equal(strict.categories.grammar.fp, 1);
});

test('greedy assignment prefers exact range with accepted fix', () => {
  const text = 'abc def';
  const m = matchExample(text, [iss(0, 3, 'spelling', ['xyz'])], [
    { start: 0, end: 7, category: 'spelling', replacements: ['q'] },
    { start: 0, end: 3, category: 'spelling', replacements: ['xyz'] },
  ]);
  assert.equal(m.matches[0].pi, 1);
  assert.deepEqual(m.unmatchedPredicted, [0]);
});

test('release-critical clean example fails on any false positive', () => {
  const corpus = [ex('k', 'Obiecał, że przyjdzie, i dotrzymał słowa.', [], { release_critical: true })];
  const r = scoreCorpus(corpus, new Map([res('k', [{ start: 21, end: 22, category: 'punctuation', replacements: [''] }])]));
  assert.deepEqual(r.release_critical_failures.map((f) => f.id), ['k']);
  const ok = scoreCorpus(corpus, new Map([res('k', [])]));
  assert.deepEqual(ok.release_critical_failures, []);
  assert.equal(ok.overall.f1, null);
});
