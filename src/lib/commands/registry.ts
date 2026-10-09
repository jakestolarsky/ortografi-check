/** Single command registry (PLAN.md s.8, s.9): menus, palette, buttons and hints read from here. */
export type Scope = 'global' | 'editor' | 'suggestions' | 'dialog';
export type Platform = 'mac' | 'other';

export interface CommandDef<C = unknown> {
  id: string;
  label: string; // Polish, user-facing
  scope: Scope;
  /** Normalized chord, e.g. "Mod+Enter", "Shift+F8". Undefined = unassigned. */
  defaultShortcut?: string;
  isAvailable?: (ctx: C) => boolean;
  run: (ctx: C) => void;
}

const MODS = ['Mod', 'Ctrl', 'Alt', 'Shift'] as const;

export function normalizeChord(chord: string): string {
  const parts = chord.split('+').map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) throw new Error('Empty shortcut');
  const key = parts.pop()!;
  const mods = new Set<string>();
  for (const p of parts) {
    const m = MODS.find((x) => x.toLowerCase() === p.toLowerCase());
    if (!m) throw new Error(`Unknown modifier: ${p}`);
    mods.add(m);
  }
  const k = key.length === 1 ? key.toUpperCase() : key[0].toUpperCase() + key.slice(1);
  return [...MODS.filter((m) => mods.has(m)), k].join('+');
}

/** Ctrl+Alt+letter collides with AltGr Polish characters (ą, ę, ś...). */
export function isAltGrConflict(chord: string, platform: Platform): boolean {
  const parts = normalizeChord(chord).split('+');
  const key = parts.at(-1)!;
  const ctrl = parts.includes('Ctrl') || (platform === 'other' && parts.includes('Mod'));
  return platform === 'other' && ctrl && parts.includes('Alt') && /^[A-Z]$/.test(key);
}

export interface KeyLike {
  key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean; isComposing?: boolean;
}

export function chordFromEvent(e: KeyLike, platform: Platform): string | null {
  if (e.isComposing || ['Control', 'Meta', 'Alt', 'Shift'].includes(e.key)) return null;
  const mod = platform === 'mac' ? e.metaKey : e.ctrlKey;
  const parts: string[] = [];
  if (mod) parts.push('Mod');
  if (platform === 'mac' && e.ctrlKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  parts.push(e.key);
  return normalizeChord(parts.join('+'));
}

export class CommandRegistry<C = unknown> {
  private commands = new Map<string, CommandDef<C>>();
  private overrides = new Map<string, string | null>();

  register(def: CommandDef<C>): void {
    if (this.commands.has(def.id)) throw new Error(`Duplicate command: ${def.id}`);
    this.commands.set(def.id, { ...def, defaultShortcut: def.defaultShortcut && normalizeChord(def.defaultShortcut) });
  }

  get(id: string) { return this.commands.get(id); }
  all() { return [...this.commands.values()]; }

  shortcutFor(id: string): string | undefined {
    if (this.overrides.has(id)) return this.overrides.get(id) ?? undefined;
    return this.commands.get(id)?.defaultShortcut;
  }

  /** Commands in the same or global scope that would share this chord. */
  conflicts(id: string, chord: string): string[] {
    const c = normalizeChord(chord);
    const scope = this.commands.get(id)?.scope;
    return this.all()
      .filter((d) => d.id !== id && this.shortcutFor(d.id) === c
        && (d.scope === scope || d.scope === 'global' || scope === 'global'))
      .map((d) => d.id);
  }

  remap(id: string, chord: string | null): { ok: true } | { ok: false; conflicts: string[] } {
    if (!this.commands.has(id)) throw new Error(`Unknown command: ${id}`);
    if (chord === null) { this.overrides.set(id, null); return { ok: true }; }
    const conflicts = this.conflicts(id, chord);
    if (conflicts.length) return { ok: false, conflicts };
    this.overrides.set(id, normalizeChord(chord));
    return { ok: true };
  }

  resetShortcuts(): void { this.overrides.clear(); }

  available(ctx: C): CommandDef<C>[] {
    return this.all().filter((d) => d.isAvailable?.(ctx) ?? true);
  }

  /** Palette search: case- and diacritic-insensitive substring over label and id. */
  search(query: string, ctx: C): CommandDef<C>[] {
    const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').replace(/ł/g, 'l').replace(/Ł/g, 'L').toLowerCase();
    const q = fold(query.trim());
    return this.available(ctx).filter((d) => fold(d.label).includes(q) || d.id.includes(q));
  }

  /** Resolve a chord in the active scopes (most specific first). Returns the command id run, if any. */
  dispatch(chord: string, activeScopes: Scope[], ctx: C): string | null {
    const c = normalizeChord(chord);
    for (const scope of [...activeScopes, 'global' as Scope]) {
      const d = this.all().find((x) => x.scope === scope && this.shortcutFor(x.id) === c);
      if (d) {
        if (!(d.isAvailable?.(ctx) ?? true)) return null;
        d.run(ctx);
        return d.id;
      }
    }
    return null;
  }

  execute(id: string, ctx: C): boolean {
    const d = this.commands.get(id);
    if (!d || !(d.isAvailable?.(ctx) ?? true)) return false;
    d.run(ctx);
    return true;
  }
}
