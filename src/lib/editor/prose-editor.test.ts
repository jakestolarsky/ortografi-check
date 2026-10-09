// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { undo } from '@codemirror/commands';
import { CheckSession } from '$lib/checking/session';
import { FakeEngine } from '$lib/checking/fake-engine';
import type { Engine } from '$lib/checking/engine';
import { createProseEditor, applySuggestion, type ProseEditor } from './prose-editor';

let ed: ProseEditor | undefined;
afterEach(() => ed?.destroy());

async function setup(text: string) {
  const session = new CheckSession(new FakeEngine(), text);
  ed = createProseEditor({ parent: document.body, session });
  await session.check();
  return { session, view: ed.view };
}
const marks = () => [...document.querySelectorAll('.cm-issue')].map((e) => [e.className, e.textContent]);
const markers = () => document.querySelectorAll('.cm-insert-marker');

describe('prose editor diagnostics', () => {
  it('starts with the session text and no line numbers', () => {
    const session = new CheckSession(new FakeEngine(), 'Zażółć gęślą jaźń');
    ed = createProseEditor({ parent: document.body, session });
    expect(ed.view.state.doc.toString()).toBe('Zażółć gęślą jaźń');
    expect(document.querySelector('.cm-gutters')).toBeNull();
  });

  it('decorates a spelling issue after an emoji with a category class', async () => {
    await setup('😀 Ala ma kotaa.');
    expect(marks()).toEqual([[expect.stringContaining('cm-issue-spelling'), 'kotaa']]);
  });

  it('shows a zero-length insertion marker for a missing comma', async () => {
    await setup('Wiem że tak.');
    expect(markers()).toHaveLength(1);
    expect(markers()[0].classList.contains('cm-issue-punctuation')).toBe(true);
    expect(markers()[0].getAttribute('aria-label')).toBe('Brak przecinka');
  });

  it('styles the insertion marker visibly with the punctuation token', async () => {
    await setup('Wiem że tak.');
    const cs = getComputedStyle(markers()[0]);
    expect(cs.width).toBe('2px');
    expect(cs.backgroundColor).toBe('var(--issue-punctuation)');
  });

  it('typing updates the session version and removes stale underlines at once', async () => {
    const { session, view } = await setup('😀 Ala ma kotaa.');
    const v = session.version;
    view.dispatch({ changes: { from: 0, insert: 'X' } });
    expect(session.text).toBe('X😀 Ala ma kotaa.');
    expect(session.version).toBe(v + 1);
    expect(marks()).toEqual([]);
  });

  it('a late result for an older text never decorates the newer text', async () => {
    const engine = new FakeEngine();
    const session = new CheckSession(engine, 'Ala ma kotaa.');
    ed = createProseEditor({ parent: document.body, session });
    const p = session.check();
    ed.view.dispatch({ changes: { from: 0, insert: 'Ola. ' } });
    await p;
    expect(marks()).toEqual([]);
  });
});

describe('comma deletion (contracts README edit conventions)', () => {
  const text = 'Był szybki, jak wiatr.';
  const engine: Engine = {
    check: async (q) => ({ protocol: 1, type: 'result', id: q.id, docVersion: q.docVersion,
      settingsVersion: q.settingsVersion, engineVersion: 'stub', status: 'complete',
      issues: [{ start: 10, end: 11, ruleId: 'ZBEDNY_PRZECINEK', category: 'punctuation',
        engineCategory: 'PUNCTUATION', issueType: 'typographical', message: 'Zbędny przecinek', replacements: [''] }] }),
  };

  it('marks only the comma as a visible, labelled deletion', async () => {
    const session = new CheckSession(engine, text);
    ed = createProseEditor({ parent: document.body, session });
    await session.check();
    const del = [...document.querySelectorAll('.cm-delete')];
    expect(del.map((e) => e.textContent)).toEqual([',']);
    expect(del[0].classList.contains('cm-issue-punctuation')).toBe(true);
    expect(del[0].getAttribute('aria-label')).toBe('Do usunięcia: Zbędny przecinek');
  });

  it('deletes the comma, keeps the space, one undo restores it', async () => {
    const session = new CheckSession(engine, text);
    ed = createProseEditor({ parent: document.body, session });
    await session.check();
    expect(applySuggestion(ed.view, session, 0, 0)).toBe(true);
    expect(ed.view.state.doc.toString()).toBe('Był szybki jak wiatr.');
    expect(ed.view.state.selection.main.head).toBe(10);
    expect(document.querySelectorAll('.cm-delete')).toHaveLength(0);
    undo(ed.view);
    expect(ed.view.state.doc.toString()).toBe(text);
    expect(session.text).toBe(text);
  });
});

describe('applySuggestion', () => {
  it('applies a fix after an emoji as one transaction, one version bump, and one undo', async () => {
    const { session, view } = await setup('😀 Ala ma kotaa.');
    const v = session.version;
    expect(applySuggestion(view, session, 0, 0)).toBe(true);
    expect(view.state.doc.toString()).toBe('😀 Ala ma kota.');
    expect(session.text).toBe('😀 Ala ma kota.');
    expect(session.version).toBe(v + 1);
    expect(marks()).toEqual([]);
    undo(view);
    expect(view.state.doc.toString()).toBe('😀 Ala ma kotaa.');
    expect(session.text).toBe('😀 Ala ma kotaa.');
  });

  it('inserts a missing comma in NFD text without normalizing it', async () => {
    const { view } = await setup('Wiem z\u0307e tak.');
    expect(applySuggestion(view, ed!.session, 0, 0)).toBe(true);
    expect(view.state.doc.toString()).toBe('Wiem, z\u0307e tak.');
  });

  it('refuses a fix once the text changed (no duplicate replacement)', async () => {
    const { session, view } = await setup('Wiem że kotaa.');
    expect(session.state.issues).toHaveLength(2);
    expect(applySuggestion(view, session, 0, 0)).toBe(true);
    expect(applySuggestion(view, session, 1, 0)).toBe(false);
    expect(view.state.doc.toString()).toBe('Wiem, że kotaa.');
  });

  it('places the caret after the fix without selecting it', async () => {
    const { session, view } = await setup('Ala ma kotaa.');
    applySuggestion(view, session, 0, 0);
    expect(view.state.selection.main.empty).toBe(true);
    expect(view.state.selection.main.head).toBe('Ala ma kota'.length);
  });
});
