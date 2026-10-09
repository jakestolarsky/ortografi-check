package pl.ortografi.engine;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import org.languagetool.AnalyzedToken;
import org.languagetool.JLanguageTool;
import org.languagetool.Language;
import org.languagetool.Languages;
import org.languagetool.rules.RuleMatch;

/**
 * Wraps one {@link JLanguageTool} for Polish. Not thread-safe: LanguageTool documents that one
 * instance must not be used concurrently, so the adapter calls it sequentially.
 */
public final class LanguageToolChecker implements Checker {

  private static final String LANGUAGE = "pl-PL";
  private final JLanguageTool lt;
  private final PossessiveFromName.Lexicon names;

  /**
   * Our rules that ship switched off. ORTOGRAFI_NUM_COLLECTIVE_5PLUS ("pięć dzieci" -> "pięcioro")
   * is pending OrBity's decision: normative, but "pięć dzieci" is common in everyday writing.
   * Remove the id here to switch it on.
   */
  static final java.util.Set<String> OFF_BY_DEFAULT = java.util.Set.of("ORTOGRAFI_NUM_COLLECTIVE_5PLUS");

  public LanguageToolChecker() {
    this(OFF_BY_DEFAULT);
  }

  LanguageToolChecker(java.util.Set<String> disabledOwnRules) {
    Language polish = Languages.getLanguageForShortCode(LANGUAGE);
    this.lt = new JLanguageTool(polish);
    lt.addRule(new SubjectVerbCommaRule(JLanguageTool.getMessageBundle(polish)));
    for (org.languagetool.rules.patterns.AbstractPatternRule r : ownRules(polish, NUMERAL_RULES)) lt.addRule(r);
    for (String id : disabledOwnRules) lt.disableRule(id);
    this.names = new PossessiveFromName.Lexicon() {
      @Override
      public boolean isPersonalName(String name, String gender) {
        return LanguageToolChecker.isPersonalName(polish, name, gender);
      }

      @Override
      public boolean isFormOf(String form, String lemma) {
        return readings(polish, form).stream().anyMatch(r -> lemma.equals(r.getLemma()));
      }
    };
  }

  /** Our own rules in LanguageTool's XML format (category GRAMMAR); see NumeralRulesTest. */
  static final String NUMERAL_RULES = "/pl/ortografi/engine/rules/numerals.xml";

  static List<org.languagetool.rules.patterns.AbstractPatternRule> ownRules(Language polish, String resource) {
    try (java.io.InputStream in = LanguageToolChecker.class.getResourceAsStream(resource)) {
      if (in == null) throw new IllegalStateException("missing " + resource);
      return new org.languagetool.rules.patterns.PatternRuleLoader().getRules(in, resource, polish);
    } catch (IOException e) {
      throw new java.io.UncheckedIOException(e);
    }
  }

  private static List<AnalyzedToken> readings(Language polish, String word) {
    try {
      return polish.getTagger().tag(List.of(word)).get(0).getReadings();
    } catch (IOException e) {
      return List.of();
    }
  }

  /** A capitalised lemma equal to {@code name}, tagged subst:sg:nom with that gender. */
  /** A capitalised lemma equal to {@code name}, tagged subst:sg:nom with that gender. */
  private static boolean isPersonalName(Language polish, String name, String gender) {
    for (AnalyzedToken r : readings(polish, name)) {
      String tag = r.getPOSTag();
      if (name.equals(r.getLemma()) && tag != null && tag.startsWith("subst:sg:nom:")
          && List.of(tag.split(":")[3].split("\\.")).contains(gender)) {
        return true;
      }
    }
    return false;
  }

  @Override
  public List<Issue> check(String text) throws IOException {
    List<RuleMatch> matches = lt.check(text);
    List<Issue> issues = new ArrayList<>(matches.size());
    for (RuleMatch m : matches) {
      String covered = text.substring(m.getFromPos(), m.getToPos());
      if (FalsePositiveFilter.suppresses(m.getRule().getId(), covered)
          || (m.getRule().getId().equals("MORFOLOGIK_RULE_PL_PL")
              && PossessiveFromName.isLowercasePossessiveFromName(covered, names))) {
        continue;
      }
      // RuleMatch positions are Java String indexes, i.e. UTF-16 code units.
      String engineCategory = m.getRule().getCategory().getId().toString();
      String issueType = m.getRule().getLocQualityIssueType().toString();
      issues.add(
          new Issue(
              m.getFromPos(),
              m.getToPos(),
              m.getRule().getId(),
              CategoryMapper.map(
                  m.getRule().getId(), engineCategory, issueType,
                  text.substring(m.getFromPos(), m.getToPos())),
              engineCategory,
              issueType,
              PlainMessage.of(m.getMessage()),
              List.copyOf(m.getSuggestedReplacements())));
    }
    return oneIssuePerNumeralPhrase(issues, text);
  }

  /**
   * When a numeral rule and the numeral-subject verb rule hit the same phrase (no sentence end
   * between them), keep only the numeral issue: one error, one issue. Fixing the numeral and
   * re-checking still reports the verb if it is wrong.
   */
  static List<Issue> oneIssuePerNumeralPhrase(List<Issue> issues, String text) {
    List<Issue> numerals = issues.stream()
        .filter(i -> i.ruleId().startsWith("ORTOGRAFI_NUM_") && !i.ruleId().equals("ORTOGRAFI_NUM_VERB_PL"))
        .toList();
    if (numerals.isEmpty()) return issues;
    List<Issue> out = new ArrayList<>(issues.size());
    for (Issue i : issues) {
      boolean samePhrase = i.ruleId().equals("ORTOGRAFI_NUM_VERB_PL") && numerals.stream().anyMatch(n -> {
        int from = Math.min(n.end(), i.end()), to = Math.max(n.start(), i.start());
        return from > to || !text.substring(from, to).matches("(?s).*[.!?;].*");
      });
      if (!samePhrase) out.add(i);
    }
    return out;
  }

  @Override
  public String engineVersion() {
    return JLanguageTool.VERSION;
  }

  @Override
  public String languageCode() {
    return LANGUAGE;
  }
}
