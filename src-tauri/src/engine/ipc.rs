//! Tauri glue: the UI invokes `engine_check` with a protocol v1 CheckRequest; the answer
//! (result or error) is emitted unchanged on the `engine://message` event unless stale.

use super::{EngineConfig, StaleFilter, Supervisor};
use serde_json::Value;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, State};

pub const EVENT: &str = "engine://message";
/// Version 1.0 edits a single document (PLAN section 1).
const DOC: &str = "main";

pub struct Engine {
    pub supervisor: Supervisor,
    stale: Mutex<StaleFilter>,
}

impl Engine {
    pub fn new(cfg: EngineConfig) -> Arc<Self> {
        Arc::new(Self { supervisor: Supervisor::new(cfg), stale: Mutex::new(StaleFilter::new()) })
    }

    /// Run one check and return the message to forward, or None if it is stale.
    pub fn check_and_filter(&self, request: Value) -> Option<Value> {
        if let (Some(d), Some(s)) = (request["docVersion"].as_u64(), request["settingsVersion"].as_u64()) {
            self.stale.lock().unwrap().note_request(DOC, (d, s));
        }
        let msg = self.supervisor.check(request);
        self.stale.lock().unwrap().accept(DOC, &msg).then_some(msg.raw)
    }
}

/// Engine command from the environment until bundling lands:
/// `ORTOGRAFI_ENGINE` = program, `ORTOGRAFI_ENGINE_ARGS` = whitespace-separated args.
/// Unset: the supervisor answers ENGINE_UNAVAILABLE.
pub fn config_from_env() -> EngineConfig {
    let program = std::env::var("ORTOGRAFI_ENGINE").unwrap_or_else(|_| "ortografi-engine-not-configured".into());
    let args = std::env::var("ORTOGRAFI_ENGINE_ARGS")
        .map(|a| a.split_whitespace().map(String::from).collect())
        .unwrap_or_default();
    EngineConfig::new(program, args)
}

#[tauri::command]
pub async fn engine_check(app: AppHandle, engine: State<'_, Arc<Engine>>, request: Value) -> Result<(), String> {
    let engine = engine.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        if let Some(msg) = engine.check_and_filter(request) {
            let _ = app.emit(EVENT, msg);
        }
    });
    Ok(())
}
