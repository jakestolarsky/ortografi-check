import { describe, it, expect } from 'vitest';
import { PALETTES, TOKEN_NAMES, colors, contrast, cssVariables, resolveMode, themeStylesheet, type Mode } from './tokens';

const MODES: Mode[] = ['light', 'dark'];
const variants = PALETTES.flatMap((p) => MODES.map((m) => [p, m] as const));

describe('theme tokens', () => {
  it.each(variants)('%s/%s defines every semantic token', (p, m) => {
    expect(Object.keys(colors(p, m)).sort()).toEqual([...TOKEN_NAMES].sort());
  });
  it.each(variants)('%s/%s meets text 4.5:1 and control/focus/issue 3:1 contrast', (p, m) => {
    const c = colors(p, m);
    for (const bg of [c.bg, c.surface, c['surface-raised']]) {
      expect(contrast(c.text, bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(c['text-muted'], bg)).toBeGreaterThanOrEqual(4.5);
      for (const t of ['border', 'focus', 'accent', 'issue-spelling', 'issue-punctuation', 'issue-grammar', 'issue-style'] as const) {
        expect(contrast(c[t], bg), `${t} on ${bg}`).toBeGreaterThanOrEqual(3);
      }
    }
    expect(contrast(c['accent-text'], c.accent)).toBeGreaterThanOrEqual(4.5);
  });
  it('palette accent never changes issue-category colors', () => {
    for (const m of MODES) {
      const ref = colors('graphite', m);
      for (const p of PALETTES) {
        expect(colors(p, m)['issue-spelling']).toBe(ref['issue-spelling']);
        expect(colors(p, m)['issue-punctuation']).toBe(ref['issue-punctuation']);
      }
    }
  });
  it('follows the system appearance', () => {
    expect(resolveMode('system', true)).toBe('dark');
    expect(resolveMode('system', false)).toBe('light');
    expect(resolveMode('light', true)).toBe('light');
  });
  it('reduced motion removes spatial motion and smooth scrolling', () => {
    expect(cssVariables('sage', 'dark', true)['--motion-shift-distance']).toBe('0px');
    expect(cssVariables('sage', 'dark', true)['--scroll-behavior']).toBe('auto');
    expect(cssVariables('sage', 'dark')['--text-muted']).toBe(colors('sage', 'dark')['text-muted']);
  });
  it('stylesheet covers all six variants', () => {
    const css = themeStylesheet();
    expect(css.match(/data-mode=/g)).toHaveLength(6);
  });
});
