// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { applyTheme, installTheme, THEME_STYLE_ID } from './apply';
import { colors } from './tokens';

beforeEach(() => { document.head.innerHTML = ''; document.documentElement.removeAttribute('data-mode'); });
const v = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

describe('applyTheme', () => {
  it('writes --issue-* variables to the document root (light)', () => {
    applyTheme(document, { palette: 'graphite', appearance: 'light' }, false);
    expect(document.documentElement.dataset.mode).toBe('light');
    expect(v('--issue-punctuation')).toBe(colors('graphite', 'light')['issue-punctuation']);
    expect(v('--bg')).toBe(colors('graphite', 'light').bg);
  });
  it('follows the system for appearance=system and switches to dark values', () => {
    applyTheme(document, { palette: 'sage', appearance: 'system' }, true);
    expect(document.documentElement.dataset.mode).toBe('dark');
    expect(v('--issue-spelling')).toBe(colors('sage', 'dark')['issue-spelling']);
  });
  it('injects the stylesheet only once', () => {
    applyTheme(document, { palette: 'plum', appearance: 'light' }, false);
    applyTheme(document, { palette: 'plum', appearance: 'dark' }, false);
    expect(document.querySelectorAll(`#${THEME_STYLE_ID}`)).toHaveLength(1);
    expect(document.documentElement.dataset.mode).toBe('dark');
  });
  it('installTheme reacts to OS dark-mode changes', () => {
    let listener: (() => void) | undefined; let matches = false;
    const win = { document, matchMedia: (q: string) => ({ get matches() { return q.includes('dark') ? matches : false; },
      addEventListener: (_: string, f: () => void) => { if (q.includes('dark')) listener = f; }, removeEventListener() {} }) } as unknown as Window;
    installTheme(win, { palette: 'graphite', appearance: 'system' });
    expect(document.documentElement.dataset.mode).toBe('light');
    matches = true; listener!();
    expect(document.documentElement.dataset.mode).toBe('dark');
  });
});
