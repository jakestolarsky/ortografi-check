package pl.ortografi.engine;

import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;

/** Process entry point: JSON lines on stdin/stdout, UTF-8, logs on stderr only. */
public final class Main {

  /** PLAN.md section 4: initial limit of 100,000 UTF-16 code units. */
  static final int MAX_TEXT_UTF16_UNITS = 100_000;

  /** The production engine: LanguageTool PL behind NFC normalisation with an offset map. */
  static Checker engine() {
    return new NormalizingChecker(new LanguageToolChecker());
  }

  public static void main(String[] args) throws Exception {
    // Keep stdout exclusively for protocol messages, even if a library prints.
    PrintStream protocolOut = new PrintStream(System.out, false, StandardCharsets.UTF_8);
    System.setOut(new PrintStream(System.err, true, StandardCharsets.UTF_8));

    long t0 = System.nanoTime();
    Checker checker = engine();
    System.err.printf("engine init %.0f ms%n", (System.nanoTime() - t0) / 1e6);

    BufferedReader in = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8));
    BufferedWriter out = new BufferedWriter(new OutputStreamWriter(protocolOut, StandardCharsets.UTF_8));
    new Adapter(checker, MAX_TEXT_UTF16_UNITS).run(in, out);
    out.flush();
    System.exit(0);
  }
}
