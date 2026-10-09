//! Minimal engine process supervisor (PLAN.md section 5).
//!
//! One child process, one check at a time. The adapter is started lazily, must send `ready`
//! within `startup_timeout`, and each `check` must be answered within `check_timeout`.
//! Rust-side failures are reported as protocol v1 error messages:
//! invalid engine line -> ENGINE_ERROR, no answer in time -> TIMEOUT,
//! spawn failure / crash / restart budget exhausted -> ENGINE_UNAVAILABLE.

use super::protocol::{error_for_check, parse_line, parse_value, Message};
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};

#[derive(Debug, Clone)]
pub struct EngineConfig {
    pub program: PathBuf,
    pub args: Vec<String>,
    pub startup_timeout: Duration,
    pub check_timeout: Duration,
    /// Automatic restarts allowed after consecutive failures (PLAN: retry once).
    pub max_restarts: u32,
    /// Delay before restart n is `backoff * 2^(n-1)`.
    pub backoff: Duration,
}

impl EngineConfig {
    pub fn new(program: impl Into<PathBuf>, args: Vec<String>) -> Self {
        Self {
            program: program.into(),
            args,
            startup_timeout: Duration::from_secs(20),
            check_timeout: Duration::from_secs(30),
            max_restarts: 1,
            backoff: Duration::from_millis(500),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EngineState {
    Stopped,
    Ready,
    Unavailable,
}

struct Running {
    child: Child,
    stdin: ChildStdin,
    lines: Receiver<String>,
    ready: Message,
}

struct Inner {
    running: Option<Running>,
    failures: u32,
    unavailable: bool,
}

pub struct Supervisor {
    cfg: EngineConfig,
    inner: Mutex<Inner>,
}

enum Fail {
    Unavailable(String),
}

impl Supervisor {
    pub fn new(cfg: EngineConfig) -> Self {
        Self { cfg, inner: Mutex::new(Inner { running: None, failures: 0, unavailable: false }) }
    }

    pub fn state(&self) -> EngineState {
        let g = self.inner.lock().unwrap();
        if g.unavailable {
            EngineState::Unavailable
        } else if g.running.is_some() {
            EngineState::Ready
        } else {
            EngineState::Stopped
        }
    }

    /// Start the engine now (normally done in the background at app start).
    /// Returns the engine's `ready` message.
    pub fn start(&self) -> Result<Message, String> {
        let mut g = self.inner.lock().unwrap();
        self.ensure_running(&mut g).map_err(|Fail::Unavailable(d)| d)?;
        Ok(g.running.as_ref().unwrap().ready.clone())
    }

    /// Manual retry after the restart budget is exhausted (the UI's "retry" action).
    pub fn reset(&self) {
        let mut g = self.inner.lock().unwrap();
        g.unavailable = false;
        g.failures = 0;
    }

    /// Send one `check` (a validated CheckRequest JSON) and return the engine's answer, or
    /// a Rust-side error that answers the same check. Never panics on engine misbehaviour.
    pub fn check(&self, request: serde_json::Value) -> Message {
        let req = match parse_value(request) {
            Ok(m) if m.kind() == "check" => m,
            _ => {
                let raw = serde_json::json!({"protocol":1,"type":"error","id":null,
                    "code":"MALFORMED_REQUEST","detail":"Not a valid protocol v1 check request."});
                return parse_value(raw).unwrap();
            }
        };
        let mut g = self.inner.lock().unwrap();
        if let Err(Fail::Unavailable(d)) = self.ensure_running(&mut g) {
            return error_for_check("ENGINE_UNAVAILABLE", &req, &d);
        }
        let run = g.running.as_mut().unwrap();
        let mut line = serde_json::to_string(&req.raw).unwrap();
        line.push('\n');
        if run.stdin.write_all(line.as_bytes()).and_then(|_| run.stdin.flush()).is_err() {
            self.crashed(&mut g);
            return error_for_check("ENGINE_UNAVAILABLE", &req, "The engine process exited.");
        }
        let deadline = Instant::now() + self.cfg.check_timeout;
        let run = g.running.as_mut().unwrap();
        let outcome = match run.lines.recv_timeout(deadline.saturating_duration_since(Instant::now())) {
            Ok(l) => Ok(l),
            Err(RecvTimeoutError::Timeout) => Err("TIMEOUT"),
            Err(RecvTimeoutError::Disconnected) => Err("ENGINE_UNAVAILABLE"),
        };
        match outcome {
            Ok(l) => match parse_line(&l) {
                Ok(m) if answers(&m, &req) => {
                    g.failures = 0;
                    m
                }
                _ => {
                    // Protocol desync: the stream can no longer be trusted. Restart next time.
                    self.crashed(&mut g);
                    error_for_check("ENGINE_ERROR", &req, "The engine sent an invalid response.")
                }
            },
            Err("TIMEOUT") => {
                // LanguageTool cannot be interrupted reliably: kill and restart (PLAN section 4).
                self.crashed(&mut g);
                error_for_check("TIMEOUT", &req, "Analysis exceeded the time limit.")
            }
            Err(_) => {
                self.crashed(&mut g);
                error_for_check("ENGINE_UNAVAILABLE", &req, "The engine process exited.")
            }
        }
    }

    /// Send `shutdown` and wait briefly; kill if the process does not exit.
    pub fn shutdown(&self) {
        let mut g = self.inner.lock().unwrap();
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

    fn crashed(&self, g: &mut Inner) {
        if let Some(mut run) = g.running.take() {
            let _ = run.child.kill();
            let _ = run.child.wait();
        }
        g.failures += 1;
        if g.failures > self.cfg.max_restarts {
            g.unavailable = true;
        }
    }

    fn ensure_running(&self, g: &mut Inner) -> Result<(), Fail> {
        if g.running.is_some() {
            return Ok(());
        }
        loop {
            if g.unavailable {
                return Err(Fail::Unavailable("The engine is unavailable after repeated failures.".into()));
            }
            if g.failures > 0 {
                thread::sleep(self.cfg.backoff * 2u32.saturating_pow(g.failures - 1));
            }
            match self.spawn() {
                Ok(run) => {
                    g.running = Some(run);
                    return Ok(());
                }
                Err(_) => {
                    g.failures += 1;
                    if g.failures > self.cfg.max_restarts {
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
                Ok(m) if m.kind() == "ready" => Ok(Running { child, stdin, lines, ready: m }),
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
