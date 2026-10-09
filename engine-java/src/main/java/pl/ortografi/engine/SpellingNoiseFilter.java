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
  private static final Pattern SPACES = Pattern.compile("[ \\u00a0]+");
  private static final String POLISH_LETTERS = "aąbcćdeęfghijklłmnńoóprsśtuwyzźżqvx";

  private SpellingNoiseFilter() {}

  /**
   * Why this spelling match is not a typo, or {@code null} to keep it. {@code otherFlagged}
   * holds the ranges of the other spelling matches in the same text.
   */
  static String reason(String text, int start, int end, List<String> suggestions, List<int[]> otherFlagged) {
    String w = text.substring(start, end);
    // Decomposed (NFD) letters are the NFC layer's job, not a sign of foreign text.
    if (COMBINING.matcher(w).find()) return null;
    if (DIGIT.matcher(w).find() || (LATIN.matcher(w).find() && NON_LATIN_LETTER.matcher(w).find())) {
      return "digits-or-mixed-script";
    }
    long letters = w.codePoints().filter(Character::isLetter).count();
    if (letters >= 2 && w.equals(w.toUpperCase(java.util.Locale.ROOT)) && !w.equals(w.toLowerCase(java.util.Locale.ROOT))) {
      return "all-caps";
    }
    for (int c : w.codePoints().toArray()) {
      if (Character.isLetter(c) && POLISH_LETTERS.indexOf(Character.toLowerCase(c)) < 0) return "foreign-letters";
    }
    boolean close = suggestions.stream().anyMatch(s -> distance(s, w) <= 1);
    for (int[] o : otherFlagged) {
      int from = Math.min(end, o[1]), to = Math.max(start, o[0]);
      if ((o[0] >= end || o[1] <= start) && from <= to && SPACES.matcher(text.substring(from, to)).matches()) {
        // Latin binomial: a capitalised unknown genus right before an unknown lowercase epithet.
        boolean binomial = o[1] <= start && Character.isUpperCase(text.codePointAt(o[0]))
            && !sentenceStart(text, o[0]) && Character.isLowerCase(w.codePointAt(0));
        if (!close || binomial) return "foreign-phrase";
      }
    }
    int dash = w.indexOf('-', 1);
    if (dash > 0 && dash < w.length() - 1 && (Character.isUpperCase(w.codePointAt(0)) || ROMAN_PREFIX.matcher(w).matches())) {
      return "hyphenated-name";
    }
    if (Character.isUpperCase(w.codePointAt(0)) && !sentenceStart(text, start)
        && suggestions.stream().noneMatch(s -> !s.isEmpty() && Character.isUpperCase(s.codePointAt(0)) && distance(s, w) <= 1)) {
      return "name";
    }
    return null;
  }

  private static boolean sentenceStart(String text, int start) {
    String before = text.substring(0, start).stripTrailing();
    if (before.isEmpty()) return true;
    char last = before.charAt(before.length() - 1);
    return ".!?:…\n„\"«(".indexOf(last) >= 0;
  }

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
