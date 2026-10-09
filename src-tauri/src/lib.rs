pub mod engine;

use engine::ipc::{self, Engine};
use std::sync::Arc;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let engine = Engine::new(ipc::config_from_env(), app.handle().clone());
            app.manage(engine.clone());
            // Start in the background at launch so the first check finds it ready (PLAN s.5).
            ipc::start_in_background(engine);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![ipc::engine_check, ipc::engine_status, ipc::engine_retry])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                app.state::<Arc<Engine>>().supervisor.shutdown();
            }
        });
}
