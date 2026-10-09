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
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.stream.Stream;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

/**
 * Adapter output against Desktop's contracts/v1 (copied from PR #8 into test resources until it
 * merges), with the real engine, the shared examples and the corpus-built fixtures.
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

  private static JsonNode example(String name) throws Exception {
    try (InputStream in = ProtocolContractTest.class.getResourceAsStream("/contracts/v1/examples/" + name + ".json")) {
      assertNotNull(in, name);
      return JSON.readTree(in);
    }
  }

  /**
   * The corpus fixtures' ranges and fixes are authoritative; their ruleIds and messages are
   * representative only (contracts/README.md), so those are not compared.
   */
  private static JsonNode assertMatchesCorpusFixture(String id) throws Exception {
    JsonNode req = example("corpus-" + id + "-check");
    JsonNode expected = example("corpus-" + id + "-result");
    List<JsonNode> msgs = run(engine, 100_000, JSON.writeValueAsString(req));
    msgs.forEach(ProtocolContractTest::assertValid);
    JsonNode res = msgs.get(1);
    assertEquals("result", res.get("type").asText(), res.toString());
    assertEquals(req.get("id"), res.get("id"));
    assertEquals(req.get("docVersion"), res.get("docVersion"));
    assertEquals(req.get("settingsVersion"), res.get("settingsVersion"));
    assertEquals(expected.get("issues").size(), res.get("issues").size(), res.toString());
    for (JsonNode want : expected.get("issues")) {
      JsonNode got = issueAt(res, want.get("start").asInt(), want.get("end").asInt());
      assertEquals(want.get("category"), got.get("category"), got.toString());
      List<?> reps = JSON.convertValue(got.get("replacements"), List.class);
      for (JsonNode r : want.get("replacements")) assertTrue(reps.contains(r.asText()), r + " not in " + reps);
      assertFalse(got.get("message").asText().contains("<suggestion>"), got.toString());
    }
    return res;
  }

  @Test
  void p0_0003_missingCommaIsAZeroLengthInsertionWithPlainMessage() throws Exception {
    JsonNode i = assertMatchesCorpusFixture("p0-0003").get("issues").get(0);
    assertEquals(List.of(","), JSON.convertValue(i.get("replacements"), List.class));
    assertTrue(i.get("message").asText().contains("„Wiem, że”"), i.toString());
  }

  private static String devText(String file, String id) throws Exception {
    for (String line : java.nio.file.Files.readAllLines(java.nio.file.Path.of("../tests/corpus/data/" + file + ".jsonl"))) {
      JsonNode e = JSON.readTree(line);
      if (e.get("id").asText().equals(id)) return e.get("text").asText();
    }
    throw new AssertionError(id);
  }

  /** Real engine, dev corpus texts: an extra comma is reported as exactly the comma with "". */
  @Test
  void extraCommasAreTheCommaOnlyWithEmptyFix() throws Exception {
    String[][] cases = {{"phase0-starter", "p0-0001", "13"}, {"phase1-dev", "p1-0160", "14"},
        {"phase0-starter", "p0-0043", "10"}};
    for (String[] c : cases) {
      String text = devText(c[0], c[1]);
      JsonNode res = run(engine, 100_000, check(c[1], text)).get(1);
      assertValid(res);
      int at = Integer.parseInt(c[2]);
      JsonNode i = issueAt(res, at, at + 1);
      assertEquals(",", text.substring(at, at + 1), c[1]);
      assertEquals(List.of(""), JSON.convertValue(i.get("replacements"), List.class), c[1]);
      assertEquals("punctuation", i.get("category").asText(), c[1]);
    }
  }

  @Test
  void p0_0059_rangeAfterEmojiIsUnchanged() throws Exception {
    assertMatchesCorpusFixture("p0-0059");
  }

  @Test
  void p0_0063_rangeOnTheNfdOriginal() throws Exception {
    String text = example("corpus-p0-0063-check").get("text").asText();
    assertNotEquals(java.text.Normalizer.normalize(text, java.text.Normalizer.Form.NFC), text, "fixture text is NFD");
    JsonNode i = assertMatchesCorpusFixture("p0-0063").get("issues").get(0);
    assertEquals("żaba", i.get("replacements").get(0).asText());
  }

  @Test
  void p0_0061_zwjFamilyEmojiHasNoIssues() throws Exception {
    assertMatchesCorpusFixture("p0-0061");
  }

  @Test
  void checksWithMissingOrNonNumericVersionsAreMalformedWithoutVersions() throws Exception {
    List<JsonNode> msgs = run(engine, 100_000,
        "{\"protocol\":1,\"type\":\"check\",\"id\":\"m1\",\"settingsVersion\":1,\"text\":\"a\"}",
        "{\"protocol\":1,\"type\":\"check\",\"id\":\"m2\",\"docVersion\":\"7\",\"settingsVersion\":1,\"text\":\"a\"}",
        "{\"protocol\":1,\"type\":\"check\",\"id\":\"m3\",\"docVersion\":1,\"settingsVersion\":null,\"text\":\"a\"}",
        "{\"protocol\":1,\"type\":\"check\",\"id\":\"m4\",\"docVersion\":1.5,\"settingsVersion\":1,\"text\":\"a\"}",
        "{\"protocol\":1,\"type\":\"check\",\"id\":\"m5\",\"docVersion\":1,\"settingsVersion\":{\"v\":1},\"text\":\"a\"}");
    assertEquals(6, msgs.size(), msgs.toString());
    for (JsonNode e : msgs.subList(1, 6)) {
      assertValid(e);
      assertEquals("MALFORMED_REQUEST", e.get("code").asText(), e.toString());
      assertFalse(e.has("docVersion") || e.has("settingsVersion"), e.toString());
    }
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
