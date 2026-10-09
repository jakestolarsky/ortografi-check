import { Annotation, EditorState, RangeSetBuilder, StateEffect, StateField } from '@codemirror/state';
import { Decoration, EditorView, WidgetType, keymap, type DecorationSet } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import type { Issue } from '$lib/protocol';
import type { CheckSession } from '$lib/checking/session';
import { setDiagnostics, lintKeymap, type Diagnostic } from '@codemirror/lint';
import { chordFromEvent, type CommandRegistry, type Platform } from '$lib/commands/registry';
import type { EditorCommandContext } from './fix-command';

/** Marks transactions whose text the session already knows (applied through CheckSession). */
const fromSession = Annotation.define<boolean>();
const setIssues = StateEffect.define<readonly Issue[]>();

class InsertMarker extends WidgetType {
  constructor(readonly issue: Issue) { super(); }
  eq(other: InsertMarker) { return other.issue === this.issue; }
  toDOM() {
    const el = document.createElement('span');
    el.className = `cm-insert-marker cm-issue-${this.issue.category}`;
    el.setAttribute('role', 'img');
    el.setAttribute('aria-label', this.issue.message);
    return el;
  }
  ignoreEvent() { return false; }
}

function buildDecorations(issues: readonly Issue[], docLength: number): DecorationSet {
  const b = new RangeSetBuilder<Decoration>();
  const sorted = [...issues].filter((i) => i.start >= 0 && i.end <= docLength && i.start <= i.end)
    .sort((a, b2) => a.start - b2.start || a.end - b2.end);
  for (const i of sorted) {
    if (i.start === i.end) b.add(i.start, i.start, Decoration.widget({ widget: new InsertMarker(i), side: 1 }));
    else if (i.replacements.length > 0 && i.replacements.every((r) => r === '')) {
      // Pure deletion (e.g. unnecessary comma, contracts README): struck through, labelled.
      b.add(i.start, i.end, Decoration.mark({ class: `cm-delete cm-issue-${i.category}`,
        attributes: { 'aria-label': `Do usunięcia: ${i.message}` } }));
    } else b.add(i.start, i.end, Decoration.mark({ class: `cm-issue cm-issue-${i.category}` }));
  }
  return b.finish();
}

const issueField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    for (const e of tr.effects) if (e.is(setIssues)) return buildDecorations(e.value, tr.state.doc.length);
    // Never shift stale underlines onto edited text (PLAN s.4): drop them until rechecked.
    return tr.docChanged ? Decoration.none : deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

const proseTheme = EditorView.theme({
  '&': { color: 'var(--text)', backgroundColor: 'var(--surface)' },
  '.cm-content': { fontFamily: 'var(--font-family)', fontSize: 'var(--font-size-doc)',
    lineHeight: 'var(--font-line-doc)', fontVariantLigatures: 'none', maxWidth: '72ch' },
  '.cm-issue': { textDecoration: 'underline wavy', textDecorationThickness: '1px', textUnderlineOffset: '3px' },
  '.cm-issue-spelling': { textDecorationColor: 'var(--issue-spelling)' },
  '.cm-issue-punctuation': { textDecorationColor: 'var(--issue-punctuation)' },
  '.cm-issue-grammar': { textDecorationColor: 'var(--issue-grammar)' },
  '.cm-issue-style, .cm-issue-other': { textDecorationColor: 'var(--issue-style)' },
  '.cm-delete': { textDecoration: 'line-through', textDecorationThickness: '2px',
    borderRadius: 'var(--radius-sm)', outline: '1px dashed currentColor', outlineOffset: '1px' },
  '.cm-delete.cm-issue-punctuation': { textDecorationColor: 'var(--issue-punctuation)', outlineColor: 'var(--issue-punctuation)' },
  '.cm-delete.cm-issue-spelling': { textDecorationColor: 'var(--issue-spelling)', outlineColor: 'var(--issue-spelling)' },
  '.cm-delete.cm-issue-grammar': { textDecorationColor: 'var(--issue-grammar)', outlineColor: 'var(--issue-grammar)' },
  // Zero-length insertion point (e.g. missing comma): a caret bar with a wedge on top, so it is
  // visible without shifting text. Colour comes from the issue-category token.
  '.cm-insert-marker': { display: 'inline-block', position: 'relative', width: '2px', height: '1.1em',
    verticalAlign: 'text-bottom', margin: '0 -1px', backgroundColor: 'var(--issue-punctuation)',
    borderRadius: '1px' },
  '.cm-insert-marker::before': { content: '""', position: 'absolute', top: '-3px', left: '-3px',
    borderLeft: '4px solid transparent', borderRight: '4px solid transparent',
    borderTop: '4px solid var(--issue-punctuation)' },
  '.cm-insert-marker.cm-issue-spelling': { backgroundColor: 'var(--issue-spelling)' },
  '.cm-insert-marker.cm-issue-grammar': { backgroundColor: 'var(--issue-grammar)' },
  '.cm-insert-marker.cm-issue-style, .cm-insert-marker.cm-issue-other': { backgroundColor: 'var(--issue-style)' },
  // Our own decorations draw the issue; the lint layer only supplies popups with fix buttons.
  '.cm-lintRange, .cm-lintPoint': { backgroundImage: 'none' },
  '.cm-lintPoint:after': { display: 'none' },
  '.cm-tooltip-lint, .cm-panel.cm-panel-lint': { backgroundColor: 'var(--surface-raised)', color: 'var(--text)' },
  '.cm-diagnosticAction': { backgroundColor: 'var(--accent)', color: 'var(--accent-text)' },
});

export interface ProseEditor {
  view: EditorView;
  session: CheckSession;
  destroy(): void;
}

const severity = (c: Issue['category']): Diagnostic['severity'] => (c === 'style' ? 'info' : c === 'grammar' ? 'warning' : 'error');

/** Button label that makes invisible fixes (spaces, insertions, deletions) readable. */
export function suggestionLabel(text: string, from: number, to: number, insert: string): string {
  if (from === to) return insert === ' ' ? 'wstaw spację' : `wstaw „${insert}”`;
  if (insert === '') {
    const removed = text.slice(from, to);
    return /^\s+$/.test(removed) ? 'usuń spację' : `usuń „${removed}”`;
  }
  return insert;
}

/** Popup shows at most this many suggestions, in engine order (PLAN s.4). */
export const MAX_POPUP_SUGGESTIONS = 5;

/** Lint diagnostics whose suggestion buttons run the registry's apply-fix command. */
export function issueDiagnostics(issues: readonly Issue[], session: CheckSession,
  registry: CommandRegistry<EditorCommandContext> | undefined): Diagnostic[] {
  return issues.map((i, issueIndex) => ({
    from: i.start, to: i.end, severity: severity(i.category), message: i.message,
    actions: registry ? i.replacements.slice(0, MAX_POPUP_SUGGESTIONS).map((r, fixIndex) => ({
      name: suggestionLabel(session.text, i.start, i.end, r),
      apply: (view: EditorView) => { registry.execute('issue.applyFix', { view, session, issueIndex, fixIndex }); },
    })) : [],
  }));
}

const platform = (): Platform => (typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform) ? 'mac' : 'other');

export function createProseEditor(opts: { parent: Element; session: CheckSession; label?: string;
  registry?: CommandRegistry<EditorCommandContext> }): ProseEditor {
  const { session, registry } = opts;
  const view = new EditorView({
    parent: opts.parent,
    state: EditorState.create({
      doc: session.text,
      extensions: [
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap, ...lintKeymap]),
        EditorView.domEventHandlers({
          keydown: (e, view) => {
            if (!registry) return false;
            const chord = chordFromEvent(e, platform());
            if (!chord || !registry.dispatch(chord, ['editor'], { view, session })) return false;
            e.preventDefault();
            return true;
          },
        }),
        EditorView.lineWrapping,
        EditorView.contentAttributes.of({ lang: 'pl', spellcheck: 'false',
          'aria-label': opts.label ?? 'Tekst do sprawdzenia', 'aria-multiline': 'true' }),
        issueField,
        // Like the underlines, popups never survive an edit: cleared until the next check.
        EditorState.transactionExtender.of((tr) => (tr.docChanged
          ? { effects: setDiagnostics(tr.startState, []).effects ?? [] } : null)),
        proseTheme,
        EditorView.updateListener.of((u) => {
          if (u.docChanged && !u.transactions.some((t) => t.annotation(fromSession))) {
            session.setText(u.state.doc.toString()); // text and version change together
          }
        }),
      ],
    }),
  });
  const unsubscribe = session.subscribe((s) => {
    if (s.status === 'complete' && s.resultVersion === session.version
      && view.state.doc.toString() === session.text) {
      const tr = setDiagnostics(view.state, issueDiagnostics(s.issues, session, registry));
      view.dispatch({ effects: ([setIssues.of(s.issues)] as StateEffect<unknown>[]).concat(tr.effects ?? []) });
    }
  });
  return { view, session, destroy() { unsubscribe(); view.destroy(); } };
}

/** The one path for applying a fix (mouse and keyboard): one transaction, one undo step. */
export function applySuggestion(view: EditorView, session: CheckSession, issueIndex: number, suggestionIndex: number): boolean {
  if (view.state.doc.toString() !== session.text) return false;
  const out = session.applyFix(issueIndex, suggestionIndex);
  if (!out.ok) return false;
  view.dispatch({
    changes: { from: out.from, to: out.to, insert: out.insert },
    selection: { anchor: out.from + out.insert.length },
    annotations: fromSession.of(true),
    userEvent: 'input.fix',
    scrollIntoView: true,
  });
  return true;
}
