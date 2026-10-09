package pl.ortografi.engine;

import java.util.regex.Pattern;

/**
 * Engine false positives the adapter suppresses. Each entry covers a class of forms, keyed on
 * the rule ID plus the matched text (in the NFC copy), never on message text. Keep this list
 * short. Every entry needs positive and negative tests and a reason; prefer reporting it
 * upstream too.
 */
final class FalsePositiveFilter {

  /**
   * IMIONA_Z_APOSTROFAMI, sub-rule "paradygmat A.2.2.2e (Locke, Braque)" in language-pl 6.8:
   * pattern {@code .*\p{Ll}+(?:c?ke|que)} + apostrophe + {@code (?:i?e)?m}, suggesting "…kiem".
   * Its regex also flags the correct apostrophe form of names whose final -e is silent after a
   * k sound: Mike → z Mike'iem (k softens before -iem; the silent -e stays, so an apostrophe
   * is needed). Confirmed by a Polish speaker (corpus p1-0222). Only the "-iem" ending is
   * accepted; "Mike'm" and "Mike'em" are still reported.
   */
  private static final Pattern SILENT_E_NAME_APOSTROPHE_IEM =
      Pattern.compile("\\p{Lu}\\p{L}*(?:ke|que)['’]iem");

  private FalsePositiveFilter() {}

  static boolean suppresses(String ruleId, String coveredText) {
    return "IMIONA_Z_APOSTROFAMI".equals(ruleId)
        && coveredText != null
        && SILENT_E_NAME_APOSTROPHE_IEM.matcher(coveredText).matches();
  }
}
