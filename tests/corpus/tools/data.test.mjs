// Checks on the committed corpus files themselves.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { readJsonl, validateCorpus, CATEGORIES } from './corpus-lib.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = join(root, 'data');
const files = readdirSync(dataDir).filter((f) => f.endsWith('.jsonl'));
const all = files.flatMap((f) => readJsonl(join(dataDir, f)).map((e) => e.value));

test('every corpus file validates without errors', () => {
  assert.ok(files.length > 0);
  for (const f of files) {
    const r = validateCorpus(readJsonl(join(dataDir, f)), f);
    assert.deepEqual(r.errors, [], r.errors.join('\n'));
  }
  assert.equal(new Set(all.map((e) => e.id)).size, all.length, 'ids unique across files');
});

test('PLAN.md §10 control cases are present and annotated as expected', () => {
  const byText = new Map(all.map((e) => [e.text, e]));
  const bad = byText.get('Kupiłem chleb, i mleko.');
  assert.ok(bad, 'incorrect comma before "i"');
  assert.deepEqual(bad.issues.map((i) => [i.original, i.category, i.fixes]), [[',', 'punctuation', ['']]]);
  assert.ok(bad.release_critical);
  const good = byText.get('Obiecał, że przyjdzie, i dotrzymał słowa.');
  assert.ok(good && good.issues.length === 0 && good.release_critical, 'correct comma before "i" is clean');
  assert.ok(all.some((e) => e.release_critical && e.issues.some((i) => i.subcategory === 'punctuation.missing_comma' && e.text.slice(i.end).startsWith(' że'))), 'missing comma before "że"');
  assert.ok(all.some((e) => e.release_critical && /brat, pracuje/.test(e.text)), 'comma between subject and predicate');
});

test('coverage: clean examples, every category, Unicode and line-ending cases', () => {
  assert.ok(all.filter((e) => e.issues.length === 0).length >= 20);
  for (const c of CATEGORIES) assert.ok(all.some((e) => e.issues.some((i) => i.category === c)), c);
  assert.ok(all.some((e) => /\p{Extended_Pictographic}/u.test(e.text)), 'emoji');
  assert.ok(all.some((e) => /\p{M}/u.test(e.text)), 'combining marks');
  assert.ok(all.some((e) => e.text.includes('\r\n')), 'CRLF');
  assert.ok(all.some((e) => e.text.includes('  ')), 'repeated spaces');
});

test('schema files agree with the validator enums', () => {
  const s = JSON.parse(readFileSync(join(root, 'schema', 'corpus-example.v1.schema.json'), 'utf8'));
  assert.deepEqual(s.$defs.issue.properties.category.enum, CATEGORIES);
  const keys = new Set(Object.keys(s.properties));
  for (const e of all) for (const k of Object.keys(e)) assert.ok(keys.has(k), `field ${k} missing from schema`);
});
