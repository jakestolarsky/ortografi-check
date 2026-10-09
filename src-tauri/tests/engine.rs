//! Supervisor and stale-filter tests against a fake engine (tests/fixtures/fake_engine.py).
use ortografi_check_lib::engine::protocol::parse_line;
use ortografi_check_lib::engine::{EngineConfig, EngineState, StaleFilter, Supervisor};
use serde_json::{json, Value};
use std::sync::{Arc, Mutex};
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
    c.check_timeout_base = Duration::from_millis(800);
    c.check_timeout_per_unit = Duration::ZERO;
    c.first_check_extra = Duration::ZERO;
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
    assert_eq!(s.state(), EngineState::Starting);
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

// ---- timeouts ----

#[test]
fn default_limits_match_engine_measurements() {
    let c = EngineConfig::new("x", vec![]);
    assert_eq!(c.startup_timeout, Duration::from_secs(10));
    // 3 s + 60 us per UTF-16 unit; +3 s on the first check after a start.
    assert_eq!(c.check_timeout_for(0, false), Duration::from_secs(3));
    assert_eq!(c.check_timeout_for(50_000, false), Duration::from_secs(6));
    assert_eq!(c.check_timeout_for(50_000, true), Duration::from_secs(9));
    assert_eq!(c.check_timeout_for(1_000, true), Duration::from_millis(6_060));
    assert_eq!(c.max_consecutive_timeouts, 3);
}

#[test]
fn first_check_after_start_gets_extra_time() {
    let mut c = cfg("ok");
    c.check_timeout_base = Duration::from_millis(300);
    c.first_check_extra = Duration::from_millis(1000);
    let s = Supervisor::new(c);
    assert_eq!(s.check(check("c1", 1, 1, "SLEEP:700")).kind(), "result");
    assert_eq!(s.check(check("c2", 2, 1, "SLEEP:700")).error_code(), Some("TIMEOUT"));
    // Restarted engine: its first check gets the extra time again.
    assert_eq!(s.check(check("c3", 3, 1, "SLEEP:700")).kind(), "result");
}

#[test]
fn timeout_scales_with_text_length() {
    let mut c = cfg("ok");
    c.check_timeout_base = Duration::from_millis(300);
    c.check_timeout_per_unit = Duration::from_millis(1);
    let s = Supervisor::new(c);
    s.start().unwrap();
    let long = format!("SLEEP:600 {}", "ą".repeat(700)); // ~710 units -> ~1 s limit
    assert_eq!(s.check(check("c1", 1, 1, &long)).kind(), "result");
    assert_eq!(s.check(check("c2", 2, 1, "SLEEP:600")).error_code(), Some("TIMEOUT"));
}

#[test]
fn timeouts_do_not_count_as_crashes() {
    let mut c = cfg("ok");
    c.check_timeout_base = Duration::from_millis(300);
    let s = Supervisor::new(c); // max_restarts = 1
    assert_eq!(s.check(check("c1", 1, 1, "SLEEP:800")).error_code(), Some("TIMEOUT"));
    assert_eq!(s.check(check("c2", 2, 1, "SLEEP:800")).error_code(), Some("TIMEOUT"));
    assert_ne!(s.state(), EngineState::Unavailable);
    assert_eq!(s.check(check("c3", 3, 1, "ok")).kind(), "result");
    // And a crash after timeouts still has its full restart budget.
    assert_eq!(s.check(check("c4", 4, 1, "CRASH")).error_code(), Some("ENGINE_UNAVAILABLE"));
    assert_eq!(s.check(check("c5", 5, 1, "ok")).kind(), "result");
}

#[test]
fn three_consecutive_timeouts_make_the_engine_unavailable() {
    let mut c = cfg("ok");
    c.check_timeout_base = Duration::from_millis(300);
    let s = Supervisor::new(c);
    for i in 1..=3 {
        assert_eq!(s.check(check(&format!("c{i}"), i, 1, "SLEEP:800")).error_code(), Some("TIMEOUT"));
    }
    assert_eq!(s.state(), EngineState::Unavailable);
    assert_eq!(s.check(check("c4", 4, 1, "ok")).error_code(), Some("ENGINE_UNAVAILABLE"));
    s.reset();
    assert_eq!(s.check(check("c5", 5, 1, "ok")).kind(), "result");
}

#[test]
fn a_successful_result_resets_the_timeout_counter() {
    let mut c = cfg("ok");
    c.check_timeout_base = Duration::from_millis(300);
    let s = Supervisor::new(c);
    let slow = |id: &str, v| s.check(check(id, v, 1, "SLEEP:800")).error_code().map(String::from);
    assert_eq!(slow("c1", 1).as_deref(), Some("TIMEOUT"));
    assert_eq!(slow("c2", 2).as_deref(), Some("TIMEOUT"));
    assert_eq!(s.check(check("c3", 3, 1, "ok")).kind(), "result");
    assert_eq!(slow("c4", 4).as_deref(), Some("TIMEOUT"));
    assert_eq!(slow("c5", 5).as_deref(), Some("TIMEOUT"));
    assert_ne!(s.state(), EngineState::Unavailable);
}

// ---- status ----

fn recording(c: EngineConfig) -> (Supervisor, Arc<Mutex<Vec<&'static str>>>) {
    let seen = Arc::new(Mutex::new(Vec::new()));
    let sink = seen.clone();
    let s = Supervisor::with_listener(c, Arc::new(move |st: EngineState| sink.lock().unwrap().push(st.as_str())));
    (s, seen)
}

fn take(seen: &Mutex<Vec<&'static str>>) -> Vec<&'static str> {
    std::mem::take(&mut *seen.lock().unwrap())
}

#[test]
fn status_transitions_are_reported() {
    let (s, seen) = recording(cfg("ok"));
    s.start().unwrap();
    assert_eq!(take(&seen), ["starting", "ready"]);
    assert_eq!(s.state().as_str(), "ready");
    s.check(check("c1", 1, 1, "ok"));
    assert_eq!(take(&seen), ["busy", "ready"]);
    s.check(check("c2", 2, 1, "CRASH"));
    assert!(wait_for(&s, EngineState::Ready), "background respawn");
    assert_eq!(take(&seen), ["busy", "restarting", "ready"]);
    s.check(check("c3", 3, 1, "ok"));
    assert_eq!(take(&seen), ["busy", "ready"]);
    s.check(check("c4", 4, 1, "CRASH"));
    s.check(check("c5", 5, 1, "CRASH"));
    assert_eq!(take(&seen).last(), Some(&"unavailable"));
    assert_eq!(s.state(), EngineState::Unavailable);
}

#[test]
fn spawn_failure_reports_unavailable_status() {
    let mut c = cfg("ok");
    c.program = "/nonexistent/ortografi-engine".into();
    let (s, seen) = recording(c);
    assert!(s.start().is_err());
    let got = take(&seen);
    assert_eq!(got.first(), Some(&"starting"));
    assert_eq!(got.last(), Some(&"unavailable"));
}

// ---- queue: only the newest waiting check ----

#[test]
fn superseded_waiting_check_is_never_sent() {
    let log = format!("{}/spawns", tempdir());
    let s = Arc::new(Supervisor::new(cfg_logged(&log)));
    s.start().unwrap();
    let run = |id: &'static str, text: &'static str, delay: u64| {
        let s = s.clone();
        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(delay));
            s.submit(check(id, delay + 1, 1, text))
        })
    };
    let a = run("a", "SLEEP:500", 0); // running
    let b = run("b", "ok", 100); // waiting, then superseded by c
    let c = run("c", "ok", 200); // newest waiting
    let (a, b, c) = (a.join().unwrap(), b.join().unwrap(), c.join().unwrap());
    assert_eq!(a.unwrap().kind(), "result");
    assert!(b.is_none(), "superseded check must not be answered");
    assert_eq!(c.unwrap().id(), Some("c"));
    let sent: Vec<String> = std::fs::read_to_string(&log).unwrap().lines()
        .filter_map(|l| l.strip_prefix("recv ").map(String::from)).collect();
    assert_eq!(sent, ["a", "c"]);
}

// ---- background respawn after a failure ----

fn wait_for(s: &Supervisor, want: EngineState) -> bool {
    let t0 = Instant::now();
    while t0.elapsed() < Duration::from_secs(3) {
        if s.state() == want {
            return true;
        }
        std::thread::sleep(Duration::from_millis(10));
    }
    false
}

fn received(log: &str) -> Vec<String> {
    std::fs::read_to_string(log).unwrap().lines()
        .filter_map(|l| l.strip_prefix("recv ").map(String::from)).collect()
}

#[test]
fn background_respawn_after_crash_reaches_ready_without_a_new_check() {
    let log = format!("{}/spawns", tempdir());
    let s = Supervisor::new(cfg_logged(&log));
    assert_eq!(s.check(check("a", 1, 1, "CRASH")).error_code(), Some("ENGINE_UNAVAILABLE"));
    assert!(wait_for(&s, EngineState::Ready));
    assert_eq!(spawns(&log), 2);
    assert_eq!(received(&log), ["a"], "failed check must not be resent");
}

#[test]
fn background_respawn_after_timeout_reaches_ready_without_a_new_check() {
    let log = format!("{}/spawns", tempdir());
    let mut c = cfg_logged(&log);
    c.check_timeout_base = Duration::from_millis(300);
    let s = Supervisor::new(c);
    assert_eq!(s.check(check("a", 1, 1, "SLEEP:800")).error_code(), Some("TIMEOUT"));
    assert!(wait_for(&s, EngineState::Ready));
    assert_eq!(spawns(&log), 2);
    assert_eq!(received(&log), ["a"]);
}

fn failed_then_waiting(text_a: &'static str, base_ms: u64) -> (Option<Value>, Option<Value>, Vec<String>) {
    let log = format!("{}/spawns", tempdir());
    let mut c = cfg_logged(&log);
    c.check_timeout_base = Duration::from_millis(base_ms);
    let s = Arc::new(Supervisor::new(c));
    s.start().unwrap();
    let s1 = s.clone();
    let a = std::thread::spawn(move || s1.submit(check("a", 1, 1, text_a)).map(|m| m.raw));
    std::thread::sleep(Duration::from_millis(100));
    let s2 = s.clone();
    let b = std::thread::spawn(move || s2.submit(check("b", 2, 1, "ok")).map(|m| m.raw));
    let (a, b) = (a.join().unwrap(), b.join().unwrap());
    (a, b, received(&log))
}

#[test]
fn waiting_check_is_delivered_once_after_a_crash() {
    let (a, b, sent) = failed_then_waiting("SLEEP:300 CRASH", 800);
    let a = a.unwrap();
    assert_eq!(a["code"], "ENGINE_UNAVAILABLE");
    assert_eq!((a["docVersion"].as_u64(), a["settingsVersion"].as_u64()), (Some(1), Some(1)));
    assert_eq!(b.unwrap()["type"], "result");
    assert_eq!(sent, ["a", "b"], "a sent once and never retried; b sent once");
}

#[test]
fn waiting_check_is_delivered_once_after_a_timeout() {
    let (a, b, sent) = failed_then_waiting("SLEEP:800", 300);
    assert_eq!(a.unwrap()["code"], "TIMEOUT");
    assert_eq!(b.unwrap()["type"], "result");
    assert_eq!(sent, ["a", "b"]);
}

#[test]
fn waiting_check_is_delivered_once_after_an_invalid_line() {
    let (a, b, sent) = failed_then_waiting("SLEEP:300 GARBAGE", 800);
    assert_eq!(a.unwrap()["code"], "ENGINE_ERROR");
    assert_eq!(b.unwrap()["type"], "result");
    assert_eq!(sent, ["a", "b"]);
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
