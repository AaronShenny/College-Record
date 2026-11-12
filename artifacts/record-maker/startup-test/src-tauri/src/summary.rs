// Portable, test-only index reader: one small derived file, no Node or assets.
use serde::{Deserialize, Serialize};
use std::{fs, io::Read, path::Path};

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Program {
    pub id: String,
    pub number: u32,
    pub title: String,
    pub updated_at: String,
}
#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Subject {
    pub id: String,
    pub name: String,
    pub semester: u32,
    pub course_code: String,
    pub programs: Vec<Program>,
}
#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Index {
    pub schema_version: u32,
    pub revision_id: String,
    pub subjects: Vec<Subject>,
}
fn bounded_file(root: &Path, name: &str, limit: u64) -> Result<Vec<u8>, &'static str> {
    let path = root.join(name);
    let metadata = fs::symlink_metadata(&path).map_err(|_| "Index unavailable.")?;
    if !metadata.is_file() || metadata.file_type().is_symlink() || metadata.len() > limit {
        return Err("Invalid index file.");
    }
    let resolved = path.canonicalize().map_err(|_| "Index unavailable.")?;
    if resolved.parent() != Some(root) { return Err("Redirected index."); }
    let mut bytes = Vec::new();
    fs::File::open(resolved).map_err(|_| "Index unavailable.")?
        .take(limit + 1).read_to_end(&mut bytes).map_err(|_| "Index unavailable.")?;
    if bytes.len() as u64 > limit { return Err("Index too large."); }
    Ok(bytes)
}
pub fn read_index(base: &Path) -> Result<Index, &'static str> {
    let base = base.canonicalize().map_err(|_| "Test directory unavailable.")?;
    let fixture = base.join("fixture-v1");
    if fs::symlink_metadata(&fixture).map_err(|_| "Run preparation.")?.file_type().is_symlink() {
        return Err("Redirected fixture.");
    }
    let root = fixture.canonicalize().map_err(|_| "Run preparation.")?;
    if root.parent() != Some(base.as_path()) { return Err("Redirected fixture."); }
    let pointer: serde_json::Value = serde_json::from_slice(&bounded_file(&root, "current.json", 4096)?)
        .map_err(|_| "Invalid fixture pointer.")?;
    let index: Index = serde_json::from_slice(&bounded_file(&root, "dashboard-index-v2.json", 256 * 1024)?)
        .map_err(|_| "Invalid dashboard index.")?;
    if index.schema_version != 2 || index.revision_id.len() != 36
        || pointer.get("revisionId").and_then(|v| v.as_str()) != Some(index.revision_id.as_str())
        || index.subjects.len() != 4 || index.subjects.iter().map(|s| s.programs.len()).sum::<usize>() != 80
        || index.subjects.iter().any(|s| s.id.len() != 36 || s.name.is_empty() || s.name.len() > 600
            || s.semester == 0 || s.semester > 20 || s.course_code.len() > 200
            || s.programs.iter().any(|p| p.id.len() != 36 || p.number == 0 || p.number > 9999
                || p.title.len() > 2000 || p.updated_at.len() > 40))
    { return Err("Stale or invalid dashboard index. Run preparation."); }
    Ok(index)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn index_reader_rejects_stale_large_and_redirected_content() {
        let base = std::env::temp_dir().join(format!("tauri-index-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&base);
        let root = base.join("fixture-v1");
        fs::create_dir_all(&root).unwrap();
        let revision = "10000000-0000-4000-8000-000000000001";
        let subject = serde_json::json!({"id":revision,"name":"Test","semester":4,"courseCode":"TEST",
            "programs":(1..=20).map(|n| serde_json::json!({"id":revision,"number":n,"title":"Program","updatedAt":"2026-01-01T00:00:00.000Z"})).collect::<Vec<_>>()});
        let index = serde_json::json!({"schemaVersion":2,"revisionId":revision,"subjects":[subject.clone(),subject.clone(),subject.clone(),subject]});
        fs::write(root.join("current.json"), serde_json::json!({"revisionId":revision}).to_string()).unwrap();
        let file = root.join("dashboard-index-v2.json");
        fs::write(&file, index.to_string()).unwrap();
        assert_eq!(read_index(&base).unwrap().subjects.len(), 4);
        fs::write(root.join("current.json"), r#"{"revisionId":"stale"}"#).unwrap();
        assert!(read_index(&base).is_err());
        fs::write(root.join("current.json"), serde_json::json!({"revisionId":revision}).to_string()).unwrap();
        fs::write(&file, vec![b' '; 256 * 1024 + 1]).unwrap();
        assert!(read_index(&base).is_err());
        fs::remove_file(&file).unwrap();
        let outside = base.join("outside.json");
        fs::write(&outside, index.to_string()).unwrap();
        #[cfg(unix)] {
            std::os::unix::fs::symlink(&outside, &file).unwrap();
            assert!(read_index(&base).is_err());
        }
        fs::remove_dir_all(base).unwrap();
    }
}
