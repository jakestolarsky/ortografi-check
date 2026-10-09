package pl.ortografi.engine;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.function.Predicate;

/**
 * Polish writes "nie" separately from verbs ("Nie wiem", not "Niewiem"). When a misspelled token
 * starts with "nie" and LanguageTool offers the split "nie &lt;verb&gt;", that suggestion goes
 * first; every other suggestion keeps LanguageTool's order. Runs before {@link SuggestionCap}.
 */
final class NieVerbFirst {

  /**
   * Verb forms in LanguageTool's Polish tagset ("verb:fin:sg:pri:..."). Participles (pact, ppas)
   * and gerunds (ger) carry their own top-level tags and are not matched: as adjectives and
   * nouns they are written together with "nie".
   */
  static final Set<String> VERB_TAGS =
      Set.of("fin", "praet", "impt", "inf", "imps", "bedzie", "pcon", "pant", "winien");

  private NieVerbFirst() {}

  static boolean isVerbTag(String tag) {
    if (tag == null || !tag.startsWith("verb:")) return false;
    String[] parts = tag.split(":");
    return parts.length > 1 && VERB_TAGS.contains(parts[1]);
  }

  static List<String> reorder(String covered, List<String> suggestions, Predicate<String> isVerb) {
    if (!covered.toLowerCase(Locale.ROOT).startsWith("nie")) return suggestions;
    for (int k = 0; k < suggestions.size(); k++) {
      String s = suggestions.get(k);
      if (s.length() > 4 && s.substring(0, 4).equalsIgnoreCase("nie ")
          && s.indexOf(' ', 4) < 0 && isVerb.test(s.substring(4).toLowerCase(Locale.ROOT))) {
        if (k == 0) return suggestions;
        List<String> out = new ArrayList<>(suggestions.size());
        out.add(s);
        for (int j = 0; j < suggestions.size(); j++) if (j != k) out.add(suggestions.get(j));
        return List.copyOf(out);
      }
    }
    return suggestions;
  }
}
