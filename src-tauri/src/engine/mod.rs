//! Engine process and queue (PLAN.md sections 4 and 5).
pub mod locate;
pub mod protocol;
pub mod stale;
pub mod supervisor;

pub use protocol::Message;
pub use stale::StaleFilter;
pub use supervisor::{EngineConfig, EngineState, StatusListener, Supervisor};
pub mod ipc;
