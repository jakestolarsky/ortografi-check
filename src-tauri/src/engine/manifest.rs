//! `engine_manifest` (contracts/README.md "Desktop IPC"): the bundled engine's versions from
//! `engine/engine-manifest.json` (written by engine-java/scripts/jlink-runtime.sh, staged by
//! scripts/prepare-engine.sh). Checksums are left out; they are for the installer, not the UI.
//!
//! `None` (JSON `null`) when the engine is not the bundled one (an `ORTOGRAFI_ENGINE` override
//! or unavailable), or when the manifest is missing or unreadable. The UI shows that as a
//! development build.

use super::locate::{bundled_engine_dir, EngineSource};
use ortografi_contracts::protocol_v1::EngineVersions;
use serde::Deserialize;
use std::path::Path;

pub const MANIFEST_NAME: &str = "engine-manifest.json";

#[derive(Deserialize)]
struct Manifest {
    adapter: Version,
    #[serde(rename = "languageTool")]
    language_tool: Version,
    runtime: Runtime,
}
#[derive(Deserialize)]
struct Version {
    version: String,
}
#[derive(Deserialize)]
struct Runtime {
    #[serde(rename = "vendorVersion")]
    vendor_version: Option<String>,
    version: String,
}

/// Versions from `<engine_dir>/engine-manifest.json`; `None` if missing or invalid.
pub fn read_versions(engine_dir: &Path) -> Option<EngineVersions> {
    let raw = std::fs::read_to_string(engine_dir.join(MANIFEST_NAME)).ok()?;
    let m: Manifest = serde_json::from_str(&raw).ok()?;
    let runtime = m.runtime.vendor_version.filter(|v| !v.trim().is_empty()).unwrap_or(m.runtime.version);
    Some(EngineVersions { adapter: m.adapter.version, languagetool: m.language_tool.version, runtime })
}

/// Versions only for the bundled engine.
pub fn engine_versions(source: &EngineSource, resource_dir: Option<&Path>) -> Option<EngineVersions> {
    match (source, resource_dir) {
        (EngineSource::Bundled, Some(res)) => read_versions(&bundled_engine_dir(res)),
        _ => None,
    }
}
