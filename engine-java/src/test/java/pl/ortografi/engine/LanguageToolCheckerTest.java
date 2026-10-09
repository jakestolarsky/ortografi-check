package pl.ortografi.engine;

import static org.junit.jupiter.api.Assertions.*;

import java.util.List;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

/**
 * Runs the real, pinned LanguageTool language-pl engine (PLAN.md section 10: "JUnit + the actual
 * pinned LanguageTool"). Offsets must be UTF-16 code units, i.e. Java/JavaScript string indexes.
 */
class LanguageToolCheckerTest {

  private static LanguageToolChecker checker;

  @BeforeAll
  static void startEngine() {
    checker = new LanguageToolChecker();
  }

  private static Issue onlyIssueCovering(List<Issue> issues, String text, String fragment) {
    List<Issue> hits =
        issues.stream().filter(i -> text.substring(i.start(), i.end()).equals(fragment)).toList();
    assertEquals(1, hits.size(), () -> "expected exactly one issue on '" + fragment + "' in " + issues);
    return hits.get(0);
  }

  private static void assertOffsetsAreValidUtf16(String text, List<Issue> issues) {
    for (Issue i : issues) {
      assertTrue(0 <= i.start() && i.start() <= i.end() && i.end() <= text.length(), i::toString);
      assertFalse(
          i.start() > 0 && Character.isLowSurrogate(text.charAt(i.start())),
          () -> "start splits a surrogate pair: " + i);
      assertFalse(
          i.end() < text.length() && Character.isLowSurrogate(text.charAt(i.end())),
          () -> "end splits a surrogate pair: " + i);
    }
  }

  @Test
  void reportsPinnedEngineVersion() {
    assertEquals("6.8", checker.engineVersion());
    assertEquals("pl-PL", checker.languageCode());
  }

  @Test
  void flagsPolishMisspellingWithSuggestion() throws Exception {
    String text = "Ala ma kotaa.";
    List<Issue> issues = checker.check(text);
    Issue i = onlyIssueCovering(issues, text, "kotaa");
    assertEquals(7, i.start());
    assertEquals(12, i.end());
    assertEquals("spelling", i.category());
    assertEquals("TYPOS", i.engineCategory());
    assertTrue(i.replacements().contains("kota"), i::toString);
  }

  @Test
  void offsetsAfterPolishDiacriticsAreUtf16() throws Exception {
    String text = "Zażółć gęślą jaźń, a potem kotaa.";
    List<Issue> issues = checker.check(text);
    Issue i = onlyIssueCovering(issues, text, "kotaa");
    assertEquals(text.indexOf("kotaa"), i.start());
    assertOffsetsAreValidUtf16(text, issues);
  }

  @Test
  void offsetsAfterEmojiCountSurrogatePairsAsTwoUnits() throws Exception {
    String text = "😀😀 Ala ma kotaa.";
    List<Issue> issues = checker.check(text);
    Issue i = onlyIssueCovering(issues, text, "kotaa");
    // Two emoji = 4 UTF-16 units (not 2 code points, not 8 UTF-8 bytes).
    assertEquals(12, i.start());
    assertEquals(17, i.end());
    assertOffsetsAreValidUtf16(text, issues);
  }

  @Test
  void offsetsAfterZwjEmojiSequenceAndNonBmpLetters() throws Exception {
    String text = "Rodzina 👨‍👩‍👧 i 𝔸 oraz kotaa w domu.";
    List<Issue> issues = checker.check(text);
    Issue i = onlyIssueCovering(issues, text, "kotaa");
    assertEquals(text.indexOf("kotaa"), i.start());
    assertOffsetsAreValidUtf16(text, issues);
  }

  @Test
  void offsetsAfterCombiningMarksAreUtf16() throws Exception {
    // "Zażółć" written in decomposed form (NFD): letters + combining marks.
    String nfd = "Zaz\u0307o\u0301łc\u0301";
    String text = nfd + " i kotaa.";
    List<Issue> issues = checker.check(text);
    Issue i = onlyIssueCovering(issues, text, "kotaa");
    assertEquals(nfd.length() + 3, i.start());
    assertOffsetsAreValidUtf16(text, issues);
  }

  @Test
  void flagsMissingCommaBeforeZe() throws Exception {
    String text = "Wiem że przyjdzie jutro.";
    List<Issue> issues = checker.check(text);
    Issue i = onlyIssueCovering(issues, text, "Wiem że");
    assertEquals("punctuation", i.category());
    assertEquals("PUNCTUATION", i.engineCategory());
    assertTrue(i.replacements().contains("Wiem, że"), i::toString);
  }

  @Test
  void flagsUnnecessaryCommaBeforeI() throws Exception {
    String text = "Kupiłem chleb, i mleko.";
    List<Issue> issues = checker.check(text);
    Issue i = onlyIssueCovering(issues, text, ", i");
    assertEquals("punctuation", i.category());
  }

  @Test
  void acceptsCorrectCommaBeforeIClosingParenthetical() throws Exception {
    // PLAN.md section 10 control example: this comma before "i" is correct.
    assertEquals(List.of(), checker.check("Obiecał, że przyjdzie, i dotrzymał słowa."));
  }

  @Test
  void knownLimitationDecomposedPolishLettersAreFlaggedAsMisspellings() throws Exception {
    // Characterization, not a desired behaviour: LanguageTool 6.8 does not normalise NFD input,
    // so "Zażółć" typed with combining marks is reported as a typo while NFC is accepted.
    // PLAN.md section 4 forbids silent normalisation; any fix needs an offset map. Phase 0 finding.
    String nfc = "Zażółć gęślą jaźń.";
    String nfd = java.text.Normalizer.normalize(nfc, java.text.Normalizer.Form.NFD);
    assertEquals(List.of(), checker.check(nfc));
    List<Issue> issues = checker.check(nfd);
    assertEquals(3, issues.size(), issues::toString);
    assertTrue(issues.stream().allMatch(i -> i.ruleId().equals("MORFOLOGIK_RULE_PL_PL")));
    assertOffsetsAreValidUtf16(nfd, issues);
  }

  @Test
  void normalizingEngineAcceptsNfdPolishThatTheRawEngineRejects() throws Exception {
    String nfd = java.text.Normalizer.normalize("Zażółć gęślą jaźń.", java.text.Normalizer.Form.NFD);
    String copy = new String(nfd);
    assertEquals(List.of(), new NormalizingChecker(checker).check(nfd));
    assertEquals(copy, nfd);
  }

  @Test
  void normalizingEngineMapsNfdMisspellingBackToOriginalRange() throws Exception {
    // "żułw" (should be "żółw") typed in NFD, after an emoji and a ZWJ sequence.
    String word = "z\u0307ułw";
    String text = "😀 👨‍👩‍👧 Widziałem " + word + "a w ogrodzie, i kotaa.";
    List<Issue> issues = new NormalizingChecker(checker).check(text);
    Issue i = onlyIssueCovering(issues, text, word + "a");
    assertEquals("spelling", i.category());
    // Edited word is written in NFC. LT ranks the true fix "żółwia" below its top 5, so with
    // SuggestionCap it is no longer sent; "żółwi" (5th) still shows the NFC mapping.
    assertTrue(i.replacements().contains("żółwi"), i::toString);
    for (String r : i.replacements()) {
      assertTrue(java.text.Normalizer.isNormalized(r, java.text.Normalizer.Form.NFC), r);
    }
    onlyIssueCovering(issues, text, "kotaa");
    assertOffsetsAreValidUtf16(text, issues);
  }

  @Test
  void simpleReplaceInflectionErrorIsGrammarButItsTypoEntriesStaySpelling() throws Exception {
    String t1 = "Poszłem do sklepu.";
    Issue a = onlyIssueCovering(checker.check(t1), t1, "Poszłem");
    assertEquals("PL_SIMPLE_REPLACE", a.ruleId());
    assertEquals("grammar", a.category());
    assertEquals("PRAWDOPODOBNE_LITEROWKI", a.engineCategory());
    String t2 = "Wogle nie wiem.";
    Issue b = onlyIssueCovering(checker.check(t2), t2, "Wogle");
    assertEquals("PL_SIMPLE_REPLACE", b.ruleId());
    assertEquals("spelling", b.category());
  }

  @Test
  void abbreviationAndNumberSpacingRulesArePunctuation() throws Exception {
    String t1 = "Weź np wodę.";
    assertEquals("punctuation", onlyIssueCovering(checker.check(t1), t1, "np").category());
    String t2 = "Było to w 2025r. latem.";
    assertEquals("punctuation", onlyIssueCovering(checker.check(t2), t2, "2025r.").category());
  }

  @Test
  void styleIssuesStayStyle() throws Exception {
    String t = "Musimy cofnąć się do tyłu.";
    Issue i = onlyIssueCovering(checker.check(t), t, "cofnąć się do tyłu");
    assertEquals("style", i.category());
  }

  @Test
  void normalizingEngineCommaFixKeepsDecomposedLettersOfTheOriginal() throws Exception {
    String text = "Wiem z\u0307e c\u0301ma lubi s\u0301wiatło.";
    List<Issue> issues = new NormalizingChecker(checker).check(text);
    assertEquals(1, issues.size(), issues::toString);
    Issue i = issues.get(0);
    String fixed = text.substring(0, i.start()) + i.replacements().get(0) + text.substring(i.end());
    assertEquals("Wiem, z\u0307e c\u0301ma lubi s\u0301wiatło.", fixed);
  }

  @Test
  void apostropheIemFormOfSilentENamesIsNotFlaggedButWrongFormsAre() throws Exception {
    for (String t : new String[] {"Spotkałem się z Mike'iem na kawie.", "Rozmawiałem z Clarke’iem wczoraj."}) {
      assertEquals(List.of(), checker.check(t), t);
    }
    String wrong = "Spotkałem się z Mike'm na kawie.";
    Issue i = onlyIssueCovering(checker.check(wrong), wrong, "Mike'm");
    assertEquals("IMIONA_Z_APOSTROFAMI", i.ruleId());
    String other = "Porozmawiajmy o John'ie Lennonie.";
    assertEquals("IMIONA_Z_APOSTROFAMI", onlyIssueCovering(checker.check(other), other, "John'ie").ruleId());
  }

  @Test
  void reformLowercasePossessivesFromNamesAreNotFlaggedButTyposStillAre() throws Exception {
    for (String t : new String[] {"Na półce leży zosina lalka.", "To jest tomkowy rower.",
        "Szukam kasinego psa.", "Wzięła agnieszczyną torbę.", "Zosina lalka leży na półce."}) {
      assertEquals(List.of(), checker.check(t), t);
    }
    String town = "Latem pojechaliśmy do krakowa pociągiem."; // corpus p0-0028
    assertEquals("MORFOLOGIK_RULE_PL_PL", onlyIssueCovering(checker.check(town), town, "krakowa").ruleId());
    String typo = "Na półce leży szkolina lalka.";
    assertEquals("MORFOLOGIK_RULE_PL_PL", onlyIssueCovering(checker.check(typo), typo, "szkolina").ruleId());
  }

  @Test
  void emptyTextHasNoIssues() throws Exception {
    assertEquals(List.of(), checker.check(""));
  }

  /** p0-0063: NFD "Może" before the issue; "rzaba" gets far more than 5 suggestions from LT. */
  @Test
  void suggestionsAreCappedAtFiveInLanguageToolOrder() throws Exception {
    String nfd = "Moz\u0307e to rzaba skacze po ła\u0328ce?";
    String nfc = java.text.Normalizer.normalize(nfd, java.text.Normalizer.Form.NFC);
    var raw = new org.languagetool.JLanguageTool(
        org.languagetool.Languages.getLanguageForShortCode("pl-PL")).check(nfc).stream()
        .filter(m -> nfc.substring(m.getFromPos(), m.getToPos()).equals("rzaba"))
        .findFirst().orElseThrow().getSuggestedReplacements();
    assertTrue(raw.size() > SuggestionCap.MAX_REPLACEMENTS, () -> "LT gave only " + raw);

    List<Issue> issues = new MinimalEditChecker(new NormalizingChecker(checker)).check(nfd);
    Issue i = onlyIssueCovering(issues, nfd, "rzaba");
    assertEquals(9, i.start());
    assertEquals(14, i.end());
    assertEquals(raw.subList(0, 5), i.replacements());
    assertEquals("żaba", i.replacements().get(0));
  }

  @Test
  void fewerThanFiveSuggestionsAndCommaFixesAreUnchanged() throws Exception {
    Checker full = new MinimalEditChecker(new NormalizingChecker(checker));
    String insert = "Wiem że to nie będzie łatwe.";
    Issue comma = onlyIssueCovering(full.check(insert), insert, "");
    assertEquals(4, comma.start());
    assertEquals(List.of(","), comma.replacements());

    String delete = "Kupiłem chleb, i mleko.";
    Issue extra = onlyIssueCovering(full.check(delete), delete, ",");
    assertEquals(List.of(""), extra.replacements());
  }

  @Test
  void nieWithAVerbIsSuggestedSeparatelyFirst() throws Exception {
    for (String[] c : new String[][] {
        {"Niewiem, co robić.", "Niewiem", "Nie wiem"},
        {"Nierozumiem tego zadania.", "Nierozumiem", "Nie rozumiem"},
        {"Niechcę iść do szkoły.", "Niechcę", "Nie chcę"},
        {"Nielubię szpinaku.", "Nielubię", "Nie lubię"}}) {
      Issue i = onlyIssueCovering(checker.check(c[0]), c[0], c[1]);
      assertEquals(c[2], i.replacements().get(0), i::toString);
      assertTrue(i.replacements().size() <= SuggestionCap.MAX_REPLACEMENTS);
    }
  }

  @Test
  void nieWordsThatAreNotVerbsAreNotReordered() throws Exception {
    // Correct words are not flagged; misspelled non-verbs keep LanguageTool's order.
    for (String t : new String[] {"Niebieski dom.", "Widziałem niedźwiedzia.", "To był niedobry pomysł."}) {
      assertEquals(List.of(), checker.check(t), t);
    }
    for (String[] c : new String[][] {{"Niebieskii dom.", "Niebieskii"},
        {"Widziałem niedźwiedzai.", "niedźwiedzai"}, {"To niedobrry pomysł.", "niedobrry"}}) {
      var raw = new org.languagetool.JLanguageTool(
          org.languagetool.Languages.getLanguageForShortCode("pl-PL")).check(c[0]).stream()
          .filter(m -> c[0].substring(m.getFromPos(), m.getToPos()).equals(c[1]))
          .findFirst().orElseThrow().getSuggestedReplacements();
      Issue i = onlyIssueCovering(checker.check(c[0]), c[0], c[1]);
      assertEquals(SuggestionCap.cap(raw), i.replacements(), c[0]);
    }
  }
}
