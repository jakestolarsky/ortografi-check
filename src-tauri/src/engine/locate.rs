//! Which engine command to run (PLAN.md sections 5 and 12).
//!
//! 1. `ORTOGRAFI_ENGINE` (+ whitespace-separated `ORTOGRAFI_ENGINE_ARGS`): developer override.
//! 2. The bundled engine in the app's resource dir: `engine/runtime/bin/java[.exe] -jar
//!    engine/ortografi-engine.jar` (staged by scripts/prepare-engine.sh). No `-Xmx` etc.:
//!    the jlink runtime has the JVM flags from engine-java/jvm-options.txt built in.
//! 3. Otherwise unavailable: the supervisor reports `unavailable` / ENGINE_UNAVAILABLE.
//!
//! The bundled path is passed as one argument, so spaces and Polish letters are fine. `PATH`
//! is never searched for the bundled engine.

use super::EngineConfig;
use std::path::{Path, PathBuf};

pub const JAR_NAME: &str = "ortografi-engine.jar";
const UNAVAILABLE_PROGRAM: &str = "ortografi-engine-unavailable";

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum EngineSource {
    Override,
    Bundled,
    Unavailable(String),
}

#[derive(Debug, Clone)]
pub struct Located {
    pub program: PathBuf,
    pub args: Vec<String>,
    pub source: EngineSource,
}

impl Located {
    pub fn config(&self) -> EngineConfig {
        EngineConfig::new(self.program.clone(), self.args.clone())
    }
}

/// `<resource_dir>/engine`, matching `bundle.resources` in tauri.conf.json.
pub fn bundled_engine_dir(resource_dir: &Path) -> PathBuf {
    resource_dir.join("engine")
}

fn java_exe() -> &'static str {
    if cfg!(windows) {
        "java.exe"
    } else {
        "java"
    }
}

pub fn locate(env_program: Option<&str>, env_args: Option<&str>, resource_dir: Option<&Path>) -> Located {
    if let Some(p) = env_program.map(str::trim).filter(|p| !p.is_empty()) {
        return Located {
            program: PathBuf::from(p),
            args: env_args.unwrap_or("").split_whitespace().map(String::from).collect(),
            source: EngineSource::Override,
        };
    }
    let unavailable = |why: String| Located {
        program: PathBuf::from(UNAVAILABLE_PROGRAM),
        args: vec![],
        source: EngineSource::Unavailable(why),
    };
    let Some(res) = resource_dir else {
        return unavailable("no resource directory".into());
    };
    let dir = bundled_engine_dir(res);
    let java = dir.join("runtime").join("bin").join(java_exe());
    let jar = dir.join(JAR_NAME);
    if !java.is_file() || !jar.is_file() {
        return unavailable(format!("bundled engine not found in {}", dir.display()));
    }
    Located {
        program: java,
        args: vec!["-jar".into(), jar.to_string_lossy().into_owned()],
        source: EngineSource::Bundled,
    }
}

/// From the process environment and the app's resource dir.
pub fn locate_from_env(resource_dir: Option<&Path>) -> Located {
    let p = std::env::var("ORTOGRAFI_ENGINE").ok();
    let a = std::env::var("ORTOGRAFI_ENGINE_ARGS").ok();
    locate(p.as_deref(), a.as_deref(), resource_dir)
}
