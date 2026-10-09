package pl.ortografi.engine;

import static org.junit.jupiter.api.Assertions.*;

import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * Punctuation edits are reported as the minimal edit: a comma insertion is a zero-length range
 * with "," and an extra comma is a range covering only the comma with "". Letter edits keep
 * their whole-word range.
 */
class MinimalEditCheckerTest {

  private static Issue issue(int s, int e, String... reps) {
    return new Issue(s, e, "R", "punctuation", "PUNCTUATION", "typographical", "m", List.of(reps));
  }

  private static List<Issue> narrow(String text, Issue in) throws Exception {
    Checker fake = new Checker() {
      public List<Issue> check(String t) { return List.of(in); }
      public String engineVersion() { return "f"; }
      public String languageCode() { return "pl-PL"; }
    };
    return new MinimalEditChecker(fake).check(text);
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
    assertEquals("Wiem z\u0307e", text.substring(3, 11));
    Issue out = narrow(text, issue(3, 11, "Wiem, z\u0307e")).get(0);
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
  void insertionsInsideAWordStayWholeWordReplacements() throws Exception {
    // Spelling fixes that happen to be insertions keep the word range (corpus p0-0034, p1-0096).
    Issue poszlem = issue(0, 7, "Poszedłem");
    assertEquals(poszlem, narrow("Poszłem do sklepu.", poszlem).get(0));
    Issue samchod = issue(4, 11, "samochód", "sam chód");
    assertEquals(samchod, narrow("Ten samchód jest stary.", samchod).get(0));
    Issue wogole = issue(0, 6, "w ogóle");
    assertEquals(wogole, narrow("wogóle nie.", wogole).get(0));
    Issue z4 = issue(0, 2, "z 4");
    assertEquals(z4, narrow("z4 x", z4).get(0));
  }

  @Test
  void insertionOfARepeatedCharacterIsPlacedDeterministically() throws Exception {
    // ". " → ". ." would be odd; use punctuation: "," → ",," inserts after the common prefix.
    Issue out = narrow("a, b", issue(1, 2, ",,")).get(0);
    assertEquals(2, out.start());
    assertEquals(2, out.end());
    assertEquals(List.of(","), out.replacements());
  }

  private static void assertCommaDeletion(String text, Issue in) throws Exception {
    Issue out = narrow(text, in).get(0);
    int comma = text.indexOf(',', in.start());
    assertEquals(comma, out.start(), text);
    assertEquals(comma + 1, out.end(), text);
    assertEquals(",", text.substring(out.start(), out.end()));
    assertEquals(List.of(""), out.replacements());
    // Applying the fix removes just the comma; the following space stays.
    String fixed = text.substring(0, out.start()) + text.substring(out.end());
    String expected = text.substring(0, in.start()) + in.replacements().get(0) + text.substring(in.end());
    assertEquals(expected, fixed);
  }

  @Test
  void extraCommaBeforeTheFollowingWordCoversOnlyTheComma() throws Exception {
    // LT shapes: PRZECINEK_ANI 13..16 -> " i" (dev p0-0001); PODMIOT_ORZECZENIE ", lubi" -> " lubi".
    assertCommaDeletion("Kupiłem chleb, i mleko.", issue(13, 16, " i"));
    assertCommaDeletion("Kupiłam jabłka, i gruszki.", issue(14, 17, " i")); // p1-0160
    assertCommaDeletion("Był szybki, jak wiatr.", issue(10, 15, " jak")); // p0-0043
    assertCommaDeletion("Mój kot, lubi mleko.", issue(7, 13, " lubi"));
    Issue out = narrow("Kupiłem chleb, i mleko.", issue(13, 16, " i")).get(0);
    assertEquals(13, out.start());
    assertEquals(14, out.end());
  }

  @Test
  void extraCommaInsideAWholeWordSpanCoversOnlyTheComma() throws Exception {
    // COFANIE_PRZECINKA shape: 0..8 "Mimo, że" -> "Mimo że".
    assertCommaDeletion("Mimo, że padało, wyszliśmy.", issue(0, 8, "Mimo że"));
    Issue out = narrow("Mimo, że padało.", issue(0, 8, "Mimo że")).get(0);
    assertEquals(4, out.start());
    assertEquals(5, out.end());
  }

  @Test
  void deletionOffsetsAfterEmojiAndOnDecomposedText() throws Exception {
    String text = "😀 Mimo, z\u0307e pada, i wieje.";
    int s1 = text.indexOf("Mimo");
    assertCommaDeletion(text, issue(s1, s1 + 9, "Mimo z\u0307e"));
    assertEquals(7, narrow(text, issue(s1, s1 + 9, "Mimo z\u0307e")).get(0).start());
    int s2 = text.indexOf(", i");
    assertCommaDeletion(text, issue(s2, s2 + 3, " i"));
    String zwj = "👨‍👩‍👧, i dom.";
    assertCommaDeletion(zwj, issue(zwj.indexOf(','), zwj.indexOf(',') + 3, " i"));
  }

  @Test
  void letterEditsStayWholeWordEvenWhenTheyShareAffixes() throws Exception {
    Issue samchod = issue(4, 11, "samochód");
    assertEquals(samchod, narrow("Ten samchód jest.", samchod).get(0));
    Issue poszlem = issue(0, 7, "Poszedłem");
    assertEquals(poszlem, narrow("Poszłem do domu.", poszlem).get(0));
    Issue deleteLetter = issue(4, 9, "kota"); // "kotaa" -> "kota"
    assertEquals(deleteLetter, narrow("Mam kotaa.", deleteLetter).get(0));
    Issue commaAndWord = issue(0, 8, "Mimo iż"); // comma deletion plus a word change
    assertEquals(commaAndWord, narrow("Mimo, że pada.", commaAndWord).get(0));
    Issue space = issue(0, 6, "w ogóle"); // a space is not punctuation
    assertEquals(space, narrow("wogóle nie.", space).get(0));
  }

  @Test
  void differentEditsAcrossReplacementsLeaveTheIssueUnchanged() throws Exception {
    Issue two = issue(13, 16, " i", ", oraz");
    assertEquals(two, narrow("Kupiłem chleb, i mleko.", two).get(0));
  }
}
