package pl.ortografi.engine;

import java.text.Normalizer;
import java.util.ArrayList;
import java.util.List;

/**
 * An NFC analysis copy of a text plus a map from NFC offsets back to the original's UTF-16
 * offsets. The original is never modified (PLAN.md section 4); only the copy given to the engine
 * is normalised.
 *
 * <p>The original is cut into segments: a starter code point followed by its combining marks
 * (adjacent segments are merged when NFC composes across them). Each segment is normalised on
 * its own, so segment boundaries correspond exactly in both texts. An offset inside a segment
 * whose length or content changed (or which holds several code units) maps outward: a range
 * start to the segment start, a range end to the segment end. Mapped ranges therefore never
 * split a surrogate pair or a base letter from its marks. If the input is already NFC, the
 * same String instance is used and the map is the identity.
 */
public final class NfcText {

  private final String original;
  private final String normalized;
  private final int[] startMap; // normalized offset -> original offset, for range starts
  private final int[] endMap; // normalized offset -> original offset, for range ends

  private NfcText(String original, String normalized, int[] startMap, int[] endMap) {
    this.original = original;
    this.normalized = normalized;
    this.startMap = startMap;
    this.endMap = endMap;
  }

  public static NfcText of(String original) {
    if (Normalizer.isNormalized(original, Normalizer.Form.NFC)) {
      return new NfcText(original, original, null, null);
    }
    List<int[]> segs = segments(original); // {origStart, origEnd}
    StringBuilder norm = new StringBuilder(original.length());
    List<String> parts = new ArrayList<>(segs.size());
    for (int[] s : segs) {
      String p = Normalizer.normalize(original.substring(s[0], s[1]), Normalizer.Form.NFC);
      parts.add(p);
      norm.append(p);
    }
    String full = Normalizer.normalize(original, Normalizer.Form.NFC);
    if (!full.contentEquals(norm)) {
      // Safety net for scripts with exotic cross-segment composition: one coarse segment.
      segs = List.of(new int[] {0, original.length()});
      parts = List.of(full);
    }
    int n = full.length();
    int[] startMap = new int[n + 1];
    int[] endMap = new int[n + 1];
    int x = 0;
    for (int k = 0; k < segs.size(); k++) {
      int a = segs.get(k)[0], b = segs.get(k)[1];
      int len = parts.get(k).length();
      startMap[x] = a;
      endMap[x] = a;
      for (int p = x + 1; p < x + len; p++) {
        startMap[p] = a;
        endMap[p] = b;
      }
      x += len;
    }
    startMap[n] = original.length();
    endMap[n] = original.length();
    return new NfcText(original, full, startMap, endMap);
  }

  private static List<int[]> segments(String s) {
    List<int[]> out = new ArrayList<>();
    int segStart = 0;
    for (int i = 0; i < s.length(); ) {
      int cp = s.codePointAt(i);
      if (i > 0 && !continuesCluster(cp)) {
        out.add(new int[] {segStart, i});
        segStart = i;
      }
      i += Character.charCount(cp);
    }
    if (segStart < s.length() || out.isEmpty()) out.add(new int[] {segStart, s.length()});
    // Merge neighbours when NFC composes across the boundary (e.g. Hangul L+V, rare starters).
    List<int[]> merged = new ArrayList<>();
    for (int[] seg : out) {
      if (!merged.isEmpty()) {
        int[] prev = merged.get(merged.size() - 1);
        String a = s.substring(prev[0], prev[1]), b = s.substring(seg[0], seg[1]);
        String together = Normalizer.normalize(a + b, Normalizer.Form.NFC);
        String apart =
            Normalizer.normalize(a, Normalizer.Form.NFC) + Normalizer.normalize(b, Normalizer.Form.NFC);
        if (!together.equals(apart)) {
          prev[1] = seg[1];
          continue;
        }
      }
      merged.add(seg);
    }
    return merged;
  }

  private static boolean continuesCluster(int cp) {
    int t = Character.getType(cp);
    return t == Character.NON_SPACING_MARK
        || t == Character.COMBINING_SPACING_MARK
        || t == Character.ENCLOSING_MARK;
  }

  public String original() {
    return original;
  }

  public String normalized() {
    return normalized;
  }

  public boolean changed() {
    return startMap != null;
  }

  /** Original offset for a range starting at normalized offset {@code i}. */
  public int toOriginalStart(int i) {
    return startMap == null ? i : startMap[i];
  }

  /** Original offset for a range ending (exclusive) at normalized offset {@code i}. */
  public int toOriginalEnd(int i) {
    return endMap == null ? i : endMap[i];
  }
}
