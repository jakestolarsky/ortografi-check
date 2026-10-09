import type { CheckResponse, Engine, ErrorCode, Issue } from './contract';
import { PROTOCOL } from './contract';

export type CheckStatus = 'idle' | 'checking' | 'complete' | 'stale' | 'incomplete';

export interface CheckState {
  status: CheckStatus;
  /** Only issues valid for the current text and settings; empty otherwise. */
  issues: readonly Issue[];
  /** Document version the issues belong to, or null. */
  resultVersion: number | null;
  errorCode: ErrorCode | null;
}

export type FixOutcome =
  | { ok: true; from: number; to: number; insert: string }
  | { ok: false; reason: 'stale' | 'no-such-issue' | 'no-such-suggestion' | 'range' };

const isLow = (c: number) => c >= 0xdc00 && c <= 0xdfff;

/**
 * Analysis state for one plain-text document (PLAN.md s.4). Text and version change together;
 * a response is accepted only if it answers the newest request for the current text and
 * settings versions. In the app the editor owns the text and calls setText on each change.
 */
export class CheckSession {
  private _text: string;
  private _version = 1;
  private _settingsVersion = 1;
  private seq = 0;
  private latestId: string | null = null;
  private listeners = new Set<(s: CheckState) => void>();
  state: CheckState = { status: 'idle', issues: [], resultVersion: null, errorCode: null };

  constructor(private engine: Engine, text = '') {
    this._text = text;
  }

  get text() { return this._text; }
  get version() { return this._version; }
  get settingsVersion() { return this._settingsVersion; }

  subscribe(fn: (s: CheckState) => void): () => void {
    this.listeners.add(fn);
    fn(this.state);
    return () => this.listeners.delete(fn);
  }

  setText(text: string): void {
    this._text = text;
    this._version++;
    this.invalidate();
  }

  /** Settings or user dictionary changed. */
  bumpSettings(): void {
    this._settingsVersion++;
    this.invalidate();
  }

  check(): Promise<void> {
    const id = `c${++this.seq}`;
    this.latestId = id;
    const docVersion = this._version;
    const settingsVersion = this._settingsVersion;
    this.set({ status: 'checking', issues: [], resultVersion: null, errorCode: null });
    return this.engine
      .check({ protocol: PROTOCOL, type: 'check', id, docVersion, settingsVersion, text: this._text })
      .then(
        (res) => this.receive(id, docVersion, settingsVersion, res),
        () => this.receive(id, docVersion, settingsVersion, null),
      );
  }

  applyFix(issueIndex: number, suggestionIndex: number): FixOutcome {
    if (this.state.status !== 'complete' || this.state.resultVersion !== this._version) {
      return { ok: false, reason: 'stale' };
    }
    const issue = this.state.issues[issueIndex];
    if (!issue) return { ok: false, reason: 'no-such-issue' };
    const insert = issue.replacements[suggestionIndex];
    if (insert === undefined) return { ok: false, reason: 'no-such-suggestion' };
    const { start: from, end: to } = issue;
    const t = this._text;
    if (!(Number.isInteger(from) && Number.isInteger(to) && 0 <= from && from <= to && to <= t.length)
      || isLow(t.charCodeAt(from)) || (to < t.length && isLow(t.charCodeAt(to)))) {
      return { ok: false, reason: 'range' };
    }
    this.setText(t.slice(0, from) + insert + t.slice(to));
    return { ok: true, from, to, insert };
  }

  private receive(id: string, docVersion: number, settingsVersion: number, res: CheckResponse | null) {
    if (id !== this.latestId || docVersion !== this._version || settingsVersion !== this._settingsVersion) {
      return; // late answer for an older request: never replaces newer state
    }
    if (!res) { // transport failure for the current request
      this.set({ status: 'incomplete', issues: [], resultVersion: null, errorCode: 'ENGINE_ERROR' });
      return;
    }
    // Both results and errors must echo the id and versions of the current request (contracts v1).
    if (res.id !== id || res.docVersion !== docVersion || res.settingsVersion !== settingsVersion) return;
    if (res.type === 'result') {
      this.set({ status: 'complete', issues: res.issues, resultVersion: docVersion, errorCode: null });
    } else {
      this.set({ status: 'incomplete', issues: [], resultVersion: null, errorCode: res.code });
    }
  }

  private invalidate() {
    this.latestId = null;
    const status: CheckStatus = this.state.status === 'idle' ? 'idle' : 'stale';
    this.set({ status, issues: [], resultVersion: null, errorCode: null });
  }

  private set(s: CheckState) {
    this.state = s;
    for (const fn of this.listeners) fn(s);
  }
}
