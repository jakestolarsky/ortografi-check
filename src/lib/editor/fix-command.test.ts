// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { openLintPanel, forEachDiagnostic } from '@codemirror/lint';
import { CheckSession } from '$lib/checking/session';
import type { Engine, CheckResponse } from '$lib/checking/engine';
import { FakeEngine } from '$lib/checking/fake-engine';
import { CommandRegistry } from '$lib/commands/registry';
import { createProseEditor, type ProseEditor } from './prose-editor';
import { APPLY_FIX, registerFixCommand, issueIndexAt, type EditorCommandContext } from './fix-command';

let ed: ProseEditor | undefined;
afterEach(() => { ed?.destroy(); ed = undefined; document.body.innerHTML = ''; });

async function setup(text: string) {
  const registry = new CommandRegistry<EditorCommandContext>();
  registerFixCommand(registry);
  const session = new CheckSession(new FakeEngine(), text);
  ed = createProseEditor({ parent: document.body, session, registry });
  await session.check();
  return { registry, session, view: ed.view };
}
const key = (view: ProseEditor['view'], init: KeyboardEventInit) =>
  view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }));

describe('issue.applyFix command', () => {
  it('is registered once in the editor scope with a shortcut', async () => {
    const { registry } = await setup('Wiem że tak.');
    expect(registry.get(APPLY_FIX)?.scope).toBe('editor');
    expect(registry.shortcutFor(APPLY_FIX)).toBe('Alt+Enter');
  });

  it('finds the issue at the cursor, including a zero-length insertion point', async () => {
    const { session } = await setup('Wiem że tak.');
    expect(issueIndexAt(session, 4)).toBe(0);
    expect(issueIndexAt(session, 9)).toBe(-1);
  });

  it('keyboard shortcut applies the top fix of the issue at the cursor', async () => {
    const { view, session, registry } = await setup('Wiem że tak.');
    const run = vi.spyOn(registry.get(APPLY_FIX)!, 'run');
    view.dispatch({ selection: { anchor: 4 } });
    key(view, { key: 'Enter', altKey: true });
    expect(run).toHaveBeenCalledTimes(1);
    expect(view.state.doc.toString()).toBe('Wiem, że tak.');
    expect(session.text).toBe('Wiem, że tak.');
  });

  it('shortcut does nothing away from an issue', async () => {
    const { view } = await setup('Wiem że tak.');
    view.dispatch({ selection: { anchor: 10 } });
    key(view, { key: 'Enter', altKey: true });
    expect(view.state.doc.toString()).toBe('Wiem że tak.');
  });

  it('clicking a suggestion in the lint popup runs the registry command', async () => {
    const { view, registry } = await setup('Wiem że tak.');
    const execute = vi.spyOn(registry, 'execute');
    openLintPanel(view);
    const btn = [...document.querySelectorAll<HTMLButtonElement>('.cm-diagnosticAction')].find((b) => b.textContent === 'wstaw „,”');
    expect(btn).toBeDefined();
    btn!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    btn!.click();
    expect(execute).toHaveBeenCalledWith(APPLY_FIX, expect.objectContaining({ issueIndex: 0, fixIndex: 0 }));
    expect(view.state.doc.toString()).toBe('Wiem, że tak.');
  });

  it('drops popup diagnostics as soon as the text changes', async () => {
    const { view } = await setup('Wiem że tak.');
    let n = 0; forEachDiagnostic(view.state, () => n++); expect(n).toBe(1);
    view.dispatch({ changes: { from: 0, insert: 'A' } });
    n = 0; forEachDiagnostic(view.state, () => n++); expect(n).toBe(0);
  });
});

describe('popup suggestion cap', () => {
  it('shows at most 5 suggestions in engine order; applyFix by index uses the shown ones', async () => {
    const { session, registry, view } = await setup('Ala ma kotaa.');
    const reps = ['k1', 'k2', 'k3', 'k4', 'k5', 'k6', 'k7'];
    const issue = { ...session.state.issues[0], replacements: reps };
    const { issueDiagnostics, MAX_POPUP_SUGGESTIONS } = await import('./prose-editor');
    expect(MAX_POPUP_SUGGESTIONS).toBe(5);
    const [d] = issueDiagnostics([issue], session, registry);
    expect(d.actions!.map((a) => a.name)).toEqual(['k1', 'k2', 'k3', 'k4', 'k5']);
    const execute = vi.spyOn(registry, 'execute');
    d.actions![4].apply(view, d.from, d.to);
    expect(execute).toHaveBeenCalledWith(APPLY_FIX, expect.objectContaining({ issueIndex: 0, fixIndex: 4 }));
  });
});

describe('popup labels for hard-to-see fixes', () => {
  it('labels insertions and deletions in Polish, other fixes verbatim', async () => {
    const { suggestionLabel } = await import('./prose-editor');
    const t = 'Ala  ma, kota';
    expect(suggestionLabel(t, 3, 3, ' ')).toBe('wstaw spację');
    expect(suggestionLabel(t, 3, 3, ',')).toBe('wstaw „,”');
    expect(suggestionLabel(t, 3, 5, '')).toBe('usuń spację');
    expect(suggestionLabel(t, 7, 8, '')).toBe('usuń „,”');
    expect(suggestionLabel(t, 9, 13, 'kot')).toBe('kot');
  });

  it('renders a marker for a " " insertion and applies it through issue.applyFix', async () => {
    const text = 'w 2025r.';
    const engine: Engine = { check: async (r) => ({ protocol: 1, type: 'result', id: r.id, docVersion: r.docVersion,
      settingsVersion: r.settingsVersion, engineVersion: 'stub', issues: [{ start: 6, end: 6, ruleId: 'SPACE_BEFORE_R',
        category: 'punctuation', engineCategory: 'TYPOGRAPHY', issueType: 'whitespace', message: 'Brak spacji',
        replacements: [' '] }] }) as CheckResponse };
    const registry = new CommandRegistry<EditorCommandContext>();
    registerFixCommand(registry);
    const session = new CheckSession(engine, text);
    ed = createProseEditor({ parent: document.body, session, registry });
    await session.check();
    expect(document.querySelectorAll('.cm-insert-marker')).toHaveLength(1);
    const execute = vi.spyOn(registry, 'execute');
    openLintPanel(ed.view);
    const btn = [...document.querySelectorAll<HTMLButtonElement>('.cm-diagnosticAction')]
      .find((b) => b.textContent === 'wstaw spację');
    expect(btn).toBeDefined();
    btn!.click();
    expect(execute).toHaveBeenCalledWith(APPLY_FIX, expect.objectContaining({ issueIndex: 0, fixIndex: 0 }));
    expect(ed.view.state.doc.toString()).toBe('w 2025 r.');
  });
});
