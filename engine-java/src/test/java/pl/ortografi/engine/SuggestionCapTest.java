package pl.ortografi.engine;

import static org.junit.jupiter.api.Assertions.*;

import java.util.List;
import org.junit.jupiter.api.Test;

class SuggestionCapTest {

  @Test
  void capIsFive() {
    assertEquals(5, SuggestionCap.MAX_REPLACEMENTS);
  }

  @Test
  void longerListsKeepTheFirstFiveInOrder() {
    assertEquals(List.of("a", "b", "c", "d", "e"),
        SuggestionCap.cap(List.of("a", "b", "c", "d", "e", "f", "g", "h")));
  }

  @Test
  void shorterOrEqualListsAreUnchanged() {
    assertEquals(List.of(), SuggestionCap.cap(List.of()));
    assertEquals(List.of(""), SuggestionCap.cap(List.of("")));
    assertEquals(List.of("c", "a", "b"), SuggestionCap.cap(List.of("c", "a", "b")));
    assertEquals(List.of("1", "2", "3", "4", "5"), SuggestionCap.cap(List.of("1", "2", "3", "4", "5")));
  }
}
