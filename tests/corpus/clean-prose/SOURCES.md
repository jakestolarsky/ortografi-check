# Clean-prose false-alarm set: sources and licenses

Correct, published Polish prose used to measure false alarms (`tools/fp-rate.mjs`).
It is **not** part of the scored corpus: `score.mjs` and `validate.mjs` never read it
(they only read `tests/corpus/data/`). Format and rules: `../FORMAT.md`, "Clean-prose
false-alarm set".

Total: **4237 sentences** (Wikipedia 2504, Wolne Lektury 1733). Built on 2026-10-10 with
`tools/build-clean-prose.mjs`.

Each source keeps **its own folder and its own LICENSE**, so the share-alike terms of the
Wikipedia text stay isolated from everything else.

## `wikipedia/`: Polish Wikipedia, CC BY-SA 4.0 (main, modern source)

* License: [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), see
  `wikipedia/LICENSE`. Attribution: "Wikipedia contributors". Each sentence records
  `source_title`, `url`, `revision` and `permalink` (`?oldid=<revision>`); the authors
  are listed in that revision's page history.
* Articles (80, at most 35 sentences each): Polska, Warszawa, Kraków, Wisła, Tatry, Morze Bałtyckie, Mikołaj Kopernik, Maria Skłodowska-Curie, Fryderyk Chopin, Adam Mickiewicz, Wisława Szymborska, Czesław Miłosz, Stanisław Lem, Język polski, Chleb, Pierogi, Kawa, Herbata, Ziemniak, Pszczoła miodna, Wilk szary, Żubr, Bocian biały, Dąb szypułkowy, Sosna zwyczajna, Fotosynteza, Układ Słoneczny, Księżyc, Mars, Grawitacja, Elektryczność, Komputer, Internet, Telefon komórkowy, Rower, Kolej, Samochód, Piłka nożna, Szachy, Tenis, Olimpiada, Muzyka, Teatr, Film, Fotografia, Malarstwo, Architektura, Biblioteka, Szkoła, Uniwersytet Jagielloński, Medycyna, Szczepionka, Serce, Sen, Klimat, Deszcz, Las, Rzeka, Góry, Ocean Atlantycki, Ekonomia, Pieniądz, Demokracja, Unia Europejska, Historia Polski, Pierwsza wojna światowa, Starożytny Rzym, Egipt, Japonia, Matematyka, Fizyka, Chemia, Biologia, Psychologia, Filozofia, Gdańsk, Wrocław, Poznań, Łódź, Lublin.
* Fetched with the MediaWiki API (`action=query&prop=extracts|revisions|info&explaintext=1`,
  one article per request, revision id recorded).

## `wolnelektury/`: Wolne Lektury, public domain (modernised post-1950 editions only)

* License: the works are in the public domain; see `wolnelektury/LICENSE`. Wolne Lektury's
  footnotes and motifs (Free Art License 1.3) are **not** included. Source: Wolne Lektury,
  Fundacja Wolne Lektury, https://wolnelektury.pl/.
* Only books whose digital text is based on an edition from **1950 or later** (modern
  orthography) are used; the builder refuses older ones. Sentences with archaic spelling (for
  example `idjalny`, `Marja`, `é`, `ztąd`) are dropped, as are dialogue, quotations,
  foreign-language sentences and verse-like lines.

| author | title | URL | edition the text is based on | sentences |
|---|---|---|---|---|
| Bolesław Prus | Kamizelka | https://wolnelektury.pl/katalog/lektura/kamizelka/ | Bolesław Prus, Nowele wybrane, Państwowy Instytut Wydawniczy, Warszawa 1976 | 93 |
| Bolesław Prus | Katarynka | https://wolnelektury.pl/katalog/lektura/katarynka/ | Bolesław Prus, Katarynka, Państwowy Instytut Wydawniczy, wyd. 8, Warszawa 1975 | 162 |
| Bolesław Prus | Lalka, tom drugi | https://wolnelektury.pl/katalog/lektura/lalka-tom-drugi/ | Bolesław Prus, Lalka, przedm. Henryk Markiewicz, PIW, wyd. 31, Warszawa 1975 | 400 |
| Bolesław Prus | Lalka, tom pierwszy | https://wolnelektury.pl/katalog/lektura/lalka-tom-pierwszy/ | Bolesław Prus, Lalka, przedm. Henryk Markiewicz, PIW, wyd. 31, Warszawa 1975 | 400 |
| Henryk Sienkiewicz | Janko Muzykant | https://wolnelektury.pl/katalog/lektura/janko-muzykant/ | Henryk Sienkiewicz, Pisma wybrane. Nowele, tom 1, Państwowy Instytut Wydawniczy, Warszawa, 1976 | 71 |
| Henryk Sienkiewicz | Latarnik | https://wolnelektury.pl/katalog/lektura/latarnik/ | Henryk Sienkiewicz, Pisma wybrane. Nowele, tom 2, Państwowy Instytut Wydawniczy, Warszawa 1976 | 207 |
| Stefan Żeromski | Przedwiośnie | https://wolnelektury.pl/katalog/lektura/przedwiosnie/ | Stefan Żeromski, Przedwiośnie, wyd. Czytelnik, Warszawa 1976 | 400 |

## Filters (both sources)

Sentences of 4 to 40 words and at most 250 characters, starting with a capital letter and
ending with `.`, `!` or `?`; Latin script only (no IPA, Greek, Cyrillic); no
parentheses left empty by the plain-text export; deduplicated; normalised to NFC.

## 2026 spelling reform

The reform of 1 January 2026 (Rada Języka Polskiego, komunikat of 10 May 2024,
https://rjp.pan.pl/12365/) changed some spellings. These sources were written before it,
so they can contain old spellings (e.g. `pałacu Saskim`, `nie dający się`). Each sentence
has `reform_2026`: the ids of the reform patterns from `tools/reform-2026.mjs` it matches.
`fp-rate.mjs` reports alerts on those spans separately from real false alarms. The patterns
are **approximate** (regex heuristics, no morphology): they miss some cases, rule 5
(`-owski` adjectives) is not covered, and a few matches may be wrong.

## Rebuilding

```sh
# download raw sources into a scratch dir (not committed), then:
node tests/corpus/tools/build-clean-prose.mjs <raw-dir>
```
`<raw-dir>/wiki/a*.json`: MediaWiki API responses (as above); `<raw-dir>/<slug>.txt`:
`https://wolnelektury.pl/media/book/txt/<slug>.txt` for the slugs `janko-muzykant`,
`kamizelka`, `katarynka`, `lalka-tom-pierwszy`, `lalka-tom-drugi`, `latarnik`,
`przedwiosnie`. Newer Wikipedia revisions give a different set; the committed files are the
reference.
