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
    assertEquals(List.of("żółwie"), issues.get(0).replacements());
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
}
