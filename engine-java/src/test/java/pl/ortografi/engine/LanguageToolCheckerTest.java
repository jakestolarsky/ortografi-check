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
    assertTrue(i.replacements().contains("żółwia"), i::toString); // edited word: NFC
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
  void emptyTextHasNoIssues() throws Exception {
    assertEquals(List.of(), checker.check(""));
  }
}
