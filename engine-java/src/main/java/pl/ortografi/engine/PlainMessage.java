package pl.ortografi.engine;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * LanguageTool messages carry {@code <suggestion>…</suggestion>} markup. The protocol's
 * {@code message} is plain text (the UI never renders it as HTML), so each suggestion becomes its
 * inner text in Polish quotes: „…”. Whitespace inside the tag is trimmed.
 */
final class PlainMessage {

  private static final Pattern SUGGESTION = Pattern.compile("<suggestion>(.*?)</suggestion>", Pattern.DOTALL);

  private PlainMessage() {}

  static String of(String message) {
    if (message == null) return "";
    Matcher m = SUGGESTION.matcher(message);
    StringBuilder out = new StringBuilder();
    while (m.find()) {
      m.appendReplacement(out, Matcher.quoteReplacement("„" + m.group(1).strip() + "”"));
    }
    m.appendTail(out);
    return out.toString();
  }
}
