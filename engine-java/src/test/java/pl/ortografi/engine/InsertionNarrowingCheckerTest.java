package pl.ortografi.engine;

import static org.junit.jupiter.api.Assertions.*;

import java.util.List;
import org.junit.jupiter.api.Test;

/** Pure insertions are reported as a zero-length range at the exact point (start == end). */
class InsertionNarrowingCheckerTest {

  private static Issue issue(int s, int e, String... reps) {
    return new Issue(s, e, "R", "punctuation", "PUNCTUATION", "typographical", "m", List.of(reps));
  }

  private static List<Issue> narrow(String text, Issue in) throws Exception {
    Checker fake = new Checker() {
      public List<Issue> check(String t) { return List.of(in); }
      public String engineVersion() { return "f"; }
      public String languageCode() { return "pl-PL"; }
    };
    return new InsertionNarrowingChecker(fake).check(text);
  }

  @Test
  void commaInsertionBecomesZeroLengthAtTheExactPoint() throws Exception {
    Issue out = narrow("Wiem że to.", issue(0, 7, "Wiem, że")).get(0);
    assertEquals(4, out.start());
    assertEquals(4, out.end());
    assertEquals(List.of(","), out.replacements());
  }

  @Test
  void worksOnDecomposedOriginalAndAfterEmoji() throws Exception {
    String text = "😀 Wiem z\u0307e to.";
    Issue out = narrow(text, issue(3, 10, "Wiem, z\u0307e")).get(0);
    assertEquals(7, out.start());
    assertEquals(7, out.end());
    assertEquals(List.of(","), out.replacements());
  }

  @Test
  void allReplacementsMustBeInsertionsAtTheSamePoint() throws Exception {
    Issue mixed = issue(0, 7, "Wiem, że", "Wiedz że");
    assertEquals(mixed, narrow("Wiem że to.", mixed).get(0));
    Issue twoPoints = issue(0, 7, "Wiem, że", "Wiem że,");
    assertEquals(twoPoints, narrow("Wiem że to.", twoPoints).get(0));
  }

  @Test
  void otherIssuesPassThroughUnchanged() throws Exception {
    Issue replace = issue(0, 4, "Wiem");
    assertEquals(replace, narrow("Wiam że.", replace).get(0));
    Issue delete = issue(4, 5, "");
    assertEquals(delete, narrow("Wiem, że.", delete).get(0));
    Issue noFix = issue(0, 4);
    assertEquals(noFix, narrow("Wiem że.", noFix).get(0));
    Issue alreadyPoint = issue(4, 4, ",");
    assertEquals(alreadyPoint, narrow("Wiem że.", alreadyPoint).get(0));
  }

  @Test
  void insertionOfARepeatedCharacterIsPlacedDeterministically() throws Exception {
    // "a" → "aa": the inserted "a" is placed after the longest common prefix.
    Issue out = narrow("xa y", issue(1, 2, "aa")).get(0);
    assertEquals(2, out.start());
    assertEquals(2, out.end());
    assertEquals(List.of("a"), out.replacements());
  }
}
