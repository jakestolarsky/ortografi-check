pub mod engine;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let engine = engine::ipc::Engine::new(engine::ipc::config_from_env());
    tauri::Builder::default()
        .manage(engine)
        .invoke_handler(tauri::generate_handler![engine::ipc::engine_check])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                app.state::<std::sync::Arc<engine::ipc::Engine>>().supervisor.shutdown();
            }
        });
}
