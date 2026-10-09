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
 * <p>Whitespace-only edits are minimal too: a missing space is a zero-length " " insertion
 * ("2025r." → "2025 r." becomes " " at 22..22, "50zł" → "50 zł" at 14..14) and an extra space
 * is a deletion of only that space with "" ("Mam  dwa" 3..5 → " " becomes 4..5 → "";
 * " ," → "," becomes the space → ""). Duplicate replacements left by trimming are dropped.
 *
 * <p>Otherwise applied only to punctuation edits: what is removed is punctuation only, and what is inserted is punctuation or whitespace (a missing space after a comma:
 * ",co" → ", co" becomes " " at the point), every replacement trims to the same range, and the edit is not
 * inside a word. Letter and digit edits ("Poszłem" → "Poszedłem", "kotaa" → "kota") and
 * in-word spaces ("wogóle" → "w ogóle") keep the engine's whole-word range, as do mixed edits ("Mimo, że" → "Mimo
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
    boolean onlySpaceInsertions = true;
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
      // Either a punctuation edit (punctuation removed; punctuation or space inserted) or a pure
      // whitespace insertion or deletion (" ," → "," and "  " → " " delete only the space).
      boolean punctuationEdit = isPunctuation(removed) && isPunctuationOrSpace(added);
      boolean whitespaceEdit = removed.isEmpty() != added.isEmpty()
          && isWhitespace(removed) && isWhitespace(added);
      if (!punctuationEdit && !whitespaceEdit) return i;
      if (!(whitespaceEdit && removed.isEmpty())) onlySpaceInsertions = false;
      // Whitespace trimming is for typographic spacing only: a double space, a space next to
      // punctuation, or a missing space at a digit-letter boundary ("2025r.", "50zł"). A space
      // inserted or removed between two letters ("Nielubię" → "Nie lubię", "Na przeciwko" →
      // "Naprzeciwko") is a spelling fix and keeps the whole-word replacement.
      if (!punctuationEdit
          && !isTypographicSpacing(text, i.start() + p, i.end() - q, removed.isEmpty())) return i;
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
        && Character.isLetterOrDigit(text.codePointAt(end))
        // ...except a space between a number and its unit or abbreviation ("50|zł", "2025|r.").
        && !(onlySpaceInsertions && start == end && Character.isDigit(text.codePointBefore(start))
            && Character.isLetter(text.codePointAt(end)))) return i;
    return new Issue(start, end, i.ruleId(), i.category(), i.engineCategory(), i.issueType(),
        i.message(), inserted.stream().distinct().toList());
  }

  private static boolean isTypographicSpacing(String text, int start, int end, boolean insertion) {
    if (start <= 0 || end >= text.length()) return true;
    int before = text.codePointBefore(start);
    int after = text.codePointAt(end);
    if (isSpaceOrPunctuation(before) || isSpaceOrPunctuation(after)) return true;
    return insertion && Character.isDigit(before) && Character.isLetter(after);
  }

  private static boolean isSpaceOrPunctuation(int c) {
    return isPunctuationOrSpace(new String(Character.toChars(c)));
  }

  private static boolean isWhitespace(String s) {
    return s.codePoints().allMatch(c -> Character.isWhitespace(c) || Character.isSpaceChar(c));
  }

  private static boolean isPunctuation(String s) {
    return s.codePoints().noneMatch(c -> Character.isWhitespace(c) || Character.isSpaceChar(c)) && isPunctuationOrSpace(s);
  }

  private static boolean isPunctuationOrSpace(String s) {
    return s.codePoints().allMatch(c -> Character.isWhitespace(c) || Character.isSpaceChar(c) || switch (Character.getType(c)) {
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
