import type { EditorView } from '@codemirror/view';
import type { CheckSession } from '$lib/checking/session';
import type { CommandRegistry } from '$lib/commands/registry';
import { applySuggestion } from './prose-editor';

export const APPLY_FIX = 'issue.applyFix';

export interface EditorCommandContext {
  view: EditorView;
  session: CheckSession;
  /** Issue to fix; defaults to the issue at the cursor. */
  issueIndex?: number;
  /** Suggestion to apply; defaults to the top (0). */
  fixIndex?: number;
}

/** Index of the first current issue with a suggestion touching `pos` (inclusive ends). */
export function issueIndexAt(session: CheckSession, pos: number): number {
  const s = session.state;
  if (s.status !== 'complete' || s.resultVersion !== session.version) return -1;
  return s.issues.findIndex((i) => i.start <= pos && pos <= i.end && i.replacements.length > 0);
}

function target(ctx: EditorCommandContext): number {
  return ctx.issueIndex ?? issueIndexAt(ctx.session, ctx.view.state.selection.main.head);
}

/** The single "apply fix" command: keyboard, popup clicks, menus and palette all run it. */
export function registerFixCommand(registry: CommandRegistry<EditorCommandContext>): void {
  registry.register({
    id: APPLY_FIX,
    label: 'Zastosuj poprawkę',
    scope: 'editor',
    defaultShortcut: 'Alt+Enter',
    isAvailable: (ctx) => {
      const i = target(ctx);
      return i >= 0 && ctx.session.state.issues[i]?.replacements[ctx.fixIndex ?? 0] !== undefined;
    },
    run: (ctx) => { applySuggestion(ctx.view, ctx.session, target(ctx), ctx.fixIndex ?? 0); },
  });
}
