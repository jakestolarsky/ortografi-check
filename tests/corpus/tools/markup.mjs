#!/usr/bin/env node
// Authoring helper: turn inline markup into corpus JSONL lines (offsets computed in UTF-16).
// The JSONL files remain the source of truth; see ../FORMAT.md ("Authoring helper").
//   {{wrong=>fix1|fix2@spelling.o_u}}   replacement (alternatives separated by |)
//   {{,=>@punctuation.extra_comma}}      deletion (single fix "")
//   {{=>,@punctuation.missing_comma}}    insertion at a zero-length range
//   {{span!@grammar.agreement}}          warning without a ready fix
//   {{?…}}                               optional issue (required: false)
// CLI: reads lines of JSON {"id": ..., "markup": ..., ...other fields} from stdin, prints JSONL.
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import { computeCorrectedText } from './corpus-lib.mjs';

const TOKEN = /\{\{(.*?)\}\}/gsu;

export function parseMarkup(markup) {
  let text = '';
  let last = 0;
  const issues = [];
  for (const m of markup.matchAll(TOKEN)) {
    text += markup.slice(last, m.index);
    last = m.index + m[0].length;
    let body = m[1];
    const required = !body.startsWith('?');
    if (!required) body = body.slice(1);
    const at = body.lastIndexOf('@');
    if (at < 0) throw new Error(`markup token without @subcategory: ${m[0]}`);
    const subcategory = body.slice(at + 1);
    const spec = body.slice(0, at);
    let original;
    let fixes;
    if (spec.endsWith('!')) {
      original = spec.slice(0, -1);
      fixes = [];
    } else {
      const arrow = spec.indexOf('=>');
      if (arrow < 0) throw new Error(`markup token without => or !: ${m[0]}`);
      original = spec.slice(0, arrow);
      fixes = spec.slice(arrow + 2).split('|');
    }
    const start = text.length;
    text += original;
    issues.push({ start, end: text.length, original, category: subcategory.split('.')[0], subcategory, fixes, required });
  }
  text += markup.slice(last);
  return { text, issues };
}

export function exampleFromMarkup({ id, markup, ...rest }) {
  const { text, issues } = parseMarkup(markup);
  const ex = {
    schema_version: '1.0',
    id,
    text,
    text_utf16_length: text.length,
    issues,
    tags: rest.tags ?? [],
    split: rest.split ?? 'dev',
    release_critical: rest.release_critical ?? false,
    needs_human_review: rest.needs_human_review ?? false,
    review_status: rest.review_status ?? 'unreviewed',
    source: rest.source ?? 'original',
  };
  if (issues.some((i) => i.required && i.fixes.length > 0)) ex.corrected_text = computeCorrectedText(ex);
  if (rest.notes) ex.notes = rest.notes;
  // Stable key order for diffs.
  const order = ['schema_version', 'id', 'text', 'text_utf16_length', 'issues', 'corrected_text', 'tags', 'split',
    'release_critical', 'needs_human_review', 'review_status', 'source', 'notes'];
  return Object.fromEntries(order.filter((k) => ex[k] !== undefined).map((k) => [k, ex[k]]));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const input = readFileSync(0, 'utf8');
  for (const line of input.split('\n')) {
    if (!line.trim()) continue;
    console.log(JSON.stringify(exampleFromMarkup(JSON.parse(line))));
  }
}
