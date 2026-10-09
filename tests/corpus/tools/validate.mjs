#!/usr/bin/env node
// Validate corpus JSONL files (and optionally an engine result file). See ../FORMAT.md.
// Usage:
//   node validate.mjs <corpus.jsonl>...
//   node validate.mjs --engine <results.jsonl> --corpus <corpus.jsonl>...
//   (results may be corpus result lines or v1 protocol messages; FORMAT.md "Protocol v1 input")
import { pathToFileURL } from 'node:url';
import { readJsonl, validateCorpus, validateEngineResult, checkSplitLocation, expandPaths } from './corpus-lib.mjs';
import { normalizeResultEntries } from './protocol-v1.mjs';

function parseArgs(argv) {
  const a = { corpus: [], engine: null, quiet: false };
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i];
    if (x === '--engine') a.engine = argv[++i];
    else if (x === '--corpus') {
      while (i + 1 < argv.length && !argv[i + 1].startsWith('--')) a.corpus.push(argv[++i]);
    }
    else if (x === '--quiet') a.quiet = true;
    else if (x.startsWith('--')) throw new Error(`unknown option ${x}`);
    else a.corpus.push(x);
  }
  if (a.corpus.length === 0) throw new Error('no corpus file given');
  a.corpus = expandPaths(a.corpus);
  return a;
}

export function main(argv) {
  const args = parseArgs(argv);
  const errors = [];
  const warnings = [];
  const byId = new Map();
  let count = 0;
  const all = [];
  for (const f of args.corpus) {
    const entries = readJsonl(f);
    entries.forEach((e) => all.push({ ...e, file: f }));
    count += entries.length;
    for (const { value } of entries) if (value && typeof value.id === 'string') byId.set(value.id, value);
  }
  // Validate per file for line numbers, then ids across files.
  for (const f of args.corpus) {
    const entries = all.filter((e) => e.file === f);
    const r = validateCorpus(entries, f);
    errors.push(...r.errors);
    warnings.push(...r.warnings);
    errors.push(...checkSplitLocation(f, entries));
  }
  const ids = new Map();
  for (const { file, line, value } of all) {
    if (!value || typeof value.id !== 'string') continue;
    const prev = ids.get(value.id);
    if (prev && prev.file !== file) errors.push(`${file}:${line}: id ${value.id} also in ${prev.file}:${prev.line}`);
    else if (!prev) ids.set(value.id, { file, line });
  }
  if (args.engine) {
    const seen = new Set();
    for (const { line, value, errors: lineErrs } of normalizeResultEntries(readJsonl(args.engine))) {
      const where = `${args.engine}:${line}`;
      if (lineErrs.length) { lineErrs.forEach((e) => errors.push(`${where}: ${e}`)); continue; }
      const ex = value && byId.get(value.id);
      if (!ex) errors.push(`${where}: id ${JSON.stringify(value && value.id)} not in corpus`);
      if (value && seen.has(value.id)) errors.push(`${where}: duplicate result for ${value.id}`);
      if (value) seen.add(value.id);
      validateEngineResult(value, ex).forEach((e) => errors.push(`${where}: ${e}`));
    }
  }
  if (!args.quiet) warnings.forEach((w) => console.warn(`warning: ${w}`));
  errors.forEach((e) => console.error(`error: ${e}`));
  console.log(`${count} examples checked, ${errors.length} errors, ${warnings.length} warnings`);
  return errors.length === 0 ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (e) {
    console.error(`error: ${e.message}`);
    process.exitCode = 2;
  }
}
