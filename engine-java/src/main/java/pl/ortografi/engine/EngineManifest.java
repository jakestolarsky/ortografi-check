package pl.ortografi.engine;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.function.Function;
import java.util.stream.Stream;

/**
 * Writes {@code engine-manifest.json} next to the adapter JAR (engine-java/README.md, "Engine
 * manifest"): adapter, LanguageTool and runtime versions plus a sha256 for every shipped file
 * (the adapter JAR, {@code lib/*.jar} and {@code runtime/**}). Run it with the jlinked runtime's
 * own {@code java}, so the runtime fields describe that runtime:
 *
 * <p>{@code target/runtime/bin/java -cp "target/ortografi-engine.jar:target/lib/*"
 * pl.ortografi.engine.EngineManifest target}
 *
 * <p>The output has no timestamps, so the same inputs give the same file.
 */
public final class EngineManifest {

  static final String FILE = "engine-manifest.json";
  /** The adapter JAR's name in the build output and in the installed app (no version in it). */
  static final String JAR = "ortografi-engine.jar";
  private static final ObjectMapper JSON = new ObjectMapper().enable(SerializationFeature.INDENT_OUTPUT);

  private EngineManifest() {}

  static String languageToolVersion() {
    return org.languagetool.JLanguageTool.VERSION;
  }

  static ObjectNode build(Path dir, String adapterVersion, String ltVersion, Function<String, String> sys)
      throws IOException {
    Path jar = dir.resolve(JAR);
    if (!Files.isRegularFile(jar)) throw new IllegalStateException("no " + JAR + " in " + dir);
    if (!Files.isDirectory(dir.resolve("runtime"))) throw new IllegalStateException("no runtime/ in " + dir);

    List<Path> files = new ArrayList<>(List.of(jar));
    for (String sub : List.of("lib", "runtime")) {
      Path d = dir.resolve(sub);
      if (!Files.isDirectory(d)) continue;
      try (Stream<Path> s = Files.walk(d)) {
        s.filter(Files::isRegularFile).filter(p -> !sub.equals("lib") || p.toString().endsWith(".jar")).forEach(files::add);
      }
    }
    List<String> rel = new ArrayList<>();
    for (Path f : files) rel.add(dir.relativize(f).toString().replace('\\', '/'));
    rel.sort(null);

    ObjectNode m = JSON.createObjectNode().put("manifestVersion", 1).put("protocol", 1);
    m.putObject("adapter").put("version", adapterVersion).put("jar", jar.getFileName().toString());
    m.putObject("languageTool").put("version", ltVersion);
    m.putObject("runtime")
        .put("vendor", sys.apply("java.vendor"))
        .put("vendorVersion", sys.apply("java.vendor.version"))
        .put("version", sys.apply("java.runtime.version"))
        .put("os", sys.apply("os.name"))
        .put("arch", sys.apply("os.arch"));
    ObjectNode sums = m.putObject("sha256");
    for (String r : rel) sums.put(r, sha256(dir.resolve(r)));
    return m;
  }

  static Path write(Path dir, String adapterVersion, String ltVersion, Function<String, String> sys) throws IOException {
    Path out = dir.resolve(FILE);
    Files.writeString(out, JSON.writeValueAsString(build(dir, adapterVersion, ltVersion, sys)) + "\n");
    return out;
  }

  private static String sha256(Path f) throws IOException {
    try (InputStream in = Files.newInputStream(f)) {
      MessageDigest md = MessageDigest.getInstance("SHA-256");
      byte[] buf = new byte[1 << 16];
      for (int n; (n = in.read(buf)) > 0; ) md.update(buf, 0, n);
      return HexFormat.of().formatHex(md.digest());
    } catch (java.security.NoSuchAlgorithmException e) {
      throw new IllegalStateException(e);
    }
  }

  public static void main(String[] args) throws IOException {
    if (args.length < 1) throw new IllegalArgumentException("usage: EngineManifest <build-dir> [adapter-version]");
    String v = EngineManifest.class.getPackage().getImplementationVersion();
    if (args.length > 1) v = args[1];
    if (v == null) throw new IllegalStateException("adapter version unknown (no Implementation-Version)");
    System.out.println(write(Path.of(args[0]), v, languageToolVersion(), System::getProperty));
  }
}
