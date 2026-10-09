#!/usr/bin/env bash
# Regenerates contracts/generated/ from contracts/v1/protocol.schema.json.
# Pinned tools: json-schema-to-typescript (pnpm lockfile), cargo-typify 0.5.0.
set -euo pipefail
cd "$(dirname "$0")/.."
node contracts/tools/build-examples.mjs
node contracts/tools/gen-ts.mjs contracts/v1/protocol.schema.json contracts/generated/ts/protocol-v1.ts
cargo typify --no-builder contracts/v1/protocol.schema.json -o contracts/rust/src/protocol_v1.rs
