//! Tauri glue.
//!
//! - `engine_check(request)`: a protocol v1 CheckRequest. The answer (result or error) is
//!   emitted **unchanged** on `engine://message` unless stale or superseded by a newer
//!   waiting check (then nothing is emitted for it).
//! - `engine://status` event and `engine_status` command: `{"state": "starting" | "ready" |
//!   "busy" | "restarting" | "unavailable"}`. Fetch once on load, then follow the event.
//! - `engine_retry`: manual retry after `unavailable`; state is `starting` when it returns.
//! - `engine_reset_session`: call on UI load (e.g. after a WebView reload restarts at
//!   docVersion 1): clears the stale filter's versions and drops any waiting check.

use super::{EngineConfig, EngineState, StaleFilter, Supervisor};
use ortografi_contracts::protocol_v1::{EngineStatus, EngineStatusState};
use serde_json::Value;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, State};

pub const MESSAGE_EVENT: &str = "engine://message";
pub const STATUS_EVENT: &str = "engine://status";
/// Version 1.0 edits a single document (PLAN section 1).
const DOC: &str = "main";

pub struct Engine {
    pub supervisor: Supervisor,
    stale: Mutex<StaleFilter>,
}

/// The `EngineStatus` contract type (contracts/v1 `$defs/EngineStatus`).
pub fn status_payload(s: EngineState) -> EngineStatus {
    let state = match s {
        EngineState::Starting => EngineStatusState::Starting,
        EngineState::Ready => EngineStatusState::Ready,
        EngineState::Busy => EngineStatusState::Busy,
        EngineState::Restarting => EngineStatusState::Restarting,
        EngineState::Unavailable => EngineStatusState::Unavailable,
    };
    EngineStatus { state }
}

impl Engine {
    /// Engine whose status changes are emitted on `engine://status`.
    pub fn new(cfg: EngineConfig, app: AppHandle) -> Arc<Self> {
        let listener = Arc::new(move |s: EngineState| {
            let _ = app.emit(STATUS_EVENT, status_payload(s));
        });
        Arc::new(Self { supervisor: Supervisor::with_listener(cfg, listener), stale: Mutex::new(StaleFilter::new()) })
    }

    /// Run one check (newest-only queue) and return the message to forward, if any.
    pub fn check_and_filter(&self, request: Value) -> Option<Value> {
        if let (Some(d), Some(s)) = (request["docVersion"].as_u64(), request["settingsVersion"].as_u64()) {
            self.stale.lock().unwrap().note_request(DOC, (d, s));
        }
        let msg = self.supervisor.submit(request)?;
        self.stale.lock().unwrap().accept(DOC, &msg).then_some(msg.raw)
    }

    /// New UI session: forget versions and drop any waiting check.
    pub fn reset_session(&self) {
        self.stale.lock().unwrap().clear();
        self.supervisor.drop_waiting();
    }
}

/// Engine command from the environment until bundling lands:
/// `ORTOGRAFI_ENGINE` = program, `ORTOGRAFI_ENGINE_ARGS` = whitespace-separated args.
/// Unset: the supervisor reports `unavailable` and answers ENGINE_UNAVAILABLE.
pub fn config_from_env() -> EngineConfig {
    let program = std::env::var("ORTOGRAFI_ENGINE").unwrap_or_else(|_| "ortografi-engine-not-configured".into());
    let args = std::env::var("ORTOGRAFI_ENGINE_ARGS")
        .map(|a| a.split_whitespace().map(String::from).collect())
        .unwrap_or_default();
    EngineConfig::new(program, args)
}

/// Start the engine on a background thread (app launch, manual retry).
pub fn start_in_background(engine: Arc<Engine>) {
    std::thread::spawn(move || {
        let _ = engine.supervisor.start();
    });
}

#[tauri::command]
pub async fn engine_check(app: AppHandle, engine: State<'_, Arc<Engine>>, request: Value) -> Result<(), String> {
    let engine = engine.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        if let Some(msg) = engine.check_and_filter(request) {
            let _ = app.emit(MESSAGE_EVENT, msg);
        }
    });
    Ok(())
}

#[tauri::command]
pub fn engine_status(engine: State<'_, Arc<Engine>>) -> EngineStatus {
    status_payload(engine.supervisor.state())
}

#[tauri::command]
pub fn engine_retry(engine: State<'_, Arc<Engine>>) {
    // Sets `starting` synchronously; the spawn continues in the background.
    engine.supervisor.retry();
}

#[tauri::command]
pub fn engine_reset_session(engine: State<'_, Arc<Engine>>) {
    engine.reset_session();
}
