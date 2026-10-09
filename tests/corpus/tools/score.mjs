#!/usr/bin/env node
// Score engine results against the corpus. See ../FORMAT.md ("Scoring").
// Usage: node score.mjs --corpus <corpus.jsonl>... --results <results.jsonl>
//          [--json] [--match overlap|exact] [--strict-category] [--fail-on-release-critical]
import { pathToFileURL } from 'node:url';
import { readJsonl, validateCorpus, validateEngineResult } from './corpus-lib.mjs';
import { scoreCorpus } from './scoring.mjs';

function parseArgs(argv) {
  const a = { corpus: [], results: null, json: false, match: 'overlap', strictCategory: false, failOnRc: false };
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i];
    if (x === '--corpus') a.corpus.push(argv[++i]);
    else if (x === '--results') a.results = argv[++i];
    else if (x === '--json') a.json = true;
    else if (x === '--match') a.match = argv[++i];
    else if (x === '--strict-category') a.strictCategory = true;
    else if (x === '--fail-on-release-critical') a.failOnRc = true;
    else throw new Error(`unknown argument ${x}`);
  }
  if (!a.corpus.length || !a.results) throw new Error('need --corpus and --results');
  if (!['overlap', 'exact'].includes(a.match)) throw new Error('--match must be overlap or exact');
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
  lines.push(`examples: ${r.examples}  (match=${r.options.match}${r.options.strict_category ? ', strict-category' : ''})`);
  const cs = r.clean_set;
  lines.push(`clean set: ${cs.with_false_positive}/${cs.examples} examples with a false positive (${pct(cs.false_positive_rate).trim()})${cs.ids.length ? `: ${cs.ids.join(', ')}` : ''}`);
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
  const byId = new Map(corpus.map((e) => [e.id, e]));
  const results = new Map();
  const errs = [];
  for (const { line, value } of readJsonl(args.results)) {
    const ex = value && byId.get(value.id);
    if (!ex) { errs.push(`${args.results}:${line}: unknown id ${JSON.stringify(value && value.id)}`); continue; }
    if (results.has(value.id)) { errs.push(`${args.results}:${line}: duplicate result for ${value.id}`); continue; }
    validateEngineResult(value, ex).forEach((e) => errs.push(`${args.results}:${line}: ${e}`));
    results.set(value.id, value);
  }
  if (errs.length) throw new Error(`engine results invalid:\n${errs.join('\n')}`);
  const report = scoreCorpus(corpus, results, { match: args.match, strictCategory: args.strictCategory });
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
