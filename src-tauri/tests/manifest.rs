//! engine_manifest: versions from the bundled engine-manifest.json, never checksums.
use ortografi_check_lib::engine::locate::{bundled_engine_dir, EngineSource};
use ortografi_check_lib::engine::manifest::{engine_versions, read_versions, MANIFEST_NAME};
use std::fs;
use std::path::PathBuf;

fn tmp(name: &str) -> PathBuf {
    let d = std::env::temp_dir().join(format!("ortografi-manifest-{}-{name}", std::process::id()));
    let _ = fs::remove_dir_all(&d);
    fs::create_dir_all(bundled_engine_dir(&d)).unwrap();
    d
}

const MANIFEST: &str = r#"{
  "manifestVersion": 1, "protocol": 1,
  "adapter": { "version": "0.0.1-phase0", "jar": "ortografi-engine-0.0.1-phase0.jar" },
  "languageTool": { "version": "6.8" },
  "runtime": { "vendor": "Eclipse Adoptium", "vendorVersion": "Temurin-21.0.12+1",
               "version": "21.0.12+1-LTS", "os": "Linux", "arch": "amd64" },
  "sha256": { "ortografi-engine.jar": "00" }
}"#;

#[test]
fn reads_versions_without_checksums() {
    let r = tmp("ok");
    fs::write(bundled_engine_dir(&r).join(MANIFEST_NAME), MANIFEST).unwrap();
    let v = read_versions(&bundled_engine_dir(&r)).unwrap();
    assert_eq!(v.adapter, "0.0.1-phase0");
    assert_eq!(v.languagetool, "6.8");
    assert_eq!(v.runtime, "Temurin-21.0.12+1");
    let json = serde_json::to_value(&v).unwrap();
    assert_eq!(json.as_object().unwrap().len(), 3, "{json}");
}

#[test]
fn runtime_falls_back_to_version_without_vendor_version() {
    let r = tmp("fallback");
    let m = MANIFEST.replace(r#""vendorVersion": "Temurin-21.0.12+1","#, "");
    fs::write(bundled_engine_dir(&r).join(MANIFEST_NAME), m).unwrap();
    assert_eq!(read_versions(&bundled_engine_dir(&r)).unwrap().runtime, "21.0.12+1-LTS");
}

#[test]
fn missing_or_invalid_manifest_is_none() {
    let r = tmp("missing");
    assert!(read_versions(&bundled_engine_dir(&r)).is_none());
    fs::write(bundled_engine_dir(&r).join(MANIFEST_NAME), "{not json").unwrap();
    assert!(read_versions(&bundled_engine_dir(&r)).is_none());
    fs::write(bundled_engine_dir(&r).join(MANIFEST_NAME), r#"{"adapter":{}}"#).unwrap();
    assert!(read_versions(&bundled_engine_dir(&r)).is_none());
}

#[test]
fn override_and_unavailable_give_none_even_with_manifest() {
    let r = tmp("source");
    fs::write(bundled_engine_dir(&r).join(MANIFEST_NAME), MANIFEST).unwrap();
    assert!(engine_versions(&EngineSource::Override, Some(&r)).is_none());
    assert!(engine_versions(&EngineSource::Unavailable("x".into()), Some(&r)).is_none());
    assert!(engine_versions(&EngineSource::Bundled, None).is_none());
    assert_eq!(engine_versions(&EngineSource::Bundled, Some(&r)).unwrap().languagetool, "6.8");
}
