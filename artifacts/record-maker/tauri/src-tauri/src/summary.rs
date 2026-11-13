//! Product cache contract, not the isolated benchmark's fixed fixture index.
//! No Node, Python, source code, image or template is opened on this path.
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{collections::HashSet, fs, io::Read, path::Path};

pub const MAX_SUMMARY_BYTES: u64 = 2 * 1024 * 1024;
#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProgramSummary {
    pub id: String,
    pub number: u32,
    pub title: String,
    pub updated_at: String,
    pub state: ProgramState,
}
#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ProgramState { Ready, Stale, Incomplete, Started }
#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SubjectSummary {
    pub id: String,
    pub name: String,
    pub semester: u32,
    pub course_code: String,
    pub programs: Vec<ProgramSummary>,
}
#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DashboardSummary {
    pub kind: String,
    pub schema_version: u32,
    pub revision_id: String,
    pub account_key: Option<String>,
    pub subjects: Vec<SubjectSummary>,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CachedDashboard {
    pub summary: DashboardSummary,
    pub saved_at: String,
    pub pending_items: u64,
}
fn valid_uuid(value: &str) -> bool { value.len() == 36 && uuid::Uuid::parse_str(value).is_ok() }
fn valid_key(key: &str) -> bool { key.len() == 32 && key.bytes().all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c)) }
fn iso_date(value: &str) -> bool {
    let bytes = value.as_bytes();
    if bytes.len() < 20 || bytes.len() > 40 || bytes.last() != Some(&b'Z') ||
        bytes[4] != b'-' || bytes[7] != b'-' || bytes[10] != b'T' || bytes[13] != b':' || bytes[16] != b':' { return false; }
    if ![0..4, 5..7, 8..10, 11..13, 14..16, 17..19].iter().all(|range| bytes[range.clone()].iter().all(u8::is_ascii_digit)) { return false; }
    if bytes.len() != 20 && (bytes.len() < 22 || bytes[19] != b'.' || !bytes[20..bytes.len()-1].iter().all(u8::is_ascii_digit)) { return false; }
    let number = |start: usize, length: usize| bytes[start..start+length].iter().fold(0u32, |n, d| n*10+u32::from(d-b'0'));
    let year = number(0, 4); let month = number(5, 2); let day = number(8, 2);
    let days = match month { 1|3|5|7|8|10|12 => 31, 4|6|9|11 => 30, 2 if year%4 == 0 && (year%100 != 0 || year%400 == 0) => 29, 2 => 28, _ => 0 };
    day > 0 && day <= days && number(11,2) < 24 && number(14,2) < 60 && number(17,2) < 60
}
fn bounded_file(root: &Path, relative: &Path, maximum: u64) -> Result<Vec<u8>, String> {
    let filename = root.join(relative);
    let metadata = fs::symlink_metadata(&filename).map_err(|_| "Dashboard cache is unavailable.")?;
    if !metadata.is_file() || metadata.file_type().is_symlink() || metadata.len() > maximum {
        return Err("Dashboard cache is invalid or oversized.".into());
    }
    let resolved = filename.canonicalize().map_err(|_| "Dashboard cache is unavailable.")?;
    if !resolved.starts_with(root) { return Err("Dashboard cache escaped its workspace.".into()); }
    let mut bytes = Vec::new();
    fs::File::open(resolved).map_err(|_| "Dashboard cache is unavailable.")?.take(maximum+1)
        .read_to_end(&mut bytes).map_err(|_| "Dashboard cache could not be read.")?;
    if bytes.len() as u64 > maximum { return Err("Dashboard cache is oversized.".into()); }
    Ok(bytes)
}
fn pointer(root: &Path) -> Result<Value, String> {
    let pointer: Value = serde_json::from_slice(&bounded_file(root, Path::new("current.json"), 4096)?)
        .map_err(|_| "Saved revision is invalid.")?;
    if !pointer["revisionId"].as_str().is_some_and(valid_uuid) ||
        !pointer["savedAt"].as_str().is_some_and(iso_date) || pointer["pendingItems"].as_u64().is_none() {
        return Err("Saved revision is invalid.".into());
    }
    Ok(pointer)
}
pub fn read_summary(root: &Path, expected_account: Option<&str>) -> Result<CachedDashboard, String> {
    if root.join("_incoming-activation").exists() {
        return Err("An interrupted incoming activation needs service recovery before a dashboard can be trusted.".into());
    }
    let root = root.canonicalize().map_err(|_| "Local workspace is unavailable.")?;
    if let Some(key) = expected_account {
        if !valid_key(key) || root.file_name().and_then(|s| s.to_str()) != Some(format!("account-{key}").as_str()) {
            return Err("Dashboard cache belongs to another account.".into());
        }
    }
    let before = pointer(&root)?;
    let revision = before["revisionId"].as_str().unwrap();
    let relative = Path::new("snapshots").join(revision).join("_local/dashboard-summary.json");
    let summary: DashboardSummary = serde_json::from_slice(&bounded_file(&root, &relative, MAX_SUMMARY_BYTES)?)
        .map_err(|_| "Dashboard cache has an invalid contract.")?;
    if summary.kind != "dashboard-summary" || summary.schema_version != 1 ||
        summary.revision_id != revision || summary.account_key.as_deref() != expected_account || summary.subjects.len() > 100 {
        return Err("Dashboard cache is stale or belongs to another account.".into());
    }
    let mut ids = HashSet::new();
    for subject in &summary.subjects {
        if !valid_uuid(&subject.id) || !ids.insert(&subject.id) || subject.name.trim().is_empty() ||
            subject.name.len() > 600 || subject.course_code.len() > 200 ||
            subject.semester == 0 || subject.semester > 20 || subject.programs.len() > 500 {
            return Err("Dashboard subject metadata is invalid.".into());
        }
        let mut numbers = HashSet::new();
        for program in &subject.programs {
            if !valid_uuid(&program.id) || !ids.insert(&program.id) || program.number == 0 ||
                program.number > 9999 || !numbers.insert(program.number) ||
                program.title.len() > 2000 || !iso_date(&program.updated_at) {
                return Err("Dashboard program metadata is invalid.".into());
            }
        }
    }
    let after = pointer(&root)?;
    if after["revisionId"] != before["revisionId"] || root.join("_incoming-activation").exists() {
        return Err("The saved revision changed or needs activation recovery while opening the dashboard.".into());
    }
    Ok(CachedDashboard {
        summary, saved_at: after["savedAt"].as_str().unwrap().to_owned(),
        pending_items: after["pendingItems"].as_u64().unwrap(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn summary_is_account_bound_read_only_and_requires_the_active_revision() {
        let parent = std::env::temp_dir().join(format!("record-summary-{}", uuid::Uuid::new_v4()));
        let key = "0123456789abcdef0123456789abcdef";
        let root = parent.join(format!("account-{key}"));
        let revision = uuid::Uuid::new_v4().to_string();
        let folder = root.join("snapshots").join(&revision).join("_local");
        fs::create_dir_all(&folder).unwrap();
        let stamp = "2026-11-13T10:00:00.000Z";
        let pointer = json!({"revisionId":revision,"savedAt":stamp,"pendingItems":2,"storage":"filesystem"});
        fs::write(root.join("current.json"), pointer.to_string()).unwrap();
        let mut index = json!({
            "kind":"dashboard-summary","schemaVersion":1,"revisionId":revision,"accountKey":key,
            "subjects":[{"id":uuid::Uuid::new_v4().to_string(),"name":"Fixture","semester":1,"courseCode":"",
                "programs":[{"id":uuid::Uuid::new_v4().to_string(),"number":1,"title":"Sample","updatedAt":stamp,"state":"ready"}]}]
        });
        let file = folder.join("dashboard-summary.json");
        fs::write(&file, index.to_string()).unwrap();
        // No app.json, source, template or image exists: this path only reads metadata.
        assert_eq!(read_summary(&root, Some(key)).unwrap().summary.subjects.len(), 1);
        fs::create_dir(root.join("_incoming-activation")).unwrap();
        assert!(read_summary(&root, Some(key)).is_err());
        fs::remove_dir(root.join("_incoming-activation")).unwrap();
        assert!(read_summary(&root, Some("ffffffffffffffffffffffffffffffff")).is_err());
        index["revisionId"] = json!(uuid::Uuid::new_v4().to_string());
        fs::write(&file, index.to_string()).unwrap();
        assert!(read_summary(&root, Some(key)).is_err());
        fs::write(&file, vec![b'x'; MAX_SUMMARY_BYTES as usize+1]).unwrap();
        assert!(read_summary(&root, Some(key)).is_err());
        fs::remove_dir_all(parent).unwrap();
    }
    #[test]
    fn invalid_dates_do_not_become_a_ready_dashboard() {
        assert!(iso_date("2024-02-29T01:02:03.000Z"));
        assert!(!iso_date("2023-02-29T01:02:03.000Z"));
        assert!(!iso_date("2026-11-13T24:00:00Z"));
        assert!(!iso_date("not-a-date"));
    }
}
