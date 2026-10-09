package pl.ortografi.engine;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
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

  public LanguageToolChecker() {
    Language polish = Languages.getLanguageForShortCode(LANGUAGE);
    this.lt = new JLanguageTool(polish);
  }

  @Override
  public List<Issue> check(String text) throws IOException {
    List<RuleMatch> matches = lt.check(text);
    List<Issue> issues = new ArrayList<>(matches.size());
    for (RuleMatch m : matches) {
      if (FalsePositiveFilter.suppresses(m.getRule().getId(), text.substring(m.getFromPos(), m.getToPos()))) {
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
