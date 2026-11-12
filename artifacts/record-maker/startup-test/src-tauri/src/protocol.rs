use serde::Serialize;
use std::collections::BTreeMap;

pub const DEADLINE_SECONDS: u64 = 60;
pub const SETTLE_SECONDS: u64 = 8;

#[derive(Clone, Debug)]
pub struct Options {
    pub run: String,
    pub mode: String,
    pub profile: String,
    pub condition: String,
}

impl Options {
    pub fn parse(args: &[String]) -> Result<Self, &'static str> {
        if args.len() != 8 {
            return Err("Start this test using Start-Tauri-Test.cmd.");
        }
        let mut fields = BTreeMap::new();
        for pair in args.chunks_exact(2) {
            if !["--run", "--mode", "--profile", "--condition"].contains(&pair[0].as_str())
                || fields.insert(pair[0].as_str(), pair[1].as_str()).is_some()
            {
                return Err("Invalid startup options.");
            }
        }
        let get = |key| fields.get(key).copied().ok_or("Missing startup option.");
        let run = get("--run")?;
        let suffix = run.strip_prefix("run-").ok_or("Invalid run ID.")?;
        if suffix.len() != 32 || !suffix.bytes().all(|c| c.is_ascii_hexdigit()) {
            return Err("Invalid run ID.");
        }
        let mode = get("--mode")?;
        let profile = get("--profile")?;
        let condition = get("--condition")?;
        if !["minimal", "dashboard"].contains(&mode)
            || !["fresh", "reused"].contains(&profile)
            || !["cold", "warm", "unknown", "ci"].contains(&condition)
        {
            return Err("Invalid startup scenario.");
        }
        Ok(Self {
            run: run.to_owned(),
            mode: mode.to_owned(),
            profile: profile.to_owned(),
            condition: condition.to_owned(),
        })
    }
}

pub fn valid_stage(stage: &str) -> bool {
    [
        "scriptReady", "domReady", "loadFinished", "paintFrames",
        "dashboardPainted", "interactionComplete", "responsive", "pageError",
    ]
    .contains(&stage)
}

#[derive(Default, Serialize)]
pub struct Milestones {
    pub milestones: BTreeMap<String, u64>,
}

impl Milestones {
    pub fn mark(&mut self, stage: &str, ms: u64) -> bool {
        if !valid_stage(stage) {
            return false;
        }
        self.milestones.entry(stage.to_owned()).or_insert(ms);
        true
    }
    pub fn ready(&self, mode: &str) -> bool {
        let common = ["scriptReady", "domReady", "loadFinished", "paintFrames", "interactionComplete", "responsive"];
        common.iter().all(|s| self.milestones.contains_key(*s))
            && (mode == "minimal" || self.milestones.contains_key("dashboardPainted"))
            && !self.milestones.contains_key("pageError")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn args() -> Vec<String> {
        ["--run", "run-0123456789abcdef0123456789abcdef", "--mode", "minimal",
         "--profile", "fresh", "--condition", "cold"].map(String::from).to_vec()
    }
    #[test]
    fn excludes_arbitrary_paths_and_scenarios() {
        assert!(Options::parse(&args()).is_ok());
        for (index, value) in [(1, "../../records"), (3, "production"), (5, "default"), (7, "private-path")] {
            let mut input = args(); input[index] = value.into();
            assert!(Options::parse(&input).is_err());
        }
        let mut input = args(); input[2] = "--run".into();
        assert!(Options::parse(&input).is_err());
    }
    #[test]
    fn loading_screen_and_ping_alone_are_not_ready() {
        let mut m = Milestones::default();
        assert!(!m.mark("account-email", 1));
        for s in ["scriptReady", "domReady", "loadFinished", "paintFrames", "interactionComplete", "responsive"] {
            m.mark(s, 100);
        }
        assert!(m.ready("minimal"));
        assert!(!m.ready("dashboard"));
        m.mark("dashboardPainted", 200);
        assert!(m.ready("dashboard"));
        m.mark("pageError", 201);
        assert!(!m.ready("dashboard"));
    }
}
