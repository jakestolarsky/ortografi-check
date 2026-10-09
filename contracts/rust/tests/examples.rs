use ortografi_contracts::parse_message;
use std::fs;

#[test]
fn every_example_deserializes() {
    let dir = concat!(env!("CARGO_MANIFEST_DIR"), "/../v1/examples");
    let mut n = 0;
    for entry in fs::read_dir(dir).unwrap() {
        let path = entry.unwrap().path();
        if !path.is_file() {
            continue;
        }
        let raw = fs::read_to_string(&path).unwrap();
        parse_message(&raw)
            .unwrap_or_else(|e| panic!("{}: {e}", path.display()));
        n += 1;
    }
    assert!(n >= 10);
}

#[test]
fn unknown_fields_are_rejected() {
    let raw = r#"{"protocol":1,"type":"shutdown","extra":true}"#;
    assert!(parse_message(raw).is_err());
}

#[test]
fn nfd_text_survives_roundtrip() {
    let dir = concat!(env!("CARGO_MANIFEST_DIR"), "/../v1/examples");
    let raw = fs::read_to_string(format!("{dir}/corpus-p0-0063-check.json")).unwrap();
    let ortografi_contracts::Message::Check(req) = parse_message(&raw).unwrap() else { panic!() };
    let back = serde_json::to_value(&req).unwrap();
    let text = back["text"].as_str().unwrap();
    assert!(text.contains('\u{0307}'), "combining dot above lost");
    assert_eq!(text.encode_utf16().count(), 31);
}
