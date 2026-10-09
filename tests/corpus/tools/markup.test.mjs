import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMarkup, exampleFromMarkup } from './markup.mjs';
import { validateExample } from './corpus-lib.mjs';

test('markup computes UTF-16 offsets for replacement, insertion, deletion, warning, optional', () => {
  const { text, issues } = parseMarkup('😀 Wiem{{=>,@punctuation.missing_comma}} że {{bląd=>błąd|błędy@spelling.diacritics}}{{,=>@punctuation.extra_comma}} i {{xx!@grammar.agreement}} {{?a=>b@spelling.typo}}');
  assert.equal(text, '😀 Wiem że bląd, i xx a');
  assert.deepEqual(issues.map((i) => [i.start, i.end, i.original, i.fixes, i.required]), [
    [7, 7, '', [','], true],
    [11, 15, 'bląd', ['błąd', 'błędy'], true],
    [15, 16, ',', [''], true],
    [19, 21, 'xx', [], true],
    [22, 23, 'a', ['b'], false],
  ]);
});

test('exampleFromMarkup produces a valid example', () => {
  const ex = exampleFromMarkup({ id: 'm-1', markup: 'Kupiłem chleb{{,=>@punctuation.extra_comma}} i mleko.', release_critical: true });
  assert.equal(ex.corrected_text, 'Kupiłem chleb i mleko.');
  assert.deepEqual(validateExample(ex), { errors: [], warnings: [] });
});

test('malformed markup throws', () => {
  assert.throws(() => parseMarkup('{{abc=>d}}'), /without @subcategory/);
  assert.throws(() => parseMarkup('{{abc@spelling.x}}'), /without => or !/);
});
