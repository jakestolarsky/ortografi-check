use ortografi_contracts::{parse_message, Message};

#[test]
fn bogus_type_is_rejected() {
    assert!(parse_message(r#"{"protocol":1,"type":"bogus"}"#).is_err());
}

#[test]
fn wrong_protocol_is_rejected() {
    assert!(parse_message(r#"{"protocol":2,"type":"shutdown"}"#).is_err());
    assert!(parse_message(r#"{"type":"shutdown"}"#).is_err());
}

#[test]
fn dispatches_by_type() {
    assert!(matches!(parse_message(r#"{"protocol":1,"type":"shutdown"}"#), Ok(Message::Shutdown(_))));
    // Shape of a ready message but labelled shutdown: rejected, not coerced.
    assert!(parse_message(r#"{"protocol":1,"type":"shutdown","engineVersion":"6.8","language":"pl-PL"}"#).is_err());
}

#[test]
fn error_with_only_one_version_is_rejected() {
    let base = r#""protocol":1,"type":"error","id":"c1","code":"TIMEOUT","detail":"d""#;
    assert!(parse_message(&format!("{{{base},\"docVersion\":1}}")).is_err());
    assert!(parse_message(&format!("{{{base},\"settingsVersion\":1}}")).is_err());
    assert!(parse_message(&format!("{{{base},\"docVersion\":1,\"settingsVersion\":1}}")).is_ok());
    assert!(parse_message(&format!("{{{base}}}")).is_ok());
}

#[test]
fn other_consts_are_enforced() {
    assert!(parse_message(r#"{"protocol":1,"type":"ready","engineVersion":"6.8","language":"en-US"}"#).is_err());
    assert!(parse_message(r#"{"protocol":1,"type":"result","id":"c","docVersion":1,"settingsVersion":1,"engineVersion":"6.8","status":"partial","issues":[]}"#).is_err());
}

#[test]
fn engine_status_ipc_payload() {
    use ortografi_contracts::protocol_v1::{EngineStatus, EngineStatusState};
    let s: EngineStatus = serde_json::from_str(r#"{"state":"restarting"}"#).unwrap();
    assert_eq!(s.state, EngineStatusState::Restarting);
    assert!(serde_json::from_str::<EngineStatus>(r#"{"state":"stopped"}"#).is_err());
    assert!(serde_json::from_str::<EngineStatus>(r#"{"state":"ready","x":1}"#).is_err());
    // Not part of the stdin/stdout message union.
    assert!(parse_message(r#"{"state":"ready"}"#).is_err());
}

#[test]
fn engine_versions_is_strict() {
    use ortografi_contracts::protocol_v1::EngineVersions;
    let v: EngineVersions =
        serde_json::from_str(r#"{"adapter":"0.0.1","languagetool":"6.8","runtime":"Temurin-21.0.12+1"}"#).unwrap();
    assert_eq!(v.languagetool, "6.8");
    assert!(serde_json::from_str::<EngineVersions>(r#"{"adapter":"a","languagetool":"b"}"#).is_err());
    assert!(serde_json::from_str::<EngineVersions>(r#"{"adapter":"a","languagetool":"b","runtime":"c","x":1}"#).is_err());
}

