import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { corpusIdFromRequestId, fromV1Message, normalizeResultEntries, V1_CATEGORIES } from './protocol-v1.mjs';
import { parseJsonl } from './corpus-lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = join(here, 'fixtures', 'v1-results.jsonl');
const starter = join(here, '..', 'data', 'phase0-starter.jsonl');
const node = (script, args) => spawnSync('node', [join(here, script), ...args], { encoding: 'utf8' });
const tmp = (lines) => { const f = join(mkdtempSync(join(tmpdir(), 'v1-')), 'r.jsonl'); writeFileSync(f, lines.map((l) => JSON.stringify(l)).join('\n') + '\n'); return f; };
const result = (id, issues, extra = {}) => ({ protocol: 1, type: 'result', id, docVersion: 1, settingsVersion: 1, engineVersion: '6.8', status: 'complete', issues, ...extra });
const issue = (start, end, replacements, extra = {}) => ({ start, end, ruleId: 'R', category: 'punctuation', engineCategory: 'PUNCTUATION', issueType: 'typographical', message: 'm', replacements, ...extra });

test('request id maps to corpus id by stripping corpus-', () => {
  assert.equal(corpusIdFromRequestId('corpus-p0-0003'), 'p0-0003');
  assert.equal(corpusIdFromRequestId('p0-0003'), 'p0-0003');
});

test('categories come from contracts/v1 schema', () => {
  assert.deepEqual(V1_CATEGORIES, ['spelling', 'punctuation', 'grammar', 'style', 'other']);
});

test('v1 result converts to a scorer line with UTF-16 offsets unchanged', () => {
  const m = JSON.parse(readFileSync(join(here, '..', '..', '..', 'contracts', 'v1', 'examples', 'corpus-p0-0059-result.json'), 'utf8'));
  const { value } = fromV1Message(m);
  assert.equal(value.id, 'p0-0059');
  assert.equal(value.status, 'complete');
  assert.deepEqual(value.issues.map((i) => [i.start, i.end, i.category, i.replacements]), [[29, 37, 'spelling', ['dziękuję']]]);
});

test('ready/check/shutdown and id-less errors are skipped; errors with an id become status error', () => {
  const out = normalizeResultEntries(parseJsonl(readFileSync(fixture, 'utf8')));
  assert.deepEqual(out.map((o) => [o.value.id, o.value.status]), [
    ['p0-0003', 'complete'], ['p0-0059', 'complete'], ['p0-0061', 'complete'], ['p0-0063', 'complete'], ['p0-0043', 'complete'], ['p0-0001', 'error'],
  ]);
  assert.ok(out.every((o) => o.v1 && o.errors.length === 0));
});

test('strict v1 shape: unknown fields, wrong protocol, bad status and category are rejected', () => {
  assert.match(fromV1Message(result('corpus-x', [], { extra: 1 })).errors[0], /unknown field extra/);
  assert.match(fromV1Message({ ...result('corpus-x', []), protocol: 2 }).errors[0], /unsupported protocol/);
  assert.match(fromV1Message(result('corpus-x', [], { status: 'incomplete' })).errors.join(), /status must be "complete"/);
  assert.match(fromV1Message(result('corpus-x', [issue(0, 1, [], { category: 'typo' })])).errors.join(), /category must be one of/);
  assert.match(fromV1Message(result('corpus-x', [{ start: 0, end: 1 }])).errors.join(), /missing required field ruleId/);
});

test('empty fixes delete the whole range, any category or length (contracts decision)', () => {
  for (const [i, why] of [[issue(4, 10, ['']), 'multi-char'], [issue(0, 3, [''], { category: 'spelling' }), 'non-comma spelling']]) {
    const r = fromV1Message(result('corpus-p0-0043', [i]));
    assert.equal(r.errors, undefined, why);
    assert.deepEqual(r.value.issues[0].replacements, ['']);
  }
});

test('validate.mjs accepts the v1 fixture and multi-char deletions', () => {
  const ok = node('validate.mjs', ['--engine', fixture, '--corpus', starter]);
  assert.equal(ok.status, 0, ok.stderr);
  const bad = node('validate.mjs', ['--engine', tmp([result('corpus-p0-0043', [issue(4, 10, [''])])]), '--corpus', starter]);
  assert.equal(bad.status, 0, bad.stderr);
  const unknown = node('validate.mjs', ['--engine', tmp([result('corpus-nope', [])]), '--corpus', starter]);
  assert.match(unknown.stderr, /"nope" not in corpus/);
});

test('score.mjs scores v1 lines the same as equivalent legacy lines', () => {
  const v1 = JSON.parse(execFileSync('node', [join(here, 'score.mjs'), '--corpus', starter, '--results', fixture, '--json'], { encoding: 'utf8' }));
  const legacy = normalizeResultEntries(parseJsonl(readFileSync(fixture, 'utf8'))).map((o) => { const { protocol_v1, engine_error, ...v } = o.value; return v; });
  const lg = JSON.parse(execFileSync('node', [join(here, 'score.mjs'), '--corpus', starter, '--results', tmp(legacy), '--json'], { encoding: 'utf8' }));
  assert.deepEqual(v1.overall, lg.overall);
  assert.equal(v1.overall.tp, 4); // p0-0003, p0-0059, p0-0063, p0-0043
  assert.equal(v1.overall.fp, 0);
  assert.ok(v1.incomplete.includes('p0-0001'));
  for (const id of ['p0-0003', 'p0-0043', 'p0-0059', 'p0-0061', 'p0-0063']) assert.equal(v1.per_example.find((e) => e.id === id).passed, true, id);
});

test('score.mjs rejects duplicate v1 answers for one example and mixed-format files work', () => {
  const dup = node('score.mjs', ['--corpus', starter, '--results', tmp([result('corpus-p0-0061', []), result('corpus-p0-0061', [])])]);
  assert.equal(dup.status, 2);
  assert.match(dup.stderr, /duplicate result for p0-0061/);
  const mixed = node('score.mjs', ['--corpus', starter, '--results', tmp([result('corpus-p0-0061', []), { schema_version: '1.0', id: 'p0-0003', status: 'complete', issues: [] }]), '--json']);
  assert.equal(mixed.status, 0, mixed.stderr);
});
