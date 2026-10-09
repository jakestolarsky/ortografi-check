//! Stale-result rejection (PLAN.md section 4): a late response must never replace a newer one.

use super::protocol::Message;
use std::collections::HashMap;

/// Tracks the latest (docVersion, settingsVersion) requested per document.
#[derive(Debug, Default)]
pub struct StaleFilter {
    latest: HashMap<String, (u64, u64)>,
}

impl StaleFilter {
    pub fn new() -> Self {
        Self::default()
    }

    /// Record a check about to be sent. Versions only move forward.
    pub fn note_request(&mut self, doc: &str, versions: (u64, u64)) {
        let e = self.latest.entry(doc.to_owned()).or_insert(versions);
        *e = (e.0.max(versions.0), e.1.max(versions.1));
    }

    /// Whether a result or error for `doc` should reach the UI. Messages without
    /// versions (ready, errors with id null) are not tied to a check and always pass.
    pub fn accept(&self, doc: &str, msg: &Message) -> bool {
        let Some((d, s)) = msg.versions() else { return true };
        match self.latest.get(doc) {
            Some(&(ld, ls)) => d >= ld && s >= ls,
            None => true,
        }
    }
}
