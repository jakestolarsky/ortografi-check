package pl.ortografi.engine;

import static org.junit.jupiter.api.Assertions.*;

import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.Test;

/**
 * 2026 spelling reform (RJP): possessive adjectives formed from personal names with -ów/-in/-yn
 * may be written lowercase ("zosina lalka"). The engine's dictionary predates the reform.
 */
class PossessiveFromNameTest {

  /** Fake lexicon: capitalised personal names and their gender. */
  private static final Map<String, Set<String>> NAMES = Map.of(
      "Zosia", Set.of("f"), "Ewa", Set.of("f"), "Agnieszka", Set.of("f"), "Kasia", Set.of("f"),
      "Tomek", Set.of("m1"), "Jaś", Set.of("m1"), "Piotr", Set.of("m1"), "Kuba", Set.of("m1", "f"),
      "Krak", Set.of("m1"));

  /** Fake lexicon: inflected forms of place names (form → lemma). */
  private static final Map<String, String> PLACES = Map.of("Krakowa", "Kraków", "Krakowem", "Kraków",
      "Zosina", "Zosin");

  private static boolean ok(String w) {
    return PossessiveFromName.isLowercasePossessiveFromName(w, new PossessiveFromName.Lexicon() {
      @Override
      public boolean isPersonalName(String name, String gender) {
        return NAMES.getOrDefault(name, Set.of()).contains(gender);
      }

      @Override
      public boolean isFormOf(String form, String lemma) {
        return lemma.equals(PLACES.get(form));
      }
    });
  }

  @Test
  void feminineNamesWithInAndYnInAllEndings() {
    for (String w : new String[] {"zosin", "zosina", "zosine", "zosinego", "zosinemu", "zosinej",
        "zosiną", "zosinym", "zosinych", "zosinymi", "zosini", "ewin", "ewina", "kasinego",
        "agnieszczyn", "agnieszczyna"}) {
      assertTrue(ok(w), w);
    }
  }

  @Test
  void masculineNamesWithOwAndOw() {
    for (String w : new String[] {"tomków", "tomkowa", "tomkowe", "tomkowego", "tomkowy", "tomkowi",
        "piotrów", "piotrowa", "jasiowa", "jasiów", "kubowa"}) {
      assertTrue(ok(w), w);
    }
  }

  @Test
  void lowercaseTownNamesInOwAreNotTakenForPossessives() {
    // Kraków (from the name Krak): "krakowa" is the town's genitive, miscapitalised (corpus p0-0028).
    assertFalse(ok("krakowa"));
    assertFalse(ok("krakowem"));
    // -in is not excluded: the -in town "Zosin" must not hide "zosina" (Zosia's).
    assertTrue(ok("zosina"));
  }

  @Test
  void otherWordsAreNotAccepted() {
    for (String w : new String[] {
        "zosinaa", "zosia", "Zosina", "kabina", "szkolina", "marysina", // Marysia not in lexicon
        "zosinowa", // wrong suffix combination
        "tominy", "ewowa", // feminine name with -ow, missing stem
        "piotrin", // masculine name with -in
        "zosinka", ""}) {
      assertFalse(ok(w), w);
    }
  }
}
