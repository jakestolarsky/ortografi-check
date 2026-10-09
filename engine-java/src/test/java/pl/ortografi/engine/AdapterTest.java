package pl.ortografi.engine;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.BufferedReader;
import java.io.StringReader;
import java.io.StringWriter;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

/** Protocol behaviour with a controlled fake engine (fast; no LanguageTool). */
class AdapterTest {

  private static final ObjectMapper JSON = new ObjectMapper();

  /** Fake engine: flags every occurrence of "zle" and records what it was asked. */
  static final class FakeChecker implements Checker {
    final List<String> seen = new ArrayList<>();
    RuntimeException failWith;

    @Override
    public List<Issue> check(String text) {
      seen.add(text);
      if (failWith != null) throw failWith;
      List<Issue> out = new ArrayList<>();
      for (int at = text.indexOf("zle"); at >= 0; at = text.indexOf("zle", at + 1)) {
        out.add(new Issue(at, at + 3, "FAKE_RULE", "TYPOS", "misspelling", "Błąd", List.of("źle")));
      }
      return out;
    }

    @Override
    public String engineVersion() {
      return "fake-1";
    }

    @Override
    public String languageCode() {
      return "pl-PL";
    }
  }

  private static List<JsonNode> run(Adapter adapter, String... inputLines) throws Exception {
    StringWriter out = new StringWriter();
    adapter.run(new BufferedReader(new StringReader(String.join("\n", inputLines) + "\n")), out);
    List<JsonNode> msgs = new ArrayList<>();
    for (String line : out.toString().split("\n", -1)) {
      if (!line.isEmpty()) msgs.add(JSON.readTree(line));
    }
    assertTrue(out.toString().endsWith("\n"), "every message ends with a newline");
    return msgs;
  }

  private static String check(String id, String text) throws Exception {
    return JSON.writeValueAsString(
        JSON.createObjectNode()
            .put("protocol", 1)
            .put("type", "check")
            .put("id", id)
            .put("docVersion", 7)
            .put("settingsVersion", 3)
            .put("text", text));
  }

  @Test
  void sendsReadyFirst() throws Exception {
    List<JsonNode> msgs = run(new Adapter(new FakeChecker(), 100), "{\"protocol\":1,\"type\":\"shutdown\"}");
    JsonNode ready = msgs.get(0);
    assertEquals("ready", ready.get("type").asText());
    assertEquals(1, ready.get("protocol").asInt());
    assertEquals("fake-1", ready.get("engineVersion").asText());
    assertEquals("pl-PL", ready.get("language").asText());
  }

  @Test
  void checkReturnsIssuesWithUtf16RangesAndEchoesVersions() throws Exception {
    FakeChecker fake = new FakeChecker();
    String text = "😀 Jest zle.\nBardzo zle.";
    List<JsonNode> msgs = run(new Adapter(fake, 100), check("r1", text));
    assertEquals(List.of(text), fake.seen, "text reaches the engine unchanged, newline included");
    JsonNode res = msgs.get(1);
    assertEquals("result", res.get("type").asText());
    assertEquals("r1", res.get("id").asText());
    assertEquals(7, res.get("docVersion").asLong());
    assertEquals(3, res.get("settingsVersion").asLong());
    assertEquals("complete", res.get("status").asText());
    assertEquals("fake-1", res.get("engineVersion").asText());
    JsonNode issues = res.get("issues");
    assertEquals(2, issues.size());
    assertEquals(text.indexOf("zle"), issues.get(0).get("start").asInt());
    assertEquals(text.indexOf("zle") + 3, issues.get(0).get("end").asInt());
    assertEquals("FAKE_RULE", issues.get(0).get("ruleId").asText());
    assertEquals("źle", issues.get(0).get("replacements").get(0).asText());
    assertTrue(res.get("analysisMs").isNumber());
  }

  @Test
  void eachMessageIsExactlyOneLine() throws Exception {
    StringWriter out = new StringWriter();
    new Adapter(new FakeChecker(), 100)
        .run(new BufferedReader(new StringReader(check("r1", "a\nzle\r\nb") + "\n")), out);
    String[] lines = out.toString().split("\n");
    assertEquals(2, lines.length, out::toString);
  }

  @Test
  void malformedJsonGivesErrorAndKeepsServing() throws Exception {
    List<JsonNode> msgs = run(new Adapter(new FakeChecker(), 100), "{not json", check("r2", "zle"));
    assertEquals("error", msgs.get(1).get("type").asText());
    assertEquals("MALFORMED_REQUEST", msgs.get(1).get("code").asText());
    assertEquals("r2", msgs.get(2).get("id").asText());
    assertEquals("result", msgs.get(2).get("type").asText());
  }

  @Test
  void missingTextIsMalformedAndEchoesId() throws Exception {
    List<JsonNode> msgs =
        run(new Adapter(new FakeChecker(), 100), "{\"protocol\":1,\"type\":\"check\",\"id\":\"r3\"}");
    assertEquals("MALFORMED_REQUEST", msgs.get(1).get("code").asText());
    assertEquals("r3", msgs.get(1).get("id").asText());
  }

  @Test
  void unknownProtocolVersionIsRejected() throws Exception {
    List<JsonNode> msgs =
        run(new Adapter(new FakeChecker(), 100), "{\"protocol\":2,\"type\":\"check\",\"id\":\"r4\",\"text\":\"x\"}");
    assertEquals("UNSUPPORTED_PROTOCOL", msgs.get(1).get("code").asText());
    assertEquals("r4", msgs.get(1).get("id").asText());
  }

  @Test
  void unknownMessageTypeIsRejected() throws Exception {
    List<JsonNode> msgs =
        run(new Adapter(new FakeChecker(), 100), "{\"protocol\":1,\"type\":\"dance\",\"id\":\"r5\"}");
    assertEquals("UNKNOWN_TYPE", msgs.get(1).get("code").asText());
  }

  @Test
  void textLimitIsCountedInUtf16UnitsAndNeverTruncates() throws Exception {
    FakeChecker fake = new FakeChecker();
    // 5 emoji = 5 code points but 10 UTF-16 units; limit 9 must reject it.
    List<JsonNode> msgs = run(new Adapter(fake, 9), check("r6", "😀😀😀😀😀"), check("r7", "😀😀😀😀a"));
    assertEquals("error", msgs.get(1).get("type").asText());
    assertEquals("TEXT_TOO_LONG", msgs.get(1).get("code").asText());
    assertEquals("r6", msgs.get(1).get("id").asText());
    assertEquals("result", msgs.get(2).get("type").asText());
    assertEquals(List.of("😀😀😀😀a"), fake.seen, "oversized text never reaches the engine");
  }

  @Test
  void engineFailureIsAnErrorNotACleanResultAndDoesNotEchoText() throws Exception {
    FakeChecker fake = new FakeChecker();
    fake.failWith = new IllegalStateException("boom: tajny tekst użytkownika");
    List<JsonNode> msgs = run(new Adapter(fake, 100), check("r8", "tajny tekst użytkownika"));
    JsonNode err = msgs.get(1);
    assertEquals("error", err.get("type").asText());
    assertEquals("ENGINE_ERROR", err.get("code").asText());
    assertEquals("r8", err.get("id").asText());
    assertFalse(err.toString().contains("tajny"), "user text must not leak into protocol errors");
  }

  @Test
  void shutdownStopsProcessingFurtherInput() throws Exception {
    FakeChecker fake = new FakeChecker();
    List<JsonNode> msgs =
        run(new Adapter(fake, 100), "{\"protocol\":1,\"type\":\"shutdown\"}", check("r9", "zle"));
    assertEquals(1, msgs.size(), "only ready; nothing after shutdown");
    assertTrue(fake.seen.isEmpty());
  }

  @Test
  void endOfInputEndsTheLoop() throws Exception {
    StringWriter out = new StringWriter();
    new Adapter(new FakeChecker(), 100).run(new BufferedReader(new StringReader("")), out);
    assertTrue(out.toString().contains("\"ready\""));
  }
}
