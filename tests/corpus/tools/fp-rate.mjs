#!/usr/bin/env node
// False-alarm rate on the clean-prose set (../clean-prose/, FORMAT.md "Clean-prose false-alarm set").
// Every alert on these sentences is a false alarm, except alerts on spellings changed by the
// 2026 reform (reform-2026.mjs), which are reported separately.
// Usage: node fp-rate.mjs --results <engine.jsonl> [--sentences <file|glob>...] [--top N] [--json]
//   results: corpus result lines and/or v1 protocol messages (ids `corpus-<sentence id>` or bare ids)
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readJsonl, expandPaths } from './corpus-lib.mjs';
import { normalizeResultEntries } from './protocol-v1.mjs';
import { reformMatchForAlert } from './reform-2026.mjs';

const DEFAULT_SENTENCES = join(dirname(fileURLToPath(import.meta.url)), '..', 'clean-prose', '**', 'sentences.jsonl');

function parseArgs(argv) {
  const a = { results: null, sentences: [], top: 20, json: false };
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i];
    if (x === '--results') a.results = argv[++i];
    else if (x === '--sentences') { while (i + 1 < argv.length && !argv[i + 1].startsWith('--')) a.sentences.push(argv[++i]); }
    else if (x === '--top') a.top = Number(argv[++i]);
    else if (x === '--json') a.json = true;
    else throw new Error(`unknown argument ${x}`);
  }
  if (!a.results) throw new Error('need --results');
  if (!a.sentences.length) a.sentences.push(DEFAULT_SENTENCES);
  a.sentences = expandPaths(a.sentences);
  if (!Number.isInteger(a.top) || a.top < 0) throw new Error('--top must be a non-negative integer');
  return a;
}

const per1000 = (n, d) => (d ? Math.round((n / d) * 1000 * 100) / 100 : null);
const inc = (o, k) => { o[k] = (o[k] ?? 0) + 1; };
const sortDesc = (o) => Object.fromEntries(Object.entries(o).sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0])));

/** Compute the report from sentences [{ id, text, source_title, ... }] and a Map id -> result line. */
export function fpReport(sentences, results, { top = 20 } = {}) {
  const r = { sentences: sentences.length, scored: 0, missing: [], incomplete: [], alerts: 0, reform_alerts: 0,
    false_alarms: 0, sentences_with_false_alarm: 0, by_rule: {}, by_category: {}, reform_by_pattern: {}, top: [] };
  const firing = [];
  for (const s of sentences) {
    const res = results.get(s.id);
    if (!res) { r.missing.push(s.id); continue; }
    if (res.status !== 'complete') { r.incomplete.push(s.id); continue; }
    r.scored += 1;
    const real = [];
    for (const iss of res.issues) {
      r.alerts += 1;
      const reform = reformMatchForAlert(s.text, iss);
      if (reform) { r.reform_alerts += 1; inc(r.reform_by_pattern, reform.id); continue; }
      r.false_alarms += 1;
      inc(r.by_rule, iss.rule_id ?? 'unknown');
      inc(r.by_category, typeof iss.category === 'string' ? iss.category : 'unknown');
      real.push({ start: iss.start, end: iss.end, span: s.text.slice(iss.start, iss.end), rule_id: iss.rule_id ?? 'unknown', category: iss.category ?? 'unknown', replacements: (iss.replacements ?? []).slice(0, 3) });
    }
    if (real.length) { r.sentences_with_false_alarm += 1; firing.push({ id: s.id, source_title: s.source_title, text: s.text, alerts: real }); }
  }
  r.alerts_per_1000 = per1000(r.alerts, r.scored);
  r.false_alarms_per_1000 = per1000(r.false_alarms, r.scored);
  r.reform_alerts_per_1000 = per1000(r.reform_alerts, r.scored);
  r.by_rule = sortDesc(r.by_rule);
  r.by_category = sortDesc(r.by_category);
  r.reform_by_pattern = sortDesc(r.reform_by_pattern);
  r.top = firing.sort((a, b) => b.alerts.length - a.alerts.length || a.id.localeCompare(b.id)).slice(0, top);
  return r;
}

export function formatFpReport(r) {
  const lines = [
    `sentences: ${r.sentences} (scored ${r.scored}, missing ${r.missing.length}, incomplete/error ${r.incomplete.length})`,
    `alerts: ${r.alerts} (${r.alerts_per_1000 ?? 'n/a'} per 1000 sentences)`,
    `  false alarms: ${r.false_alarms} (${r.false_alarms_per_1000 ?? 'n/a'} per 1000) in ${r.sentences_with_false_alarm} sentences`,
    `  pre-2026-reform spelling (approximate, not false alarms): ${r.reform_alerts} (${r.reform_alerts_per_1000 ?? 'n/a'} per 1000)`,
  ];
  const table = (title, o) => { if (Object.keys(o).length) { lines.push('', title); for (const [k, v] of Object.entries(o)) lines.push(`  ${String(v).padStart(5)}  ${k}`); } };
  table('false alarms by rule id:', r.by_rule);
  table('false alarms by category:', r.by_category);
  table('reform-flagged alerts by pattern:', r.reform_by_pattern);
  if (r.top.length) {
    lines.push('', `top firing sentences (${r.top.length}):`);
    for (const t of r.top) lines.push(`  ${t.id} [${t.alerts.map((a) => `${a.rule_id}@${a.start}-${a.end} "${a.span}"`).join(', ')}] ${t.text}`);
  }
  return lines.join('\n');
}

export function main(argv) {
  const args = parseArgs(argv);
  const sentences = args.sentences.flatMap((f) => readJsonl(f).map((e) => e.value));
  const byId = new Map(sentences.map((s) => [s.id, s]));
  const results = new Map();
  const errs = [];
  for (const { line, value, errors } of normalizeResultEntries(readJsonl(args.results))) {
    const where = `${args.results}:${line}`;
    if (errors.length) { errors.forEach((e) => errs.push(`${where}: ${e}`)); continue; }
    if (!value || !byId.has(value.id)) continue; // not a clean-prose sentence (e.g. scored corpus): ignored
    if (results.has(value.id)) { errs.push(`${where}: duplicate result for ${value.id}`); continue; }
    const len = byId.get(value.id).text.length;
    if (!Array.isArray(value.issues) || value.issues.some((i) => !(Number.isInteger(i.start) && Number.isInteger(i.end) && i.start >= 0 && i.start <= i.end && i.end <= len))) { errs.push(`${where}: issues out of range for ${value.id}`); continue; }
    results.set(value.id, value);
  }
  if (errs.length) throw new Error(`engine results invalid:\n${errs.join('\n')}`);
  const report = fpReport(sentences, results, { top: args.top });
  console.log(args.json ? JSON.stringify(report, null, 2) : formatFpReport(report));
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { process.exitCode = main(process.argv.slice(2)); } catch (e) { console.error(`error: ${e.message}`); process.exitCode = 2; }
}
