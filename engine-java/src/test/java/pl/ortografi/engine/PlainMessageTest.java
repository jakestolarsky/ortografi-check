package pl.ortografi.engine;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;

class PlainMessageTest {

  @Test
  void suggestionTagsBecomePolishQuotesAroundTheInnerText() {
    assertEquals("Przed spójnikiem „że” stawiamy przecinek: „Wiem, że”.",
        PlainMessage.of("Przed spójnikiem „że” stawiamy przecinek: <suggestion>Wiem, że</suggestion>."));
    assertEquals("Może „a” albo „b”?", PlainMessage.of("Może <suggestion>a</suggestion> albo <suggestion>b</suggestion>?"));
  }

  @Test
  void leadingSpaceInsideTheSuggestionIsKeptOutsideTheQuotes() {
    assertEquals("Powinno być: „jest”.", PlainMessage.of("Powinno być: <suggestion> jest</suggestion>."));
  }

  @Test
  void plainMessagesAreUnchanged() {
    assertEquals("Wykryto prawdopodobny błąd pisowni", PlainMessage.of("Wykryto prawdopodobny błąd pisowni"));
    assertEquals("a < b > c", PlainMessage.of("a < b > c"));
  }
}
