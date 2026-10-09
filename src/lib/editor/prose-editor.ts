import { Annotation, EditorState, RangeSetBuilder, StateEffect, StateField } from '@codemirror/state';
import { Decoration, EditorView, WidgetType, keymap, type DecorationSet } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import type { Issue } from '$lib/checking/contract';
import type { CheckSession } from '$lib/checking/session';

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
    else b.add(i.start, i.end, Decoration.mark({ class: `cm-issue cm-issue-${i.category}` }));
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
  '.cm-insert-marker': { display: 'inline-block', width: '0', height: '1em', verticalAlign: 'text-bottom',
    borderLeft: '2px solid var(--issue-punctuation)', margin: '0 -1px' },
});

export interface ProseEditor {
  view: EditorView;
  session: CheckSession;
  destroy(): void;
}

export function createProseEditor(opts: { parent: Element; session: CheckSession; label?: string }): ProseEditor {
  const { session } = opts;
  const view = new EditorView({
    parent: opts.parent,
    state: EditorState.create({
      doc: session.text,
      extensions: [
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        EditorView.lineWrapping,
        EditorView.contentAttributes.of({ lang: 'pl', spellcheck: 'false',
          'aria-label': opts.label ?? 'Tekst do sprawdzenia', 'aria-multiline': 'true' }),
        issueField,
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
      view.dispatch({ effects: setIssues.of(s.issues) });
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
