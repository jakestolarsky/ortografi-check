import { describe, it, expect } from 'vitest';
import { CheckSession } from './session';
import type { CheckRequest, CheckResponse, Engine, Issue } from './contract';

/** Controlled engine: holds requests until the test releases them, in any order. */
class ControlledEngine implements Engine {
  pending: { req: CheckRequest; resolve: (r: CheckResponse) => void }[] = [];
  check(req: CheckRequest) {
    return new Promise<CheckResponse>((resolve) => this.pending.push({ req, resolve }));
  }
  respond(i: number, issues: Issue[]) {
    const { req, resolve } = this.pending[i];
    resolve({
      protocol: 1, type: 'result', id: req.id, docVersion: req.docVersion,
      settingsVersion: req.settingsVersion, engineVersion: '6.8', status: 'complete', issues,
    });
  }
  fail(i: number, code: 'TIMEOUT' | 'ENGINE_ERROR' | 'TEXT_TOO_LONG',
    versions: { docVersion?: number; settingsVersion?: number } = {}) {
    const { req, resolve } = this.pending[i];
    resolve({ protocol: 1, type: 'error', id: req.id, docVersion: req.docVersion,
      settingsVersion: req.settingsVersion, ...versions, code, detail: 'x' });
  }
}

const issue = (start: number, end: number, replacements: string[] = [], ruleId = 'R'): Issue => ({
  start, end, ruleId, category: 'spelling', engineCategory: 'TYPOS', issueType: 'misspelling',
  message: 'm', replacements,
});
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('CheckSession versioning', () => {
  it('discards a late result when responses arrive in reverse order (PLAN s.10)', async () => {
    const engine = new ControlledEngine();
    const s = new CheckSession(engine, 'Ala ma kotaa.');
    s.check();
    s.setText('Ala ma kota.');
    s.check();
    engine.respond(1, []); // newer answers first
    await flush();
    expect(s.state.status).toBe('complete');
    expect(s.state.issues).toEqual([]);
    engine.respond(0, [issue(7, 12, ['kota'])]); // old, late
    await flush();
    expect(s.state.issues).toEqual([]);
    expect(s.state.resultVersion).toBe(s.version);
  });

  it('editing during analysis discards the in-flight result', async () => {
    const engine = new ControlledEngine();
    const s = new CheckSession(engine, 'Wiem że tak.');
    s.check();
    s.setText('Wiem, że tak.');
    engine.respond(0, [issue(4, 4, [','])]);
    await flush();
    expect(s.state.issues).toEqual([]);
    expect(s.state.status).toBe('stale');
  });

  it('setText bumps the version and deactivates existing underlines in one step', async () => {
    const engine = new ControlledEngine();
    const s = new CheckSession(engine, 'kotaa');
    s.check();
    engine.respond(0, [issue(0, 5, ['kota'])]);
    await flush();
    expect(s.state.status).toBe('complete');
    const v = s.version;
    s.setText('kotaa!');
    expect(s.version).toBe(v + 1);
    expect(s.state.status).toBe('stale');
    expect(s.state.issues).toEqual([]);
  });

  it('a settings/dictionary change invalidates results and late answers for old settings', async () => {
    const engine = new ControlledEngine();
    const s = new CheckSession(engine, 'Kowalskyy');
    s.check();
    s.bumpSettings();
    engine.respond(0, [issue(0, 9)]);
    await flush();
    expect(s.state.issues).toEqual([]);
    expect(s.state.status).toBe('stale');
  });

  it('an error is an incomplete state, never a clean result', async () => {
    const engine = new ControlledEngine();
    const s = new CheckSession(engine, 'tekst');
    s.check();
    engine.fail(0, 'TIMEOUT');
    await flush();
    expect(s.state.status).toBe('incomplete');
    expect(s.state.errorCode).toBe('TIMEOUT');
    expect(s.state.issues).toEqual([]);
  });

  it('a late error for an old version does not override a newer result', async () => {
    const engine = new ControlledEngine();
    const s = new CheckSession(engine, 'a');
    s.check();
    s.setText('b');
    s.check();
    engine.respond(1, []);
    await flush();
    engine.fail(0, 'ENGINE_ERROR');
    await flush();
    expect(s.state.status).toBe('complete');
  });

  it('rejects results whose id does not match the request sent for that version', async () => {
    const engine = new ControlledEngine();
    const s = new CheckSession(engine, 'a');
    s.check();
    s.check(); // re-check same version: only the newest request counts
    engine.respond(0, [issue(0, 1)]);
    await flush();
    expect(s.state.status).toBe('checking');
    engine.respond(1, []);
    await flush();
    expect(s.state.status).toBe('complete');
  });

  it('notifies subscribers on state change', async () => {
    const engine = new ControlledEngine();
    const s = new CheckSession(engine, 'a');
    const seen: string[] = [];
    s.subscribe((st) => seen.push(st.status));
    s.check();
    engine.respond(0, []);
    await flush();
    expect(seen).toEqual(['idle', 'checking', 'complete']);
  });
});

describe('CheckSession errors carry versions (contracts v1)', () => {
  it('a late TIMEOUT for an older docVersion does not mark the newer document incomplete', async () => {
    const engine = new ControlledEngine();
    const s = new CheckSession(engine, 'a');
    s.check();
    s.setText('b');
    s.check();
    engine.fail(0, 'TIMEOUT');
    await flush();
    expect(s.state.status).toBe('checking');
    engine.respond(1, []);
    await flush();
    expect(s.state.status).toBe('complete');
  });

  it('a late error for an older settingsVersion does not mark the current check incomplete', async () => {
    const engine = new ControlledEngine();
    const s = new CheckSession(engine, 'a');
    s.check();
    s.bumpSettings();
    s.check();
    engine.fail(0, 'ENGINE_ERROR');
    await flush();
    expect(s.state.status).toBe('checking');
  });

  it('ignores an error whose own docVersion/settingsVersion do not match the current document', async () => {
    const engine = new ControlledEngine();
    const s = new CheckSession(engine, 'a');
    s.check();
    engine.fail(0, 'TIMEOUT', { docVersion: s.version - 1 });
    await flush();
    expect(s.state.status).toBe('checking');
    expect(s.state.errorCode).toBeNull();
  });

  it('ignores an error whose settingsVersion is older than the current settings', async () => {
    const engine = new ControlledEngine();
    const s = new CheckSession(engine, 'a');
    s.check();
    engine.fail(0, 'TIMEOUT', { settingsVersion: s.settingsVersion - 1 });
    await flush();
    expect(s.state.status).toBe('checking');
  });

  it('a matching error marks the current document incomplete', async () => {
    const engine = new ControlledEngine();
    const s = new CheckSession(engine, 'a');
    s.check();
    engine.fail(0, 'TIMEOUT');
    await flush();
    expect(s.state).toMatchObject({ status: 'incomplete', errorCode: 'TIMEOUT' });
  });
});

describe('CheckSession.applyFix', () => {
  async function checked(text: string, issues: Issue[]) {
    const engine = new ControlledEngine();
    const s = new CheckSession(engine, text);
    s.check();
    engine.respond(0, issues);
    await flush();
    return s;
  }

  it('applies a fix after an emoji using UTF-16 ranges and bumps the version once', async () => {
    const text = '😀 Zażułć kotaa.'; // emoji = 2 UTF-16 units
    const start = text.indexOf('kotaa');
    const s = await checked(text, [issue(start, start + 5, ['kota'])]);
    const v = s.version;
    const edit = s.applyFix(0, 0);
    expect(edit).toEqual({ ok: true, from: start, to: start + 5, insert: 'kota' });
    expect(s.text).toBe('😀 Zażułć kota.');
    expect(s.version).toBe(v + 1);
    expect(s.state.status).toBe('stale');
  });

  it('inserts at a zero-length range (missing comma)', async () => {
    const s = await checked('Wiem że tak.', [issue(4, 4, [','])]);
    expect(s.applyFix(0, 0).ok).toBe(true);
    expect(s.text).toBe('Wiem, że tak.');
  });

  it('refuses a fix when the result is stale', async () => {
    const s = await checked('kotaa', [issue(0, 5, ['kota'])]);
    s.setText('kotaa x');
    expect(s.applyFix(0, 0)).toEqual({ ok: false, reason: 'stale' });
    expect(s.text).toBe('kotaa x');
  });

  it('refuses an out-of-range or unknown issue/suggestion', async () => {
    const s = await checked('ab', [issue(0, 9, ['x']), issue(0, 1, ['y'])]);
    expect(s.applyFix(0, 0)).toEqual({ ok: false, reason: 'range' });
    expect(s.applyFix(1, 5)).toEqual({ ok: false, reason: 'no-such-suggestion' });
    expect(s.applyFix(7, 0)).toEqual({ ok: false, reason: 'no-such-issue' });
  });

  it('refuses a range that splits a surrogate pair', async () => {
    const s = await checked('😀a', [issue(1, 3, ['x'])]);
    expect(s.applyFix(0, 0)).toEqual({ ok: false, reason: 'range' });
  });

  it('overlapping issues cannot both be applied (no duplicate replacement)', async () => {
    const s = await checked('Wiem że kotaa', [issue(0, 7, ['Wiem, że']), issue(5, 13, ['że kota'])]);
    expect(s.applyFix(0, 0).ok).toBe(true);
    expect(s.applyFix(1, 0)).toEqual({ ok: false, reason: 'stale' });
    expect(s.text).toBe('Wiem, że kotaa');
  });
});
