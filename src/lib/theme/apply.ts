import { themeStylesheet, resolveMode, type Appearance, type Palette } from './tokens';

export const THEME_STYLE_ID = 'ortografi-theme';

export interface ThemePrefs { palette: Palette; appearance: Appearance; reduceMotion?: boolean }

/** Writes the token stylesheet once and selects the variant on <html> via data attributes. */
export function applyTheme(doc: Document, prefs: ThemePrefs, systemPrefersDark: boolean): void {
  if (!doc.getElementById(THEME_STYLE_ID)) {
    const style = doc.createElement('style');
    style.id = THEME_STYLE_ID;
    style.textContent = `${themeStylesheet()}\n${BASE_CSS}`;
    doc.head.appendChild(style);
  }
  const root = doc.documentElement;
  const mode = resolveMode(prefs.appearance, systemPrefersDark);
  root.dataset.palette = prefs.palette;
  root.dataset.mode = mode;
  root.style.colorScheme = mode;
  if (prefs.reduceMotion) root.dataset.reduceMotion = '';
  else delete root.dataset.reduceMotion;
}

/** Applies the theme and follows OS light/dark and reduced-motion changes. Returns a cleanup. */
export function installTheme(win: Window, prefs: ThemePrefs): () => void {
  const dark = win.matchMedia?.('(prefers-color-scheme: dark)');
  const motion = win.matchMedia?.('(prefers-reduced-motion: reduce)');
  const run = () => applyTheme(win.document,
    { ...prefs, reduceMotion: prefs.reduceMotion ?? !!motion?.matches }, !!dark?.matches);
  run();
  dark?.addEventListener?.('change', run);
  motion?.addEventListener?.('change', run);
  return () => { dark?.removeEventListener?.('change', run); motion?.removeEventListener?.('change', run); };
}

const BASE_CSS = `html,body{margin:0;background:var(--bg);color:var(--text);font-family:var(--font-family);font-size:var(--font-size-ui);scroll-behavior:var(--scroll-behavior)}
main{padding:var(--space-6)}
.editor{border:1px solid var(--border);border-radius:var(--radius-md);background:var(--surface)}
:focus-visible{outline:2px solid var(--focus);outline-offset:2px}
button{font:inherit;color:var(--accent-text);background:var(--accent);border:1px solid var(--border);border-radius:var(--radius-md);padding:var(--space-1) var(--space-3)}`;
