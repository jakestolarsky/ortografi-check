package pl.ortografi.engine;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 2026 spelling reform (Rada Języka Polskiego): possessive adjectives formed from personal names
 * with the suffixes -in/-yn (from names ending in -a: Zosia → zosina) and -ów/-ow- (Tomek →
 * tomkowy) may be written lowercase. LanguageTool 6.8's dictionary predates the reform, so it
 * flags them as typos.
 *
 * <p>This recognises the derivation, not a word list. The word must be lowercase and consist of
 * stem + suffix + adjective ending, and the stem must resolve (with the regular stem alternations)
 * to a <em>personal name</em> in the engine's own lexicon: a capitalised lemma tagged
 * {@code subst:sg:nom} with gender f (for -in/-yn) or m1 (for -ów/-ow-). Common nouns
 * ("mama" → "mamin" is already in the dictionary) and place names (m3) never qualify.
 */
final class PossessiveFromName {

  /** Answers whether {@code name} is a personal name of {@code gender} ("f" or "m1"). */
  interface NameLexicon {
    boolean isPersonalName(String name, String gender);
  }

  private static final String ENDINGS = "(|a|e|ego|emu|ej|ą|ym|ych|ymi|i)";
  private static final Pattern IN_YN = Pattern.compile("(\\p{Ll}{2,})(in|yn)" + ENDINGS);
  private static final Pattern OW = Pattern.compile("(\\p{Ll}{2,})(?:ów|ow(a|e|ego|emu|ej|ą|y|ym|ych|ymi|i))");
  private static final Locale PL = Locale.forLanguageTag("pl");

  private PossessiveFromName() {}

  static boolean isLowercasePossessiveFromName(String word, NameLexicon names) {
    if (word == null || word.isEmpty() || !word.equals(word.toLowerCase(PL))) {
      return false;
    }
    Matcher m = IN_YN.matcher(word);
    if (m.matches()) {
      String stem = m.group(1);
      List<String> candidates = new ArrayList<>();
      candidates.add(stem + "a"); // Ewa → ew-in-a
      candidates.add(stem + "ia"); // Zosia → zos-in-a (the softening i is absorbed)
      if (m.group(2).equals("yn") && stem.endsWith("cz")) {
        candidates.add(stem.substring(0, stem.length() - 2) + "ka"); // Agnieszka → agnieszczyn
      }
      for (String c : candidates) {
        if (names.isPersonalName(capitalise(c), "f")) {
          return true;
        }
      }
    }
    m = OW.matcher(word);
    if (m.matches()) {
      String stem = m.group(1);
      List<String> candidates = new ArrayList<>();
      candidates.add(stem); // Piotr → piotrowy
      int n = stem.length();
      char last = stem.charAt(n - 1);
      if ((last == 'k' || last == 'c') && !isVowel(stem.charAt(n - 2))) {
        candidates.add(stem.substring(0, n - 1) + "e" + last); // Tomek → tomkowy (fleeting e)
      }
      for (String[] soft : new String[][] {{"dzi", "dź"}, {"si", "ś"}, {"ci", "ć"}, {"zi", "ź"}, {"ni", "ń"}}) {
        if (stem.endsWith(soft[0])) {
          candidates.add(stem.substring(0, n - soft[0].length()) + soft[1]); // Jaś → jasiowy
          break;
        }
      }
      candidates.add(stem + "a"); // Kuba → kubowy
      for (String c : candidates) {
        if (names.isPersonalName(capitalise(c), "m1")) {
          return true;
        }
      }
    }
    return false;
  }

  private static boolean isVowel(char c) {
    return "aąeęioóuy".indexOf(c) >= 0;
  }

  private static String capitalise(String s) {
    return s.substring(0, 1).toUpperCase(PL) + s.substring(1);
  }
}
