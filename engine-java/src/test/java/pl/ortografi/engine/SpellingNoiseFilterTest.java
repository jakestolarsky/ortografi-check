package pl.ortografi.engine;

import static org.junit.jupiter.api.Assertions.*;

import java.util.List;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

/** Spelling (MORFOLOGIK_RULE_PL_PL) matches the adapter treats as names or foreign text, not typos. */
class SpellingNoiseFilterTest {

  private static String reason(String text, String word, List<String> suggestions, String... otherFlagged) {
    int s = text.indexOf(word);
    List<int[]> others = new java.util.ArrayList<>();
    for (String o : otherFlagged) { int i = text.indexOf(o); others.add(new int[] {i, i + o.length()}); }
    return SpellingNoiseFilter.reason(text, s, s + word.length(), suggestions, others);
  }

  @Test
  void digitsAndMixedScripts() {
    assertEquals("digits-or-mixed-script", reason("Model XR7 ma nową baterię.", "XR7", List.of("XR")));
    assertEquals("digits-or-mixed-script", reason("Woda wrze w 100 °C pod ciśnieniem.", "°C", List.of("AC")));
    assertEquals("digits-or-mixed-script", reason("Napis Moskвa był krzywy.", "Moskвa", List.of()));
  }

  @Test
  void allCapsAcronyms() {
    assertEquals("all-caps", reason("Raport przygotowała agencja QWZX.", "QWZX", List.of("QWZ")));
    assertNotEquals("all-caps", reason("Raport przygotowała agencja Q.", "Q", List.of()), "one letter is not an acronym");
  }

  @Test
  void adjacentUnknownWordsAreAForeignPhraseOrABinomial() {
    assertEquals("foreign-phrase", reason("Gatunek Abrocoma budini żyje w Andach.", "Abrocoma", List.of(), "budini"));
    assertEquals("foreign-phrase", reason("Gatunek Abrocoma budini żyje w Andach.", "budini", List.of(), "Abrocoma"));
    assertNull(reason("Gatunek Abrocoma i budini.", "budini", List.of(), "Abrocoma"), "a word in between");
  }

  @Test
  void capitalisedMidSentenceWithoutACloseCapitalisedSuggestion() {
    assertEquals("name", reason("Spotkałem wczoraj Xiaolonga na konferencji.", "Xiaolonga", List.of("Ksiolonga")));
    // A close capitalised suggestion means a likely typo in a known name: keep it.
    assertNull(reason("Mieszkam w Lodzi od roku.", "Lodzi", List.of("Łodzi")));
    assertNull(reason("Wczoraj w Krakowei padało.", "Krakowei", List.of("Krakowie")), "transposition is distance 1");
    assertNull(reason("Krakowei to miasto.", "Krakowei", List.of()), "sentence start is not a name signal");
  }

  @Test
  void sentenceInitialWordIsNeverTreatedAsAName() {
    // "Pszyjehałem" is two edits from "Przyjechałem": no close suggestion, so only the position decides.
    List<String> far = List.of("Przyjechałem");
    for (String text : List.of("Pszyjehałem wczoraj.", "  Pszyjehałem wczoraj.", "Tak było. Pszyjehałem wczoraj.",
        "Tak było!  Pszyjehałem wczoraj.", "Tak było?\nPszyjehałem wczoraj.", "Tak było…\r\nPszyjehałem wczoraj.",
        "Lista zakupów\nPszyjehałem wczoraj.", "Powiedział: Pszyjehałem wczoraj.", "„Pszyjehałem wczoraj” – powiedział.",
        "Tak było. „Pszyjehałem wczoraj”.", "— Pszyjehałem wczoraj — powiedział.", "Tak było.\n– Pszyjehałem wczoraj.",
        "(Pszyjehałem wczoraj.)", "Tak było. [Pszyjehałem wczoraj.]", "»Pszyjehałem wczoraj«.", "“Pszyjehałem wczoraj”.",
        "Tak było.\n- Pszyjehałem wczoraj.", "Tak było. (\u201EPszyjehałem wczoraj”.)")) {
      assertNull(reason(text, "Pszyjehałem", far), text);
    }
    // Mid-sentence it is still a name; an opening quote or dash after a word does not start a sentence.
    assertEquals("name", reason("Spotkałem wczoraj Pszyjehałem.", "Pszyjehałem", far));
    assertEquals("name", reason("Spotkałem wczoraj „Xiaolonga” na konferencji.", "Xiaolonga", List.of()));
    assertEquals("name", reason("Spotkałem go — Xiaolonga — na konferencji.", "Xiaolonga", List.of()));
  }

  @Test
  void otherShapeFiltersDoNotHideASentenceInitialTypo() {
    List<String> far = List.of("Przyjechałem");
    // The next word is also unknown but has a close suggestion: still a typo pair, not a foreign phrase.
    assertNull(reason("Pszyjehałem wczorj do domu.", "Pszyjehałem", far, "wczorj"));
    assertNull(reason("Tak było. Pszyjehałem wczorj do domu.", "wczorj", List.of("wczoraj"), "Pszyjehałem"));
    // Two far typos in a row at sentence start: neither is hidden as a foreign phrase.
    assertNull(reason("Pszyjehałem wczorjjaj do domu.", "Pszyjehałem", far, "wczorjjaj"));
    assertNull(reason("Pszyjehałem wczorjjaj do domu.", "wczorjjaj", List.of("wczoraj"), "Pszyjehałem"));
    // A capitalised hyphenated word at sentence start is an ordinary compound, not a name.
    assertNull(reason("Biało-czerowny sztandar powiewał.", "Biało-czerowny", List.of("Biało-czerwony")));
    assertNull(reason("Tak było.\n„Biało-czerowny sztandar”.", "Biało-czerowny", List.of()));
    assertEquals("hyphenated-name", reason("Neuville-Vitasse leży we Francji.", "Neuville-Vitasse", List.of()),
        "both parts capitalised is still a name at sentence start");
  }

  @Test
  void hyphenatedNamesAndCenturies() {
    assertEquals("hyphenated-name", reason("Miasto Neuville-Vitasse leży we Francji.", "Neuville-Vitasse", List.of()));
    assertEquals("hyphenated-name", reason("To XIV-wieczny kościół.", "XIV-wieczny", List.of()));
    assertNull(reason("To było naprawdę bardzo-ładne.", "bardzo-ładne", List.of()));
  }

  @Test
  void nonPolishDiacritics() {
    assertEquals("foreign-letters", reason("Mieszkał w mieście Sète przez rok.", "Sète", List.of("Set")));
    assertEquals("foreign-letters", reason("Zamówił crème brûlée.", "brûlée", List.of()));
  }

  @Test
  void ordinaryLowercaseTyposAreKept() {
    assertNull(reason("Idę do szkołly.", "szkołly", List.of("szkoły")));
    assertNull(reason("Prosze zamknąć okno.", "Prosze", List.of("Proszę")));
    assertNull(reason("Kupiłem video na kasecie.", "video", List.of("wideo")), "q/v/x typos are kept");
  }

  private static LanguageToolChecker checker;

  @BeforeAll
  static void start() { checker = new LanguageToolChecker(); }

  private static List<Issue> spelling(String text) throws Exception {
    return checker.check(text).stream().filter(i -> i.ruleId().equals("MORFOLOGIK_RULE_PL_PL")).toList();
  }

  @Test
  void realEngineKeepsTyposAndDropsNames() throws Exception {
    for (String typo : List.of("Mieszkam w Warszawiee.", "Byłem w Gdańksu.", "Spotkałem Małgorzate wczoraj.",
        "Wczoraj w Krakowei padało.")) {
      assertEquals(1, spelling(typo).size(), typo);
    }
    assertEquals(1, spelling("Idę jutro do szkołly.").size());
    assertEquals(List.of(), spelling("Gatunek Abrocoma budini żyje w Andach."));
    assertEquals(List.of(), spelling("Spotkałem wczoraj Xiaolonga na konferencji."));
  }

  @Test
  void realEngineFlagsATypoInTheFirstWordOfASentence() throws Exception {
    for (String text : List.of("Wczorja poszłam do sklepu.", "Było zimno. Wczorja poszłam do sklepu.",
        "Było zimno.\nWczorja poszłam do sklepu.", "Powiedziała: „Wczorja poszłam do sklepu”.",
        "„Wczorja poszłam do sklepu” – powiedziała.", "— Wczorja poszłam do sklepu — powiedziała.",
        "Pszyjehałem wczoraj do domu.", "Było zimno.\n\nPszyjehałem wczoraj do domu.")) {
      List<Issue> sp = spelling(text);
      assertEquals(1, sp.size(), text);
      String first = text.contains("Wczorja") ? "Wczorja" : "Pszyjehałem";
      assertEquals(text.indexOf(first), sp.get(0).start(), text);
    }
  }
}
