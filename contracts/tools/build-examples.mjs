// Builds contracts/v1/examples/corpus-*.json from tests/corpus/data/phase0-starter.jsonl.
// Texts and fixes are copied from the parsed corpus strings, never retyped, so NFD
// sequences, emoji and ZWJ survive byte-for-byte. Result messages/ruleIds are
// representative shape fixtures, not golden engine output.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const corpus = new Map(
  readFileSync(join(root, 'tests/corpus/data/phase0-starter.jsonl'), 'utf8')
    .split('\n').filter(Boolean).map((l) => JSON.parse(l)).map((r) => [r.id, r])
);

// id -> engine-shaped metadata for each expected corpus issue
const cases = {
  'p0-0003': { ruleId: 'BRAK_PRZECINKA_ZE', category: 'punctuation', engineCategory: 'PUNCTUATION', issueType: 'typographical', message: 'Brak przecinka przed „że”.' },
  'p0-0059': { ruleId: 'MORFOLOGIK_RULE_PL_PL', category: 'spelling', engineCategory: 'TYPOS', issueType: 'misspelling', message: 'Prawdopodobny błąd pisowni.' },
  'p0-0063': { ruleId: 'MORFOLOGIK_RULE_PL_PL', category: 'spelling', engineCategory: 'TYPOS', issueType: 'misspelling', message: 'Prawdopodobny błąd pisowni.' },
  'p0-0061': null // no-issue control
};

let n = 0;
for (const [id, meta] of Object.entries(cases)) {
  const rec = corpus.get(id);
  if (!rec) throw new Error(`missing corpus id ${id}`);
  n += 1;
  const reqId = `corpus-${id}`;
  const base = { protocol: 1, id: reqId, docVersion: n, settingsVersion: 1 };
  const check = { protocol: 1, type: 'check', id: reqId, docVersion: n, settingsVersion: 1, text: rec.text };
  const issues = meta === null ? [] : rec.issues.map((i) => ({
    start: i.start, end: i.end, ruleId: meta.ruleId, category: meta.category,
    engineCategory: meta.engineCategory, issueType: meta.issueType, message: meta.message,
    replacements: i.fixes
  }));
  const result = { protocol: 1, type: 'result', id: reqId, docVersion: base.docVersion, settingsVersion: 1,
    engineVersion: '6.8', status: 'complete', analysisMs: 10, issues };
  const dir = join(root, 'contracts/v1/examples');
  writeFileSync(join(dir, `corpus-${id}-check.json`), JSON.stringify(check) + '\n');
  writeFileSync(join(dir, `corpus-${id}-result.json`), JSON.stringify(result) + '\n');
}

// Normalise every hand-written example to compact single-line JSON (+ newline).
const exDir = join(root, 'contracts/v1/examples');
for (const f of readdirSync(exDir).filter((f) => f.endsWith('.json'))) {
  const p = join(exDir, f);
  writeFileSync(p, JSON.stringify(JSON.parse(readFileSync(p, 'utf8'))) + '\n');
}
