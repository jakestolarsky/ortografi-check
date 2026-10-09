import { describe, it, expect } from 'vitest';
import { FakeEngine } from './fake-engine';
import type { CheckRequest, CheckResult } from '$lib/protocol';

const req = (text: string, docVersion = 1): CheckRequest =>
  ({ protocol: 1, type: 'check', id: 'c1', docVersion, settingsVersion: 1, text });

describe('FakeEngine (tests/dev only)', () => {
  it('echoes id and versions and flags misspellings with UTF-16 ranges after emoji', async () => {
    const r = (await new FakeEngine().check(req('😀 Ala ma kotaa.', 4))) as CheckResult;
    expect(r).toMatchObject({ type: 'result', id: 'c1', docVersion: 4, settingsVersion: 1, status: 'complete' });
    expect(r.issues).toEqual([expect.objectContaining({ start: 10, end: 15, category: 'spelling', replacements: ['kota'] })]);
  });
  it('flags a missing comma before „że” as a zero-length punctuation issue', async () => {
    const r = (await new FakeEngine().check(req('Wiem że tak.'))) as CheckResult;
    expect(r.issues).toEqual([expect.objectContaining({ start: 4, end: 4, category: 'punctuation', replacements: [','] })]);
  });
  it('does not flag „że” already preceded by a comma', async () => {
    const r = (await new FakeEngine().check(req('Wiem, że tak.'))) as CheckResult;
    expect(r.issues).toEqual([]);
  });
  it('matches NFD „że” (z + combining dot) without normalizing the text', async () => {
    const text = 'Wiem z\u0307e tak.';
    const r = (await new FakeEngine().check(req(text))) as CheckResult;
    expect(r.issues[0]).toMatchObject({ start: 4, end: 4 });
  });
  it('can be told to time out', async () => {
    const e = new FakeEngine();
    e.nextError = 'TIMEOUT';
    expect(await e.check(req('x', 2))).toMatchObject({ type: 'error', code: 'TIMEOUT', docVersion: 2 });
  });
});
