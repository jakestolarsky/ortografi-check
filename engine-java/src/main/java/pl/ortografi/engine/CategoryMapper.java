package pl.ortografi.engine;

import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * The single mapping from LanguageTool categories to the product's categories (PLAN.md sections
 * 6, 9): {@code spelling}, {@code punctuation}, {@code grammar}, plus {@code style} (kept apart
 * from errors, section 1) and {@code other}. Keys are LanguageTool category IDs, never message
 * text. Table built from all rules of language-pl 6.8.
 */
public final class CategoryMapper {

  private static final Map<String, String> BY_CATEGORY =
      Map.ofEntries(
          Map.entry("TYPOS", "spelling"),
          Map.entry("SPELLING", "spelling"),
          Map.entry("CASING", "spelling"),
          Map.entry("PHONETICS", "spelling"),
          Map.entry("PRAWDOPODOBNE_LITEROWKI", "spelling"),
          Map.entry("PUNCTUATION", "punctuation"),
          Map.entry("TYPOGRAPHY", "punctuation"),
          Map.entry("GRAMMAR", "grammar"),
          Map.entry("GENDER", "grammar"),
          Map.entry("SYNTAX", "grammar"),
          Map.entry("WORD_ORDER", "grammar"),
          Map.entry("STYLE", "style"),
          Map.entry("REDUNDANCY", "style"),
          Map.entry("SEMANTICS", "style"),
          Map.entry("CONFUSED_WORDS", "style"),
          Map.entry("MISC", "other"),
          Map.entry("NUMBERS", "other"));

  /**
   * Whole-rule overrides, checked before the category table. Both rules were reviewed in
   * language-pl 6.8: every sub-rule of SKROTY_Z_KROPKA is "abbreviation needs a dot";
   * JEDNOSTKA_LICZBA is "space between number and unit/year" (+ "o" -> degree sign).
   */
  private static final Map<String, String> BY_RULE =
      Map.of("SKROTY_Z_KROPKA", "punctuation", "JEDNOSTKA_LICZBA", "punctuation");

  /**
   * PL_SIMPLE_REPLACE is a 227-entry context-free typo list (replace.txt: typos, missing
   * diacritics, joined/split words, foreign-name declension). Only these entries are wrong
   * inflected forms, so only they are grammar; the rest of the rule stays spelling. Keys are
   * the lower-cased wrong forms; a test asserts each is still in the engine's list.
   */
  static final Set<String> SIMPLE_REPLACE_INFLECTION =
      Set.of(
          "szłem", "poszłem", // -> (po)szedłem
          "chłopcowi", "bratowi", // -> chłopcu, bratu
          "synie", "domie", // -> synu, domu
          "akcesorii", "akwarii", "centr", // gen. pl. -> akcesoriów, akwariów, centrów
          "lubieć", // -> lubić
          "obiedwie", // -> obydwie
          "europom"); // -> Europą

  private static final Locale PL = Locale.forLanguageTag("pl-PL");

  /**
   * Product category for one match. {@code coveredText} is the matched text as the engine saw
   * it (NFC); it is used only to pick out PL_SIMPLE_REPLACE entries, never message text.
   */
  public static String map(String ruleId, String engineCategoryId, String issueType, String coveredText) {
    String byRule = BY_RULE.get(ruleId);
    if (byRule != null) return byRule;
    if ("PL_SIMPLE_REPLACE".equals(ruleId)
        && coveredText != null
        && SIMPLE_REPLACE_INFLECTION.contains(coveredText.toLowerCase(PL))) {
      return "grammar";
    }
    return map(engineCategoryId, issueType);
  }

  private CategoryMapper() {}

  public static String map(String engineCategoryId, String issueType) {
    String c = BY_CATEGORY.get(engineCategoryId);
    if (c != null) return c;
    return switch (issueType) {
      case "misspelling" -> "spelling";
      case "grammar" -> "grammar";
      case "typographical", "whitespace" -> "punctuation";
      case "style" -> "style";
      default -> "other";
    };
  }
}
