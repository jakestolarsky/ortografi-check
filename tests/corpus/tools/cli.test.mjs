import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const data = join(here, '..', 'data');

test('score.mjs accepts several files and a quoted glob after one --corpus', () => {
  const d = mkdtempSync(join(tmpdir(), 'score-cli-'));
  const results = join(d, 'empty.jsonl');
  writeFileSync(results, '');
  const run = (...corpus) => JSON.parse(execFileSync('node', [join(here, 'score.mjs'), '--corpus', ...corpus, '--results', results, '--json'], { encoding: 'utf8' }));
  const many = run(join(data, 'phase0-starter.jsonl'), join(data, 'phase1-dev.jsonl'), join(data, 'heldout', 'phase1-heldout.jsonl'));
  const glob = run(`${data}/**/*.jsonl`);
  assert.equal(glob.examples, many.examples);
  assert.ok(glob.splits.dev > 0 && glob.splits.heldout > 0);
  const dev = JSON.parse(execFileSync('node', [join(here, 'score.mjs'), '--corpus', `${data}/**/*.jsonl`, '--results', results, '--split', 'dev', '--json'], { encoding: 'utf8' }));
  assert.equal(dev.examples, glob.splits.dev);
});
