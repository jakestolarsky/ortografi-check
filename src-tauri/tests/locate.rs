//! Engine path resolution: ORTOGRAFI_ENGINE override > bundled resources > unavailable.
use ortografi_check_lib::engine::locate::{bundled_engine_dir, locate, EngineSource, JAR_NAME};
use std::fs;
use std::path::{Path, PathBuf};

fn tmp(name: &str) -> PathBuf {
    let d = std::env::temp_dir().join(format!("ortografi-locate-{}-{name}", std::process::id()));
    let _ = fs::remove_dir_all(&d);
    fs::create_dir_all(&d).unwrap();
    d
}

/// Fake staged engine under <resource_dir>/engine/.
fn stage(resource_dir: &Path, with_java: bool, with_jar: bool) {
    let e = bundled_engine_dir(resource_dir);
    fs::create_dir_all(e.join("runtime/bin")).unwrap();
    if with_java {
        let exe = if cfg!(windows) { "java.exe" } else { "java" };
        fs::write(e.join("runtime/bin").join(exe), b"").unwrap();
    }
    if with_jar {
        fs::write(e.join(JAR_NAME), b"").unwrap();
    }
}

#[test]
fn override_wins_over_bundled() {
    let r = tmp("override");
    stage(&r, true, true);
    let l = locate(Some("/opt/java/bin/java"), Some("-jar /x/engine.jar"), Some(&r));
    assert_eq!(l.source, EngineSource::Override);
    assert_eq!(l.program, PathBuf::from("/opt/java/bin/java"));
    assert_eq!(l.args, ["-jar", "/x/engine.jar"]);
}

#[test]
fn override_without_args() {
    let l = locate(Some("my-engine"), None, None);
    assert_eq!(l.source, EngineSource::Override);
    assert!(l.args.is_empty());
}

#[test]
fn empty_override_is_ignored() {
    let r = tmp("empty");
    stage(&r, true, true);
    assert_eq!(locate(Some("  "), Some("-jar x"), Some(&r)).source, EngineSource::Bundled);
}

#[test]
fn bundled_runtime_and_jar_without_xmx() {
    let r = tmp("bundled");
    stage(&r, true, true);
    let l = locate(None, None, Some(&r));
    assert_eq!(l.source, EngineSource::Bundled);
    let e = bundled_engine_dir(&r);
    let exe = if cfg!(windows) { "java.exe" } else { "java" };
    assert_eq!(l.program, e.join("runtime").join("bin").join(exe));
    assert_eq!(l.args, ["-jar".to_string(), e.join(JAR_NAME).to_string_lossy().into_owned()]);
    // The jlink runtime has its JVM flags built in (engine-java/jvm-options.txt).
    assert!(l.args.iter().all(|a| !a.starts_with("-X")));
}

#[test]
fn bundled_path_with_spaces_and_polish_letters_is_one_argument() {
    let r = tmp("Zażółć gęślą");
    stage(&r, true, true);
    let l = locate(None, None, Some(&r));
    assert_eq!(l.source, EngineSource::Bundled);
    assert_eq!(l.args.len(), 2);
    assert!(l.args[1].contains("Zażółć gęślą"));
}

#[test]
fn unavailable_when_nothing_is_staged() {
    let r = tmp("missing");
    for (java, jar) in [(false, false), (true, false), (false, true)] {
        let r = r.join(format!("{java}-{jar}"));
        fs::create_dir_all(&r).unwrap();
        stage(&r, java, jar);
        assert!(matches!(locate(None, None, Some(&r)).source, EngineSource::Unavailable(_)), "{java} {jar}");
    }
    assert!(matches!(locate(None, None, None).source, EngineSource::Unavailable(_)));
}
