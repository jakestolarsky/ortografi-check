package pl.ortografi.engine;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.Writer;

/**
 * JSON-lines protocol v1 (experimental, phase 0). One message per line in each direction; text
 * newlines travel escaped inside JSON. Requests are handled sequentially. Nothing but protocol
 * messages is written to {@code out}; diagnostics belong on stderr and never include user text.
 *
 * <p>Out: {@code ready}, {@code result}, {@code error}. In: {@code check}, {@code shutdown}.
 */
public final class Adapter {

  public static final int PROTOCOL = 1;
  private static final ObjectMapper JSON = new ObjectMapper();

  private final Checker checker;
  private final int maxTextUtf16Units;

  public Adapter(Checker checker, int maxTextUtf16Units) {
    this.checker = checker;
    this.maxTextUtf16Units = maxTextUtf16Units;
  }

  /** Serves until a {@code shutdown} message or end of input. */
  public void run(BufferedReader in, Writer out) throws IOException {
    send(
        out,
        msg("ready")
            .put("engineVersion", checker.engineVersion())
            .put("language", checker.languageCode()));
    String line;
    while ((line = in.readLine()) != null) {
      if (line.isBlank()) continue;
      if (!handle(line, out)) return;
    }
  }

  /** @return false when the loop must stop. */
  private boolean handle(String line, Writer out) throws IOException {
    JsonNode req;
    try {
      req = JSON.readTree(line);
    } catch (JsonProcessingException e) {
      send(out, error(null, "MALFORMED_REQUEST", "Request is not valid JSON."));
      return true;
    }
    if (req == null || !req.isObject()) {
      send(out, error(null, "MALFORMED_REQUEST", "Request must be a JSON object."));
      return true;
    }
    String id = req.path("id").isTextual() ? req.get("id").asText() : null;
    if (req.path("protocol").asInt(-1) != PROTOCOL) {
      ObjectNode e = error(id, "UNSUPPORTED_PROTOCOL", "Supported protocol: " + PROTOCOL + ".");
      if ("check".equals(req.path("type").asText())) withVersions(e, req);
      send(out, e);
      return true;
    }
    switch (req.path("type").asText("")) {
      case "shutdown":
        return false;
      case "check":
        send(out, check(id, req));
        return true;
      default:
        send(out, error(id, "UNKNOWN_TYPE", "Unknown message type."));
        return true;
    }
  }

  /** Both versions present as non-negative integers (the contract's {@code version}). */
  private static boolean hasVersions(JsonNode req) {
    return isVersion(req.get("docVersion")) && isVersion(req.get("settingsVersion"));
  }

  private static boolean isVersion(JsonNode n) {
    return n != null && n.isIntegralNumber() && n.canConvertToLong() && n.asLong() >= 0;
  }

  /**
   * An error answering a check carries that check's docVersion and settingsVersion (both or
   * neither), so the receiver can drop errors for stale versions.
   */
  private static ObjectNode withVersions(ObjectNode error, JsonNode req) {
    if (hasVersions(req)) {
      error.set("docVersion", req.get("docVersion"));
      error.set("settingsVersion", req.get("settingsVersion"));
    }
    return error;
  }

  private ObjectNode check(String id, JsonNode req) {
    JsonNode textNode = req.get("text");
    if (id == null || id.isEmpty() || textNode == null || !textNode.isTextual()) {
      return withVersions(error(id, "MALFORMED_REQUEST", "check requires string fields id and text."), req);
    }
    if (!hasVersions(req)) {
      return error(id, "MALFORMED_REQUEST", "check requires integer docVersion and settingsVersion >= 0.");
    }
    String text = textNode.asText();
    if (text.length() > maxTextUtf16Units) {
      return withVersions(
          error(id, "TEXT_TOO_LONG", "Limit is " + maxTextUtf16Units + " UTF-16 code units.")
              .put("limit", maxTextUtf16Units)
              .put("length", text.length()),
          req);
    }
    long t0 = System.nanoTime();
    java.util.List<Issue> issues;
    try {
      issues = checker.check(text);
    } catch (Exception | StackOverflowError e) {
      // Only the exception type: messages may quote user text (PLAN.md section 13).
      System.err.println("engine error: " + e.getClass().getName());
      return withVersions(error(id, "ENGINE_ERROR", "The engine failed to analyse the text."), req);
    }
    double ms = (System.nanoTime() - t0) / 1e6;
    ObjectNode res = msg("result").put("id", id);
    res.set("docVersion", req.get("docVersion"));
    res.set("settingsVersion", req.get("settingsVersion"));
    res.put("engineVersion", checker.engineVersion()).put("status", "complete");
    res.put("analysisMs", Math.round(ms * 1000) / 1000.0);
    ArrayNode arr = res.putArray("issues");
    for (Issue i : issues) {
      ObjectNode o =
          arr.addObject()
              .put("start", i.start())
              .put("end", i.end())
              .put("ruleId", i.ruleId())
              .put("category", i.category())
              .put("engineCategory", i.engineCategory())
              .put("issueType", i.issueType())
              .put("message", i.message());
      ArrayNode reps = o.putArray("replacements");
      i.replacements().forEach(reps::add);
    }
    return res;
  }

  private static ObjectNode msg(String type) {
    return JSON.createObjectNode().put("protocol", PROTOCOL).put("type", type);
  }

  private static ObjectNode error(String id, String code, String detail) {
    ObjectNode e = msg("error");
    if (id != null) e.put("id", id);
    else e.putNull("id");
    return e.put("code", code).put("detail", detail);
  }

  private static void send(Writer out, ObjectNode message) throws IOException {
    // Jackson escapes control characters, so the message is always a single line.
    out.write(JSON.writeValueAsString(message));
    out.write('\n');
    out.flush();
  }
}
