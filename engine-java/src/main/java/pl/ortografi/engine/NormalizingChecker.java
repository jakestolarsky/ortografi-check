package pl.ortografi.engine;

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
      out.add(
          new Issue(start, end, i.ruleId(), i.category(), i.engineCategory(), i.issueType(),
              i.message(), i.replacements()));
    }
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
