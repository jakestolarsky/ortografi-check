#!/usr/bin/env node
// Score engine results against the corpus. See ../FORMAT.md ("Scoring").
// Usage: node score.mjs --corpus <file|glob>... --results <results.jsonl>
//   (--results lines: corpus result lines and/or v1 protocol messages, ids `corpus-<id>`)
//   (--corpus accepts several files and quoted globs such as 'tests/corpus/data/**/*.jsonl')
//          [--split all|dev|heldout] [--json] [--match overlap|exact] [--strict-category]
//          [--score-all-categories] [--fail-on-release-critical]
// Results for examples outside the selected split are ignored.
import { pathToFileURL } from 'node:url';
import { readJsonl, validateCorpus, validateEngineResult, expandPaths } from './corpus-lib.mjs';
import { scoreCorpus } from './scoring.mjs';
import { normalizeResultEntries, validateV1AgainstExample } from './protocol-v1.mjs';

function parseArgs(argv) {
  const a = { corpus: [], results: null, json: false, match: 'overlap', strictCategory: false, scoreAllCategories: false, split: 'all', failOnRc: false };
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i];
    if (x === '--corpus') {
      // --corpus takes one or more files/globs, until the next option.
      while (i + 1 < argv.length && !argv[i + 1].startsWith('--')) a.corpus.push(argv[++i]);
    }
    else if (x === '--results') a.results = argv[++i];
    else if (x === '--json') a.json = true;
    else if (x === '--match') a.match = argv[++i];
    else if (x === '--strict-category') a.strictCategory = true;
    else if (x === '--score-all-categories') a.scoreAllCategories = true;
    else if (x === '--split') a.split = argv[++i];
    else if (x === '--fail-on-release-critical') a.failOnRc = true;
    else if (x.startsWith('--')) throw new Error(`unknown argument ${x}`);
    else a.corpus.push(x);
  }
  if (!a.corpus.length || !a.results) throw new Error('need --corpus and --results');
  a.corpus = expandPaths(a.corpus);
  if (!['overlap', 'exact'].includes(a.match)) throw new Error('--match must be overlap or exact');
  if (!['all', 'dev', 'heldout'].includes(a.split)) throw new Error('--split must be all, dev or heldout');
  return a;
}

const pct = (x) => (x === null ? '   n/a' : `${(x * 100).toFixed(1).padStart(5)}%`);

export function formatReport(r) {
  const rows = [['category', 'TP', 'FP', 'FN', 'prec', 'recall', 'F1', 'top1', 'any', 'cat≠']];
  const add = (name, b) => rows.push([name, b.tp, b.fp, b.fn, pct(b.precision), pct(b.recall), pct(b.f1), pct(b.top1_accuracy), pct(b.any_accuracy), b.category_mismatches]);
  for (const [c, b] of Object.entries(r.categories)) add(c, b);
  add('OVERALL', r.overall);
  const widths = rows[0].map((_, i) => Math.max(...rows.map((row) => String(row[i]).length)));
  const lines = rows.map((row) => row.map((v, i) => (i === 0 ? String(v).padEnd(widths[i]) : String(v).padStart(widths[i]))).join('  '));
  lines.push('');
  const ex = Object.entries(r.excluded_categories);
  const ne = Object.entries(r.expected_non_error ?? {});
  if (ne.length) lines.push(`annotated non-error issues (optional, not scored): ${ne.map(([c, v]) => `${c} ${v.flagged}/${v.expected} flagged`).join(', ')}`);
  if (ex.length) lines.push(`not scored (non-error categories): ${ex.map(([c, v]) => `${c} ${v.predictions} (${v.on_clean_examples} on clean)`).join(', ')}`);
  const splits = Object.entries(r.splits).map(([k, v]) => `${k} ${v}`).join(', ');
  const opts = [`match=${r.options.match}`, `split=${r.options.split}`];
  if (r.options.strict_category) opts.push('strict-category');
  if (r.options.score_all_categories) opts.push('score-all-categories');
  lines.push(`examples: ${r.examples} (${splits})  (${opts.join(', ')}; scoring ${r.scoring_version})`);
  const cs = r.clean_set;
  lines.push(`clean set: ${cs.with_false_positive}/${cs.examples} examples with a false positive (${pct(cs.false_positive_rate).trim()}; error categories ${cs.with_error_category_fp}, style/other only ${cs.with_only_excluded_category})${cs.ids.length ? `: ${cs.ids.join(', ')}` : ''}`);
  if (r.missing.length) lines.push(`missing results (${r.missing.length}): ${r.missing.join(', ')}`);
  if (r.incomplete.length) lines.push(`incomplete/error results (${r.incomplete.length}): ${r.incomplete.join(', ')}`);
  lines.push(`release-critical failures: ${r.release_critical_failures.length ? r.release_critical_failures.map((f) => f.id).join(', ') : 'none'}`);
  lines.push('Scores describe this corpus only, not Polish in general.');
  return lines.join('\n');
}

export function main(argv) {
  const args = parseArgs(argv);
  const corpus = [];
  for (const f of args.corpus) {
    const entries = readJsonl(f);
    const v = validateCorpus(entries, f);
    if (v.errors.length) throw new Error(`corpus invalid (run validate.mjs):\n${v.errors.join('\n')}`);
    corpus.push(...entries.map((e) => e.value));
  }
  const allById = new Map(corpus.map((e) => [e.id, e]));
  const selected = args.split === 'all' ? corpus : corpus.filter((e) => e.split === args.split);
  const byId = new Map(selected.map((e) => [e.id, e]));
  const results = new Map();
  const errs = [];
  // Lines may be corpus result lines or v1 protocol messages (FORMAT.md "Protocol v1 input").
  for (const { line, value, errors: lineErrs, v1 } of normalizeResultEntries(readJsonl(args.results))) {
    if (lineErrs.length) { lineErrs.forEach((e) => errs.push(`${args.results}:${line}: ${e}`)); continue; }
    if (value && !byId.has(value.id) && allById.has(value.id)) continue; // other split
    const ex = value && byId.get(value.id);
    if (!ex) { errs.push(`${args.results}:${line}: unknown id ${JSON.stringify(value && value.id)}`); continue; }
    if (results.has(value.id)) { errs.push(`${args.results}:${line}: duplicate result for ${value.id}`); continue; }
    validateEngineResult(value, ex).forEach((e) => errs.push(`${args.results}:${line}: ${e}`));
    if (v1) validateV1AgainstExample(value, ex).forEach((e) => errs.push(`${args.results}:${line}: ${e}`));
    results.set(value.id, value);
  }
  if (errs.length) throw new Error(`engine results invalid:\n${errs.join('\n')}`);
  const report = scoreCorpus(selected, results, { match: args.match, strictCategory: args.strictCategory, scoreAllCategories: args.scoreAllCategories, split: args.split });
  console.log(args.json ? JSON.stringify(report, null, 2) : formatReport(report));
  return args.failOnRc && report.release_critical_failures.length ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (e) {
    console.error(`error: ${e.message}`);
    process.exitCode = 2;
  }
}
