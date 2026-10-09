package pl.ortografi.engine;

import static org.junit.jupiter.api.Assertions.*;

import java.util.List;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

/**
 * Typos in Polish place names and first names mid-sentence (1 to 3 edits: insertions, deletions,
 * substitutions, swaps, missing diacritics) must be reported, while correct rare place names stay
 * clean. Our own sentences, written for this test.
 */
class PlaceNameTyposTest {

  private static LanguageToolChecker checker;

  @BeforeAll
  static void start() { checker = new LanguageToolChecker(); }

  private static List<Issue> spelling(String text) throws Exception {
    return checker.check(text).stream().filter(i -> i.ruleId().equals("MORFOLOGIK_RULE_PL_PL")).toList();
  }

  static final List<String> TYPOS = List.of(
      "Wróciłem wczoraj z Warszway.",
      "Mieszkam w Warszwie od lat.",
      "Mieszkam w Wraszwaie od lat.",
      "Mieszkam w Warszwiee od lat.",
      "Jechaliśmy pod Wrcłwaem.",
      "Byłem w Wroclawiu na koncercie.",
      "Byłem we Wrclawiu.",
      "Pojechaliśmy do Gdńskaa.",
      "Pojechaliśmy do Gadnska.",
      "Spacerowaliśmy po Krakwoie.",
      "Spacerowaliśmy po Krkowiee.",
      "Lubię warszwski klimat.",
      "Lubię wrcoawski rynek.",
      "Mieszkam pod Lublniem.",
      "Mieszkam pod Lubelinem.",
      "Jadę do Bydgszczy.",
      "Jadę do Szcecina.",
      "Wracam z Rzszowa.",
      "Wracam z Rszeszowa.",
      "Wracam z Rzeszwoaa.",
      "Rozmawiałem z Małogrzatą.",
      "Rozmawiałem z Małgrozatą.",
      "Dzwoniłem do Katażyny.",
      "Dzwoniłem do Kartazyny.",
      "Spotkałem Krzysztfoa.",
      "Spotkałem Krzyszotfa.",
      "Byłem u Wojicecha.",
      "Mieszkam w Częstochwie.",
      "Mieszkam w Czestochwoie.",
      "Jadę do Białmstoku.",
      "Jadę do Bilaegostoku.",
      "Pracuję w Katowciach.",
      "Pracuję w Ktaowicach.",
      "Wypoczywam w Zakopnaem.",
      "Wypoczywam w Zakopaniuu.",
      "Spotkałem się z Agnieszkka.",
      "Spotkałem się z Agniesza.",
      "Mieszkam w Olsztnyie.",
      "Jadę nad Bałtkyk.",
      "Jadę do Szczciena.");

  static final List<String> CORRECT = List.of(
      "Mieszkam w Pszczynie od lat.",
      "Wracam z Żółkiewki.",
      "Pojechaliśmy do Szczebrzeszyna.",
      "Byłem w Mszanie Dolnej.",
      "Spacerowaliśmy po Kazimierzu Dolnym.",
      "Jadę do Ińska nad jeziorem.",
      "Odwiedziłem Brzeszcze i Oświęcim.",
      "Mieszkam pod Wąchockiem.",
      "Jedziemy przez Pcim.",
      "Wracamy z Ustrzyk Dolnych.",
      "Spotkałem Bożydara i Wszebora.",
      "Rozmawiałem z Gościsławą.",
      "Byłem w Tykocinie i Choroszczy.",
      "Pojechaliśmy do Łęczycy.",
      "Mieszkam w Zduńskiej Woli.",
      "Jechaliśmy przez Węgorzewo i Gołdap.",
      "Wypoczywamy w Krynicy-Zdroju.",
      "Mieszkam w Ostrowcu Świętokrzyskim.",
      "Jadę do Kłodzka przez Bardo.",
      "Odwiedziłem Sandomierz i Opatów.");

  @Test
  void typosInNamesAreReported() throws Exception {
    for (String text : TYPOS) assertFalse(spelling(text).isEmpty(), text);
  }

  @Test
  void rareButRealPlaceNamesAreNotFlagged() throws Exception {
    for (String text : CORRECT) assertEquals(List.of(), spelling(text), text);
  }
}
