package pl.ortografi.engine;

import java.util.List;

/** The engine boundary. Implementations are not required to be thread-safe. */
public interface Checker {
  List<Issue> check(String text) throws Exception;

  String engineVersion();

  String languageCode();
}
