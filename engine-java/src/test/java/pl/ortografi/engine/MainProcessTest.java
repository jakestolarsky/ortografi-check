package pl.ortografi.engine;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.io.Writer;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;

/** End-to-end: the real process speaks JSON lines over stdin/stdout in UTF-8. */
class MainProcessTest {

  @Test
  void realProcessAnswersCheckAndExitsOnShutdown() throws Exception {
    String java = Path.of(System.getProperty("java.home"), "bin", "java").toString();
    Process p =
        new ProcessBuilder(java, "-cp", System.getProperty("java.class.path"), Main.class.getName())
            .redirectError(ProcessBuilder.Redirect.DISCARD)
            .start();
    ObjectMapper json = new ObjectMapper();
    try (BufferedReader out =
            new BufferedReader(new InputStreamReader(p.getInputStream(), StandardCharsets.UTF_8));
        Writer in = new OutputStreamWriter(p.getOutputStream(), StandardCharsets.UTF_8)) {
      JsonNode ready = json.readTree(out.readLine());
      assertEquals("ready", ready.get("type").asText());
      assertEquals("6.8", ready.get("engineVersion").asText());

      String text = "Zażółć 😀 kotaa.";
      in.write(
          json.writeValueAsString(
                  json.createObjectNode()
                      .put("protocol", 1)
                      .put("type", "check")
                      .put("id", "e2e")
                      .put("docVersion", 1)
                      .put("settingsVersion", 1)
                      .put("text", text))
              + "\n");
      in.flush();
      JsonNode res = json.readTree(out.readLine());
      assertEquals("result", res.get("type").asText());
      assertEquals("e2e", res.get("id").asText());
      JsonNode issue = res.get("issues").get(0);
      assertEquals(
          "kotaa", text.substring(issue.get("start").asInt(), issue.get("end").asInt()));

      in.write("{\"protocol\":1,\"type\":\"shutdown\"}\n");
      in.flush();
      assertNull(out.readLine(), "stdout carries protocol messages only");
    }
    assertTrue(p.waitFor(30, TimeUnit.SECONDS));
    assertEquals(0, p.exitValue());
  }
}
