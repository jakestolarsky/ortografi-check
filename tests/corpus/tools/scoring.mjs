// Scoring logic for engine results against the corpus (format v1). See ../FORMAT.md.
import { applyEdit, ERROR_CATEGORIES } from './corpus-lib.mjs';

export const SCORING_VERSION = '1.3';

/** Predictions in a non-error category (e.g. style, other) are reported apart, not scored. */
export function isExcludedCategory(category, opts = {}) {
  return !opts.scoreAllCategories && typeof category === 'string' && !ERROR_CATEGORIES.includes(category);
}

/** Ranges can match: overlap, or touch when either side is zero-length. */
export function rangesMatch(e, p, mode = 'overlap') {
  if (mode === 'exact') return e.start === p.start && e.end === p.end;
  if (e.start === e.end || p.start === p.end) return p.start <= e.end && e.start <= p.end;
  return p.start < e.end && e.start < p.end;
}

/** Engine range lies within the expected range (zero-length insertions inside or at the edges count). */
export function rangeWithin(e, p) {
  return p.start >= e.start && p.end <= e.end;
}

const nfc = (t) => t.normalize('NFC');

/** Apply several non-overlapping edits [{start, end, replacement}] to text (right to left). */
export function applyEdits(text, edits) {
  const sorted = [...edits].sort((x, y) => y.start - x.start || y.end - x.end);
  for (let i = 1; i < sorted.length; i++) if (sorted[i].end > sorted[i - 1].start) return null; // overlapping edits
  return sorted.reduce((t, ed) => applyEdit(t, ed.start, ed.end, ed.replacement), text);
}

/** Does applying these engine edits give the same sentence (NFC) as some acceptable expected fix? */
export function editsAccepted(text, expected, edits) {
  const got = applyEdits(text, edits);
  if (got === null) return false;
  return expected.fixes.some((f) => nfc(applyEdit(text, expected.start, expected.end, f)) === nfc(got));
}

/**
 * Fix hit for one engine issue (scoring 1.3): the engine range must lie within the
 * expected range AND the resulting sentence must equal an acceptable corrected sentence.
 */
export function replacementAccepted(text, expected, predicted, replacement) {
  return rangeWithin(expected, predicted) && editsAccepted(text, expected, [{ start: predicted.start, end: predicted.end, replacement }]);
}

function pairInfo(text, e, p) {
  const reps = Array.isArray(p.replacements) ? p.replacements : [];
  const top = reps.length > 0 && replacementAccepted(text, e, p, reps[0]);
  const any = top || reps.some((r) => replacementAccepted(text, e, p, r));
  const exact = e.start === p.start && e.end === p.end;
  const catOk = p.category === e.category;
  const overlap = Math.max(0, Math.min(e.end, p.end) - Math.max(e.start, p.start));
  const score = (exact ? 1000 : 0) + (top ? 100 : 0) + (any ? 10 : 0) + (catOk ? 1 : 0) + overlap / 1e6;
  return { top, any, exact, catOk, score };
}

/** Every way to pick one replacement per issue, capped (first replacements first). */
function* replacementCombos(preds, cap = 256) {
  const lists = preds.map((p) => p.replacements);
  const idx = lists.map(() => 0);
  for (let n = 0; n < cap; n++) {
    yield preds.map((p, i) => ({ start: p.start, end: p.end, replacement: lists[i][idx[i]] }));
    let k = lists.length - 1;
    while (k >= 0 && ++idx[k] >= lists[k].length) { idx[k] = 0; k -= 1; }
    if (k < 0) return;
  }
}

/**
 * Two-edit phrases: several engine issues inside one expected range whose fixes, applied
 * together, give an acceptable sentence count as ONE hit (no FP for the others).
 */
function groupInfo(text, e, predicted, pis) {
  const preds = pis.map((i) => predicted[i]);
  if (preds.some((p) => !Array.isArray(p.replacements) || p.replacements.length === 0)) return null;
  const top = editsAccepted(text, e, preds.map((p) => ({ start: p.start, end: p.end, replacement: p.replacements[0] })));
  let any = top;
  if (!any) for (const c of replacementCombos(preds)) if (editsAccepted(text, e, c)) { any = true; break; }
  if (!any) return null;
  const catOk = preds.every((p) => p.category === e.category);
  return { top, any, exact: false, catOk, group: true, score: 500 + (top ? 100 : 0) + 10 + (catOk ? 1 : 0) };
}

/** One-to-one greedy assignment of predicted to expected issues for one example. */
export function matchExample(text, expected, predicted, opts = {}) {
  const mode = opts.match ?? 'overlap';
  const pairs = [];
  expected.forEach((e, ei) => {
    predicted.forEach((p, pi) => {
      if (!rangesMatch(e, p, mode)) return;
      const info = pairInfo(text, e, p);
      if (opts.strictCategory && !info.catOk) return;
      pairs.push({ ei, pi, pis: [pi], ...info });
    });
    if (mode === 'exact' || e.fixes.length === 0) return;
    const inside = predicted.map((p, pi) => (rangeWithin(e, p) ? pi : -1)).filter((pi) => pi >= 0);
    if (inside.length < 2 || inside.length > 4) return;
    const g = groupInfo(text, e, predicted, inside);
    if (g && !(opts.strictCategory && !g.catOk)) pairs.push({ ei, pi: inside[0], pis: inside, ...g });
  });
  pairs.sort((a, b) => b.score - a.score || a.ei - b.ei || a.pi - b.pi);
  const usedE = new Set();
  const usedP = new Set();
  const matches = [];
  for (const pr of pairs) {
    if (usedE.has(pr.ei) || pr.pis.some((i) => usedP.has(i))) continue;
    usedE.add(pr.ei);
    pr.pis.forEach((i) => usedP.add(i));
    matches.push(pr);
  }
  return {
    matches,
    unmatchedExpected: expected.map((_, i) => i).filter((i) => !usedE.has(i)),
    unmatchedPredicted: predicted.map((_, i) => i).filter((i) => !usedP.has(i)),
  };
}

const emptyBucket = () => ({ tp: 0, fp: 0, fn: 0, with_fixes: 0, top1_ok: 0, any_ok: 0, category_mismatches: 0, multi_edit_hits: 0 });
const ratio = (a, b) => (b === 0 ? null : a / b);

function finish(b) {
  const precision = ratio(b.tp, b.tp + b.fp);
  const recall = ratio(b.tp, b.tp + b.fn);
  let f1 = null;
  if (b.tp > 0) f1 = (2 * precision * recall) / (precision + recall);
  else if (b.fp + b.fn > 0) f1 = 0;
  return { ...b, precision, recall, f1, top1_accuracy: ratio(b.top1_ok, b.with_fixes), any_accuracy: ratio(b.any_ok, b.with_fixes) };
}

/**
 * Score results against the corpus.
 * @param {object[]} corpus examples
 * @param {Map<string, object>} results engine result lines by id
 * @param {{match?: 'overlap'|'exact', strictCategory?: boolean}} opts
 */
export function scoreCorpus(corpus, results, opts = {}) {
  const buckets = new Map();
  const bucket = (c) => {
    if (!buckets.has(c)) buckets.set(c, emptyBucket());
    return buckets.get(c);
  };
  const overall = emptyBucket();
  const missing = [];
  const incomplete = [];
  const releaseCriticalFailures = [];
  const clean = { examples: 0, with_false_positive: 0, with_error_category_fp: 0, with_only_excluded_category: 0, ids: [] };
  const excluded = {};
  const expectedNonError = {};
  const perExample = [];

  for (const ex of corpus) {
    const res = results.get(ex.id);
    // Non-error expected issues (style) are never required, whatever the file says.
    const requiredIdx = new Set(ex.issues.map((iss, i) => (iss.required && ERROR_CATEGORIES.includes(iss.category) ? i : -1)).filter((i) => i >= 0));
    let predicted = [];
    let status = 'complete';
    if (!res) {
      status = 'missing';
      missing.push(ex.id);
    } else if (res.status !== 'complete') {
      status = res.status;
      incomplete.push(ex.id);
    } else {
      predicted = res.issues;
    }
    // Clean = no required issue; optional/style annotations do not make a sentence wrong.
    const isClean = requiredIdx.size === 0;
    const excludedHere = predicted.filter((p) => isExcludedCategory(p.category, opts));
    for (const e of ex.issues) {
      if (ERROR_CATEGORIES.includes(e.category)) continue;
      expectedNonError[e.category] ??= { expected: 0, flagged: 0 };
      expectedNonError[e.category].expected += 1;
      if (predicted.some((p) => rangesMatch(e, p, opts.match ?? 'overlap'))) expectedNonError[e.category].flagged += 1;
    }
    // A style/other prediction on an annotated optional issue is expected, not a false alarm.
    const excludedUnexpected = excludedHere.filter((p) => !ex.issues.some((e) => !requiredIdx.has(ex.issues.indexOf(e)) && rangesMatch(e, p, opts.match ?? 'overlap')));
    for (const p of excludedHere) {
      excluded[p.category] ??= { predictions: 0, on_clean_examples: 0 };
      excluded[p.category].predictions += 1;
      if (isClean && excludedUnexpected.includes(p)) excluded[p.category].on_clean_examples += 1;
    }
    predicted = predicted.filter((p) => !isExcludedCategory(p.category, opts));
    const { matches, unmatchedExpected, unmatchedPredicted } = matchExample(ex.text, ex.issues, predicted, opts);
    let exFp = 0;
    let exFn = 0;
    let exTopMiss = 0;
    for (const m of matches) {
      const e = ex.issues[m.ei];
      if (!requiredIdx.has(m.ei)) continue; // optional issue: neutral
      for (const b of [bucket(e.category), overall]) {
        b.tp += 1;
        if (!m.catOk) b.category_mismatches += 1;
        if (m.group) b.multi_edit_hits += 1;
        if (e.fixes.length > 0) {
          b.with_fixes += 1;
          if (m.top) b.top1_ok += 1;
          if (m.any) b.any_ok += 1;
        }
      }
      if (e.fixes.length > 0 && !m.top) exTopMiss += 1;
    }
    for (const ei of unmatchedExpected) {
      if (!requiredIdx.has(ei)) continue;
      exFn += 1;
      for (const b of [bucket(ex.issues[ei].category), overall]) b.fn += 1;
    }
    for (const pi of unmatchedPredicted) {
      exFp += 1;
      const c = typeof predicted[pi].category === 'string' ? predicted[pi].category : 'unknown';
      for (const b of [bucket(c), overall]) b.fp += 1;
    }
    if (isClean) {
      clean.examples += 1;
      if (exFp > 0 || excludedUnexpected.length > 0) {
        clean.with_false_positive += 1;
        clean.ids.push(ex.id);
        if (exFp > 0) clean.with_error_category_fp += 1;
        else clean.with_only_excluded_category += 1;
      }
    }
    const passed = status === 'complete' && exFp === 0 && exFn === 0 && exTopMiss === 0;
    if (ex.release_critical && !passed) releaseCriticalFailures.push({ id: ex.id, status, fp: exFp, fn: exFn, top_suggestion_misses: exTopMiss });
    perExample.push({ id: ex.id, split: ex.split, status, fp: exFp, fn: exFn, top_suggestion_misses: exTopMiss, excluded_predictions: excludedHere.length, passed });
  }

  const categories = {};
  for (const [c, b] of [...buckets.entries()].sort()) categories[c] = finish(b);
  // Strict exact-span metric, reported alongside the default (FORMAT.md "Scoring" 8).
  let exactSpan;
  if ((opts.match ?? 'overlap') !== 'exact' && !opts.noExactSpan) {
    const x = scoreCorpus(corpus, results, { ...opts, match: 'exact', noExactSpan: true });
    exactSpan = { overall: x.overall, categories: x.categories };
  }
  return {
    scoring_version: SCORING_VERSION,
    options: { match: opts.match ?? 'overlap', strict_category: !!opts.strictCategory, score_all_categories: !!opts.scoreAllCategories, split: opts.split ?? 'all' },
    splits: corpus.reduce((a, e) => ({ ...a, [e.split]: (a[e.split] ?? 0) + 1 }), {}),
    examples: corpus.length,
    overall: finish(overall),
    categories,
    excluded_categories: excluded,
    expected_non_error: expectedNonError,
    clean_set: { ...clean, false_positive_rate: ratio(clean.with_false_positive, clean.examples) },
    missing,
    incomplete,
    release_critical_failures: releaseCriticalFailures,
    per_example: perExample,
    ...(exactSpan ? { exact_span: exactSpan } : {}),
  };
}
