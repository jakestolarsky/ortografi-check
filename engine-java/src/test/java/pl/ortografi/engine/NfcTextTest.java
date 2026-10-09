package pl.ortografi.engine;

import static org.junit.jupiter.api.Assertions.*;

import java.text.Normalizer;
import java.util.List;
import org.junit.jupiter.api.Test;

/** NFC analysis copy + map back to original UTF-16 offsets (PLAN.md section 4). */
class NfcTextTest {

  private static final String ZAZOLC_NFD = "Zaz\u0307o\u0301łc\u0301"; // "Zażółć", 9 units

  @Test
  void alreadyNfcTextIsUsedAsIsWithIdentityMap() {
    String original = "Zażółć 😀 👨‍👩‍👧 gęślą.";
    NfcText t = NfcText.of(original);
    assertSame(original, t.normalized());
    assertFalse(t.changed());
    for (int i = 0; i <= original.length(); i++) {
      assertEquals(i, t.toOriginalStart(i));
      assertEquals(i, t.toOriginalEnd(i));
    }
  }

  @Test
  void nfdPolishIsComposedAndMappedBack() {
    String original = ZAZOLC_NFD + " jaz\u0301n\u0301";
    NfcText t = NfcText.of(original);
    assertEquals("Zażółć jaźń", t.normalized());
    assertTrue(t.changed());
    // "ż" is normalized [2,3) and original [2,4) ("z" + U+0307).
    assertEquals(2, t.toOriginalStart(2));
    assertEquals(4, t.toOriginalEnd(3));
    // whole first word: normalized [0,6) -> original [0,9)
    assertEquals(0, t.toOriginalStart(0));
    assertEquals(9, t.toOriginalEnd(6));
    // "jaźń": normalized [7,11) -> original [10,16)
    assertEquals(10, t.toOriginalStart(7));
    assertEquals(original.length(), t.toOriginalEnd(11));
    assertEquals(" jaz\u0301n\u0301", original.substring(t.toOriginalStart(6), t.toOriginalEnd(11)));
  }

  @Test
  void emojiBeforeAndAfterNfdKeepUtf16Offsets() {
    String original = "😀 z\u0307o\u0301łw 👍 kot";
    NfcText t = NfcText.of(original);
    assertEquals("😀 żółw 👍 kot", t.normalized());
    int kotN = t.normalized().indexOf("kot");
    assertEquals(original.indexOf("kot"), t.toOriginalStart(kotN));
    assertEquals(original.length(), t.toOriginalEnd(kotN + 3));
    int zolwN = t.normalized().indexOf("żółw");
    assertEquals("z\u0307o\u0301łw", original.substring(t.toOriginalStart(zolwN), t.toOriginalEnd(zolwN + 4)));
  }

  @Test
  void nonComposingCombiningMarksStayAndMapIdentically() {
    String original = "a\u0332b\u0332 ść"; // U+0332 combining low line has no precomposed form
    NfcText t = NfcText.of(original);
    assertEquals(original, t.normalized());
    assertEquals(original.indexOf("ść"), t.toOriginalStart(t.normalized().indexOf("ść")));
  }

  @Test
  void rangeInsideAComposedLetterExpandsToTheWholeOriginalCluster() {
    // Normalized "ę" is one unit; a range can't split it, but a zero-length or interior offset
    // must never land between the base letter and its combining mark in the original.
    String original = "ge\u0328s";
    NfcText t = NfcText.of(original);
    assertEquals("gęs", t.normalized());
    assertEquals(1, t.toOriginalStart(1));
    assertEquals(3, t.toOriginalEnd(2));
    assertEquals(3, t.toOriginalStart(2));
  }

  @Test
  void mappedRangesNeverSplitClustersOrSurrogatesAndCoverTheNormalizedText() {
    List<String> samples =
        List.of(
            Normalizer.normalize("Zażółć gęślą jaźń 😀 Łódź, że 𝔸 ŻÓŁW.", Normalizer.Form.NFD),
            "Mix: z\u0307 ż e\u0328\u0301 😀\u0301 a\u0332\u0301 \r\n koniec",
            "\u0301na początku znak łączący",
            "");
    for (String original : samples) {
      NfcText t = NfcText.of(original);
      String n = t.normalized();
      assertEquals(Normalizer.normalize(original, Normalizer.Form.NFC), n, original);
      for (int i = 0; i <= n.length(); i++) {
        for (int j = i; j <= n.length(); j++) {
          int s = t.toOriginalStart(i), e = t.toOriginalEnd(j);
          assertTrue(0 <= s && s <= e && e <= original.length(), original + " " + i + "," + j);
          assertFalse(splitsCluster(original, s), "start splits a cluster at " + s);
          assertFalse(splitsCluster(original, e), "end splits a cluster at " + e);
          String back = Normalizer.normalize(original.substring(s, e), Normalizer.Form.NFC);
          assertTrue(back.contains(n.substring(i, j)), () -> "range does not cover normalized text");
        }
      }
    }
  }

  private static boolean splitsCluster(String s, int at) {
    if (at <= 0 || at >= s.length()) return false;
    if (Character.isLowSurrogate(s.charAt(at))) return true;
    int type = Character.getType(s.codePointAt(at));
    boolean mark =
        type == Character.NON_SPACING_MARK
            || type == Character.COMBINING_SPACING_MARK
            || type == Character.ENCLOSING_MARK;
    // A leading mark at offset 0..k with no base is its own cluster; elsewhere a mark continues.
    return mark && !onlyMarksBefore(s, at);
  }

  private static boolean onlyMarksBefore(String s, int at) {
    for (int i = 0; i < at; ) {
      int cp = s.codePointAt(i);
      int type = Character.getType(cp);
      if (type != Character.NON_SPACING_MARK
          && type != Character.COMBINING_SPACING_MARK
          && type != Character.ENCLOSING_MARK) return false;
      i += Character.charCount(cp);
    }
    return true;
  }
}
