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

  public LanguageToolChecker() {
    Language polish = Languages.getLanguageForShortCode(LANGUAGE);
    this.lt = new JLanguageTool(polish);
    lt.addRule(new SubjectVerbCommaRule(JLanguageTool.getMessageBundle(polish)));
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
              m.getMessage(),
              List.copyOf(m.getSuggestedReplacements())));
    }
    return issues;
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
