package pl.ortografi.engine;

import java.util.List;

/**
 * Limits how many replacements one issue carries. LanguageTool's spelling rule can return dozens
 * of suggestions (about 60 for "rzaba"); the UI shows only a few and the corpus scores only the
 * first, so the engine sends at most {@link #MAX_REPLACEMENTS}, in LanguageTool's order.
 */
final class SuggestionCap {

  /** The engine sends at most this many replacements per issue. */
  static final int MAX_REPLACEMENTS = 5;

  private SuggestionCap() {}

  /** The first {@link #MAX_REPLACEMENTS} items, order kept; shorter lists are returned as copies. */
  static List<String> cap(List<String> replacements) {
    return List.copyOf(
        replacements.size() > MAX_REPLACEMENTS
            ? replacements.subList(0, MAX_REPLACEMENTS)
            : replacements);
  }
}
