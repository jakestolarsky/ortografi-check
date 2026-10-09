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

## 2. Desktop app (Tauri 2 + SvelteKit)

```sh
pnpm install                           # uses the committed pnpm-lock.yaml
pnpm tauri dev                         # dev window; runs `pnpm dev` (Vite on port 1420) for you
pnpm tauri build                       # release build
```

The release bundles end up in `src-tauri/target/release/bundle/` (`macos/Ortografi.app` and
`dmg/`). The app is **unsigned**, so the first time you open it, right-click the app, choose
**Open**, then confirm.

Checks:

```sh
pnpm test                              # Vitest (src/ and contracts/tests/)
pnpm check                             # svelte-check / TypeScript
(cd src-tauri && cargo test)           # engine supervisor tests (use python3 and env, both present on macOS)
```

## 3. Engine (Java adapter, `engine-java/`)

```sh
brew install --cask temurin@21         # CI pins Temurin 21.0.12.1+1
brew install maven                     # Maven 3.9
cd engine-java
mvn test
mvn package                            # target/ortografi-engine-0.0.1-phase0.jar + target/lib/*.jar
java -jar target/ortografi-engine-0.0.1-phase0.jar   # optional: prints the protocol `ready` line; Ctrl-D to exit
cd ..
```

To run the app against the real engine, point it at the JAR before `pnpm tauri dev`. Arguments
are split on whitespace, so use a path without spaces.

```sh
export ORTOGRAFI_ENGINE=java           # or the jlink runtime: engine-java/target/runtime/bin/java
export ORTOGRAFI_ENGINE_ARGS="-jar $PWD/engine-java/target/ortografi-engine-0.0.1-phase0.jar"
pnpm tauri dev
```

Without these variables the app starts and reports the engine as `unavailable`. (These
variables are read by the engine supervisor in `src-tauri/src/engine/`.)

See `engine-java/README.md` for the jlink runtime (`scripts/jlink-runtime.sh`) and smoke tests.

## 4. Polish corpus

```sh
node --test tests/corpus/tools/                                  # corpus tool tests
node tests/corpus/tools/validate.mjs 'tests/corpus/data/**/*.jsonl'  # validate all corpus files
```

Scoring an engine run is described in `tests/corpus/FORMAT.md` and `engine-java/README.md`.
