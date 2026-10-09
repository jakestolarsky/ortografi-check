package pl.ortografi.engine;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.IOException;
import java.io.OutputStreamWriter;
import java.io.Writer;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

/**
 * Runs tests/corpus examples through the engine and writes engine-result JSONL v1.0
 * (tests/corpus/FORMAT.md, schema engine-result.v1.schema.json).
 *
 * <p>{@code java -cp ... pl.ortografi.engine.CorpusRunner corpus.jsonl... > results.jsonl}
 */
public final class CorpusRunner {

  private static final ObjectMapper JSON = new ObjectMapper();
  private final Checker checker;

  public CorpusRunner(Checker checker) {
    this.checker = checker;
  }

  public void run(BufferedReader corpus, Writer out) throws IOException {
    String line;
    int lineNo = 0;
    while ((line = corpus.readLine()) != null) {
      lineNo++;
      if (line.isBlank()) continue;
      JsonNode ex;
      try {
        ex = JSON.readTree(line);
      } catch (IOException e) {
        System.err.println("corpus line " + lineNo + ": not JSON, skipped");
        continue;
      }
      String id = ex.path("id").asText(null);
      if (id == null) {
        System.err.println("corpus line " + lineNo + ": no id, skipped");
        continue;
      }
      ObjectNode res =
          JSON.createObjectNode()
              .put("schema_version", "1.0")
              .put("id", id)
              .put("engine", "languagetool-pl " + checker.engineVersion());
      ArrayNode arr = JSON.createArrayNode();
      String status = "complete";
      JsonNode text = ex.get("text");
      if (text == null
          || !text.isTextual()
          || (ex.has("text_utf16_length") && ex.get("text_utf16_length").asInt() != text.asText().length())) {
        status = "error";
        res.put("error", "corpus line has no text or a wrong text_utf16_length");
      } else {
        try {
          for (Issue i : checker.check(text.asText())) {
            ObjectNode o =
                arr.addObject()
                    .put("start", i.start())
                    .put("end", i.end())
                    .put("category", i.category())
                    .put("rule_id", i.ruleId())
                    .put("message", i.message())
                    .put("engine_category", i.engineCategory());
            ArrayNode reps = o.putArray("replacements");
            i.replacements().forEach(reps::add);
          }
        } catch (Exception | StackOverflowError e) {
          status = "error";
          arr.removeAll();
          res.put("error", e.getClass().getName());
        }
      }
      res.put("status", status);
      res.set("issues", arr);
      out.write(JSON.writeValueAsString(res));
      out.write('\n');
    }
    out.flush();
  }

  public static void main(String[] args) throws Exception {
    Writer out = new BufferedWriter(new OutputStreamWriter(System.out, StandardCharsets.UTF_8));
    CorpusRunner runner = new CorpusRunner(Main.engine());
    for (String f : args.length == 0 ? List.of("-") : List.of(args)) {
      try (BufferedReader in =
          f.equals("-")
              ? new BufferedReader(new java.io.InputStreamReader(System.in, StandardCharsets.UTF_8))
              : Files.newBufferedReader(Path.of(f), StandardCharsets.UTF_8)) {
        runner.run(in, out);
      }
    }
    out.flush();
  }
}
