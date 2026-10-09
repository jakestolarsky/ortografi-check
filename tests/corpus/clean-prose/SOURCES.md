# Clean-prose false-alarm set: sources and licenses

Correct, published Polish prose used to measure false alarms (`tools/fp-rate.mjs`).
It is **not** part of the scored corpus: `score.mjs` and `validate.mjs` never read it
(they only read `tests/corpus/data/`). Format and rules: `../FORMAT.md`, "Clean-prose
false-alarm set".

Total: **4254 sentences** (Wikipedia 2504, Wolne Lektury 1750). Built on 2026-10-10 with
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

## `wolnelektury/`: Wolne Lektury, CC BY-SA 3.0 PL / Free Art License 1.3 (works written 1950 or later)

* License: per sentence (`license` field), see `wolnelektury/LICENSE`. Both licences are
  share-alike and stay inside this folder. Source: Wolne Lektury, Fundacja Wolne Lektury,
  https://wolnelektury.pl/. Footnotes and motifs are not included.
* **Rule: the work must have been originally written or first published in 1950 or later.**
  The edition year is not enough: the first build of this set used seven 1879-1924 novels
  (Prus, Sienkiewicz, Żeromski) because it only checked their 1975-76 edition dates. The
  builder now keeps a list of allowed books with their original year (`WL_BOOKS` in
  `tools/build-clean-prose.mjs`), refuses any book not on it or written before 1950, records
  that year in each line's `written` field, and accepts only CC BY-SA or Free Art License
  footers. Dialogue, quotations, archaic spellings, foreign-language sentences and
  verse-like lines are dropped; at most 150 sentences per book.

| author | title | URL | written / first published | edition the text is based on | licence | sentences |
|---|---|---|---|---|---|---|
| Jerzy Andrzejewski | Ciemności kryją ziemię | https://wolnelektury.pl/katalog/lektura/andrzejewski-ciemnosci-kryja-ziemie/ | **1957** | Jerzy Andrzejewski, Ciemności kryją ziemię, Państwowy Instytut Wydawniczy, Warszawa 1957. | CC BY-SA 3.0 PL | 150 |
| Andrzej Kijowski | Dziecko przez ptaka przyniesione | https://wolnelektury.pl/katalog/lektura/kijowski-dziecko-przez-ptaka-przyniesione/ | **1968** | Andrzej Kijowski, Dziecko przez ptaka przyniesione, Państwowy Instytut Wydawniczy, Warszawa 1968. | CC BY-SA 3.0 PL | 150 |
| Bogdan Wojdowski | Chleb rzucony umarłym | https://wolnelektury.pl/katalog/lektura/wojdowski-chleb-rzucony-umarlym/ | **1971** | Bogdan Wojdowski, Chleb rzucony umarłym, Państwowy Instytut Wydawniczy, Warszawa 1971. | CC BY-SA 3.0 PL | 150 |
| Andrzej Kijowski | Listopadowy wieczór | https://wolnelektury.pl/katalog/lektura/kijowski-listopadowy-wieczor/ | **1972** | Andrzej Kijowski, Listopadowy wieczór, Państwowy Instytut Wydawniczy, Warszawa 1972. | CC BY-SA 3.0 PL | 150 |
| Jerzy Andrzejewski | Miazga | https://wolnelektury.pl/katalog/lektura/andrzejewski-miazga/ | **1979** | Jerzy Andrzejewski, Miazga, Niezależna Oficyna Wydawnicza, Warszawa 1979. | CC BY-SA 3.0 PL | 150 |
| Joanna Papuzińska | Wędrowcy | https://wolnelektury.pl/katalog/lektura/papuzinska-wedrowcy/ | **1988** | Joanna Papuzińska, Wędrowcy, Nasza Księgarnia, Warszawa 1988. | Free Art License 1.3 | 150 |
| Magdalena Tulli | Sny i kamienie | https://wolnelektury.pl/katalog/lektura/tulli-sny-i-kamienie/ | **1995** | Magdalena Tulli, Sny i kamienie, 2019, wyd. II. | Free Art License 1.3 | 150 |
| Konrad Gliściński | Wszystkie prawa zastrzeżone | https://wolnelektury.pl/katalog/lektura/gliscinski-dyskursy-prawa-autorskiego/ | **2015** | (not stated; first e-book edition 2015) | CC BY-SA 3.0 PL | 150 |
| Julia Fiedorczuk | Każdy śnił swój sen | https://wolnelektury.pl/katalog/lektura/fiedorczuk-kazdy-snil-swoj-sen/ | **2019** | Julia Fiedorczuk, Każdy śnił swój sen, 2019, wyd. I. | Free Art License 1.3 | 150 |
| Radek Rak | Małe zwierzątka | https://wolnelektury.pl/katalog/lektura/rak-male-zwierzatka/ | **2020** | Radek Rak, Małe zwierzątka, Fundacja Nowoczesna Polska 2020. | Free Art License 1.3 | 150 |
| Wit Szostak | Posłowie | https://wolnelektury.pl/katalog/lektura/szostak-poslowie/ | **2021** | Wit Szostak, Posłowie, wyd. I, Fundacja Nowoczesna Polska 2021. | Free Art License 1.3 | 100 |
| Wojciech Orliński | Ulica Conrada | https://wolnelektury.pl/katalog/lektura/orlinski-ulica-conrada/ | **2023** | Wojciech Orliński, Ulica Conrada, Fundacja Wolne Lektury, Warszawa 2023. | Free Art License 1.3 | 150 |

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
`https://wolnelektury.pl/media/book/txt/<slug>.txt` for each slug in `WL_BOOKS`.
Without `<raw-dir>/wiki` the committed Wikipedia file is kept unchanged. Newer Wikipedia revisions give a different set; the committed files are the
reference.
