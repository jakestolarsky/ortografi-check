//! Supervisor and stale-filter tests against a fake engine (tests/fixtures/fake_engine.py).
use ortografi_check_lib::engine::protocol::parse_line;
use ortografi_check_lib::engine::{EngineConfig, EngineState, StaleFilter, Supervisor};
use serde_json::{json, Value};
use std::time::{Duration, Instant};

/// src-tauri dir; overridable so the tests can also run from a Tauri-free harness.
fn root() -> String {
    std::env::var("ORTOGRAFI_SRC_TAURI").unwrap_or_else(|_| env!("CARGO_MANIFEST_DIR").into())
}

fn examples() -> String {
    format!("{}/../contracts/v1/examples", root())
}

fn cfg(mode: &str) -> EngineConfig {
    let mut c = EngineConfig::new(
        "python3",
        vec![format!("{}/tests/fixtures/fake_engine.py", root()), mode.into(), examples()],
    );
    c.startup_timeout = Duration::from_millis(1500);
    c.check_timeout = Duration::from_millis(800);
    c.backoff = Duration::from_millis(20);
    c
}

fn check(id: &str, dv: u64, sv: u64, text: &str) -> Value {
    json!({"protocol":1,"type":"check","id":id,"docVersion":dv,"settingsVersion":sv,"text":text})
}

fn example(name: &str) -> Value {
    serde_json::from_str(&std::fs::read_to_string(format!("{}/{name}", examples())).unwrap()).unwrap()
}

#[test]
fn starts_and_checks() {
    let s = Supervisor::new(cfg("ok"));
    assert_eq!(s.state(), EngineState::Stopped);
    let ready = s.start().unwrap();
    assert_eq!(ready.kind(), "ready");
    let m = s.check(check("c1", 3, 1, "Wiem że."));
    assert_eq!(m.kind(), "result");
    assert_eq!(m.versions(), Some((3, 1)));
    assert_eq!(s.state(), EngineState::Ready);
}

#[test]
fn shared_examples_pass_through_unchanged() {
    let s = Supervisor::new(cfg("ok"));
    for id in ["p0-0003", "p0-0059", "p0-0063", "p0-0061"] {
        let req = example(&format!("corpus-{id}-check.json"));
        let want = example(&format!("corpus-{id}-result.json"));
        let got = s.check(req.clone());
        assert_eq!(got.raw, want, "{id} changed in transit");
        // Insertion point and NFD text survive intact.
        if id == "p0-0003" {
            assert_eq!(got.raw["issues"][0]["start"], got.raw["issues"][0]["end"]);
        }
        if id == "p0-0063" {
            assert!(req["text"].as_str().unwrap().contains('\u{0307}'));
        }
    }
}

#[test]
fn invalid_line_maps_to_engine_error_and_restarts() {
    let s = Supervisor::new(cfg("ok"));
    let m = s.check(check("c1", 1, 1, "GARBAGE"));
    assert_eq!(m.error_code(), Some("ENGINE_ERROR"));
    assert_eq!(m.versions(), Some((1, 1)));
    let m = s.check(check("c2", 2, 1, "ok"));
    assert_eq!(m.kind(), "result");
}

#[test]
fn answer_for_another_id_is_engine_error() {
    let s = Supervisor::new(cfg("ok"));
    assert_eq!(s.check(check("c1", 1, 1, "WRONGID")).error_code(), Some("ENGINE_ERROR"));
}

#[test]
fn per_check_timeout() {
    let s = Supervisor::new(cfg("ok"));
    let t0 = Instant::now();
    let m = s.check(check("c1", 4, 2, "SLOW"));
    assert_eq!(m.error_code(), Some("TIMEOUT"));
    assert_eq!(m.id(), Some("c1"));
    assert_eq!(m.versions(), Some((4, 2)));
    assert!(t0.elapsed() < Duration::from_secs(3));
    // Engine was killed and restarts for the next check.
    assert_eq!(s.check(check("c2", 5, 2, "ok")).kind(), "result");
}

#[test]
fn spawn_failure_is_engine_unavailable() {
    let mut c = cfg("ok");
    c.program = "/nonexistent/ortografi-engine".into();
    let s = Supervisor::new(c);
    let m = s.check(check("c1", 1, 1, "x"));
    assert_eq!(m.error_code(), Some("ENGINE_UNAVAILABLE"));
    assert_eq!(m.versions(), Some((1, 1)));
    assert_eq!(s.state(), EngineState::Unavailable);
}

#[test]
fn startup_failures_are_engine_unavailable() {
    for mode in ["crash", "badready", "noready"] {
        let s = Supervisor::new(cfg(mode));
        assert!(s.start().is_err(), "{mode}");
        assert_eq!(s.state(), EngineState::Unavailable, "{mode}");
    }
}

#[test]
fn crash_restarts_once_with_backoff_then_gives_up() {
    let log = format!("{}/spawns", tempdir());
    let s = Supervisor::new(cfg_logged(&log));
    assert_eq!(s.check(check("c1", 1, 1, "CRASH")).error_code(), Some("ENGINE_UNAVAILABLE"));
    // Budget max_restarts = 1: one automatic restart.
    assert_eq!(s.check(check("c2", 2, 1, "CRASH")).error_code(), Some("ENGINE_UNAVAILABLE"));
    // Second consecutive failure exhausts it: no restart loop.
    assert_eq!(s.state(), EngineState::Unavailable);
    assert_eq!(s.check(check("c3", 3, 1, "ok")).error_code(), Some("ENGINE_UNAVAILABLE"));
    assert_eq!(spawns(&log), 2);
    // Manual retry recovers.
    s.reset();
    assert_eq!(s.check(check("c4", 4, 1, "ok")).kind(), "result");
    assert_eq!(spawns(&log), 3);
}

fn spawns(log: &str) -> usize {
    std::fs::read_to_string(log).unwrap().lines().filter(|l| *l == "spawn").count()
}

/// Runs the fake through `env` so each test has its own spawn log (tests run in parallel).
fn cfg_logged(log: &str) -> EngineConfig {
    let mut c = cfg("ok");
    c.args.insert(0, format!("FAKE_SPAWN_LOG={log}"));
    c.args.insert(1, "python3".into());
    c.program = "env".into();
    c
}

#[test]
fn shutdown_is_sent_on_exit() {
    let log = format!("{}/spawns", tempdir());
    let c = cfg_logged(&log);
    let s = Supervisor::new(c);
    s.start().unwrap();
    drop(s);
    let log = std::fs::read_to_string(&log).unwrap();
    assert_eq!(log.lines().collect::<Vec<_>>(), ["spawn", "shutdown"]);
}

#[test]
fn malformed_request_is_rejected_before_the_engine() {
    let s = Supervisor::new(cfg("ok"));
    let m = s.check(json!({"protocol":1,"type":"check","id":"c1","docVersion":1,"settingsVersion":1,"text":"x","extra":1}));
    assert_eq!(m.error_code(), Some("MALFORMED_REQUEST"));
}

// ---- stale-result rejection ----

fn result(dv: u64, sv: u64) -> ortografi_check_lib::engine::Message {
    parse_line(&json!({"protocol":1,"type":"result","id":format!("c{dv}"),"docVersion":dv,"settingsVersion":sv,
        "engineVersion":"6.8","status":"complete","issues":[]}).to_string()).unwrap()
}

fn error(code: &str, dv: u64, sv: u64) -> ortografi_check_lib::engine::Message {
    parse_line(&json!({"protocol":1,"type":"error","id":format!("c{dv}"),"code":code,"detail":"d",
        "docVersion":dv,"settingsVersion":sv}).to_string()).unwrap()
}

#[test]
fn reverse_order_arrival_drops_the_older_result() {
    let mut f = StaleFilter::new();
    f.note_request("main", (1, 1));
    f.note_request("main", (2, 1));
    assert!(f.accept("main", &result(2, 1)));
    assert!(!f.accept("main", &result(1, 1)));
}

#[test]
fn late_timeout_for_an_old_version_is_dropped() {
    let mut f = StaleFilter::new();
    f.note_request("main", (5, 1));
    f.note_request("main", (6, 1));
    assert!(!f.accept("main", &error("TIMEOUT", 5, 1)));
    assert!(f.accept("main", &error("TIMEOUT", 6, 1)));
}

#[test]
fn settings_change_invalidates_results() {
    let mut f = StaleFilter::new();
    f.note_request("main", (3, 1));
    f.note_request("main", (3, 2)); // dictionary changed, same text
    assert!(!f.accept("main", &result(3, 1)));
    assert!(f.accept("main", &result(3, 2)));
}

#[test]
fn documents_are_tracked_independently_and_unversioned_errors_pass() {
    let mut f = StaleFilter::new();
    f.note_request("a", (9, 1));
    f.note_request("b", (1, 1));
    assert!(f.accept("b", &result(1, 1)));
    let malformed = parse_line(r#"{"protocol":1,"type":"error","id":null,"code":"MALFORMED_REQUEST","detail":"d"}"#).unwrap();
    assert!(f.accept("a", &malformed));
}

fn tempdir() -> String {
    let d = std::env::temp_dir().join(format!("ortografi-test-{}-{:?}", std::process::id(), Instant::now()));
    std::fs::create_dir_all(&d).unwrap();
    d.to_string_lossy().into_owned()
}
