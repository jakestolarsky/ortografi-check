package pl.ortografi.engine;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.networknt.schema.JsonSchema;
import com.networknt.schema.JsonSchemaFactory;
import com.networknt.schema.SpecVersion;
import com.networknt.schema.ValidationMessage;
import java.io.BufferedReader;
import java.io.InputStream;
import java.io.StringReader;
import java.io.StringWriter;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.stream.Stream;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

/**
 * Adapter output against the draft protocol contract (copied into test resources until Desktop
 * commits contracts/), with the real engine and texts from the corpus.
 */
class ProtocolContractTest {

  private static final ObjectMapper JSON = new ObjectMapper();
  private static JsonSchema schema;
  private static Checker engine;

  @BeforeAll
  static void load() throws Exception {
    try (InputStream in = ProtocolContractTest.class.getResourceAsStream("/contracts/v1/protocol.schema.json")) {
      schema = JsonSchemaFactory.getInstance(SpecVersion.VersionFlag.V202012).getSchema(in);
    }
    engine = Main.engine();
  }

  private static void assertValid(JsonNode msg) {
    Set<ValidationMessage> errors = schema.validate(msg);
    assertTrue(errors.isEmpty(), msg + " -> " + errors);
  }

  private static String corpusText(String id) throws Exception {
    for (String line : Files.readAllLines(Path.of("../tests/corpus/data/phase0-starter.jsonl"), StandardCharsets.UTF_8)) {
      JsonNode e = JSON.readTree(line);
      if (e.get("id").asText().equals(id)) return e.get("text").asText();
    }
    throw new AssertionError("no corpus example " + id);
  }

  private static List<JsonNode> run(Checker checker, int limit, String... lines) throws Exception {
    StringWriter out = new StringWriter();
    new Adapter(checker, limit).run(new BufferedReader(new StringReader(String.join("\n", lines) + "\n")), out);
    List<JsonNode> msgs = new ArrayList<>();
    for (String l : out.toString().split("\n")) if (!l.isEmpty()) msgs.add(JSON.readTree(l));
    return msgs;
  }

  private static String check(String id, String text) throws Exception {
    return JSON.writeValueAsString(JSON.createObjectNode().put("protocol", 1).put("type", "check")
        .put("id", id).put("docVersion", 7).put("settingsVersion", 3).put("text", text));
  }

  private static JsonNode issueAt(JsonNode result, int start, int end) {
    for (JsonNode i : result.get("issues")) {
      if (i.get("start").asInt() == start && i.get("end").asInt() == end) return i;
    }
    throw new AssertionError("no issue " + start + ".." + end + " in " + result);
  }

  @Test
  void sharedExamplesAreValid() throws Exception {
    try (Stream<Path> files = Files.list(Path.of(ProtocolContractTest.class.getResource("/contracts/v1/examples").toURI()))) {
      for (Path f : files.toList()) assertValid(JSON.readTree(f.toFile()));
    }
  }

  @Test
  void missingCommaIsAZeroLengthInsertionWithPlainMessage() throws Exception {
    String text = corpusText("p0-0003"); // "Wiem że to nie będzie łatwe."
    List<JsonNode> msgs = run(engine, 100_000, check("c1", text));
    msgs.forEach(ProtocolContractTest::assertValid);
    JsonNode i = issueAt(msgs.get(1), 4, 4);
    assertEquals(List.of(","), JSON.convertValue(i.get("replacements"), List.class));
    String message = i.get("message").asText();
    assertFalse(message.contains("<"), message);
    assertTrue(message.contains("„Wiem, że”"), message);
  }

  @Test
  void replacementRangesAreUnchanged() throws Exception {
    String p59 = corpusText("p0-0059"); // emoji before the range
    JsonNode r59 = run(engine, 100_000, check("c2", p59)).get(1);
    assertValid(r59);
    JsonNode i59 = issueAt(r59, 29, 37);
    assertEquals("dziekuje", p59.substring(29, 37));
    assertTrue(JSON.convertValue(i59.get("replacements"), List.class).contains("dziękuję"), i59.toString());

    String p63 = corpusText("p0-0063"); // NFD original: offsets count the combining marks
    assertNotEquals(java.text.Normalizer.normalize(p63, java.text.Normalizer.Form.NFC), p63);
    JsonNode r63 = run(engine, 100_000, check("c3", p63)).get(1);
    assertValid(r63);
    JsonNode i63 = issueAt(r63, 9, 14);
    assertEquals("żaba", i63.get("replacements").get(0).asText());
  }

  @Test
  void everyAdapterMessageKindIsValid() throws Exception {
    List<JsonNode> msgs = run(engine, 10,
        "{not json",
        "{\"protocol\":2,\"type\":\"check\",\"id\":\"e1\",\"docVersion\":1,\"settingsVersion\":1,\"text\":\"a\"}",
        "{\"protocol\":1,\"type\":\"nope\",\"id\":\"e2\"}",
        "{\"protocol\":1,\"type\":\"check\",\"id\":\"e3\",\"docVersion\":1,\"text\":\"a\"}",
        check("e4", "Ten tekst jest za długi."),
        check("e5", "Wiem że kotaa."));
    assertEquals(7, msgs.size(), msgs.toString());
    msgs.forEach(ProtocolContractTest::assertValid);
  }
}
