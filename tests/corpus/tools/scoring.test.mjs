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

test('fix acceptance (scoring 1.3): engine range within the expected range and same resulting sentence', () => {
  const text = 'Kupiłem chleb, i mleko.';
  const e = iss(13, 14, 'punctuation', ['']);
  assert.equal(replacementAccepted(text, e, { start: 13, end: 14 }, ''), true);
  assert.equal(replacementAccepted(text, e, { start: 13, end: 14 }, ';'), false);
  // A wider engine range is no longer a fix hit, even if the resulting text is right.
  assert.equal(replacementAccepted(text, e, { start: 8, end: 14 }, 'chleb'), false);
  const w = 'Wiem że';
  assert.equal(replacementAccepted(w, iss(4, 4, 'punctuation', [',']), { start: 4, end: 4 }, ','), true);
  assert.equal(replacementAccepted(w, iss(4, 4, 'punctuation', [',']), { start: 0, end: 4 }, 'Wiem,'), false);
  // NFC comparison: an NFD fix equals the NFC corpus fix.
  const z = 'Może to rzaba skacze.';
  assert.equal(replacementAccepted(z, iss(8, 13, 'spelling', ['żaba']), { start: 8, end: 10 }, 'z\u0307'), true);
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

// ---- scoring 1.3: minimal engine spans inside phrase-level annotations ----
const one = (corpus, issues, opts) => scoreCorpus(corpus, new Map([res(corpus[0].id, issues)]), opts);

test('minimal span with the correct fix: detection and top-1 fix hit', () => {
  const text = 'Nie widziałem tę książkę w bibliotece.';
  const corpus = [ex('m1', text, [iss(14, 24, 'grammar', ['tej książki'])])];
  const r = one(corpus, [{ start: 14, end: 16, category: 'grammar', replacements: ['tej'] }, { start: 17, end: 24, category: 'grammar', replacements: ['książki'] }]);
  // two minimal edits together fix the phrase: one hit, no FP
  assert.deepEqual([r.overall.tp, r.overall.fp, r.overall.fn, r.overall.top1_ok, r.overall.multi_edit_hits], [1, 0, 0, 1, 1]);
  const single = 'Szukam klucze od mieszkania.';
  const r2 = one([ex('m2', single, [iss(7, 13, 'grammar', ['kluczy'])])], [{ start: 11, end: 13, category: 'grammar', replacements: ['zy', 'ze'] }]);
  assert.deepEqual([r2.overall.tp, r2.overall.fp, r2.overall.top1_ok, r2.overall.any_ok], [1, 0, 1, 1]);
});

test('minimal span with a wrong fix: detection (TP) but no fix hit', () => {
  const text = 'Szukam klucze od mieszkania.';
  const r = one([ex('w1', text, [iss(7, 13, 'grammar', ['kluczy'])])], [{ start: 7, end: 13, category: 'grammar', replacements: ['klucza', 'kluczy'] }]);
  assert.deepEqual([r.overall.tp, r.overall.fp, r.overall.fn, r.overall.top1_ok, r.overall.any_ok], [1, 0, 0, 0, 1]);
  const r2 = one([ex('w2', text, [iss(7, 13, 'grammar', ['kluczy'])])], [{ start: 7, end: 9, category: 'grammar', replacements: ['xx'] }]);
  assert.deepEqual([r2.overall.tp, r2.overall.top1_ok, r2.overall.any_ok], [1, 0, 0]);
});

test('two-edit phrase (verb + numeral): combined fixes are one hit; a wrong combination is detection only', () => {
  const text = 'Na spotkanie przyszli dwa osoby.';
  // expected phrase "przyszli dwa" -> "przyszły dwie"
  const e = iss(13, 25, 'grammar', ['przyszły dwie']);
  const corpus = [ex('t1', text, [e])];
  const good = one(corpus, [{ start: 13, end: 21, category: 'grammar', replacements: ['przyszły'] }, { start: 22, end: 25, category: 'grammar', replacements: ['dwie'] }]);
  assert.deepEqual([good.overall.tp, good.overall.fp, good.overall.fn, good.overall.top1_ok, good.overall.multi_edit_hits], [1, 0, 0, 1, 1]);
  // second fix only via a later suggestion: any-hit, not top-1
  const anyOnly = one(corpus, [{ start: 13, end: 21, category: 'grammar', replacements: ['przyszły'] }, { start: 22, end: 25, category: 'grammar', replacements: ['dwóch', 'dwie'] }]);
  assert.deepEqual([anyOnly.overall.tp, anyOnly.overall.fp, anyOnly.overall.top1_ok, anyOnly.overall.any_ok], [1, 0, 0, 1]);
  // only one of the two edits: detection, no fix hit, no FP
  const half = one(corpus, [{ start: 22, end: 25, category: 'grammar', replacements: ['dwie'] }]);
  assert.deepEqual([half.overall.tp, half.overall.fp, half.overall.top1_ok], [1, 0, 0]);
  // two edits whose combination is wrong: one detection, the other is a false positive
  const bad = one(corpus, [{ start: 13, end: 21, category: 'grammar', replacements: ['przyszedł'] }, { start: 22, end: 25, category: 'grammar', replacements: ['dwóch'] }]);
  assert.deepEqual([bad.overall.tp, bad.overall.fp, bad.overall.top1_ok], [1, 1, 0]);
});

test('insertion: zero-length engine issue inside or at the edge of the expected range', () => {
  const text = 'Wiem że to ważne.';
  const corpus = [ex('i1', text, [iss(4, 4, 'punctuation', [','])])];
  const r = one(corpus, [{ start: 4, end: 4, category: 'punctuation', replacements: [','] }]);
  assert.deepEqual([r.overall.tp, r.overall.top1_ok], [1, 1]);
  const phrase = [ex('i2', text, [iss(0, 7, 'punctuation', ['Wiem, że'])])];
  const r2 = one(phrase, [{ start: 4, end: 4, category: 'punctuation', replacements: [','] }]);
  assert.deepEqual([r2.overall.tp, r2.overall.fp, r2.overall.top1_ok], [1, 0, 1]);
  // a whole-word span with "Wiem," is a detection but no longer a fix hit
  const r3 = one(corpus, [{ start: 0, end: 4, category: 'punctuation', replacements: ['Wiem,'] }]);
  assert.deepEqual([r3.overall.tp, r3.overall.top1_ok], [1, 0]);
});

test('deletion: comma-only and a longer deleted range', () => {
  const text = 'Był szybki, jak wiatr.';
  const r = one([ex('d1', text, [iss(10, 11, 'punctuation', [''])])], [{ start: 10, end: 11, category: 'punctuation', replacements: [''] }]);
  assert.deepEqual([r.overall.tp, r.overall.top1_ok], [1, 1]);
  const t2 = 'Mgr. Nowak prowadzi zajęcia.';
  const r2 = one([ex('d2', t2, [iss(0, 4, 'punctuation', ['Mgr'])])], [{ start: 3, end: 4, category: 'spelling', replacements: [''] }]);
  assert.deepEqual([r2.overall.tp, r2.overall.top1_ok, r2.overall.category_mismatches], [1, 1, 1]);
  const t3 = 'To jest bardzo bardzo dobre.';
  const r3 = one([ex('d3', t3, [iss(8, 21, 'style', ['bardzo'], false), iss(14, 21, 'grammar', [''])])], [{ start: 14, end: 21, category: 'grammar', replacements: [''] }]);
  assert.deepEqual([r3.overall.tp, r3.overall.fp, r3.overall.top1_ok], [1, 0, 1]);
});

test('exact-span metric is reported alongside, and unchanged results where spans were already exact', () => {
  const corpus = [
    ex('a', 'Wiem że to ważne.', [iss(4, 4, 'punctuation', [','])]),
    ex('b', 'Mój wójek.', [iss(4, 9, 'spelling', ['wujek'])]),
    ex('c', 'Szukam klucze od mieszkania.', [iss(7, 13, 'grammar', ['kluczy'])]),
  ];
  const results = new Map([
    res('a', [{ start: 4, end: 4, category: 'punctuation', replacements: [','] }]),
    res('b', [{ start: 4, end: 9, category: 'spelling', replacements: ['wujek'] }]),
    res('c', [{ start: 11, end: 13, category: 'grammar', replacements: ['zy'] }]),
  ]);
  const r = scoreCorpus(corpus, results);
  assert.equal(r.scoring_version, '1.3');
  assert.deepEqual([r.overall.tp, r.overall.fp, r.overall.fn, r.overall.top1_ok], [3, 0, 0, 3]);
  // exact-span: the minimal grammar span is a miss + FP; the exact ones are identical
  assert.deepEqual([r.exact_span.overall.tp, r.exact_span.overall.fp, r.exact_span.overall.fn], [2, 1, 1]);
  for (const c of ['punctuation', 'spelling']) assert.deepEqual(r.exact_span.categories[c], r.categories[c]);
  assert.equal(scoreCorpus(corpus, results, { match: 'exact' }).exact_span, undefined);
});
