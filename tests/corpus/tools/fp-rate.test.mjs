import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fpReport } from './fp-rate.mjs';
import { reformFlags, reformMatchForAlert } from './reform-2026.mjs';
import { rejectReason, splitSentences, checkWritten, wlLicense, WL_BOOKS, MIN_WRITTEN } from './build-clean-prose.mjs';
import { parseJsonl } from './corpus-lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const sentences = join(here, 'fixtures', 'clean-prose-sentences.jsonl');
const results = join(here, 'fixtures', 'clean-prose-results.jsonl');
const run = (...a) => spawnSync('node', [join(here, 'fp-rate.mjs'), ...a], { encoding: 'utf8' });

test('fp-rate.mjs on the fixture: totals, per-1000, rules, categories, reform split', () => {
  const p = run('--results', results, '--sentences', sentences, '--json');
  assert.equal(p.status, 0, p.stderr);
  const r = JSON.parse(p.stdout);
  assert.equal(r.sentences, 5);
  assert.equal(r.scored, 4);
  assert.deepEqual(r.incomplete, ['cp-test-00005']); // v1 error with an id
  assert.equal(r.alerts, 5);
  assert.equal(r.reform_alerts, 2); // warszawianina (R1) and "nie palący" (R4)
  assert.equal(r.false_alarms, 3);
  assert.equal(r.alerts_per_1000, 1250);
  assert.equal(r.false_alarms_per_1000, 750);
  assert.equal(r.sentences_with_false_alarm, 2);
  assert.deepEqual(r.by_rule, { MORFOLOGIK_RULE_PL_PL: 1, PL_X: 1, STYLE_X: 1 });
  assert.deepEqual(r.by_category, { grammar: 1, spelling: 1, style: 1 });
  assert.deepEqual(r.reform_by_pattern, { R1_inhabitant_lowercase: 1, R4_nie_participle_apart: 1 });
  assert.equal(r.top[0].id, 'cp-test-00003'); // most alerts first
  assert.equal(r.top[0].alerts[0].span, 'leżał'); // UTF-16 offsets after an emoji
});

test('text report and default sentence set (the committed clean-prose files) load', () => {
  const p = run('--results', results, '--sentences', sentences, '--top', '1');
  assert.equal(p.status, 0, p.stderr);
  assert.match(p.stdout, /false alarms: 3 \(750 per 1000\)/);
  assert.match(p.stdout, /pre-2026-reform spelling \(approximate, not false alarms\): 2/);
  assert.match(p.stdout, /top firing sentences \(1\)/);
  const d = JSON.parse(run('--results', results, '--json').stdout);
  assert.ok(d.sentences >= 3000 && d.sentences <= 5000, `clean-prose size ${d.sentences}`);
  assert.equal(d.scored, 0);
});

test('invalid result lines are rejected', () => {
  const p = run('--results', join(here, 'fixtures', 'v1-results.jsonl'), '--sentences', sentences);
  assert.equal(p.status, 0, p.stderr); // corpus ids are ignored, not errors
});

test('fpReport counts missing sentences', () => {
  const r = fpReport([{ id: 'a', text: 'Ala ma kota i psa.' }], new Map());
  assert.deepEqual(r.missing, ['a']);
  assert.equal(r.alerts_per_1000, null);
});

test('reform patterns: approximate detector', () => {
  assert.deepEqual(reformFlags('Mówił pół żartem, pół serio.'), ['R6_pol_apart']);
  assert.deepEqual(reformFlags('Zastanawiam się, czyby nie pojechać.'), ['R3_by_joined']);
  assert.deepEqual(reformFlags('Szliśmy przez plac Zbawiciela.'), ['R8_generic_lowercase']);
  assert.deepEqual(reformFlags('To nie najlepszy pomysł.'), ['R11_nie_comparative_apart']);
  assert.deepEqual(reformFlags('Ma niby-uśmiech.'), ['R10_prefix_hyphen']);
  for (const ok of ['Nie zawsze tak było.', 'Cena nie zmniejszy się.', 'Tego nie pamięta.', 'Kot nie lubi mleka.', 'Choćby jutro.', 'Rozwój poznania naukowego.']) assert.deepEqual(reformFlags(ok), [], ok);
  assert.equal(reformMatchForAlert('Szliśmy przez plac Zbawiciela.', { start: 0, end: 7 }), null);
});

test('builder filters: dialogue, archaic, short, verse-like, foreign; splitting keeps abbreviations', () => {
  assert.equal(rejectReason('— Gdzie idziesz, panie Ignacy?'), 'dialogue');
  assert.equal(rejectReason('Był to człowiek bardzo idjalny w obejściu.'), 'archaic');
  assert.equal(rejectReason('Marja wyszła z domu wcześnie rano.'), 'archaic');
  assert.equal(rejectReason('Ala ma kota.'), 'short');
  assert.equal(rejectReason('Wiatr wieje, liście lecą,'), 'end');
  assert.equal(rejectReason('Mein Herr, das ist nicht gut heute.'), 'foreign');
  assert.equal(rejectReason('Zdjął kapelusz i usiadł przy stole.'), null);
  assert.deepEqual(splitSentences('Urodził się w 1810 r. w Żelazowej Woli. Zmarł w Paryżu.'), ['Urodził się w 1810 r. w Żelazowej Woli.', 'Zmarł w Paryżu.']);
});

test('committed clean-prose files: NFC, unique, attributed, flags current, kept out of the scored corpus', () => {
  const root = join(here, '..', 'clean-prose');
  const seen = new Set();
  for (const [dir, lic] of [['wikipedia', /^CC BY-SA 4\.0$/], ['wolnelektury', /^(CC BY-SA 3\.0 PL|CC BY-SA 4\.0|Free Art License 1\.3) \(Wolne Lektury\)$/]]) {
    const rows = parseJsonl(readFileSync(join(root, dir, 'sentences.jsonl'), 'utf8')).map((e) => e.value);
    assert.ok(readFileSync(join(root, dir, 'LICENSE'), 'utf8').length > 100);
    for (const r of rows) {
      assert.equal(r.text, r.text.normalize('NFC'), r.id);
      assert.ok(!seen.has(r.text), `duplicate ${r.id}`); seen.add(r.text);
      assert.match(r.license, lic, r.id);
      assert.ok(r.url && r.source_title && r.author, r.id);
      if (dir === 'wikipedia') assert.ok(Number.isInteger(r.revision) && r.permalink.endsWith(`oldid=${r.revision}`), r.id);
      else {
        const slug = r.url.split('/').at(-2);
        assert.equal(r.written, checkWritten(slug).written, r.id);
        assert.ok(r.written >= 1950, r.id);
      }
      assert.equal(rejectReason(r.text, { literary: dir === 'wolnelektury' }), null, r.id);
      assert.deepEqual(r.reform_2026, reformFlags(r.text), r.id);
    }
  }
  assert.ok(seen.size >= 3000 && seen.size <= 5000);
});

test('builder refuses Wolne Lektury books written before 1950 or with unknown writing year', () => {
  assert.equal(MIN_WRITTEN, 1950);
  for (const [slug, m] of Object.entries(WL_BOOKS)) assert.ok(m.written >= 1950 && m.note, slug);
  // the 1879-1924 books of the first build had 1975-76 editions; edition year alone must not pass
  assert.throws(() => checkWritten('przedwiosnie'), /not in WL_BOOKS/);
  assert.throws(() => checkWritten('lalka-tom-pierwszy'), /not in WL_BOOKS/);
  assert.equal(checkWritten('orlinski-ulica-conrada').written, 2023);
});

test('wlLicense accepts only CC BY-SA and Free Art License footers', () => {
  assert.equal(wlLicense('Ten utwór jest udostępniony na licencji Licencja Wolnej Sztuki 1.3: http://artlibre.org/'), 'Free Art License 1.3 (Wolne Lektury)');
  assert.equal(wlLicense('Ten utwór jest udostępniony na licencji Creative Commons Uznanie Autorstwa - Na Tych Samych Warunkach 3.0. PL'), 'CC BY-SA 3.0 PL (Wolne Lektury)');
  assert.equal(wlLicense('Ten utwór jest w domenie publicznej.'), null);
  assert.equal(wlLicense('Wszelkie prawa zastrzeżone.'), null);
});
