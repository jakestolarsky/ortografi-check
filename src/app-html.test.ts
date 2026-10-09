import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('./app.html', import.meta.url), 'utf8');

describe('app.html', () => {
  it('declares light and dark color schemes before first paint (no white flash)', () => {
    expect(html).toMatch(/<meta name="color-scheme" content="light dark"\s*\/?>/);
    expect(html).toMatch(/:root\s*\{\s*color-scheme:\s*light dark/);
  });
});
