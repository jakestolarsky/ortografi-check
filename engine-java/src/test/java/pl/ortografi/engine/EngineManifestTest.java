package pl.ortografi.engine;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class EngineManifestTest {

  private static final ObjectMapper JSON = new ObjectMapper();
  /** sha256("abc"), FIPS 180-2 test vector. */
  private static final String SHA_ABC = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";

  private static Path tree(Path dir) throws Exception {
    Files.writeString(dir.resolve("ortografi-engine-1.2.3.jar"), "abc");
    Files.createDirectories(dir.resolve("lib"));
    Files.writeString(dir.resolve("lib/language-pl-6.8.jar"), "pl");
    Files.writeString(dir.resolve("lib/languagetool-core-6.8.jar"), "core");
    Files.createDirectories(dir.resolve("runtime/bin"));
    Files.writeString(dir.resolve("runtime/bin/java"), "java");
    Files.writeString(dir.resolve("runtime/release"), "JAVA_VERSION=\"21\"");
    Files.writeString(dir.resolve("unrelated.txt"), "not shipped");
    return dir;
  }

  private static final Map<String, String> RUNTIME = Map.of(
      "java.vendor", "Eclipse Adoptium", "java.vendor.version", "Temurin-21.0.12.1+1",
      "java.runtime.version", "21.0.12.1+1-LTS", "os.name", "Linux", "os.arch", "amd64");

  @Test
  void recordsVersionsAndChecksumsOfEveryShippedFile(@TempDir Path dir) throws Exception {
    JsonNode m = EngineManifest.build(tree(dir), "1.2.3", "6.8", RUNTIME::get);
    assertEquals(1, m.get("manifestVersion").asInt());
    assertEquals(1, m.get("protocol").asInt());
    assertEquals("1.2.3", m.at("/adapter/version").asText());
    assertEquals("ortografi-engine-1.2.3.jar", m.at("/adapter/jar").asText());
    assertEquals("6.8", m.at("/languageTool/version").asText());
    assertEquals("Eclipse Adoptium", m.at("/runtime/vendor").asText());
    assertEquals("Temurin-21.0.12.1+1", m.at("/runtime/vendorVersion").asText());
    assertEquals("21.0.12.1+1-LTS", m.at("/runtime/version").asText());
    assertEquals("Linux", m.at("/runtime/os").asText());
    assertEquals("amd64", m.at("/runtime/arch").asText());

    JsonNode files = m.get("sha256");
    List<String> names = new ArrayList<>();
    files.fieldNames().forEachRemaining(names::add);
    assertEquals(List.of("lib/language-pl-6.8.jar", "lib/languagetool-core-6.8.jar",
        "ortografi-engine-1.2.3.jar", "runtime/bin/java", "runtime/release"), names,
        "sorted, forward slashes, only the JAR, lib/ and runtime/");
    assertEquals(SHA_ABC, files.get("ortografi-engine-1.2.3.jar").asText());
    for (JsonNode h : files) assertTrue(h.asText().matches("[0-9a-f]{64}"), h.asText());
  }

  @Test
  void writesNextToTheJarAndIsReproducible(@TempDir Path dir) throws Exception {
    tree(dir);
    Path out = EngineManifest.write(dir, "1.2.3", "6.8", RUNTIME::get);
    assertEquals(dir.resolve("engine-manifest.json"), out);
    String first = Files.readString(out, StandardCharsets.UTF_8);
    EngineManifest.write(dir, "1.2.3", "6.8", RUNTIME::get);
    assertEquals(first, Files.readString(out, StandardCharsets.UTF_8), "no timestamps, own file not hashed");
    assertFalse(JSON.readTree(first).get("sha256").has("engine-manifest.json"));
  }

  @Test
  void failsWithoutAJarOrRuntime(@TempDir Path dir) throws Exception {
    assertThrows(IllegalStateException.class, () -> EngineManifest.build(dir, "1", "6.8", RUNTIME::get));
    Files.writeString(dir.resolve("ortografi-engine-1.jar"), "x");
    assertThrows(IllegalStateException.class, () -> EngineManifest.build(dir, "1", "6.8", RUNTIME::get));
  }

  @Test
  void languageToolVersionComesFromTheLibraryOnTheClassPath() {
    assertEquals("6.8", EngineManifest.languageToolVersion());
  }
}
