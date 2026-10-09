package pl.ortografi.engine;

import java.util.List;
import java.util.regex.Pattern;

/**
 * Spelling matches (MORFOLOGIK_RULE_PL_PL) that are names or foreign text, not typos. Each
 * class is decided from the word's shape and its context, never from a word list (decision doc
 * 0001, "Spelling false alarms on clean prose"). A word is kept whenever the speller offers a
 * close suggestion of the same shape, so typos in known names ("Lodzi" → "Łodzi") still show.
 */
final class SpellingNoiseFilter {

  static final String RULE = "MORFOLOGIK_RULE_PL_PL";

  private static final Pattern DIGIT = Pattern.compile("[\\d°]");
  private static final Pattern LATIN = Pattern.compile("[A-Za-z]");
  private static final Pattern NON_LATIN_LETTER = Pattern.compile("[\\p{IsCyrillic}\\p{IsGreek}]");
  private static final Pattern ROMAN_PREFIX = Pattern.compile("^[IVXLCDM]+-\\p{L}+");
  private static final Pattern COMBINING = Pattern.compile("\\p{M}");
  private static final String POLISH_LETTERS = "aąbcćdeęfghijklłmnńoóprsśtuwyzźżqvx";

  private SpellingNoiseFilter() {}

  /** The speller's view of a word, used to tell typos of known words from names and acronyms. */
  interface Speller {
    boolean known(String word);

    List<String> suggest(String word);

    /** True once this request's lookup budget is spent; callers then keep the alert (main's behaviour). */
    default boolean exhausted() { return false; }
  }

  /**
   * Per-request limit on speller lookups for the name and all-caps checks, so a text full of unknown
   * names (1,000 distinct ones) stays well inside Desktop's timeout of 3 s + 60 µs per UTF-16 unit.
   * Deadline and lookup count both scale with text length. Once either is spent, the remaining
   * words fall back to main's behaviour: the alert is kept, nothing more is hidden.
   */
  record Budget(java.util.function.LongSupplier clock, long deadlineNanos, int maxLookups) {
    static final long BASE_NANOS = 100_000_000L, NANOS_PER_UNIT = 5_000L;
    static final int BASE_LOOKUPS = 500, UNITS_PER_LOOKUP = 10;

    static Budget forText(int utf16Length, java.util.function.LongSupplier clock) {
      return new Budget(clock, BASE_NANOS + NANOS_PER_UNIT * utf16Length, BASE_LOOKUPS + utf16Length / UNITS_PER_LOOKUP);
    }

    static Budget unlimited() { return new Budget(() -> 0L, Long.MAX_VALUE, Integer.MAX_VALUE); }
  }

  /**
   * Remembers the speller's answers for one request. A name repeated through a document, and the
   * transposition and case variants the filters try, are looked up once. Answers are the same as
   * the wrapped speller's; the cache is dropped with the request, so memory is bounded by its text.
   */
  static Speller perRequestCache(Speller speller) { return perRequestCache(speller, Budget.unlimited()); }

  static Speller perRequestCache(Speller speller, Budget budget) {
    java.util.Map<String, Boolean> known = new java.util.HashMap<>();
    java.util.Map<String, List<String>> suggestions = new java.util.HashMap<>();
    long start = budget.clock().getAsLong();
    int[] lookups = {0};
    return new Speller() {
      @Override
      public boolean known(String word) {
        return known.computeIfAbsent(word, w -> { lookups[0]++; return speller.known(w); });
      }

      @Override
      public List<String> suggest(String word) {
        return suggestions.computeIfAbsent(word, w -> { lookups[0]++; return List.copyOf(speller.suggest(w)); });
      }

      @Override
      public boolean exhausted() {
        return lookups[0] >= budget.maxLookups() || budget.clock().getAsLong() - start >= budget.deadlineNanos();
      }
    };
  }

  /** Below this many letters an all-caps word is always read as an acronym (PKP, NATO). */
  static final int ACRONYM_MAX_LETTERS = 4;

  /**
   * Why this spelling match is not a typo, or {@code null} to keep it. {@code otherFlagged}
   * holds the ranges of the other spelling matches in the same text.
   */
  static String reason(String text, int start, int end, List<String> suggestions, List<int[]> otherFlagged,
      Speller speller) {
    String w = text.substring(start, end);
    // Decomposed (NFD) letters are the NFC layer's job, not a sign of foreign text.
    if (COMBINING.matcher(w).find()) return null;
    if (DIGIT.matcher(w).find() || (LATIN.matcher(w).find() && NON_LATIN_LETTER.matcher(w).find())) {
      return "digits-or-mixed-script";
    }
    long letters = w.codePoints().filter(Character::isLetter).count();
    if (letters >= 2 && w.equals(w.toUpperCase(java.util.Locale.ROOT)) && !w.equals(w.toLowerCase(java.util.Locale.ROOT))) {
      return allCapsTypo(w, letters, speller) ? null : "all-caps";
    }
    for (int c : w.codePoints().toArray()) {
      if (Character.isLetter(c) && POLISH_LETTERS.indexOf(Character.toLowerCase(c)) < 0) return "foreign-letters";
    }
    boolean close = suggestions.stream().anyMatch(s -> distance(s, w) <= 1);
    boolean initial = sentenceStart(text, start);
    // The first word of a sentence is never part of a foreign phrase: a typo there next to another
    // unknown word ("Pszyjehałem wczorj") would otherwise hide both.
    for (int[] o : initial ? List.<int[]>of() : otherFlagged) {
      int from = Math.min(end, o[1]), to = Math.max(start, o[0]);
      // Only the neighbouring match matters; test the gap in place (no copy of the text between).
      if ((o[0] >= end || o[1] <= start) && onlySpaces(text, from, to)) {
        if (sentenceStart(text, o[0])) continue;
        // Latin binomial: a capitalised unknown genus right before an unknown lowercase epithet.
        boolean binomial = o[1] <= start && Character.isUpperCase(text.codePointAt(o[0]))
            && !sentenceStart(text, o[0]) && Character.isLowerCase(w.codePointAt(0));
        if (!close || binomial) return "foreign-phrase";
      }
    }
    int dash = w.indexOf('-', 1);
    // At sentence start a capital proves nothing, so the part after the hyphen must be capitalised too.
    boolean nameLike = initial ? Character.isUpperCase(w.codePointAt(Math.min(dash + 1, w.length() - 1)))
        : Character.isUpperCase(w.codePointAt(0));
    if (dash > 0 && dash < w.length() - 1 && (nameLike || ROMAN_PREFIX.matcher(w).matches())) {
      return "hyphenated-name";
    }
    if (Character.isUpperCase(w.codePointAt(0)) && !initial && !nearKnownWord(w, suggestions, speller)) {
      return "name";
    }
    return null;
  }

  /**
   * A capitalised word that is probably a typo of a known word or name: a capitalised suggestion
   * within two edits (transpositions count as one), the lowercased word is known, or one adjacent
   * transposition gives a known word ("Krakwoa" → "Krakowa").
   */
  static boolean nearKnownWord(String w, List<String> suggestions, Speller speller) {
    if (suggestions.stream().anyMatch(s -> capitalised(s) && distance(s, w) <= 2)) return true;
    // {@code suggestions} are already the speller's suggestions for w (LanguageTool's match), so
    // asking the speller for them again would only repeat the most expensive lookup.
    if (speller.exhausted()) return true;
    String lower = w.toLowerCase(java.util.Locale.ROOT);
    if (speller.known(lower)) return true;
    return transposedKnown(w, speller) || transposedKnown(lower, speller);
  }

  /**
   * An all-caps word is an acronym when it is short or nothing known is close to it; a long one
   * near a known word ("WARSZAWIEE") is a typo in capitals and is spell-checked like any word.
   */
  static boolean allCapsTypo(String w, long letters, Speller speller) {
    if (letters <= ACRONYM_MAX_LETTERS) return false;
    if (speller.exhausted()) return true;
    String lower = w.toLowerCase(java.util.Locale.ROOT);
    String title = lower.substring(0, 1).toUpperCase(java.util.Locale.ROOT) + lower.substring(1);
    if (speller.known(lower) || speller.known(title)) return false; // a known word written in caps
    for (String form : List.of(lower, title)) {
      if (speller.suggest(form).stream().anyMatch(s -> distance(s, form) <= 2)) return true;
    }
    return transposedKnown(lower, speller) || transposedKnown(title, speller);
  }

  /** Whether text[from, to) is one or more spaces or no-break spaces, nothing else. */
  private static boolean onlySpaces(String text, int from, int to) {
    if (from >= to) return false;
    for (int i = from; i < to; i++) {
      char c = text.charAt(i);
      if (c != ' ' && c != '\u00a0') return false;
    }
    return true;
  }

  private static boolean capitalised(String s) { return !s.isEmpty() && Character.isUpperCase(s.codePointAt(0)); }

  private static boolean transposedKnown(String w, Speller speller) {
    for (int i = 0; i + 1 < w.length(); i++) {
      if (w.charAt(i) == w.charAt(i + 1)) continue;
      String t = w.substring(0, i) + w.charAt(i + 1) + w.charAt(i) + w.substring(i + 2);
      if (speller.known(t)) return true;
    }
    return false;
  }

  /** Quotes, brackets, dashes and list bullets that can open a sentence before its first word. */
  private static final String OPENERS = "„\"“”‚‘'«»‹›([{—–-•*";
  private static final String TERMINATORS = ".!?…:";

  /**
   * Whether the word at {@code start} is the first word of a sentence: at the start of the text, on a
   * new line, or after . ! ? … or : (with any whitespace between), allowing a run of opening quotes,
   * brackets, dashes or bullets right before the word. A quote or dash after an ordinary word does
   * not start a sentence ("spotkałem „Xiaolonga”").
   */
  static boolean sentenceStart(String text, int start) {
    int i = start;
    while (true) {
      while (i > 0 && isSpace(text.charAt(i - 1))) {
        if (isLineBreak(text.charAt(i - 1))) return true;
        i--;
      }
      if (i == 0) return true;
      char c = text.charAt(i - 1);
      if (TERMINATORS.indexOf(c) >= 0) return true;
      if (OPENERS.indexOf(c) < 0) return false;
      i--;
    }
  }

  private static boolean isSpace(char c) { return Character.isWhitespace(c) || c == '\u00a0' || c == '\u202f'; }

  private static boolean isLineBreak(char c) { return c == '\n' || c == '\r' || c == '\u2028' || c == '\u2029'; }

  /** Optimal string alignment distance (a transposition counts as one edit), case-insensitive. */
  static int distance(String a, String b) {
    a = a.toLowerCase(java.util.Locale.ROOT);
    b = b.toLowerCase(java.util.Locale.ROOT);
    int[][] d = new int[a.length() + 1][b.length() + 1];
    for (int i = 0; i <= a.length(); i++) d[i][0] = i;
    for (int j = 0; j <= b.length(); j++) d[0][j] = j;
    for (int i = 1; i <= a.length(); i++) {
      for (int j = 1; j <= b.length(); j++) {
        int cost = a.charAt(i - 1) == b.charAt(j - 1) ? 0 : 1;
        d[i][j] = Math.min(Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1), d[i - 1][j - 1] + cost);
        if (i > 1 && j > 1 && a.charAt(i - 1) == b.charAt(j - 2) && a.charAt(i - 2) == b.charAt(j - 1)) {
          d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
        }
      }
    }
    return d[a.length()][b.length()];
  }
}
