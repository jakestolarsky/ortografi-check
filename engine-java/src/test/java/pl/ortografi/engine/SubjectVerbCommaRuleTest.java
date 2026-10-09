package pl.ortografi.engine;

import static org.junit.jupiter.api.Assertions.*;

import java.util.List;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

/** Real engine: the adapter's own rule for a comma between a sentence-initial subject and its verb. */
class SubjectVerbCommaRuleTest {

  private static LanguageToolChecker checker;

  @BeforeAll
  static void startEngine() {
    checker = new LanguageToolChecker();
  }

  private static List<Issue> ours(String text) throws Exception {
    return checker.check(text).stream()
        .filter(i -> i.ruleId().equals(SubjectVerbCommaRule.ID))
        .toList();
  }

  private static void assertFlagsOnlyTheComma(String text) throws Exception {
    List<Issue> issues = ours(text);
    assertEquals(1, issues.size(), text + " -> " + issues);
    Issue i = issues.get(0);
    assertEquals(",", text.substring(i.start(), i.end()), text);
    assertEquals(text.indexOf(','), i.start(), text);
    assertEquals(List.of(""), i.replacements(), text);
    assertEquals("punctuation", i.category(), text);
  }

  @Test
  void commaBetweenSubjectAndVerbIsFlagged() throws Exception {
    assertFlagsOnlyTheComma("Mój starszy brat, pracuje w szpitalu."); // corpus p0-0004
    assertFlagsOnlyTheComma("Ta kobieta, pracowała w banku.");
    assertFlagsOnlyTheComma("Nasi sąsiedzi, mieszkają tu od lat.");
    assertFlagsOnlyTheComma("Mój brat, nie pracuje w szpitalu.");
    assertFlagsOnlyTheComma("Nowy samochód, stoi przed domem.");
  }

  @Test
  void flaggedInLaterSentencesWithCorrectOffsets() throws Exception {
    String text = "Był wieczór 😀. Mój starszy brat, pracuje w szpitalu.";
    List<Issue> issues = ours(text);
    assertEquals(1, issues.size(), issues.toString());
    assertEquals(text.lastIndexOf(','), issues.get(0).start());
  }

  @Test
  void legitimateCommasAreNotFlagged() throws Exception {
    for (String t : new String[] {
        "Mój brat, który pracuje w szpitalu, jest lekarzem.", // relative clause
        "Mój brat, Jan, pracuje w szpitalu.", // apposition
        "Mój brat, jak wiadomo, pracuje w szpitalu.", // parenthesis
        "Mój brat, pracując w szpitalu, poznał żonę.", // participle clause
        "Kasia, zrobiłaś to?", // vocative + 2nd person
        "Kasia, przyszedł listonosz.", // vocative; verb agrees with another subject
        "Mamo, dzwoni babcia.", // vocative form
        "Kasiu, dzwoni mama.",
        "Kasia, dzwoni mama.", // nominative used as vocative, later subject
        "Brat, siostra i ja pracujemy razem.", // enumeration
        "Wczoraj, gdy padało, brat pracował w domu.",
        "Mój starszy brat pracuje w szpitalu.",
        "Jan, Piotr i Maria przyszli."}) {
      assertEquals(List.of(), ours(t), t);
    }
  }
}
