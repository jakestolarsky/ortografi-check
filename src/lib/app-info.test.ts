import { describe, expect, it } from 'vitest';
import { appLanguage, appTitle } from './app-info';

describe('app-info', () => {
  it('targets Polish', () => {
    expect(appLanguage).toBe('pl-PL');
    expect(appTitle).toBe('Ortografi');
  });
});
