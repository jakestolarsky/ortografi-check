import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import type { CheckRequest, CheckResult, ErrorMessage } from '$lib/protocol';
import type { CheckResponse, Engine } from './engine';
import { CheckSession } from './session';
import { FakeEngine } from './fake-engine';

// Shared fixtures from contracts/v1/examples (including the corpus-derived ones) driven through
// the real UI path, so a schema/example change that breaks the UI fails here.
const dir = join(__dirname, '../../../contracts/v1/examples');
const load = <T>(f: string): T => JSON.parse(readFileSync(join(dir, f), 'utf8'));
const files = readdirSync(dir);
const pairs = files.filter((f) => f.endsWith('check.json'))
  .map((c) => [c, c.replace(/check\.json$/, 'result.json')] as const)
  .filter(([, r]) => files.includes(r));
const errors = files.filter((f) => f.startsWith('error-'));

/** Replays one fixture response; asserts the UI sent exactly the fixture request (except id). */
class ReplayEngine implements Engine {
  sent: CheckRequest[] = [];
  constructor(private expected: CheckRequest, private response: CheckResponse) {}
  async check(req: CheckRequest): Promise<CheckResponse> {
    this.sent.push(req);
    expect({ ...req, id: this.expected.id }).toEqual(this.expected);
    return { ...this.response, id: req.id };
  }
}

/** A session whose doc/settings versions equal the fixture's. */
function sessionAt(engine: Engine, text: string, docVersion: number, settingsVersion: number) {
  const s = new CheckSession(engine, text);
  while (s.version < docVersion) s.setText(text);
  while (s.settingsVersion < settingsVersion) s.bumpSettings();
  expect([s.version, s.settingsVersion]).toEqual([docVersion, settingsVersion]);
  return s;
}

describe('contracts/v1 examples through CheckSession', () => {
  it('has the corpus pairs and error fixtures', () => {
    expect(pairs.map(([c]) => c)).toEqual(expect.arrayContaining(['check.json', 'corpus-p0-0003-check.json',
      'corpus-p0-0059-check.json', 'corpus-p0-0061-check.json', 'corpus-p0-0063-check.json']));
    expect(errors.length).toBeGreaterThanOrEqual(5);
  });

  it.each(pairs)('%s + result: accepted as complete with identical issues', async (c, r) => {
    const req = load<CheckRequest>(c);
    const res = load<CheckResult>(r);
    const s = sessionAt(new ReplayEngine(req, res), req.text, req.docVersion, req.settingsVersion);
    await s.check();
    expect(s.state.status).toBe('complete');
    expect(s.state.issues).toEqual(res.issues);
  });

  it.each(pairs)('%s: every issue range is valid UTF-16 and the first fix applies in place', async (c, r) => {
    const req = load<CheckRequest>(c);
    const res = load<CheckResult>(r);
    for (const i of res.issues) {
      expect(0 <= i.start && i.start <= i.end && i.end <= req.text.length).toBe(true);
    }
    if (!res.issues.length) return;
    const s = sessionAt(new ReplayEngine(req, res), req.text, req.docVersion, req.settingsVersion);
    await s.check();
    const { start, end, replacements } = res.issues[0];
    expect(s.applyFix(0, 0)).toMatchObject({ ok: true });
    // Text outside the range is untouched byte for byte (NFD, emoji, ZWJ sequences).
    expect(s.text).toBe(req.text.slice(0, start) + replacements[0] + req.text.slice(end));
  });

  it.each(pairs)('%s + result: a reply for an older docVersion is dropped', async (c, r) => {
    const req = load<CheckRequest>(c);
    const res = load<CheckResult>(r);
    const engine: Engine = { check: async (q) => ({ ...res, id: q.id, docVersion: q.docVersion - 1 }) };
    const s = sessionAt(engine, req.text, req.docVersion, req.settingsVersion);
    await s.check();
    expect(s.state.status).toBe('checking');
  });

  it.each(errors)('%s: handled per the version rule', async (f) => {
    const err = load<ErrorMessage>(f);
    const engine: Engine = { check: async (q) => ({ ...err, id: err.id === null ? null : q.id }) };
    if (err.docVersion === undefined) {
      const s = new CheckSession(engine, 'x');
      await s.check();
      expect(s.state.status).toBe('checking'); // not tied to this check: ignored
      return;
    }
    const s = sessionAt(engine, 'x', err.docVersion, err.settingsVersion!);
    await s.check();
    expect(s.state).toMatchObject({ status: 'incomplete', errorCode: err.code, issues: [] });
  });
});

describe('FakeEngine agrees with the corpus fixtures it covers', () => {
  it.each(['corpus-p0-0003', 'corpus-p0-0061'])('%s', async (id) => {
    const req = load<CheckRequest>(`${id}-check.json`);
    const res = load<CheckResult>(`${id}-result.json`);
    const out = (await new FakeEngine().check(req)) as CheckResult;
    expect(out.issues.map((i) => [i.start, i.end, i.category, i.replacements]))
      .toEqual(res.issues.map((i) => [i.start, i.end, i.category, i.replacements]));
  });
});
