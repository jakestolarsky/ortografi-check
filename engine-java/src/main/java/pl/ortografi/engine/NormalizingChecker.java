package pl.ortografi.engine;

import java.text.Normalizer;
import java.util.ArrayList;
import java.util.List;

/**
 * Gives the engine an NFC copy of the text and maps every range back to the caller's original
 * UTF-16 offsets. LanguageTool's Polish dictionary only knows precomposed letters, so NFD input
 * ("z" + U+0307) would otherwise be reported as misspelt.
 */
public final class NormalizingChecker implements Checker {

  private final Checker delegate;

  public NormalizingChecker(Checker delegate) {
    this.delegate = delegate;
  }

  @Override
  public List<Issue> check(String text) throws Exception {
    NfcText nfc = NfcText.of(text);
    List<Issue> found = delegate.check(nfc.normalized());
    if (!nfc.changed()) return found;
    List<Issue> out = new ArrayList<>(found.size());
    for (Issue i : found) {
      int start = nfc.toOriginalStart(i.start());
      int end = i.start() == i.end() ? start : nfc.toOriginalEnd(i.end());
      List<String> reps = new ArrayList<>(i.replacements().size());
      for (String r : i.replacements()) reps.add(inOriginalForm(nfc, i.start(), i.end(), start, end, r));
      out.add(
          new Issue(start, end, i.ruleId(), i.category(), i.engineCategory(), i.issueType(),
              i.message(), List.copyOf(reps)));
    }
    return out;
  }

  /**
   * Re-expresses an NFC suggestion for the original range so that applying it changes only what
   * the engine meant to change. LanguageTool suggests whole spans ("Wiem że" -> "Wiem, że");
   * written in NFC, that would silently recompose untouched decomposed letters (PLAN.md section
   * 4). Clusters at the start and end of the original range whose NFC form the suggestion keeps
   * are copied verbatim; only the differing middle is new (NFC) text.
   */
  static String inOriginalForm(NfcText nfc, int normStart, int normEnd, int origStart, int origEnd, String r) {
    String norm = nfc.normalized();
    int nos = nfc.toNormalized(origStart), noe = nfc.toNormalized(origEnd);
    // Suggestion widened to the whole original range (it may cover more clusters than the match).
    String expanded = norm.substring(nos, normStart) + r + norm.substring(normEnd, noe);
    List<String> segs = NfcText.clusters(nfc.original().substring(origStart, origEnd));
    int i = 0, p = 0;
    while (i < segs.size()) {
      String n = Normalizer.normalize(segs.get(i), Normalizer.Form.NFC);
      if (!expanded.startsWith(n, p)) break;
      p += n.length();
      i++;
    }
    int j = segs.size(), q = expanded.length();
    while (j > i) {
      String n = Normalizer.normalize(segs.get(j - 1), Normalizer.Form.NFC);
      if (q - n.length() < p || !expanded.startsWith(n, q - n.length())) break;
      q -= n.length();
      j--;
    }
    StringBuilder b = new StringBuilder();
    for (int k = 0; k < i; k++) b.append(segs.get(k));
    b.append(expanded, p, q);
    for (int k = j; k < segs.size(); k++) b.append(segs.get(k));
    return b.toString();
  }

  @Override
  public String engineVersion() {
    return delegate.engineVersion();
  }

  @Override
  public String languageCode() {
    return delegate.languageCode();
  }
}
