package pl.ortografi.engine;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.BufferedReader;
import java.io.StringReader;
import java.io.StringWriter;
import java.util.List;
import org.junit.jupiter.api.Test;

/** Emits tests/corpus engine-result JSONL v1.0 (tests/corpus/FORMAT.md). */
class CorpusRunnerTest {

  private static final ObjectMapper JSON = new ObjectMapper();

  private static List<JsonNode> run(Checker checker, String corpus) throws Exception {
    StringWriter out = new StringWriter();
    new CorpusRunner(checker).run(new BufferedReader(new StringReader(corpus)), out);
    return out.toString().lines().map(l -> {
      try { return JSON.readTree(l); } catch (Exception e) { throw new AssertionError(l, e); }
    }).toList();
  }

  private static String line(String id, String text) throws Exception {
    return JSON.writeValueAsString(
        JSON.createObjectNode().put("schema_version", "1.0").put("id", id).put("text", text)
            .put("text_utf16_length", text.length()));
  }

  @Test
  void writesOneEngineResultLinePerCorpusExample() throws Exception {
    String text = "😀 Mam z\u0307o\u0301łw, wiem że.";
    List<JsonNode> out =
        run(new NormalizingChecker(new NormalizingCheckerTest.Fake()),
            line("p0-1", text) + "\n\n" + line("p0-2", "Czysto."));
    assertEquals(2, out.size());
    JsonNode r = out.get(0);
    assertEquals("1.0", r.get("schema_version").asText());
    assertEquals("p0-1", r.get("id").asText());
    assertEquals("complete", r.get("status").asText());
    assertEquals("languagetool-pl fake", r.get("engine").asText());
    JsonNode i = r.get("issues").get(0);
    assertEquals("z\u0307o\u0301łw", text.substring(i.get("start").asInt(), i.get("end").asInt()));
    assertEquals("spelling", i.get("category").asText());
    assertEquals("FAKE", i.get("rule_id").asText());
    assertEquals("żółwie", i.get("replacements").get(0).asText());
    assertTrue(i.has("message"));
    assertEquals("TYPOS", i.get("engine_category").asText());
    assertEquals(0, out.get(1).get("issues").size());
  }

  @Test
  void engineFailureIsAnErrorLineNotACleanOne() throws Exception {
    Checker broken = new NormalizingCheckerTest.Fake() {
      @Override public List<Issue> check(String text) { throw new IllegalStateException("x"); }
    };
    JsonNode r = run(broken, line("p0-9", "Tekst.")).get(0);
    assertEquals("error", r.get("status").asText());
    assertEquals("p0-9", r.get("id").asText());
    assertEquals(0, r.get("issues").size());
  }

  @Test
  void rejectsCorpusLineWithWrongUtf16LengthAsError() throws Exception {
    String bad = "{\"schema_version\":\"1.0\",\"id\":\"p0-x\",\"text\":\"😀\",\"text_utf16_length\":1}";
    JsonNode r = run(new NormalizingCheckerTest.Fake(), bad).get(0);
    assertEquals("error", r.get("status").asText());
  }
}
