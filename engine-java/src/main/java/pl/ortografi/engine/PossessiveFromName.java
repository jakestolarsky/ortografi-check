package pl.ortografi.engine;

final class PossessiveFromName {
  interface NameLexicon { boolean isPersonalName(String name, String gender); }
  static boolean isLowercasePossessiveFromName(String word, NameLexicon names) {
    throw new UnsupportedOperationException("TODO");
  }
}
