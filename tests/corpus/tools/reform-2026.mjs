// Approximate detector for spellings that changed in the Polish spelling reform in force
// from 2026-01-01 (Rada Języka Polskiego, komunikat 10 May 2024, załącznik nr 1:
// https://rjp.pan.pl/12365/). Texts written before 2026 may use the old spelling, so an
// engine following the new rules can legitimately flag them. fp-rate.mjs reports such
// alerts separately from real false alarms.
// APPROXIMATE: regex heuristics only, no morphology. Expect misses (e.g. rule 5 -owski
// adjectives, which cannot be told apart from surnames) and some over-matching.
const L = '\\p{L}';
const UP = '[A-ZĄĆĘŁŃÓŚŹŻ]';
export const REFORM_PATTERNS = [
  // 1. Inhabitants of towns, districts and villages: now capitalised (warszawianin -> Warszawianin).
  { id: 'R1_inhabitant_lowercase', re: new RegExp(`(?<!${L})(?:warszawian|warszawiak|krakowian|poznanian|poznaniak|gdańszczan|wrocławian|łodzian|lublinian|zgierzan|gdynian|szczecinian|torunian|bydgoszczan|katowiczan|rzeszowian|białostocczan|kielczan|opolan|mokotowian|nowohucian)${L}*`, 'gu') },
  // 3. -by/-bym... after conjunctions now written separately (czyby -> czy by).
  { id: 'R3_by_joined', re: new RegExp(`(?<!${L})(?:czy|jeśli|jeżeli|skoro|ponieważ|niż)(?:bym|byś|byśmy|byście|by)(?!${L})`, 'giu') },
  // 4. nie + inflected participle: now always together (nie palący -> niepalący).
  { id: 'R4_nie_participle_apart', re: new RegExp(`(?<!${L})nie (?!${L}*mięta(?!${L}))(?:${L}{2,}(?:ąc|an|on|ęt|it)(?:y|a|e|ego|ej|emu|ym|ymi|ych|ą|i))(?!${L})`, 'giu') },
  // 6. pół- written together in pairs like półżartem, półserio.
  { id: 'R6_pol_apart', re: new RegExp(`(?<!${L})pół (?:żartem|serio|nauka|zabawa|spał|czuwał|przytomn${L}*|świadom${L}*)(?!${L})`, 'giu') },
  // 8. Proper names: generic word now capitalised (morze Marmara, plac Zbawiciela, nagroda Nobla).
  { id: 'R8_generic_lowercase', re: new RegExp(`(?<!${L})(?:morze|pustynia|półwysep|wyspa|aleja|alei|aleją|brama|bulwar|plac|placu|park|parku|kopiec|kościół|kościoła|klasztor|pałac|pałacu|zamek|zamku|most|moście|pomnik|cmentarz|cmentarzu|nagroda|nagrodę|nagrody|nagrodą|kometa|komety) ${UP}${L}*`, 'gu') },
  // 9/10. Prefixes before lowercase words written together (niby-, quasi-, super-...).
  { id: 'R10_prefix_hyphen', re: new RegExp(`(?<!${L})(?:niby|quasi|super|ekstra|eko|mini|mega)-[a-ząćęłńóśźż]${L}*`, 'giu') },
  // 11. nie + comparative/superlative now together (nie lepszy -> nielepszy, nie najlepiej -> nienajlepiej).
  { id: 'R11_nie_comparative_apart', re: new RegExp(`(?<!${L})nie (?!(?:z|po|u|s|wy|prze)${L}*sz[yaeąi]|zawsze)(?:naj${L}+|lepiej|gorzej|prędzej|częściej|(?:lepsz|gorsz|większ|mniejsz|${L}{2,}(?:ejsz|iejsz))(?:y|a|e|ego|ej|ym|ych))(?!${L})`, 'giu') },
];

/** All reform matches in a text: [{ id, start, end, match }], UTF-16 offsets. */
export function reformMatches(text) {
  const out = [];
  for (const { id, re } of REFORM_PATTERNS) {
    for (const m of text.matchAll(re)) out.push({ id, start: m.index, end: m.index + m[0].length, match: m[0] });
  }
  return out.sort((a, b) => a.start - b.start);
}

/** Rule ids of the reform patterns that match a text (sorted, unique). */
export function reformFlags(text) {
  return [...new Set(reformMatches(text).map((m) => m.id))].sort();
}

/** The reform match an alert range touches, or null (zero-length alerts touch at edges). */
export function reformMatchForAlert(text, alert) {
  return reformMatches(text).find((m) => alert.start <= m.end && alert.end >= m.start) ?? null;
}
