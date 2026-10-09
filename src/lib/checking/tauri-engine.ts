import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { CheckRequest, EngineStatus } from '$lib/protocol';
import type { CheckResponse, Engine } from './engine';

export type EngineState = EngineStatus['state'];
// Exhaustive by construction: adding a state to the schema fails typecheck here.
const STATE_SET: Record<EngineState, true> = { starting: true, ready: true, busy: true, restarting: true, unavailable: true };
const STATES = Object.keys(STATE_SET) as EngineState[];

/**
 * Engine over Tauri IPC (contracts/README.md, Desktop IPC): `engine_check` returns at once and
 * the answer arrives unchanged on `engine://message`. Rust emits nothing for stale or superseded
 * checks, so an older pending check is rejected as soon as a newer one is sent. No UI-side
 * timer: Rust reports TIMEOUT.
 */
export class TauriEngine implements Engine {
  private pending = new Map<string, { resolve: (r: CheckResponse) => void; reject: (e: Error) => void }>();
  private listeners = new Set<(s: EngineState) => void>();
  status: EngineState = 'starting';

  private constructor() {}

  static async start(): Promise<TauriEngine> {
    const e = new TauriEngine();
    await listen<CheckResponse>('engine://message', (ev) => e.receive(ev.payload));
    await listen<EngineStatus>('engine://status', (ev) => e.setStatus(ev.payload?.state));
    // A WebView reload restarts docVersion at 1: clear Rust's stale filter first (contracts README).
    await invoke('engine_reset_session');
    const initial = await invoke<EngineStatus>('engine_status');
    e.setStatus(initial?.state);
    return e;
  }

  get pendingCount() { return this.pending.size; }

  onStatus(fn: (s: EngineState) => void): () => void {
    this.listeners.add(fn);
    fn(this.status);
    return () => this.listeners.delete(fn);
  }

  check(request: CheckRequest): Promise<CheckResponse> {
    for (const [id, p] of this.pending) {
      this.pending.delete(id);
      p.reject(new Error('superseded'));
    }
    return new Promise<CheckResponse>((resolve, reject) => {
      this.pending.set(request.id, { resolve, reject });
      invoke('engine_check', { request }).catch((err: unknown) => {
        if (this.pending.delete(request.id)) reject(err instanceof Error ? err : new Error(String(err)));
      });
    });
  }

  retry(): Promise<void> {
    return invoke('engine_retry');
  }

  private receive(msg: CheckResponse) {
    if (!msg || typeof msg.id !== 'string') return; // id:null errors are not tied to a check
    const p = this.pending.get(msg.id);
    if (!p) return;
    this.pending.delete(msg.id);
    p.resolve(msg);
  }

  private setStatus(s: unknown) {
    if (!STATES.includes(s as EngineState)) return;
    this.status = s as EngineState;
    for (const fn of this.listeners) fn(this.status);
  }
}
