package pl.ortografi.engine;

import static org.junit.jupiter.api.Assertions.*;

import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

/** Decorator: the engine sees NFC, the caller gets ranges into the unaltered original. */
class NormalizingCheckerTest {

  /** Flags every "żółw" and inserts a zero-length issue before every "że". */
  static class Fake implements Checker {
    final List<String> seen = new ArrayList<>();

    @Override
    public List<Issue> check(String text) {
      seen.add(text);
      List<Issue> out = new ArrayList<>();
      for (int at = text.indexOf("żółw"); at >= 0; at = text.indexOf("żółw", at + 1)) {
        out.add(new Issue(at, at + 4, "FAKE", "spelling", "TYPOS", "misspelling", "m", List.of("żółwie")));
      }
      for (int at = text.indexOf(" że"); at >= 0; at = text.indexOf(" że", at + 1)) {
        out.add(new Issue(at, at, "FAKE_COMMA", "punctuation", "PUNCTUATION", "typographical", "m", List.of(",")));
      }
      return out;
    }

    @Override
    public String engineVersion() {
      return "fake";
    }

    @Override
    public String languageCode() {
      return "pl-PL";
    }
  }

  @Test
  void engineSeesNfcAndRangesPointIntoTheOriginalNfdText() throws Exception {
    String original = "😀 Mam z\u0307o\u0301łwia i z\u0307o\u0301łw.";
    String copy = new String(original);
    Fake fake = new Fake();
    List<Issue> issues = new NormalizingChecker(fake).check(original);
    assertEquals(List.of("😀 Mam żółwia i żółw."), fake.seen);
    assertEquals(copy, original, "input text is never altered");
    assertEquals(2, issues.size());
    for (Issue i : issues) {
      assertEquals("z\u0307o\u0301łw", original.substring(i.start(), i.end()));
    }
    // The suggestion keeps the user's decomposed letters; only the edit itself is new text.
    assertEquals(List.of("z\u0307o\u0301łwie"), issues.get(0).replacements());
    assertEquals("FAKE", issues.get(0).ruleId());
  }

  @Test
  void zeroLengthIssueStaysZeroLengthAtTheMappedOffset() throws Exception {
    String original = "Wiem\u0301 że"; // combining acute on "m" is not composable
    String nfdBefore = "Z\u0307ona wie że";
    List<Issue> a = new NormalizingChecker(new Fake()).check(original);
    assertEquals(original.indexOf(" że"), a.get(0).start());
    assertEquals(a.get(0).start(), a.get(0).end());
    List<Issue> b = new NormalizingChecker(new Fake()).check(nfdBefore);
    assertEquals(nfdBefore.indexOf(" że"), b.get(0).start());
    assertEquals(b.get(0).start(), b.get(0).end());
  }

  @Test
  void nfcInputIsPassedThroughUntouched() throws Exception {
    String original = "Mam żółwia 🐢.";
    Fake fake = new Fake();
    List<Issue> issues = new NormalizingChecker(fake).check(original);
    assertSame(original, fake.seen.get(0));
    assertEquals(original.indexOf("żółw"), issues.get(0).start());
  }

  @Test
  void delegatesVersionAndLanguage() {
    NormalizingChecker c = new NormalizingChecker(new Fake());
    assertEquals("fake", c.engineVersion());
    assertEquals("pl-PL", c.languageCode());
  }

  /** Fake that reports one issue with a fixed NFC range and replacements. */
  private static Checker oneIssue(String nfcFragment, String... replacements) {
    return new Fake() {
      @Override
      public List<Issue> check(String text) {
        int at = text.indexOf(nfcFragment);
        return List.of(new Issue(at, at + nfcFragment.length(), "R", "punctuation", "PUNCTUATION",
            "typographical", "m", List.of(replacements)));
      }
    };
  }

  private static String apply(String text, Issue i, String replacement) {
    return text.substring(0, i.start()) + replacement + text.substring(i.end());
  }

  @Test
  void commaInsertionDoesNotNormalizeNeighbouringDecomposedLetters() throws Exception {
    String original = "Wiem z\u0307e c\u0301ma lata.";
    Issue i = new NormalizingChecker(oneIssue("Wiem że", "Wiem, że")).check(original).get(0);
    assertEquals("Wiem z\u0307e", original.substring(i.start(), i.end()));
    assertEquals(List.of("Wiem, z\u0307e"), i.replacements());
    assertEquals("Wiem, z\u0307e c\u0301ma lata.", apply(original, i, i.replacements().get(0)));
  }

  @Test
  void replacedDecomposedLetterBecomesTheSuggestedLetterOnly() throws Exception {
    String original = "Z\u0307le sie\u0328 czuje\u0328.";
    Issue i = new NormalizingChecker(oneIssue("Żle", "Źle", "Złe")).check(original).get(0);
    assertEquals(List.of("Źle", "Złe"), i.replacements());
    assertEquals("Źle sie\u0328 czuje\u0328.", apply(original, i, "Źle"));
  }

  @Test
  void deletionAndEmptyReplacementKeepDecomposedContext() throws Exception {
    String original = "Kupiłem chleb, i mleko z\u0307ółte.";
    Issue i = new NormalizingChecker(oneIssue(", i mleko ż", " i mleko ż")).check(original).get(0);
    assertEquals(List.of(" i mleko z\u0307"), i.replacements());
    Issue d = new NormalizingChecker(oneIssue("ż", "")).check(original).get(0);
    assertEquals(List.of(""), d.replacements());
  }

  @Test
  void replacementsOfNfcInputAreUntouched() throws Exception {
    String original = "Wiem że ćma lata.";
    Issue i = new NormalizingChecker(oneIssue("Wiem że", "Wiem, że")).check(original).get(0);
    assertEquals(List.of("Wiem, że"), i.replacements());
  }
}
