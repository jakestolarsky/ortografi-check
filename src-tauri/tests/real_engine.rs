//! Smoke test against the real staged engine (scripts/prepare-engine.sh). Runs only when
//! ORTOGRAFI_TEST_RESOURCE_DIR points at a directory containing the staged `engine/`
//! (CI: src-tauri/resources); otherwise it is skipped.
use ortografi_check_lib::engine::locate::{locate, EngineSource};
use ortografi_check_lib::engine::Supervisor;
use serde_json::json;
use std::path::PathBuf;

#[test]
fn bundled_engine_finds_the_missing_comma_in_p0_0003() {
    let Ok(dir) = std::env::var("ORTOGRAFI_TEST_RESOURCE_DIR") else {
        eprintln!("skipped: ORTOGRAFI_TEST_RESOURCE_DIR not set");
        return;
    };
    let located = locate(None, None, Some(&PathBuf::from(dir)));
    assert_eq!(located.source, EngineSource::Bundled, "staged engine not found");
    let s = Supervisor::new(located.config());
    let ready = s.start().expect("bundled engine starts");
    assert_eq!(ready.raw["language"], "pl-PL");
    // Text taken from tests/corpus/data/phase0-starter.jsonl p0-0003.
    let root = std::env::var("ORTOGRAFI_SRC_TAURI").unwrap_or_else(|_| env!("CARGO_MANIFEST_DIR").into());
    let corpus = std::fs::read_to_string(format!("{root}/../tests/corpus/data/phase0-starter.jsonl")).unwrap();
    let rec: serde_json::Value = corpus.lines().map(|l| serde_json::from_str::<serde_json::Value>(l).unwrap())
        .find(|r| r["id"] == "p0-0003").unwrap();
    let m = s.check(json!({"protocol":1,"type":"check","id":"smoke","docVersion":1,"settingsVersion":1,"text":rec["text"]}));
    assert_eq!(m.kind(), "result", "{}", m.raw);
    let issues = m.raw["issues"].as_array().unwrap();
    assert!(
        issues.iter().any(|i| i["start"] == 4 && i["end"] == 4 && i["replacements"].as_array().unwrap().iter().any(|r| r == ",")),
        "expected a 4..4 \",\" insertion, got {}", m.raw
    );
    s.shutdown();
}
