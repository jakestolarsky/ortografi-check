package pl.ortografi.engine;

import java.util.List;

public final class NormalizingChecker implements Checker {
  public NormalizingChecker(Checker delegate) {}
  @Override public List<Issue> check(String text) { throw new UnsupportedOperationException("TODO"); }
  @Override public String engineVersion() { throw new UnsupportedOperationException("TODO"); }
  @Override public String languageCode() { throw new UnsupportedOperationException("TODO"); }
}
