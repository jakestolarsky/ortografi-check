//! Protocol v1 messages as seen by the supervisor: the validated contract type plus the
//! exact JSON value, which is what gets forwarded to the UI unchanged.
//! Validation lives in `ortografi_contracts::from_value` (dispatch on `type`, protocol 1,
//! constants, both-or-neither versions on errors).

use serde_json::{json, Value};

pub use ortografi_contracts::PROTOCOL;

/// A validated protocol message plus the exact JSON value received, which is what gets
/// forwarded to the UI (messages cross IPC unchanged).
#[derive(Debug, Clone)]
pub struct Message {
    pub raw: Value,
    pub parsed: ortografi_contracts::Message,
}

impl Message {
    pub fn kind(&self) -> &str {
        self.raw["type"].as_str().unwrap_or("")
    }
    pub fn id(&self) -> Option<&str> {
        self.raw["id"].as_str()
    }
    /// (docVersion, settingsVersion) when the message carries both.
    pub fn versions(&self) -> Option<(u64, u64)> {
        Some((self.raw["docVersion"].as_u64()?, self.raw["settingsVersion"].as_u64()?))
    }
    pub fn error_code(&self) -> Option<&str> {
        match self.kind() {
            "error" => self.raw["code"].as_str(),
            _ => None,
        }
    }
}

pub fn parse_line(line: &str) -> Result<Message, String> {
    let raw: Value = serde_json::from_str(line).map_err(|e| format!("not JSON: {e}"))?;
    parse_value(raw)
}

pub fn parse_value(raw: Value) -> Result<Message, String> {
    let parsed = ortografi_contracts::from_value(raw.clone()).map_err(|e| e.0)?;
    Ok(Message { raw, parsed })
}

/// An error produced on the Rust side (TIMEOUT, ENGINE_UNAVAILABLE, or ENGINE_ERROR for an
/// invalid engine line). Answers the given check, so it carries its id and both versions.
pub fn error_for_check(code: &str, req: &Message, detail: &str) -> Message {
    let raw = json!({
        "protocol": PROTOCOL, "type": "error", "id": req.raw["id"], "code": code,
        "detail": detail, "docVersion": req.raw["docVersion"], "settingsVersion": req.raw["settingsVersion"],
    });
    parse_value(raw).expect("rust-built error must satisfy the contract")
}
