package pl.ortografi.engine;

import java.util.ArrayList;
import java.util.List;

/**
 * Reports punctuation edits as the minimal edit: the common prefix and suffix between the
 * engine's span and each replacement are trimmed. A missing comma becomes a zero-length range
 * with "," ("Wiem że" 0..7 → "Wiem, że" becomes 4..4 → ","). An extra comma becomes a range
 * covering only the comma with "" ("chleb, i" 13..16 → " i" becomes 13..14 → ""), so the
 * following space stays.
 *
 * <p>Applied only when the trimmed edit is punctuation only: what is removed and what is
 * inserted consist of punctuation characters ({@code \p{P}}), and every replacement trims to the
 * same range. Letter, digit and space edits ("Poszłem" → "Poszedłem", "wogóle" → "w ogóle",
 * "kotaa" → "kota") keep the engine's whole-word range, as do mixed edits ("Mimo, że" → "Mimo
 * iż"), and so do punctuation edits inside a word ("email" → "e-mail"). Trimming takes the longest common prefix first, so the result is deterministic. A range
 * edge inside a surrogate pair or before a combining mark is never produced; such issues stay
 * unchanged. Runs on the original text (after {@link NormalizingChecker}), so offsets are
 * original UTF-16 code units.
 */
final class MinimalEditChecker implements Checker {

  private final Checker inner;

  MinimalEditChecker(Checker inner) {
    this.inner = inner;
  }

  @Override
  public List<Issue> check(String text) throws Exception {
    List<Issue> in = inner.check(text);
    List<Issue> out = new ArrayList<>(in.size());
    for (Issue i : in) out.add(minimal(text, i));
    return out;
  }

  static Issue minimal(String text, Issue i) {
    if (i.replacements().isEmpty() || i.end() < i.start()) return i;
    String covered = text.substring(i.start(), i.end());
    int start = -1;
    int end = -1;
    List<String> inserted = new ArrayList<>();
    for (String r : i.replacements()) {
      int max = Math.min(covered.length(), r.length());
      int p = 0;
      while (p < max && covered.charAt(p) == r.charAt(p)) p++;
      int q = 0;
      while (q < max - p
          && covered.charAt(covered.length() - 1 - q) == r.charAt(r.length() - 1 - q)) q++;
      String removed = covered.substring(p, covered.length() - q);
      String added = r.substring(p, r.length() - q);
      if (removed.isEmpty() && added.isEmpty()) return i; // replacement equals the text
      if (!isPunctuation(removed) || !isPunctuation(added)) return i;
      int s = i.start() + p;
      int e = i.end() - q;
      if (start >= 0 && (s != start || e != end)) return i;
      start = s;
      end = e;
      inserted.add(added);
    }
    if (start == i.start() && end == i.end()) return i;
    if (!isSafeEdge(text, start) || !isSafeEdge(text, end)) return i;
    // Inside a word ("e|mail", "e-|mail") the fix is a word correction: keep the word range.
    if (start > 0 && end < text.length()
        && Character.isLetterOrDigit(text.codePointBefore(start))
        && Character.isLetterOrDigit(text.codePointAt(end))) return i;
    return new Issue(start, end, i.ruleId(), i.category(), i.engineCategory(), i.issueType(),
        i.message(), List.copyOf(inserted));
  }

  private static boolean isPunctuation(String s) {
    return s.codePoints().allMatch(c -> switch (Character.getType(c)) {
      case Character.CONNECTOR_PUNCTUATION, Character.DASH_PUNCTUATION, Character.START_PUNCTUATION,
          Character.END_PUNCTUATION, Character.INITIAL_QUOTE_PUNCTUATION,
          Character.FINAL_QUOTE_PUNCTUATION, Character.OTHER_PUNCTUATION -> true;
      default -> false;
    });
  }

  private static boolean isSafeEdge(String text, int at) {
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
