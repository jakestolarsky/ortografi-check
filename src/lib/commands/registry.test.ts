import { describe, it, expect, vi } from 'vitest';
import { CommandRegistry, normalizeChord, isAltGrConflict, chordFromEvent } from './registry';

type Ctx = { hasIssues: boolean };
function make() {
  const r = new CommandRegistry<Ctx>();
  const runs: string[] = [];
  r.register({ id: 'check', label: 'Sprawdź', scope: 'global', defaultShortcut: 'mod+enter', run: () => runs.push('check') });
  r.register({ id: 'nextIssue', label: 'Następny błąd', scope: 'editor', defaultShortcut: 'F8',
    isAvailable: (c) => c.hasIssues, run: () => runs.push('next') });
  r.register({ id: 'palette', label: 'Paleta poleceń', scope: 'global', defaultShortcut: 'Mod+K', run: () => runs.push('palette') });
  r.register({ id: 'focusMode', label: 'Tryb skupienia', scope: 'global', run: () => runs.push('focus') });
  r.register({ id: 'applySuggestion', label: 'Zastosuj sugestię', scope: 'suggestions', defaultShortcut: 'Enter', run: () => runs.push('apply') });
  return { r, runs };
}

describe('chords', () => {
  it('normalizes modifier order and case', () => {
    expect(normalizeChord('shift+mod+k')).toBe('Mod+Shift+K');
    expect(normalizeChord('Shift+F8')).toBe('Shift+F8');
    expect(() => normalizeChord('Hyper+K')).toThrow();
  });
  it('flags Ctrl+Alt+letter as an AltGr conflict on Windows/Linux only', () => {
    expect(isAltGrConflict('Ctrl+Alt+A', 'other')).toBe(true);
    expect(isAltGrConflict('Mod+Alt+S', 'other')).toBe(true);
    expect(isAltGrConflict('Mod+Alt+S', 'mac')).toBe(false);
    expect(isAltGrConflict('Ctrl+Alt+F8', 'other')).toBe(false);
  });
  it('maps events to chords per platform and ignores IME composition', () => {
    const e = { key: 'k', ctrlKey: false, metaKey: true, altKey: false, shiftKey: false };
    expect(chordFromEvent(e, 'mac')).toBe('Mod+K');
    expect(chordFromEvent({ ...e, metaKey: false, ctrlKey: true }, 'other')).toBe('Mod+K');
    expect(chordFromEvent({ ...e, isComposing: true }, 'mac')).toBeNull();
    expect(chordFromEvent({ ...e, key: 'Shift' }, 'mac')).toBeNull();
  });
});

describe('CommandRegistry', () => {
  it('rejects duplicate ids', () => {
    const { r } = make();
    expect(() => r.register({ id: 'check', label: 'x', scope: 'global', run() {} })).toThrow();
  });
  it('dispatches by scope, most specific first, and only when available', () => {
    const { r, runs } = make();
    expect(r.dispatch('Mod+Enter', ['editor'], { hasIssues: false })).toBe('check');
    expect(r.dispatch('F8', ['editor'], { hasIssues: false })).toBeNull();
    expect(r.dispatch('F8', ['editor'], { hasIssues: true })).toBe('nextIssue');
    expect(r.dispatch('Enter', ['editor'], { hasIssues: true })).toBeNull(); // Enter in editor = newline
    expect(r.dispatch('Enter', ['suggestions'], { hasIssues: true })).toBe('applySuggestion');
    expect(runs).toEqual(['check', 'next', 'apply']);
  });
  it('remaps, reports conflicts without changing the binding, and resets defaults', () => {
    const { r } = make();
    expect(r.remap('focusMode', 'Mod+K')).toEqual({ ok: false, conflicts: ['palette'] });
    expect(r.shortcutFor('focusMode')).toBeUndefined();
    expect(r.remap('focusMode', 'Mod+Shift+F')).toEqual({ ok: true });
    expect(r.dispatch('mod+shift+f', [], { hasIssues: false })).toBe('focusMode');
    r.remap('check', null);
    expect(r.dispatch('Mod+Enter', [], { hasIssues: false })).toBeNull();
    r.resetShortcuts();
    expect(r.shortcutFor('check')).toBe('Mod+Enter');
    expect(r.shortcutFor('focusMode')).toBeUndefined();
  });
  it('commands in disjoint non-global scopes may share a chord', () => {
    const { r } = make();
    expect(r.conflicts('nextIssue', 'Enter')).toEqual([]);
  });
  it('palette search is diacritic-insensitive and filters unavailable commands', () => {
    const { r } = make();
    expect(r.search('sprawdz', { hasIssues: false }).map((d) => d.id)).toEqual(['check']);
    expect(r.search('nastepny', { hasIssues: false })).toEqual([]);
    expect(r.search('NASTĘPNY', { hasIssues: true }).map((d) => d.id)).toEqual(['nextIssue']);
    expect(r.search('skupienia', { hasIssues: false }).map((d) => d.id)).toEqual(['focusMode']);
  });
  it('execute runs once per call (menu and keyboard share one path)', () => {
    const { r } = make();
    const spy = vi.fn();
    r.register({ id: 'copy', label: 'Kopiuj', scope: 'global', run: spy });
    expect(r.execute('copy', { hasIssues: false })).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(r.execute('nope', { hasIssues: false })).toBe(false);
  });
});
