import type { CheckRequest, CheckResponse, Engine, ErrorCode, Issue } from './contract';

/**
 * Controlled fake engine for tests and `vite dev` only (PLAN s.10: fakes control timing and
 * errors, never language quality). Production builds must not import it.
 */
const MISSPELLINGS: Record<string, string> = { kotaa: 'kota', mlekoo: 'mleko', gdańks: 'Gdańsk' };
const WORD = /\p{L}[\p{L}\p{M}]*/gu;
// „że” in NFC or NFD (z + U+0307), preceded by a word and a space but no comma.
const MISSING_COMMA_ZE = /(?<=[\p{L}\p{M}])(?= (?:że|z\u0307e)(?![\p{L}\p{M}]))/gu;

export class FakeEngine implements Engine {
  nextError: ErrorCode | null = null;

  async check(req: CheckRequest): Promise<CheckResponse> {
    const { id, docVersion, settingsVersion, text } = req;
    if (this.nextError) {
      const code = this.nextError;
      this.nextError = null;
      return { protocol: 1, type: 'error', id, docVersion, settingsVersion, code, detail: 'fake' };
    }
    const issues: Issue[] = [];
    for (const m of text.matchAll(WORD)) {
      const fix = MISSPELLINGS[m[0].normalize('NFC').toLowerCase()];
      if (fix) issues.push({ start: m.index!, end: m.index! + m[0].length, ruleId: 'FAKE_SPELLING',
        category: 'spelling', engineCategory: 'TYPOS', issueType: 'misspelling',
        message: 'Prawdopodobny błąd pisowni', replacements: [fix] });
    }
    for (const m of text.matchAll(MISSING_COMMA_ZE)) {
      issues.push({ start: m.index!, end: m.index!, ruleId: 'FAKE_BRAK_PRZECINKA_ZE',
        category: 'punctuation', engineCategory: 'PUNCTUATION', issueType: 'typographical',
        message: 'Brak przecinka', replacements: [','] });
    }
    issues.sort((a, b) => a.start - b.start);
    return { protocol: 1, type: 'result', id, docVersion, settingsVersion, engineVersion: 'fake',
      status: 'complete', issues };
  }
}
