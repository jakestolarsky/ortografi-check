import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import Ajv2020 from 'ajv/dist/2020';

const root = join(__dirname, '..', '..');
const schema = JSON.parse(readFileSync(join(root, 'contracts/v1/protocol.schema.json'), 'utf8'));
const exDir = join(root, 'contracts/v1/examples');
const examples = readdirSync(exDir).filter((f) => f.endsWith('.json'));
const ajv = new Ajv2020({ strict: true, allErrors: true });
const validate = ajv.compile(schema);
const corpus = new Map<string, { text: string; issues: { start: number; end: number; fixes: string[] }[] }>(
  readFileSync(join(root, 'tests/corpus/data/phase0-starter.jsonl'), 'utf8')
    .split('\n').filter(Boolean).map((l) => JSON.parse(l)).map((r) => [r.id, r])
);
const load = (f: string) => JSON.parse(readFileSync(join(exDir, f), 'utf8'));

describe('contracts v1', () => {
  it.each(examples)('%s validates against the schema', (f) => {
    const ok = validate(load(f));
    expect(validate.errors ?? []).toEqual([]);
    expect(ok).toBe(true);
  });

  it.each(examples)('%s is compact single-line JSON', (f) => {
    const raw = readFileSync(join(exDir, f), 'utf8');
    expect(raw).toBe(JSON.stringify(JSON.parse(raw)) + '\n');
  });

  it('EngineStatus (IPC only) validates its examples and is not a stdin/stdout message', () => {
    const v = ajv.compile({ $ref: `${schema.$id}#/$defs/EngineStatus` });
    const dir = join(exDir, 'ipc');
    const files = readdirSync(dir).filter((f) => f.startsWith('engine-status'));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) expect(v(JSON.parse(readFileSync(join(dir, f), 'utf8')))).toBe(true);
    for (const st of ['starting', 'ready', 'busy', 'restarting', 'unavailable']) expect(v({ state: st })).toBe(true);
    expect(v({ state: 'stopped' })).toBe(false);
    expect(v({ state: 'ready', extra: 1 })).toBe(false);
    expect(validate({ state: 'ready' })).toBe(false);
  });

  it('rejects unknown fields and wrong protocol', () => {
    expect(validate({ protocol: 1, type: 'shutdown', extra: 1 })).toBe(false);
    expect(validate({ protocol: 2, type: 'shutdown' })).toBe(false);
  });

  it('check errors carry docVersion and settingsVersion together', () => {
    expect(validate({ protocol: 1, type: 'error', id: 'x', code: 'TIMEOUT', detail: 'd', docVersion: 1 })).toBe(false);
  });

  it.each(['p0-0003', 'p0-0059', 'p0-0061', 'p0-0063'])('%s matches the corpus byte-for-byte', (id) => {
    const rec = corpus.get(id)!;
    const check = load(`corpus-${id}-check.json`);
    const result = load(`corpus-${id}-result.json`);
    expect(Buffer.from(check.text, 'utf8').equals(Buffer.from(rec.text, 'utf8'))).toBe(true);
    expect(result.issues.map((i: { start: number; end: number; replacements: string[] }) => [i.start, i.end, i.replacements]))
      .toEqual(rec.issues.map((i) => [i.start, i.end, i.fixes]));
  });

  it('pins the agreed ranges', () => {
    const r = (id: string) => load(`corpus-${id}-result.json`).issues;
    expect(r('p0-0003')).toMatchObject([{ start: 4, end: 4, replacements: [','] }]);
    expect(r('p0-0059')).toMatchObject([{ start: 29, end: 37, replacements: ['dziękuję'] }]);
    expect(r('p0-0063')).toMatchObject([{ start: 9, end: 14, replacements: ['żaba'] }]);
    expect(r('p0-0061')).toEqual([]);
  });

  it('keeps NFD bytes in p0-0063 (no normalisation)', () => {
    const raw = readFileSync(join(exDir, 'corpus-p0-0063-check.json'));
    expect(raw.includes(Buffer.from('\u0307', 'utf8'))).toBe(true);
    const text: string = JSON.parse(raw.toString('utf8')).text;
    expect(text).not.toBe(text.normalize('NFC'));
    expect(text.length).toBe(31);
  });
});
