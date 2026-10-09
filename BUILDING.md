# Building on macOS

Commands and paths match this repository (checked on Linux; not yet run on a Mac). Run them
from the repo root unless noted.

## 1. Tools

```sh
xcode-select --install                 # Apple command line tools (clang, git)
brew install rustup node
rustup-init -y                         # or: "$(brew --prefix rustup)/bin/rustup-init" -y
# open a new shell (or: source "$HOME/.cargo/env"), then check:
rustc --version                        # must be >= 1.85 (src-tauri and contracts/rust set rust-version = "1.85")
corepack enable                        # provides pnpm at the version pinned in package.json ("packageManager": "pnpm@10.34.6")
```

## 2. Java and Maven (needed to bundle the engine)

```sh
brew install --cask temurin@21         # JDK 21 with jlink/jdeps; CI pins Temurin 21.0.12.1+1
brew install maven                     # Maven 3.9
```

## 3. Desktop app (Tauri 2 + SvelteKit) with the bundled engine

```sh
pnpm install                           # uses the committed pnpm-lock.yaml
pnpm prepare-engine                    # mvn package + jlink -> src-tauri/resources/engine/ (gitignored)
pnpm tauri dev                         # dev window; runs `pnpm dev` (Vite on port 1420) for you
pnpm tauri build                       # release build; beforeBuildCommand runs prepare-engine again
```

`pnpm prepare-engine` (`scripts/prepare-engine.sh`) builds `engine-java` (without its tests) and
stages it as a Tauri resource for **this** OS and CPU:
- the jlink-trimmed runtime, with the JVM flags from `engine-java/jvm-options.txt` built in;
- `ortografi-engine.jar`;
- `lib/*.jar`.

About 113 MiB installed and 85 MiB as tar.gz (on Linux x64). It takes about 10 s and checks that the staged engine sends
`ready`. The app starts `engine/runtime/bin/java -jar engine/ortografi-engine.jar` from its resource
directory; nothing has to be installed on the user's machine. The engine is per OS/arch, so build
the macOS ARM and Intel apps on (or for) each architecture separately.

The release bundles end up in `src-tauri/target/release/bundle/` (`macos/Ortografi.app` and
`dmg/`). The app is **unsigned**, so the first time you open it, right-click the app, choose
**Open**, then confirm.

Developer override: `ORTOGRAFI_ENGINE` (program) and `ORTOGRAFI_ENGINE_ARGS` (whitespace-separated
arguments) take precedence over the bundled engine, e.g. to run a freshly built JAR:

```sh
export ORTOGRAFI_ENGINE=java
export ORTOGRAFI_ENGINE_ARGS="-jar $PWD/engine-java/target/ortografi-engine-0.0.1-phase0.jar"
pnpm tauri dev
```

Without an override and without a staged engine, the app starts and reports the engine as
`unavailable`.

Checks:

```sh
pnpm test                              # Vitest (src/ and contracts/tests/)
pnpm check                             # svelte-check / TypeScript
(cd src-tauri && cargo test)           # supervisor + path tests (fake engine uses python3 and env)
(cd src-tauri && ORTOGRAFI_TEST_RESOURCE_DIR="$PWD/resources" cargo test --test real_engine)  # real staged engine
```

## 4. Engine on its own (`engine-java/`)

```sh
cd engine-java
mvn test
mvn package                            # target/ortografi-engine-0.0.1-phase0.jar + target/lib/*.jar
java -jar target/ortografi-engine-0.0.1-phase0.jar   # optional: prints the protocol `ready` line; Ctrl-D to exit
cd ..
```

See `engine-java/README.md` for the jlink runtime (`scripts/jlink-runtime.sh`) and smoke tests.

## 5. Polish corpus

```sh
node --test tests/corpus/tools/                                  # corpus tool tests
node tests/corpus/tools/validate.mjs 'tests/corpus/data/**/*.jsonl'  # validate all corpus files
```

Scoring an engine run is described in `tests/corpus/FORMAT.md` and `engine-java/README.md`.
