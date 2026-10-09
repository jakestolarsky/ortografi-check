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
   * written in NFC, that would silently recompose untouched decomposed words (PLAN.md section
   * 4). Work at word granularity: leading and trailing tokens (words, or single non-word
   * clusters) of the original range whose NFC form the suggestion keeps are copied verbatim; the
   * edited middle, including any word the fix touches, is the suggestion's NFC text. This matches
   * the corpus convention (tests/corpus/FORMAT.md): a fixed word is written in NFC, while the
   * rest of the text keeps its form.
   */
  static String inOriginalForm(NfcText nfc, int normStart, int normEnd, int origStart, int origEnd, String r) {
    String norm = nfc.normalized();
    int nos = nfc.toNormalized(origStart), noe = nfc.toNormalized(origEnd);
    // Suggestion widened to the whole original range (it may cover more clusters than the match).
    String expanded = norm.substring(nos, normStart) + r + norm.substring(normEnd, noe);
    List<String> toks = tokens(nfc.original().substring(origStart, origEnd));
    int i = 0, p = 0;
    while (i < toks.size()) {
      String n = Normalizer.normalize(toks.get(i), Normalizer.Form.NFC);
      if (!expanded.startsWith(n, p)) break;
      p += n.length();
      i++;
    }
    int j = toks.size(), q = expanded.length();
    while (j > i) {
      String n = Normalizer.normalize(toks.get(j - 1), Normalizer.Form.NFC);
      if (q - n.length() < p || !expanded.startsWith(n, q - n.length())) break;
      q -= n.length();
      j--;
    }
    // A kept word must not run straight into the edited text: if the edit continues that word
    // (e.g. "żółw" -> "żółwie"), the whole word is part of the edit and is written in NFC.
    while (i > 0 && p < q && isWord(toks.get(i - 1)) && isWordChar(expanded.codePointAt(p))) {
      i--;
      p -= Normalizer.normalize(toks.get(i), Normalizer.Form.NFC).length();
    }
    while (j < toks.size() && p < q && isWord(toks.get(j)) && isWordChar(expanded.codePointBefore(q))) {
      q += Normalizer.normalize(toks.get(j), Normalizer.Form.NFC).length();
      j++;
    }
    StringBuilder b = new StringBuilder();
    for (int k = 0; k < i; k++) b.append(toks.get(k));
    b.append(expanded, p, q);
    for (int k = j; k < toks.size(); k++) b.append(toks.get(k));
    return b.toString();
  }

  private static boolean isWord(String token) {
    return isWordChar(token.codePointAt(0));
  }

  private static boolean isWordChar(int cp) {
    int t = Character.getType(cp);
    return Character.isLetterOrDigit(cp)
        || t == Character.NON_SPACING_MARK
        || t == Character.COMBINING_SPACING_MARK
        || t == Character.ENCLOSING_MARK;
  }

  /** Word tokens (runs of letter/digit clusters, marks included) and single other clusters. */
  private static List<String> tokens(String s) {
    List<String> out = new ArrayList<>();
    StringBuilder word = new StringBuilder();
    for (String c : NfcText.clusters(s)) {
      if (Character.isLetterOrDigit(c.codePointAt(0))) {
        word.append(c);
      } else {
        if (word.length() > 0) {
          out.add(word.toString());
          word.setLength(0);
        }
        out.add(c);
      }
    }
    if (word.length() > 0) out.add(word.toString());
    return out;
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
