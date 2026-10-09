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
      "Tomek", Set.of("m1"), "Jaś", Set.of("m1"), "Piotr", Set.of("m1"), "Kuba", Set.of("m1", "f"));

  private static boolean ok(String w) {
    return PossessiveFromName.isLowercasePossessiveFromName(
        w, (name, gender) -> NAMES.getOrDefault(name, Set.of()).contains(gender));
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
