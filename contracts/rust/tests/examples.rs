use ortografi_contracts::protocol_v1::OrtografiEngineProtocolV1;
use std::fs;

#[test]
fn every_example_deserializes() {
    let dir = concat!(env!("CARGO_MANIFEST_DIR"), "/../v1/examples");
    let mut n = 0;
    for entry in fs::read_dir(dir).unwrap() {
        let path = entry.unwrap().path();
        let raw = fs::read_to_string(&path).unwrap();
        let _: OrtografiEngineProtocolV1 = serde_json::from_str(&raw)
            .unwrap_or_else(|e| panic!("{}: {e}", path.display()));
        n += 1;
    }
    assert!(n >= 10);
}

#[test]
fn unknown_fields_are_rejected() {
    let raw = r#"{"protocol":1,"type":"shutdown","extra":true}"#;
    assert!(serde_json::from_str::<OrtografiEngineProtocolV1>(raw).is_err());
}

#[test]
fn nfd_text_survives_roundtrip() {
    let dir = concat!(env!("CARGO_MANIFEST_DIR"), "/../v1/examples");
    let raw = fs::read_to_string(format!("{dir}/corpus-p0-0063-check.json")).unwrap();
    let msg: OrtografiEngineProtocolV1 = serde_json::from_str(&raw).unwrap();
    let back = serde_json::to_value(&msg).unwrap();
    let text = back["text"].as_str().unwrap();
    assert!(text.contains('\u{0307}'), "combining dot above lost");
    assert_eq!(text.encode_utf16().count(), 31);
}
