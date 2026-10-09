package pl.ortografi.engine;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;

/**
 * Known engine false positives suppressed by the adapter. Each entry is a class of forms, never a
 * single word, and has positive and negative cases here.
 */
class FalsePositiveFilterTest {

  private static boolean suppressed(String ruleId, String covered) {
    return FalsePositiveFilter.suppresses(ruleId, covered);
  }

  @Test
  void apostropheIemAfterNameWithSilentFinalEIsAccepted() {
    // Names ending in -ke / -cke / -que with a silent -e take the ending "-iem" after an
    // apostrophe (Mike -> z Mike'iem). Confirmed correct by a Polish speaker (corpus p1-0222).
    for (String w : new String[] {"Mike'iem", "Mike’iem", "Luke'iem", "Spike'iem", "Blake'iem",
        "Locke'iem", "Clarke'iem", "Braque'iem"}) {
      assertTrue(suppressed("IMIONA_Z_APOSTROFAMI", w), w);
    }
  }

  @Test
  void wrongApostropheFormsOfTheSameNamesStayFlagged() {
    for (String w : new String[] {"Mike'm", "Mike'em", "Locke'm", "Locke'em", "Mike'ie"}) {
      assertFalse(suppressed("IMIONA_Z_APOSTROFAMI", w), w);
    }
  }

  @Test
  void otherNamesAndOtherRulesAreNotAffected() {
    for (String w : new String[] {"John'ie", "Bentley'u", "Andrew'em", "Joyce'iem", "mike'iem", "Mikeiem"}) {
      assertFalse(suppressed("IMIONA_Z_APOSTROFAMI", w), w);
    }
    assertFalse(suppressed("MORFOLOGIK_RULE_PL_PL", "Mike'iem"));
  }
}
