package pl.ortografi.engine;

import java.util.List;

/**
 * One finding. {@code start}/{@code end} are UTF-16 code-unit offsets into the exact request text
 * (Java/JavaScript string indexes; not UTF-8 bytes, not code points). {@code end} is exclusive.
 * {@code category} is the product category from {@link CategoryMapper}; {@code engineCategory}
 * is LanguageTool's own category ID, kept for diagnostics.
 */
public record Issue(
    int start,
    int end,
    String ruleId,
    String category,
    String engineCategory,
    String issueType,
    String message,
    List<String> replacements) {}
