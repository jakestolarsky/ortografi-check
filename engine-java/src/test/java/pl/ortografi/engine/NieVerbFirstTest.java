package pl.ortografi.engine;

import static org.junit.jupiter.api.Assertions.*;

import java.util.List;
import java.util.Set;
import java.util.function.Predicate;
import org.junit.jupiter.api.Test;

/** "nie" with verbs is written separately: such a split suggestion goes first. */
class NieVerbFirstTest {

  private static final Predicate<String> VERBS = Set.of("wiem", "chcę", "lubię")::contains;

  @Test
  void splitBeforeAVerbMovesToTheTopAndTheRestKeepOrder() {
    assertEquals(List.of("Nie wiem", "Niewidem", "Niewie", "Niewieś"),
        NieVerbFirst.reorder("Niewiem", List.of("Niewidem", "Niewie", "Nie wiem", "Niewieś"), VERBS));
    assertEquals(List.of("nie chcę", "niechęć"),
        NieVerbFirst.reorder("niechcę", List.of("niechęć", "nie chcę"), VERBS));
  }

  @Test
  void nonVerbSplitsAndOtherTokensAreLeftAlone() {
    List<String> reps = List.of("niebieski", "nie bieski");
    assertEquals(reps, NieVerbFirst.reorder("niebieskie", reps, VERBS));
    List<String> lub = List.of("Lubię", "Nie lubię");
    assertEquals(lub, NieVerbFirst.reorder("Lubiee", lub, VERBS)); // token doesn't start with nie
    List<String> none = List.of("Niewiele");
    assertEquals(none, NieVerbFirst.reorder("Niewiem", none, VERBS));
    assertEquals(List.of(), NieVerbFirst.reorder("Niewiem", List.of(), VERBS));
  }

  @Test
  void alreadyFirstIsUnchanged() {
    List<String> reps = List.of("Nie wiem", "Niewidem");
    assertEquals(reps, NieVerbFirst.reorder("Niewiem", reps, VERBS));
  }

  @Test
  void onlyFiniteAndOtherVerbFormsCountNotParticiplesOrGerunds() {
    assertTrue(NieVerbFirst.isVerbTag("verb:fin:sg:pri:imperf:nonrefl"));
    assertTrue(NieVerbFirst.isVerbTag("verb:praet:sg:m1:imperf"));
    assertFalse(NieVerbFirst.isVerbTag("ppas:sg:nom.voc:m1.m2.m3:imperf:aff"));
    assertFalse(NieVerbFirst.isVerbTag("pact:sg:nom.voc:m1.m2.m3:imperf:aff"));
    assertFalse(NieVerbFirst.isVerbTag("ger:sg:nom.acc:n2:imperf:aff"));
    assertFalse(NieVerbFirst.isVerbTag("adj:sg:nom.voc:m1.m2.m3:pos"));
    assertFalse(NieVerbFirst.isVerbTag(null));
  }
}
