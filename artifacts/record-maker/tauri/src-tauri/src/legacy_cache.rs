//! Read-only legacy source, verified staged copy, atomic activation.
//! Never merge into an existing Tauri workspace or remove the old cache.
use sha2::{Digest, Sha256};
use std::{collections::BTreeMap, fs, io::Read, path::{Path, PathBuf}};

type Manifest = BTreeMap<PathBuf, (u64, [u8; 32])>;
fn linked(metadata: &fs::Metadata) -> bool {
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        // Includes junctions and other reparse points, not just symlinks.
        if metadata.file_attributes() & 0x400 != 0 { return true; }
    }
    metadata.file_type().is_symlink()
}

fn manifest(root: &Path) -> Result<Manifest, String> {
    fn visit(root: &Path, relative: &Path, out: &mut Manifest) -> Result<(), String> {
        if linked(&fs::symlink_metadata(root.join(relative)).map_err(|_| "Could not inspect the legacy folder.")?) {
            return Err("Linked cache folders are not supported. Originals were preserved.".into());
        }
        for entry in fs::read_dir(root.join(relative)).map_err(|_| "Could not read the legacy cache.")? {
            let entry = entry.map_err(|_| "Could not inspect the legacy cache.")?;
            let name = relative.join(entry.file_name());
            let metadata = fs::symlink_metadata(entry.path()).map_err(|_| "Could not inspect a cached file.")?;
            if linked(&metadata) { return Err("Linked files are not supported during cache migration. The source was preserved.".into()); }
            if metadata.is_dir() { visit(root, &name, out)?; }
            else if metadata.is_file() {
                if out.len() >= 200_000 { return Err("The cache is too large for automatic onboarding. The source was preserved.".into()); }
                let mut file = fs::File::open(entry.path()).map_err(|_| "Could not read a cached file.")?;
                let mut digest = Sha256::new();
                let mut buffer = [0_u8; 65536];
                let mut bytes = 0;
                loop {
                    let n = file.read(&mut buffer).map_err(|_| "Could not verify a cached file.")?;
                    if n == 0 { break; }
                    digest.update(&buffer[..n]); bytes += n as u64;
                }
                if bytes != metadata.len() { return Err("The old cache changed during migration. Close Electron and try again.".into()); }
                out.insert(name, (bytes, digest.finalize().into()));
            } else { return Err("Unsupported cached file type. The source was preserved.".into()); }
        }
        Ok(())
    }
    let mut out = BTreeMap::new();
    if linked(&fs::symlink_metadata(root).map_err(|_| "Could not inspect the cache root.")?) {
        return Err("Linked cache roots are not supported. Originals were preserved.".into());
    }
    for directory in ["workspaces", "credentials"] {
        if root.join(directory).is_dir() { visit(root, Path::new(directory), &mut out)?; }
    }
    Ok(out)
}

pub fn stage_copy(source: &Path, destination: &Path, guard: impl Fn() -> Result<(), String>) -> Result<(), String> {
    guard()?;
    if destination.exists() { return Err("A Tauri workspace already exists. No legacy files were merged or overwritten.".into()); }
    let before = manifest(source)?;
    let parent = destination.parent().ok_or("Invalid onboarding destination.")?;
    fs::create_dir_all(parent).map_err(|_| "Could not create the app data folder.")?;
    // Recover space from interrupted copies only after onboarding consent and
    // only for explicitly marked, app-owned staging directories. Never touch
    // arbitrary folders, the source cache or an activated destination.
    for entry in fs::read_dir(parent).map_err(|_| "Could not inspect onboarding recovery files.")? {
        let entry = entry.map_err(|_| "Could not inspect onboarding recovery files.")?;
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.strip_prefix(".onboarding-").is_some_and(|id| uuid::Uuid::parse_str(id).is_ok()) {
            let metadata = fs::symlink_metadata(entry.path()).map_err(|_| "Could not inspect a partial cache.")?;
            if metadata.is_dir() && !linked(&metadata) &&
                fs::read(entry.path().join(".tauri-onboarding-owner")).is_ok_and(|b| b == b"record-maker-tauri-v1") {
                guard()?;
                fs::remove_dir_all(entry.path()).map_err(|_| "Could not clear an interrupted copy. Originals were preserved.")?;
            }
        }
    }
    let staging = parent.join(format!(".onboarding-{}", uuid::Uuid::new_v4()));
    fs::create_dir(&staging).map_err(|_| "Could not stage the legacy cache.")?;
    let result = (|| {
        fs::write(staging.join(".tauri-onboarding-owner"), b"record-maker-tauri-v1").map_err(|_| "Could not initialize onboarding recovery.")?;
        for relative in before.keys() {
            guard()?;
            let target = staging.join(relative);
            fs::create_dir_all(target.parent().unwrap()).map_err(|_| "Could not stage the cache. Check free disk space.")?;
            fs::copy(source.join(relative), &target).map_err(|_| "Could not copy the cache. Check free disk space; originals are intact.")?;
        }
        guard()?;
        if before != manifest(source)? || before != manifest(&staging)? {
            return Err("Cache verification failed or Electron changed files. Nothing was activated.".into());
        }
        fs::write(staging.join("onboarding.json"), b"{\"schemaVersion\":1,\"verified\":true,\"originalsPreserved\":true}")
            .map_err(|_| "Could not commit onboarding.")?;
        // Same-volume rename: an interruption never exposes a partial cache.
        fs::rename(&staging, destination).map_err(|_| "Could not activate the verified cache.")?;
        Ok(())
    })();
    if result.is_err() { let _ = fs::remove_dir_all(&staging); }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn migration_preserves_pending_files_and_never_merges_or_activates_partial_copies() {
        let root = std::env::temp_dir().join(format!("onboarding-{}", uuid::Uuid::new_v4()));
        let old = root.join("old"); let new = root.join("new");
        fs::create_dir_all(old.join("workspaces/account-fixture")).unwrap();
        fs::create_dir_all(old.join("credentials")).unwrap();
        fs::write(old.join("workspaces/account-fixture/pending.json"), b"unsynced fixture").unwrap();
        fs::write(old.join("credentials/google-session.bin"), b"opaque encrypted fixture").unwrap();
        assert!(stage_copy(&old, &new, || Err("Electron is running.".into())).is_err());
        assert!(!new.exists());
        stage_copy(&old, &new, || Ok(())).unwrap();
        assert_eq!(manifest(&old).unwrap(), manifest(&new).unwrap());
        assert!(stage_copy(&old, &new, || Ok(())).is_err());
        assert!(old.join("credentials/google-session.bin").exists());
        fs::remove_dir_all(root).unwrap();
    }
}
