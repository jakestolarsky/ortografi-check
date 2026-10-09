package pl.ortografi.engine;

import java.util.Map;

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
