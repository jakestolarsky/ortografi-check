/**
 * Semantic theme tokens (PLAN.md s.7). Components use only these CSS variables.
 * Palettes: Graphite / Sage / Plum, each light + dark. Issue-category colors are shared across
 * palettes so the accent never changes the meaning of spelling/punctuation/grammar.
 */
export type Palette = 'graphite' | 'sage' | 'plum';
export type Mode = 'light' | 'dark';
export type Appearance = Mode | 'system';

export const TOKEN_NAMES = [
  'bg', 'surface', 'surface-raised', 'text', 'text-muted', 'border', 'accent', 'accent-text', 'focus',
  'issue-spelling', 'issue-punctuation', 'issue-grammar', 'issue-style',
] as const;
export type ColorToken = (typeof TOKEN_NAMES)[number];
export type ColorSet = Record<ColorToken, string>;

const ISSUE: Record<Mode, Pick<ColorSet, 'issue-spelling' | 'issue-punctuation' | 'issue-grammar' | 'issue-style'>> = {
  light: { 'issue-spelling': '#b42318', 'issue-punctuation': '#1d5fbf', 'issue-grammar': '#8a4b00', 'issue-style': '#5b5f66' },
  dark: { 'issue-spelling': '#ff8a80', 'issue-punctuation': '#82b4ff', 'issue-grammar': '#f0b45a', 'issue-style': '#a9adb4' },
};

type Base = Omit<ColorSet, keyof (typeof ISSUE)['light']>;
const BASE: Record<Palette, Record<Mode, Base>> = {
  graphite: {
    light: { bg: '#f7f7f6', surface: '#ffffff', 'surface-raised': '#ffffff', text: '#1c1d1f', 'text-muted': '#5d6066', border: '#85888e', accent: '#3b4250', 'accent-text': '#ffffff', focus: '#2f5fd0' },
    dark: { bg: '#161719', surface: '#1e1f22', 'surface-raised': '#26282c', text: '#e8e9eb', 'text-muted': '#a3a6ad', border: '#737782', accent: '#c9ced8', 'accent-text': '#161719', focus: '#8ab0ff' },
  },
  sage: {
    light: { bg: '#f5f7f4', surface: '#ffffff', 'surface-raised': '#ffffff', text: '#1b201c', 'text-muted': '#56605a', border: '#86908a', accent: '#3d6b4f', 'accent-text': '#ffffff', focus: '#2f5fd0' },
    dark: { bg: '#141814', surface: '#1b201c', 'surface-raised': '#232a24', text: '#e5ebe6', 'text-muted': '#a0aba3', border: '#68746b', accent: '#8fc4a2', 'accent-text': '#141814', focus: '#8ab0ff' },
  },
  plum: {
    light: { bg: '#f8f6f8', surface: '#ffffff', 'surface-raised': '#ffffff', text: '#201b21', 'text-muted': '#615763', border: '#928895', accent: '#6b3d6e', 'accent-text': '#ffffff', focus: '#2f5fd0' },
    dark: { bg: '#181419', surface: '#201b21', 'surface-raised': '#29222a', text: '#ece6ed', 'text-muted': '#ada3af', border: '#76697a', accent: '#d1a3d4', 'accent-text': '#181419', focus: '#8ab0ff' },
  },
};

export const PALETTES = Object.keys(BASE) as Palette[];

export function colors(palette: Palette, mode: Mode): ColorSet {
  return { ...BASE[palette][mode], ...ISSUE[mode] };
}

export const SPACE = { 1: '4px', 2: '8px', 3: '12px', 4: '16px', 6: '24px', 8: '32px' } as const;
export const RADIUS = { sm: '4px', md: '6px', lg: '10px' } as const;
export const FONT = {
  family: "'JetBrains Mono', ui-monospace, system-ui, sans-serif",
  'size-doc': '16px', 'line-doc': '1.65', 'size-ui': '13px', 'size-heading': '18px',
} as const;
/** Upper bounds from the PLAN s.7 motion table. Reduced motion zeroes spatial motion. */
export const MOTION = {
  press: '100ms', 'suggestion-open': '120ms', 'fix-highlight': '180ms', 'issue-select': '160ms',
  panel: '160ms', theme: '150ms', 'shift-distance': '4px',
} as const;

export function resolveMode(a: Appearance, systemPrefersDark: boolean): Mode {
  return a === 'system' ? (systemPrefersDark ? 'dark' : 'light') : a;
}

export function cssVariables(palette: Palette, mode: Mode, reduceMotion = false): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(colors(palette, mode))) out[`--${k}`] = v;
  for (const [k, v] of Object.entries(SPACE)) out[`--space-${k}`] = v;
  for (const [k, v] of Object.entries(RADIUS)) out[`--radius-${k}`] = v;
  for (const [k, v] of Object.entries(FONT)) out[`--font-${k}`] = v;
  for (const [k, v] of Object.entries(MOTION)) {
    out[`--motion-${k}`] = reduceMotion && k === 'shift-distance' ? '0px' : v;
  }
  out['--scroll-behavior'] = reduceMotion ? 'auto' : 'smooth';
  return out;
}

/** CSS for all six variants, to inline before first paint (no dark-mode flash). */
export function themeStylesheet(): string {
  const block = (p: Palette, m: Mode) =>
    `:root[data-palette="${p}"][data-mode="${m}"]{${Object.entries(cssVariables(p, m)).map(([k, v]) => `${k}:${v}`).join(';')}}`;
  const reduced = `:root[data-reduce-motion]{--motion-shift-distance:0px;--scroll-behavior:auto}`;
  return [...PALETTES.flatMap((p) => (['light', 'dark'] as Mode[]).map((m) => block(p, m))), reduced].join('\n');
}

// WCAG 2.x contrast
function lum(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}
export function contrast(a: string, b: string): number {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
