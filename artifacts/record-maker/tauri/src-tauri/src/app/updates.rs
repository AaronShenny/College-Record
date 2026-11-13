use serde::Deserialize;
use serde_json::{json, Value};
use std::{fs, path::Path, process::{Command, Stdio}, os::windows::process::CommandExt, time::Duration};
use tauri_plugin_updater::{Update, UpdaterExt};

#[derive(Default)]
pub struct Updates {
    downloaded: Option<(Update, std::path::PathBuf)>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Configuration {
    feed: Option<String>,
    public_key: Option<String>,
    #[serde(default)]
    publisher_names: Vec<String>,
}
impl Updates {
    pub fn check(&mut self, app: &tauri::AppHandle, resources: &Path, data: &Path) -> Result<Value, String> {
        if self.downloaded.is_some() { return Ok(json!({"state":"downloaded","message":"Update verified. Restart when your work is saved."})); }
        let bytes = fs::read(resources.join("config/release-config.json")).map_err(|_| "Update configuration is missing.")?;
        let config: Configuration = serde_json::from_slice(&bytes).map_err(|_| "Update configuration is invalid.")?;
        let Some(feed) = config.feed.filter(|s| !s.is_empty()) else {
            return Ok(json!({"state":"disabled","message":"Automatic updates are not configured for this build."}));
        };
        let url = tauri::Url::parse(&feed).map_err(|_| "Invalid update feed.")?;
        if url.scheme() != "https" || !url.username().is_empty() || url.password().is_some() ||
            config.publisher_names.is_empty() || config.public_key.as_ref().is_none_or(|s| s.is_empty()) {
            return Err("Updates require HTTPS, a Tauri verification key and a Windows publisher policy.".into());
        }
        let updater = app.updater_builder().pubkey(config.public_key.unwrap()).endpoints(vec![url])
            .map_err(|_| "Invalid update endpoint.")?.timeout(Duration::from_secs(30))
            .build().map_err(|_| "Could not initialize signed updates.")?;
        let update = tauri::async_runtime::block_on(updater.check()).map_err(|_| "Could not check for updates. Your current app is unchanged.")?;
        let Some(mut update) = update else { return Ok(json!({"state":"current","message":"You have the latest version."})); };
        if update.download_url.scheme() != "https" { return Err("The update download must use HTTPS.".into()); }
        // The manifest should fail promptly, but the complete app includes
        // Python/WebView2 and may need longer on a slow student connection.
        // This remains a bounded background download, not a startup wait.
        update.timeout = Some(Duration::from_secs(15 * 60));
        let bytes = tauri::async_runtime::block_on(update.download(|_, _| {}, || {}))
            .map_err(|_| "Update download or signature verification failed. The current app is unchanged.")?;
        // The updater verifies its signature; independently verify Authenticode
        // and the approved certificate name before calling it downloaded.
        fs::create_dir_all(data.join("updates")).map_err(|_| "Could not cache the update.")?;
        let filename = data.join("updates").join("verified-update.exe");
        fs::write(&filename, &bytes).map_err(|_| "Could not cache the update.")?;
        if !publisher_verified(&filename, &config.publisher_names)? {
            let _ = fs::remove_file(&filename);
            return Err("The Windows update signature or publisher did not match. Nothing was installed.".into());
        }
        self.downloaded = Some((update, filename));
        Ok(json!({"state":"downloaded","message":"Update downloaded and verified. Restart now or keep working."}))
    }
    pub fn install(&mut self) -> Result<Value, String> {
        let (update, file) = self.downloaded.as_ref().ok_or("No verified update is downloaded.")?;
        let bytes = fs::read(file).map_err(|_| "The cached update is unavailable. Check for updates again.")?;
        // install verifies the Tauri signature again, preventing replacement of
        // cached bytes between verification and installation.
        update.install(bytes).map_err(|_| "The update could not be installed. Existing app files were preserved.")?;
        Ok(Value::Null)
    }
}

fn publisher_verified(file: &Path, names: &[String]) -> Result<bool, String> {
    use std::os::windows::io::{AsRawHandle, FromRawHandle, OwnedHandle};
    use windows_sys::Win32::System::JobObjects::{
        AssignProcessToJobObject, CreateJobObjectW, SetInformationJobObject, JobObjectExtendedLimitInformation,
        JOBOBJECT_EXTENDED_LIMIT_INFORMATION, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    };
    let handle = unsafe { CreateJobObjectW(std::ptr::null(), std::ptr::null()) };
    if handle.is_null() { return Err("Could not supervise Windows signature verification.".into()); }
    let job = unsafe { OwnedHandle::from_raw_handle(handle) };
    let mut limits: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = unsafe { std::mem::zeroed() };
    limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
    if unsafe { SetInformationJobObject(job.as_raw_handle(), JobObjectExtendedLimitInformation,
        &limits as *const _ as *const _, std::mem::size_of_val(&limits) as u32) } == 0 {
        return Err("Could not supervise Windows signature verification.".into());
    }
    let windows = std::env::var_os("SystemRoot").ok_or("Windows signature verification is unavailable.")?;
    let executable = Path::new(&windows).join("System32/WindowsPowerShell/v1.0/powershell.exe");
    let script = "$ErrorActionPreference='Stop'; $s=Get-AuthenticodeSignature -LiteralPath $env:CRM_UPDATE_FILE; if($s.Status -ne 'Valid'){exit 2}; $n=$s.SignerCertificate.GetNameInfo([System.Security.Cryptography.X509Certificates.X509NameType]::SimpleName,$false); $allowed=ConvertFrom-Json $env:CRM_UPDATE_PUBLISHERS; if($allowed -ccontains $n){exit 0}; exit 3";
    let mut child = Command::new(executable).args(["-NoProfile","-NonInteractive","-Command",script])
        .env("CRM_UPDATE_FILE", file).env("CRM_UPDATE_PUBLISHERS", serde_json::to_string(names).unwrap())
        .stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null()).creation_flags(0x08000000)
        .spawn().map_err(|_| "Windows signature verification could not start.")?;
    if unsafe { AssignProcessToJobObject(job.as_raw_handle(), child.as_raw_handle()) } == 0 {
        let _ = child.kill(); let _ = child.wait();
        return Err("Could not supervise Windows signature verification.".into());
    }
    let start = std::time::Instant::now();
    loop {
        if let Some(status) = child.try_wait().map_err(|_| "Windows signature verification failed.")? { return Ok(status.success()); }
        if start.elapsed() > Duration::from_secs(30) { let _ = child.kill(); let _ = child.wait(); return Err("Windows signature verification timed out.".into()); }
        std::thread::sleep(Duration::from_millis(50));
    }
}
