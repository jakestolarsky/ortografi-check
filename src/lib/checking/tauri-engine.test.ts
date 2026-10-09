import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CheckRequest, CheckResult, ErrorMessage } from '$lib/protocol';

type Handler = (e: { payload: unknown }) => void;
const h = vi.hoisted(() => ({
  listeners: new Map<string, Handler>(),
  invoke: vi.fn(),
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke: h.invoke }));
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async (name: string, fn: Handler) => { h.listeners.set(name, fn); return () => h.listeners.delete(name); }),
}));

import { TauriEngine } from './tauri-engine';
import { CheckSession } from './session';
import { connectEngine, statusLabel } from './engine-status';

const emit = (name: string, payload: unknown) => h.listeners.get(name)!({ payload });
const flush = () => new Promise((r) => setTimeout(r, 0));
const checks = () => h.invoke.mock.calls.filter(([c]) => c === 'engine_check').map(([, a]) => (a as { request: CheckRequest }).request);
const result = (r: CheckRequest, issues: CheckResult['issues'] = []): CheckResult => ({
  protocol: 1, type: 'result', id: r.id, docVersion: r.docVersion, settingsVersion: r.settingsVersion,
  engineVersion: '6.8', status: 'complete', issues });
const error = (r: CheckRequest, code: ErrorMessage['code']): ErrorMessage => ({
  protocol: 1, type: 'error', id: r.id, docVersion: r.docVersion, settingsVersion: r.settingsVersion, code, detail: 'd' });

beforeEach(() => {
  h.listeners.clear();
  h.invoke.mockReset();
  h.invoke.mockImplementation(async (cmd: string) => (cmd === 'engine_status' ? { state: 'starting' } : undefined));
});

async function started() {
  const engine = await TauriEngine.start();
  return engine;
}

const order = () => h.invoke.mock.calls.map(([c]) => c);

describe('TauriEngine', () => {
  it('calls engine_reset_session on load, before engine_status and any check', async () => {
    const engine = await started();
    engine.check({ protocol: 1, type: 'check', id: 'c1', docVersion: 1, settingsVersion: 1, text: 'a' });
    expect(order()).toEqual(['engine_reset_session', 'engine_status', 'engine_check']);
  });

  it('accepts the shared EngineStatus IPC example', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const ex = JSON.parse(readFileSync(join(__dirname, '../../../contracts/v1/examples/ipc/engine-status.json'), 'utf8'));
    const engine = await started();
    emit('engine://status', ex);
    expect(engine.status).toBe(ex.state);
  });

  it('ignores an unknown status value', async () => {
    const engine = await started();
    emit('engine://status', { state: 'exploded' });
    expect(engine.status).toBe('starting');
  });

  it('fetches the initial status once and follows engine://status', async () => {
    const engine = await started();
    const seen: string[] = [];
    engine.onStatus((s) => seen.push(s));
    expect(engine.status).toBe('starting');
    emit('engine://status', { state: 'ready' });
    expect(seen).toEqual(['starting', 'ready']);
    expect(h.invoke.mock.calls.filter(([c]) => c === 'engine_status')).toHaveLength(1);
  });

  it('sends engine_check with { request } and resolves from engine://message by id', async () => {
    const engine = await started();
    const req: CheckRequest = { protocol: 1, type: 'check', id: 'c1', docVersion: 1, settingsVersion: 1, text: 'Wiem że' };
    const p = engine.check(req);
    expect(h.invoke).toHaveBeenCalledWith('engine_check', { request: req });
    emit('engine://message', result(req));
    await expect(p).resolves.toEqual(result(req));
  });

  it('drops a superseded check (Rust emits nothing for it) without leaking', async () => {
    const engine = await started();
    const a: CheckRequest = { protocol: 1, type: 'check', id: 'c1', docVersion: 1, settingsVersion: 1, text: 'a' };
    const b = { ...a, id: 'c2', docVersion: 2, text: 'b' };
    const pa = engine.check(a);
    engine.check(b);
    await expect(pa).rejects.toThrow('superseded');
    expect(engine.pendingCount).toBe(1);
  });

  it('ignores messages for unknown ids and id:null errors', async () => {
    const engine = await started();
    emit('engine://message', { protocol: 1, type: 'error', id: null, code: 'MALFORMED_REQUEST', detail: 'd' });
    emit('engine://message', { protocol: 1, type: 'result', id: 'zz', docVersion: 1, settingsVersion: 1, engineVersion: '', status: 'complete', issues: [] });
    expect(engine.pendingCount).toBe(0);
  });

  it('a failed invoke rejects the check', async () => {
    const engine = await started();
    h.invoke.mockImplementation(async (c: string) => { if (c === 'engine_check') throw new Error('ipc'); });
    await expect(engine.check({ protocol: 1, type: 'check', id: 'c1', docVersion: 1, settingsVersion: 1, text: '' })).rejects.toThrow();
  });
});

describe('connectEngine with CheckSession', () => {
  async function setup(text = 'Ala ma kota.') {
    const engine = await started();
    const session = new CheckSession(engine, text);
    const ctl = connectEngine(session, engine);
    return { engine, session, ctl };
  }

  it('the in-flight check failing shows incomplete; returning to ready sends no duplicate check', async () => {
    const { session } = await setup();
    emit('engine://status', { state: 'ready' });
    session.check();
    emit('engine://status', { state: 'busy' });
    const [req] = checks();
    emit('engine://status', { state: 'restarting' });
    emit('engine://message', error(req, 'TIMEOUT'));
    await flush();
    expect(session.state).toMatchObject({ status: 'incomplete', errorCode: 'TIMEOUT' });
    emit('engine://status', { state: 'ready' });
    await flush();
    expect(checks()).toHaveLength(1);
    expect(session.state.status).toBe('incomplete');
  });

  it('no duplicate check on busy -> ready while a reply is pending', async () => {
    const { session } = await setup();
    emit('engine://status', { state: 'ready' });
    session.check();
    emit('engine://status', { state: 'busy' });
    emit('engine://status', { state: 'ready' });
    await flush();
    expect(checks()).toHaveLength(1);
    emit('engine://message', result(checks()[0]));
    await flush();
    expect(session.state.status).toBe('complete');
  });

  it('retry when unavailable calls engine_retry and re-sends the current check once', async () => {
    const { session, ctl } = await setup();
    session.check();
    emit('engine://message', error(checks()[0], 'ENGINE_UNAVAILABLE'));
    emit('engine://status', { state: 'unavailable' });
    await flush();
    expect(ctl.canRetry()).toBe(true);
    await ctl.retry();
    expect(h.invoke).toHaveBeenCalledWith('engine_retry');
    expect(checks()).toHaveLength(2);
    expect(checks()[1]).toMatchObject({ docVersion: session.version, text: session.text });
    expect(checks()[1].id).not.toBe(checks()[0].id);
  });

  it('retry after an incomplete result with a ready engine re-sends without engine_retry', async () => {
    const { session, ctl } = await setup();
    emit('engine://status', { state: 'ready' });
    session.check();
    emit('engine://message', error(checks()[0], 'ENGINE_ERROR'));
    await flush();
    expect(ctl.canRetry()).toBe(true);
    await ctl.retry();
    expect(h.invoke).not.toHaveBeenCalledWith('engine_retry');
    expect(checks()).toHaveLength(2);
  });

  it('cannot retry while a check is pending and the engine is fine', async () => {
    const { session, ctl } = await setup();
    emit('engine://status', { state: 'ready' });
    session.check();
    expect(ctl.canRetry()).toBe(false);
  });
});

describe('README failure contract (PR #9)', () => {
  async function setup(text = 'Ala ma kota.') {
    const engine = await started();
    const session = new CheckSession(engine, text);
    return { engine, session, ctl: connectEngine(session, engine) };
  }

  it('check right after retry: engine_retry resolves (state starting), check is queued and answered at ready', async () => {
    const { session, ctl } = await setup();
    session.check();
    emit('engine://message', error(checks()[0], 'ENGINE_UNAVAILABLE'));
    emit('engine://status', { state: 'unavailable' });
    await flush();
    h.invoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'engine_retry') emit('engine://status', { state: 'starting' }); // synchronous per README
    });
    await ctl.retry();
    expect(order().slice(-2)).toEqual(['engine_retry', 'engine_check']);
    expect(session.state.status).toBe('checking');
    emit('engine://status', { state: 'ready' });
    emit('engine://status', { state: 'busy' });
    emit('engine://message', result(checks()[1]));
    emit('engine://status', { state: 'ready' });
    await flush();
    expect(session.state.status).toBe('complete');
    expect(checks()).toHaveLength(2);
  });

  it('failed running check gets one stale error; the waiting newer check is replayed by Rust, not re-sent', async () => {
    const { session } = await setup('Ala ma kotaa.');
    emit('engine://status', { state: 'ready' });
    session.check();
    const [a] = checks();
    session.setText('Ala ma kota.');
    session.check(); // waits in Rust's queue
    const b = checks()[1];
    emit('engine://message', error(a, 'TIMEOUT')); // older version: Rust drops it; ignored even if it arrives
    emit('engine://status', { state: 'restarting' });
    emit('engine://status', { state: 'ready' });
    await flush();
    expect(session.state.status).toBe('checking');
    emit('engine://message', result(b));
    await flush();
    expect(session.state.status).toBe('complete');
    expect(checks()).toHaveLength(2);
  });

  it('a status event may arrive after the message (no ordering)', async () => {
    const { session } = await setup();
    session.check();
    emit('engine://message', result(checks()[0]));
    await flush();
    emit('engine://status', { state: 'ready' });
    expect(session.state.status).toBe('complete');
    expect(checks()).toHaveLength(1);
  });
});

describe('statusLabel (Polish)', () => {
  it.each([
    ['starting', 'Uruchamianie silnika…'],
    ['ready', 'Silnik gotowy'],
    ['busy', 'Sprawdzanie…'],
    ['restarting', 'Ponowne uruchamianie silnika…'],
    ['unavailable', 'Silnik niedostępny'],
  ] as const)('%s -> %s', (s, label) => {
    expect(statusLabel(s)).toBe(label);
  });
});
