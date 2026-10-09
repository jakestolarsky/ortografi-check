package pl.ortografi.engine;

import static org.junit.jupiter.api.Assertions.*;

import java.util.List;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

/**
 * Real engine: the adapter's own numeral rules (src/main/resources/.../numerals.xml). Sentences
 * are dev-style, not copied from the corpus.
 */
class NumeralRulesTest {

  private static LanguageToolChecker checker;

  @BeforeAll
  static void startEngine() {
    checker = new LanguageToolChecker();
  }

  private static List<Issue> ours(String text) throws Exception {
    return checker.check(text).stream().filter(i -> i.ruleId().startsWith("ORTOGRAFI_NUM_")).toList();
  }

  /** Exactly one of our issues, on {@code wrong}, grammar, top fix {@code fix}. */
  private static void assertFix(String rule, String text, String wrong, String fix) throws Exception {
    List<Issue> issues = ours(text);
    assertEquals(1, issues.size(), text + " -> " + issues);
    Issue i = issues.get(0);
    assertEquals(rule, i.ruleId(), text);
    assertEquals("grammar", i.category(), text);
    assertEquals(wrong, text.substring(i.start(), i.end()), text);
    assertEquals(fix, i.replacements().get(0), text + " -> " + i.replacements());
  }

  @Test
  void dwaWithAFeminineNounBecomesDwie() throws Exception {
    assertFix("ORTOGRAFI_NUM_DWA_F", "Na stole leżały dwa łyżki.", "dwa", "dwie");
    assertFix("ORTOGRAFI_NUM_DWA_F", "Dwa sąsiadki rozmawiały przez płot.", "Dwa", "Dwie");
    assertFix("ORTOGRAFI_NUM_DWA_F", "Kupiłem dwa ciepłe czapki.", "dwa", "dwie");
  }

  @Test
  void fivePlusWithAMasculinePersonalNounTakesThePieciuForm() throws Exception {
    assertFix("ORTOGRAFI_NUM_M1", "Sześć lekarzy dyżurowało w nocy.", "Sześć", "Sześciu");
    assertFix("ORTOGRAFI_NUM_M1", "W sali czekało siedem kierowców.", "siedem", "siedmiu");
  }

  @Test
  void pluralVerbAfterANumeralSubjectBecomesNeuterSingular() throws Exception {
    assertFix("ORTOGRAFI_NUM_VERB_PL", "Sześć osób przyjechali na wesele.", "przyjechali", "przyjechało");
    assertFix("ORTOGRAFI_NUM_VERB_PL", "Na zebranie przyszli siedem osób.", "przyszli", "przyszło");
  }

  @Test
  void pieciuWithANonPersonalNounAfterAVerbOfArrivalBecomesPiec() throws Exception {
    assertFix("ORTOGRAFI_NUM_M1_REVERSE", "Przyjechało sześciu turystek z Niemiec.", "sześciu", "sześć");
  }

  @Test
  void correctNumeralPhrasesAreNotFlagged() throws Exception {
    for (String ok : List.of(
        "Dwie kobiety czekały na przystanku.", "Dwa okna były otwarte.", "Trzy koleżanki przyszły.",
        "Dwaj panowie rozmawiali.", "Dwóch studentów zdało egzamin.", "Pięciu chłopców przyszło na trening.",
        "Pięć osób przyszło.", "Kilka osób czekało.", "Widzieli pięć osób na ulicy.", "Dwa razy dziennie.",
        "Zabrakło mi pięciu złotych.", "Z pięciu kandydatów dwaj przyszli.", "Pięć lat temu przyjechali do Polski.",
        "Czekali pięć godzin.", "Cztery dni padało.", "Oboje rodzice przyszli.")) {
      assertEquals(List.of(), ours(ok), ok);
    }
  }
}
