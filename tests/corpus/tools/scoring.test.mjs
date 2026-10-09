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

test('style/other predictions are reported apart and excluded from P/R, but count on clean sentences', () => {
  const corpus = [
    ex('s', 'Mój wójek.', [iss(4, 9, 'spelling', ['wujek'])]),
    ex('c', 'Kot śpi na kanapie.', []),
    ex('d', 'Pies śpi.', []),
  ];
  const results = new Map([
    res('s', [{ start: 4, end: 9, category: 'style', replacements: ['wujek'] }, { start: 0, end: 3, category: 'other', replacements: [] }]),
    res('c', [{ start: 11, end: 18, category: 'style', replacements: ['sofie'] }]),
    res('d', [{ start: 0, end: 4, category: 'spelling', replacements: ['Pis'] }]),
  ]);
  const r = scoreCorpus(corpus, results);
  assert.equal(r.categories.style, undefined);
  assert.equal(r.categories.other, undefined);
  assert.deepEqual([r.overall.tp, r.overall.fp, r.overall.fn], [0, 1, 1]); // a style hit cannot satisfy a spelling issue
  assert.deepEqual(r.excluded_categories, { style: { predictions: 2, on_clean_examples: 1 }, other: { predictions: 1, on_clean_examples: 0 } });
  assert.equal(r.clean_set.with_false_positive, 2);
  assert.equal(r.clean_set.with_error_category_fp, 1);
  assert.equal(r.clean_set.with_only_excluded_category, 1);
  assert.equal(r.clean_set.false_positive_rate, 1);

  const all = scoreCorpus(corpus, results, { scoreAllCategories: true });
  assert.equal(all.categories.style.fp, 1);
  assert.equal(all.overall.tp, 1);
  assert.deepEqual(all.excluded_categories, {});
});

test('predictions without a category are still scored', () => {
  const r = scoreCorpus([ex('c', 'Kot śpi.', [])], new Map([res('c', [{ start: 0, end: 3 }])]));
  assert.equal(r.categories.unknown.fp, 1);
});

test('report counts examples per split', () => {
  const r = scoreCorpus([ex('a', 'A.', [], { split: 'dev' }), ex('b', 'B.', [], { split: 'heldout' })], new Map([res('a', []), res('b', [])]), { split: 'all' });
  assert.deepEqual(r.splits, { dev: 1, heldout: 1 });
  assert.equal(r.options.split, 'all');
});

test('expected style issues are neutral; style hits on them do not count against clean sentences', () => {
  const text = 'Mi się to nie podoba.';
  const corpus = [ex('m', text, [{ start: 0, end: 2, category: 'style', fixes: ['Mnie'], required: false }])];
  const flaggedStyle = scoreCorpus(corpus, new Map([res('m', [{ start: 0, end: 2, category: 'style', replacements: ['Mnie'] }])]));
  assert.deepEqual([flaggedStyle.overall.tp, flaggedStyle.overall.fp, flaggedStyle.overall.fn], [0, 0, 0]);
  assert.equal(flaggedStyle.clean_set.examples, 1);
  assert.equal(flaggedStyle.clean_set.with_false_positive, 0);
  assert.deepEqual(flaggedStyle.expected_non_error, { style: { expected: 1, flagged: 1 } });
  const flaggedGrammar = scoreCorpus(corpus, new Map([res('m', [{ start: 0, end: 2, category: 'grammar', replacements: ['Mnie'] }])]));
  assert.deepEqual([flaggedGrammar.overall.tp, flaggedGrammar.overall.fp], [0, 0]);
  const none = scoreCorpus(corpus, new Map([res('m', [])]));
  assert.equal(none.overall.fn, 0);
  assert.deepEqual(none.expected_non_error, { style: { expected: 1, flagged: 0 } });
  // A style prediction elsewhere on that sentence still counts as a clean-sentence false alarm.
  const elsewhere = scoreCorpus(corpus, new Map([res('m', [{ start: 14, end: 20, category: 'style', replacements: [] }])]));
  assert.equal(elsewhere.clean_set.with_false_positive, 1);
});

test('optional comma: inserting it or not are both fine', () => {
  const corpus = [ex('o', 'Według mnie to dobry pomysł.', [{ start: 11, end: 11, category: 'punctuation', fixes: [','], required: false }])];
  for (const issues of [[], [{ start: 11, end: 11, category: 'punctuation', replacements: [','] }]]) {
    const r = scoreCorpus(corpus, new Map([res('o', issues)]));
    assert.deepEqual([r.overall.tp, r.overall.fp, r.overall.fn, r.clean_set.with_false_positive], [0, 0, 0, 0]);
  }
});
