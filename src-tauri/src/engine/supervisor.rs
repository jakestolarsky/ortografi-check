//! Minimal engine process supervisor (PLAN.md section 5).
//!
//! One child process, one check at a time. The adapter must send `ready` within
//! `startup_timeout`; each check must be answered within a limit that scales with text
//! length ([`EngineConfig::check_timeout_for`]). Rust-side failures are protocol v1 errors:
//! invalid engine line -> ENGINE_ERROR, no answer in time -> TIMEOUT,
//! spawn failure / crash / budget exhausted -> ENGINE_UNAVAILABLE.
//!
//! Failure budgets: crashes, spawn failures and invalid lines count toward `max_restarts`
//! (consecutive). Timeouts restart the engine but do not count there; instead
//! `max_consecutive_timeouts` timeouts with no successful result in between make the engine
//! unavailable. Any successful result resets both counters. `reset()` is the manual retry.
//!
//! After a failure the engine is respawned in the background immediately (with backoff).
//! The failed check gets exactly one error and is never retried; a newest waiting check is
//! kept and sent once the engine is ready.

use super::protocol::{error_for_check, parse_line, parse_value, Message};
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

#[derive(Debug, Clone)]
pub struct EngineConfig {
    pub program: PathBuf,
    pub args: Vec<String>,
    /// Wait for `ready` (measured ~1.1 s, p95 1.3 s).
    pub startup_timeout: Duration,
    /// Per-check limit = base + per_unit * UTF-16 length (+ first_check_extra).
    pub check_timeout_base: Duration,
    pub check_timeout_per_unit: Duration,
    /// Added to the first check after each engine start (rules load lazily: cold 50k ~4 s).
    pub first_check_extra: Duration,
    /// Automatic restarts allowed after consecutive crashes (PLAN: retry once).
    pub max_restarts: u32,
    /// Consecutive timeouts (no successful result in between) before `unavailable`.
    pub max_consecutive_timeouts: u32,
    /// Delay before crash restart n is `backoff * 2^(n-1)`.
    pub backoff: Duration,
}

impl EngineConfig {
    pub fn new(program: impl Into<PathBuf>, args: Vec<String>) -> Self {
        Self {
            program: program.into(),
            args,
            startup_timeout: Duration::from_secs(10),
            check_timeout_base: Duration::from_secs(3),
            check_timeout_per_unit: Duration::from_micros(60),
            first_check_extra: Duration::from_secs(3),
            max_restarts: 1,
            max_consecutive_timeouts: 3,
            backoff: Duration::from_millis(500),
        }
    }

    /// 3 s + 60 µs per UTF-16 unit by default (50k units = 6 s), + 3 s on a first check.
    pub fn check_timeout_for(&self, utf16_len: usize, first_check: bool) -> Duration {
        let units = u32::try_from(utf16_len).unwrap_or(u32::MAX);
        let mut t = self.check_timeout_base + self.check_timeout_per_unit.saturating_mul(units);
        if first_check {
            t += self.first_check_extra;
        }
        t
    }
}

/// Published on `engine://status` and returned by `engine_status`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EngineState {
    /// Initial start in progress (or not yet started).
    Starting,
    Ready,
    /// A check is running.
    Busy,
    /// The engine was stopped after a crash or timeout; it is respawned for the next check.
    Restarting,
    /// Budget exhausted or the engine cannot be spawned; needs a manual retry.
    Unavailable,
}

impl EngineState {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Starting => "starting",
            Self::Ready => "ready",
            Self::Busy => "busy",
            Self::Restarting => "restarting",
            Self::Unavailable => "unavailable",
        }
    }
}

pub type StatusListener = Arc<dyn Fn(EngineState) + Send + Sync>;

struct Running {
    child: Child,
    stdin: ChildStdin,
    lines: Receiver<String>,
    ready: Message,
    first_check: bool,
}

#[derive(Default)]
struct Inner {
    running: Option<Running>,
    crashes: u32,
    timeouts: u32,
    unavailable: bool,
    /// Set by shutdown(): no more (re)spawns.
    closed: bool,
    /// `starting` has been published for the current start attempt.
    announced: bool,
}

/// Public handle; the shared core is also owned by background respawn threads.
pub struct Supervisor {
    core: Arc<Core>,
}

struct Core {
    cfg: EngineConfig,
    inner: Mutex<Inner>,
    state: Mutex<EngineState>,
    listener: Option<StatusListener>,
    /// Sequence number of the newest check passed to `submit`.
    newest: AtomicU64,
}

enum Failure {
    Crash,
    Timeout,
}

impl Supervisor {
    pub fn new(cfg: EngineConfig) -> Self {
        Self::build(cfg, None)
    }

    pub fn with_listener(cfg: EngineConfig, listener: StatusListener) -> Self {
        Self::build(cfg, Some(listener))
    }

    fn build(cfg: EngineConfig, listener: Option<StatusListener>) -> Self {
        Self {
            core: Arc::new(Core {
                cfg,
                inner: Mutex::new(Inner::default()),
                state: Mutex::new(EngineState::Starting),
                listener,
                newest: AtomicU64::new(0),
            }),
        }
    }

    /// Current state; never blocks on a running check.
    pub fn state(&self) -> EngineState {
        self.core.state()
    }

    /// Start the engine now (the app does this in the background at launch).
    pub fn start(&self) -> Result<Message, String> {
        let mut g = self.core.inner.lock().unwrap();
        self.core.ensure_running(&mut g)?;
        Ok(g.running.as_ref().unwrap().ready.clone())
    }

    /// Clear the failure budgets (no state change, no spawn). Prefer [`Self::retry`].
    pub fn reset(&self) {
        let mut g = self.core.inner.lock().unwrap();
        g.unavailable = false;
        g.crashes = 0;
        g.timeouts = 0;
    }

    /// Manual retry after `unavailable`: clears the budgets and sets `starting` **before
    /// returning**, so a check submitted right after is queued (delivered at `ready`) rather
    /// than answered ENGINE_UNAVAILABLE. The spawn itself continues in the background.
    pub fn retry(&self) {
        {
            let mut g = self.core.inner.lock().unwrap();
            g.unavailable = false;
            g.crashes = 0;
            g.timeouts = 0;
            if g.running.is_some() {
                return;
            }
            g.announced = true;
            self.core.set_state(EngineState::Starting);
        }
        let core = Arc::clone(&self.core);
        thread::spawn(move || {
            let mut g = core.inner.lock().unwrap();
            if !g.closed && g.running.is_none() {
                let _ = core.ensure_running(&mut g);
            }
        });
    }

    /// New UI session: drop any waiting check (it will never be sent; its `submit` returns
    /// `None`). A check already running is not interrupted.
    pub fn drop_waiting(&self) {
        self.core.newest.fetch_add(1, Ordering::SeqCst);
    }

    /// Queue a check, keeping only the newest waiting one (PLAN section 4): if a newer
    /// check is submitted while this one waits for the engine, this one is never sent and
    /// `None` is returned. A check already running is not interrupted. A waiting check is
    /// also kept across a failure of the running one and sent once the engine is respawned.
    pub fn submit(&self, request: serde_json::Value) -> Option<Message> {
        let seq = self.core.newest.fetch_add(1, Ordering::SeqCst) + 1;
        let mut g = self.core.inner.lock().unwrap();
        if self.core.newest.load(Ordering::SeqCst) != seq {
            return None;
        }
        Some(Core::check_locked(&self.core, &mut g, request))
    }

    /// Run one check now (waiting for any running one) and return the engine's answer or a
    /// Rust-side error answering the same check. A failed check gets exactly one error and
    /// is never retried by Rust. Never panics on engine misbehaviour.
    pub fn check(&self, request: serde_json::Value) -> Message {
        let mut g = self.core.inner.lock().unwrap();
        Core::check_locked(&self.core, &mut g, request)
    }

    /// Send `shutdown` and wait briefly; kill if the process does not exit. Final.
    pub fn shutdown(&self) {
        self.core.shutdown()
    }
}

impl Core {

    /// Current state; never blocks on a running check.
    pub fn state(&self) -> EngineState {
        *self.state.lock().unwrap()
    }

    fn set_state(&self, s: EngineState) {
        self.publish(s, false)
    }

    /// `force` re-announces an unchanged state (the initial `starting`).
    fn publish(&self, s: EngineState, force: bool) {
        let mut cur = self.state.lock().unwrap();
        if force || *cur != s {
            *cur = s;
            drop(cur);
            if let Some(l) = &self.listener {
                l(s);
            }
        }
    }

    fn check_locked(this: &Arc<Self>, g: &mut Inner, request: serde_json::Value) -> Message {
        let core = this;
        let req = match parse_value(request) {
            Ok(m) if m.kind() == "check" => m,
            _ => {
                let raw = serde_json::json!({"protocol":1,"type":"error","id":null,
                    "code":"MALFORMED_REQUEST","detail":"Not a valid protocol v1 check request."});
                return parse_value(raw).unwrap();
            }
        };
        if let Err(d) = core.ensure_running(g) {
            return error_for_check("ENGINE_UNAVAILABLE", &req, &d);
        }
        core.set_state(EngineState::Busy);
        let text_len = req.raw["text"].as_str().map_or(0, |t| t.encode_utf16().count());
        let run = g.running.as_mut().unwrap();
        let limit = core.cfg.check_timeout_for(text_len, run.first_check);
        run.first_check = false;
        let mut line = serde_json::to_string(&req.raw).unwrap();
        line.push('\n');
        if run.stdin.write_all(line.as_bytes()).and_then(|_| run.stdin.flush()).is_err() {
            Core::failed(core, g, Failure::Crash);
            return error_for_check("ENGINE_UNAVAILABLE", &req, "The engine process exited.");
        }
        match run.lines.recv_timeout(limit) {
            Ok(l) => match parse_line(&l) {
                Ok(m) if answers(&m, &req) => {
                    g.crashes = 0;
                    g.timeouts = 0;
                    core.set_state(EngineState::Ready);
                    m
                }
                _ => {
                    // Protocol desync: the stream can no longer be trusted.
                    Core::failed(core, g, Failure::Crash);
                    error_for_check("ENGINE_ERROR", &req, "The engine sent an invalid response.")
                }
            },
            Err(RecvTimeoutError::Timeout) => {
                // LanguageTool cannot be interrupted reliably: kill and restart (PLAN section 4).
                Core::failed(core, g, Failure::Timeout);
                error_for_check("TIMEOUT", &req, "Analysis exceeded the time limit.")
            }
            Err(RecvTimeoutError::Disconnected) => {
                Core::failed(core, g, Failure::Crash);
                error_for_check("ENGINE_UNAVAILABLE", &req, "The engine process exited.")
            }
        }
    }

    /// Send `shutdown` and wait briefly; kill if the process does not exit.
    fn shutdown(&self) {
        let mut g = self.inner.lock().unwrap();
        g.closed = true;
        if let Some(mut run) = g.running.take() {
            let _ = run.stdin.write_all(b"{\"protocol\":1,\"type\":\"shutdown\"}\n");
            let _ = run.stdin.flush();
            drop(run.stdin);
            let deadline = Instant::now() + Duration::from_secs(2);
            loop {
                match run.child.try_wait() {
                    Ok(Some(_)) => break,
                    _ if Instant::now() >= deadline => {
                        let _ = run.child.kill();
                        let _ = run.child.wait();
                        break;
                    }
                    _ => thread::sleep(Duration::from_millis(10)),
                }
            }
        }
    }

    /// Kill the engine after a failure, update the budgets and, unless unavailable, respawn
    /// it in the background (once the current check has returned and released the lock).
    fn failed(this: &Arc<Self>, g: &mut Inner, f: Failure) {
        let core = this;
        if let Some(mut run) = g.running.take() {
            let _ = run.child.kill();
            let _ = run.child.wait();
        }
        match f {
            Failure::Crash => g.crashes += 1,
            Failure::Timeout => g.timeouts += 1,
        }
        if g.crashes > core.cfg.max_restarts || g.timeouts >= core.cfg.max_consecutive_timeouts {
            g.unavailable = true;
            core.set_state(EngineState::Unavailable);
        } else {
            core.set_state(EngineState::Restarting);
            let core = Arc::clone(core);
            thread::spawn(move || {
                let mut g = core.inner.lock().unwrap();
                if !g.closed && g.running.is_none() {
                    let _ = core.ensure_running(&mut g);
                }
            });
        }
    }

    fn ensure_running(&self, g: &mut Inner) -> Result<(), String> {
        if g.running.is_some() {
            return Ok(());
        }
        if g.closed {
            return Err("The engine has been shut down.".into());
        }
        // A fresh start is announced once; a respawn after a failure stays `restarting`.
        if !g.unavailable && !g.announced && self.state() != EngineState::Restarting {
            self.publish(EngineState::Starting, true);
        }
        g.announced = false;
        loop {
            if g.unavailable {
                self.set_state(EngineState::Unavailable);
                return Err("The engine is unavailable after repeated failures.".into());
            }
            if g.crashes > 0 {
                thread::sleep(self.cfg.backoff * 2u32.saturating_pow(g.crashes - 1));
            }
            match self.spawn() {
                Ok(run) => {
                    g.running = Some(run);
                    self.set_state(EngineState::Ready);
                    return Ok(());
                }
                Err(_) => {
                    g.crashes += 1;
                    if g.crashes > self.cfg.max_restarts {
                        g.unavailable = true;
                    }
                }
            }
        }
    }

    fn spawn(&self) -> Result<Running, String> {
        let mut child = Command::new(&self.cfg.program)
            .args(&self.cfg.args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("spawn failed: {e}"))?;
        let stdin = child.stdin.take().unwrap();
        let stdout = child.stdout.take().unwrap();
        let stderr = child.stderr.take().unwrap();
        // Drain stderr so a full pipe can never block the engine (PLAN section 5).
        thread::spawn(move || for _ in BufReader::new(stderr).lines() {});
        let (tx, lines) = mpsc::channel();
        thread::spawn(move || {
            for l in BufReader::new(stdout).lines() {
                let Ok(l) = l else { break };
                if tx.send(l).is_err() {
                    break;
                }
            }
        });
        let fail = |mut child: Child, why: &str| {
            let _ = child.kill();
            let _ = child.wait();
            Err(why.to_owned())
        };
        match lines.recv_timeout(self.cfg.startup_timeout) {
            Ok(l) => match parse_line(&l) {
                Ok(m) if m.kind() == "ready" => {
                    Ok(Running { child, stdin, lines, ready: m, first_check: true })
                }
                _ => fail(child, "engine did not send a valid ready message"),
            },
            Err(RecvTimeoutError::Timeout) => fail(child, "engine startup timed out"),
            Err(RecvTimeoutError::Disconnected) => fail(child, "engine exited during startup"),
        }
    }
}

impl Drop for Supervisor {
    fn drop(&mut self) {
        self.shutdown();
    }
}

/// The answer must be a result or error for this exact request.
fn answers(m: &Message, req: &Message) -> bool {
    matches!(m.kind(), "result" | "error")
        && m.id() == req.id()
        && (m.kind() == "error" && m.versions().is_none() || m.versions() == req.versions())
}
