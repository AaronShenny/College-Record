use record_maker_native::{legacy_cache::{stage_copy, destination_state, DestinationState}, saved_session, summary::read_summary, vault};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{fs, os::windows::fs::OpenOptionsExt, path::{Path, PathBuf}};
use windows_sys::Win32::System::Diagnostics::ToolHelp::{
    CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W, TH32CS_SNAPPROCESS,
};
use windows_sys::Win32::Foundation::{CloseHandle, INVALID_HANDLE_VALUE};

pub fn exclude_electron() -> Result<(), String> {
    let snapshot = unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) };
    if snapshot == INVALID_HANDLE_VALUE { return Err("Windows could not verify that Electron is closed.".into()); }
    let mut item: PROCESSENTRY32W = unsafe { std::mem::zeroed() };
    item.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;
    let mut found = false;
    let mut next = unsafe { Process32FirstW(snapshot, &mut item) };
    while next != 0 {
        let end = item.szExeFile.iter().position(|c| *c == 0).unwrap_or(item.szExeFile.len());
        let name = String::from_utf16_lossy(&item.szExeFile[..end]).to_lowercase();
        if name == "college record maker.exe" { found = true; break; }
        next = unsafe { Process32NextW(snapshot, &mut item) };
    }
    unsafe { CloseHandle(snapshot); }
    if found { Err("Close the old Electron College Record Maker before using Tauri. No records were changed.".into()) } else { Ok(()) }
}

pub fn lock(directory: &Path) -> Result<fs::File, String> {
    fs::create_dir_all(directory).map_err(|_| "Could not open the application data folder.")?;
    fs::OpenOptions::new().read(true).write(true).create(true).truncate(false).share_mode(0)
        .open(directory.join("instance.lock")).map_err(|_| "College Record Maker is already open for this Windows user.".into())
}

pub fn onboard(base: &Path) -> Result<PathBuf, String> {
    exclude_electron()?;
    let destination = base.join("data");
    let state = destination_state(&destination)?;
    if state == DestinationState::Initialized { return Ok(destination); }
    let roaming = std::env::var_os("APPDATA").map(PathBuf::from).ok_or("Windows account storage is unavailable.")?;
    let candidates: Vec<PathBuf> = ["College Record Maker", "record-maker", "@workspace/record-maker"]
        .iter().map(|name| roaming.join(name)).filter(|path| path.join("workspaces").is_dir()).collect();
    if candidates.len() > 1 {
        return Err("Several old record caches were found. Keep them intact and ask for migration assistance before continuing.".into());
    }
    if let Some(source) = candidates.first() {
        if !super::adapters::message("Bring your records into Tauri",
            "The old app must stay closed. Copy and verify its cached records, history and unsynced work into Tauri? If an uninitialized Tauri folder exists, it will be preserved separately, never merged or deleted. Your old files stay untouched. Google sign-in may need recovery using the SAME college account.",
            "Copy and verify", "Cancel") {
            return Err("Onboarding was cancelled. Your old records were not changed.".into());
        }
        exclude_electron()?;
        if destination.exists() {
            fs::rename(&destination, base.join(format!("preserved-uninitialized-{}", uuid::Uuid::new_v4())))
                .map_err(|_| "Could not preserve the uninitialized Tauri folder. Nothing was overwritten.")?;
        }
        stage_copy(source, &destination, exclude_electron)?;
    } else {
        if state == DestinationState::Uncertain {
            return Err("Existing Tauri files could not be verified and no legacy cache was found. All files were preserved; ask for recovery assistance instead of resetting the app.".into());
        }
        fs::create_dir_all(&destination).map_err(|_| "Could not create the local workspace.")?;
        fs::write(destination.join("initialized.json"), b"{\"schemaVersion\":1,\"initialized\":true}")
            .map_err(|_| "Could not initialize the local workspace.")?;
    }
    Ok(destination)
}

pub fn boot_cache(directory: &Path) -> Result<Value, String> {
    let session = directory.join("credentials/google-session.bin");
    if !session.exists() { return Ok(json!({"cache":null})); }
    let recovery = || Ok(json!({"cache":null,"requiresRecovery":true}));
    let metadata = match fs::metadata(&session) { Ok(value) => value, Err(_) => return recovery() };
    if metadata.len() > 128 * 1024 { return recovery(); }
    // Native-only decryption; tokens and subject IDs never cross the WebView.
    let bytes = match fs::read(session) { Ok(value) => value, Err(_) => return recovery() };
    let plain = match vault::decrypt(&bytes) {
        Ok(value) => value,
        Err(_) => return Ok(json!({"cache":null,"requiresRecovery":true})),
    };
    let identity = match saved_session::identity(&plain) { Some(value) => value, None => return recovery() };
    let key = format!("{:x}", Sha256::digest(identity.sub.as_bytes()))[..32].to_owned();
    let root = directory.join("workspaces").join(format!("account-{key}"));
    match read_summary(&root, Some(&key)) {
        Ok(cache) if !cache.summary.subjects.is_empty() => Ok(json!({"cache":cache,"name":identity.name,"email":identity.email})),
        // An empty cache cannot confirm an empty Drive before this launch's sync.
        _ => Ok(json!({"cache":null})),
    }
}
