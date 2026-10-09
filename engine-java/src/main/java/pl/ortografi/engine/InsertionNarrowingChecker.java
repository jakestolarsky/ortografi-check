package pl.ortografi.engine;

import java.io.IOException;
import java.util.List;

final class InsertionNarrowingChecker implements Checker {
  private final Checker inner;
  InsertionNarrowingChecker(Checker inner) { this.inner = inner; }
  public List<Issue> check(String text) throws IOException { throw new UnsupportedOperationException("TODO"); }
  public String engineVersion() { return inner.engineVersion(); }
  public String languageCode() { return inner.languageCode(); }
}
