package pl.ortografi.engine;

import java.util.ArrayList;
import java.util.List;

/**
 * Reports pure insertions as a zero-length range at the exact point. LanguageTool often marks a
 * whole span for a missing comma ("Wiem że" → "Wiem, że"); the adapter returns start == end at
 * the insertion point with the inserted text (",") as the replacement.
 *
 * <p>Applied only when every replacement inserts at the same point without changing the covered
 * text. The point is after the longest common prefix, so it is deterministic. A point inside a
 * surrogate pair or before a combining mark is never produced; such issues stay unchanged.
 * Runs on the original text (after {@link NormalizingChecker}), so offsets are original UTF-16.
 */
final class InsertionNarrowingChecker implements Checker {

  private final Checker inner;

  InsertionNarrowingChecker(Checker inner) {
    this.inner = inner;
  }

  @Override
  public List<Issue> check(String text) throws Exception {
    List<Issue> in = inner.check(text);
    List<Issue> out = new ArrayList<>(in.size());
    for (Issue i : in) out.add(narrow(text, i));
    return out;
  }

  static Issue narrow(String text, Issue i) {
    if (i.end() <= i.start() || i.replacements().isEmpty()) return i;
    String covered = text.substring(i.start(), i.end());
    int point = -1;
    List<String> inserted = new ArrayList<>();
    for (String r : i.replacements()) {
      if (r.length() <= covered.length()) return i;
      int p = 0;
      while (p < covered.length() && covered.charAt(p) == r.charAt(p)) p++;
      int q = 0;
      while (q < covered.length() - p
          && covered.charAt(covered.length() - 1 - q) == r.charAt(r.length() - 1 - q)) q++;
      if (p + q != covered.length()) return i; // changes the covered text: not a pure insertion
      int at = i.start() + p;
      if (point >= 0 && at != point) return i;
      point = at;
      inserted.add(r.substring(p, r.length() - q));
    }
    if (!isSafePoint(text, point)) return i;
    return new Issue(point, point, i.ruleId(), i.category(), i.engineCategory(), i.issueType(),
        i.message(), List.copyOf(inserted));
  }

  private static boolean isSafePoint(String text, int at) {
    if (at <= 0 || at >= text.length()) return true;
    if (Character.isLowSurrogate(text.charAt(at)) && Character.isHighSurrogate(text.charAt(at - 1))) return false;
    int type = Character.getType(text.codePointAt(at));
    return type != Character.NON_SPACING_MARK && type != Character.COMBINING_SPACING_MARK
        && type != Character.ENCLOSING_MARK;
  }

  @Override
  public String engineVersion() {
    return inner.engineVersion();
  }

  @Override
  public String languageCode() {
    return inner.languageCode();
  }
}
