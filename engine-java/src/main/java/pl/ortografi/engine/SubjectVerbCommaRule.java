package pl.ortografi.engine;

import java.util.List;
import java.util.ResourceBundle;
import org.languagetool.AnalyzedSentence;
import org.languagetool.AnalyzedToken;
import org.languagetool.AnalyzedTokenReadings;
import org.languagetool.rules.Categories;
import org.languagetool.rules.ITSIssueType;
import org.languagetool.rules.Rule;
import org.languagetool.rules.RuleMatch;

/**
 * Comma between a sentence-initial subject and its verb ("Mój starszy brat, pracuje…"). Written
 * to be conservative; it only fires when all of these hold:
 *
 * <ol>
 *   <li>the sentence starts with 0–4 adjectives + a noun in the nominative, all agreeing, and
 *       nothing else before the first comma;
 *   <li>right after the comma comes (optionally "nie" and) a third-person finite verb (present,
 *       past or "będzie") that agrees with the noun in number (and gender for the past tense),
 *       and has no noun/adjective reading;
 *   <li>no second comma or dash within {@value #INSERTION_WINDOW} tokens after the comma, so a
 *       parenthetical insertion ("Tata, zdaje się, wyjechał.") is not mistaken for the verb;
 *   <li>no other nominative-only noun agreeing with the verb follows before the next comma, so
 *       a vocative ("Kasia, dzwoni mama.") is not mistaken for the subject.
 * </ol>
 *
 * Relative clauses, appositions, parentheses and participle clauses never match (2).
 */
final class SubjectVerbCommaRule extends Rule {

  static final String ID = "ORTOGRAFI_PRZECINEK_PODMIOT_ORZECZENIE";
  private static final int MAX_ADJECTIVES = 4;
  static final int INSERTION_WINDOW = 4;

  SubjectVerbCommaRule(ResourceBundle messages) {
    super(messages);
    setCategory(Categories.PUNCTUATION.getCategory(messages));
    setLocQualityIssueType(ITSIssueType.Typographical);
  }

  @Override
  public String getId() {
    return ID;
  }

  @Override
  public String getDescription() {
    return "Zbędny przecinek między podmiotem a orzeczeniem";
  }

  @Override
  public RuleMatch[] match(AnalyzedSentence sentence) {
    AnalyzedTokenReadings[] t = sentence.getTokensWithoutWhitespace();
    int comma = -1;
    for (int i = 1; i < t.length; i++) {
      if (t[i].getToken().equals(",")) {
        comma = i;
        break;
      }
    }
    // t[0] is SENT_START; the noun phrase is t[1 .. comma-1].
    if (comma < 2 || comma - 2 > MAX_ADJECTIVES || comma + 1 >= t.length) {
      return new RuleMatch[0];
    }
    for (int i = comma + 1; i < t.length && i <= comma + INSERTION_WINDOW; i++) {
      if (t[i].getToken().matches("[,\u2013\u2014-]")) {
        return new RuleMatch[0];
      }
    }
    int v = comma + 1;
    if (t[v].getToken().equalsIgnoreCase("nie") && v + 1 < t.length) {
      v++;
    }
    for (String[] noun : readings(t[comma - 1], "subst")) {
      if (!has(noun[2], "nom")) {
        continue;
      }
      String number = noun[1];
      String gender = noun[3];
      if (!adjectivesAgree(t, 1, comma - 1, number, gender) || isNounOrAdj(t[v])
          || !verbAgrees(t[v], number, gender) || laterSubject(t, v + 1, number)) {
        continue;
      }
      RuleMatch m = new RuleMatch(this, sentence, t[comma].getStartPos(), t[comma].getEndPos(),
          "Podmiotu nie oddziela się przecinkiem od orzeczenia.", "Zbędny przecinek");
      m.setSuggestedReplacement("");
      return new RuleMatch[] {m};
    }
    return new RuleMatch[0];
  }

  private static boolean adjectivesAgree(AnalyzedTokenReadings[] t, int from, int to, String number, String gender) {
    for (int i = from; i < to; i++) {
      boolean ok = false;
      for (String[] a : readings(t[i], "adj")) {
        ok |= a[1].equals(number) && has(a[2], "nom") && genderMatches(a[3], gender);
      }
      if (!ok) {
        return false;
      }
    }
    return true;
  }

  private static boolean verbAgrees(AnalyzedTokenReadings tok, String number, String gender) {
    for (String[] r : readings(tok, "verb")) {
      if (r.length < 4 || !r[2].equals(number)) {
        continue;
      }
      switch (r[1]) {
        case "fin", "bedzie" -> {
          if (r[3].equals("ter")) {
            return true;
          }
        }
        case "praet" -> {
          if (r.length > 4 && r[4].equals("ter") && genderMatches(r[3], gender)) {
            return true;
          }
        }
        default -> { }
      }
    }
    return false;
  }

  private static boolean laterSubject(AnalyzedTokenReadings[] t, int from, String number) {
    for (int i = from; i < t.length && !t[i].getToken().equals(","); i++) {
      boolean nom = false;
      boolean acc = false;
      for (String[] r : readings(t[i], "subst")) {
        nom |= r[1].equals(number) && has(r[2], "nom");
        acc |= has(r[2], "acc");
      }
      if (nom && !acc) {
        return true;
      }
    }
    return false;
  }

  private static boolean isNounOrAdj(AnalyzedTokenReadings tok) {
    return !readings(tok, "subst").isEmpty() || !readings(tok, "adj").isEmpty();
  }

  /** Readings of the given class, as tag fields: [class, number, case(s), gender(s), ...]. */
  private static List<String[]> readings(AnalyzedTokenReadings tok, String cls) {
    return tok.getReadings().stream()
        .map(AnalyzedToken::getPOSTag)
        .filter(p -> p != null && p.startsWith(cls + ":"))
        .map(p -> p.split(":"))
        .filter(f -> f.length >= 4)
        .toList();
  }

  private static boolean has(String dotted, String value) {
    for (String s : dotted.split("\\.")) {
      if (s.equals(value)) {
        return true;
      }
    }
    return false;
  }

  private static boolean genderMatches(String dotted, String gender) {
    for (String g : gender.split("\\.")) {
      if (has(dotted, g)) {
        return true;
      }
    }
    return false;
  }
}
