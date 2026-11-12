//! Private, owned Node service. No shell, socket, renderer-chosen executable,
//! broad process-name termination, or automatic retry of uncertain writes.
use crate::protocol::{allowed_method, read_frame, MAX_FRAME_BYTES};
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    io::{BufReader, Write},
    os::windows::{io::{AsRawHandle, FromRawHandle, OwnedHandle}, process::CommandExt},
    path::{Path, PathBuf},
    process::{Child, ChildStdin, Command, Stdio},
    sync::{atomic::{AtomicBool, AtomicUsize, Ordering}, mpsc, Arc, Mutex},
    thread,
    time::Duration,
};
use windows_sys::Win32::System::JobObjects::{
    AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
    SetInformationJobObject, TerminateJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
    JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
};

type Response = Result<Value, String>;
type NativeHandler = dyn Fn(&str, Value) -> Response + Send + Sync;
struct Channel {
    stdin: Mutex<ChildStdin>,
    pending: Mutex<HashMap<String, mpsc::Sender<Response>>>,
    stopped: AtomicBool,
    callbacks: AtomicUsize,
}
impl Channel {
    fn send(&self, value: Value) -> Result<(), String> {
        let mut encoded = serde_json::to_vec(&value).map_err(|_| "Could not encode a native service request.")?;
        if encoded.len() + 1 > MAX_FRAME_BYTES { return Err("The desktop message is too large.".into()); }
        encoded.push(b'\n');
        self.stdin.lock().map_err(|_| "Native service input is unavailable.")?
            .write_all(&encoded).map_err(|_| "Native service stopped. Its operations were not retried.".into())
    }
    fn fail(&self) {
        self.stopped.store(true, Ordering::SeqCst);
        if let Ok(mut pending) = self.pending.lock() {
            for (_, caller) in pending.drain() {
                let _ = caller.send(Err("Native service stopped. Local files were preserved; operations were not retried.".into()));
            }
        }
    }
}

pub struct NativeService {
    child: Mutex<Child>,
    job: OwnedHandle,
    channel: Arc<Channel>,
}
pub struct ServiceConfiguration {
    pub node: PathBuf,
    pub script: PathBuf,
    pub directory: PathBuf,
    pub resources: PathBuf,
    pub version: String,
    pub packaged: bool,
}
impl NativeService {
    pub fn spawn(configuration: ServiceConfiguration, native: Arc<NativeHandler>) -> Result<Self, String> {
        let resources = configuration.resources.canonicalize().map_err(|_| "Bundled service resources are missing.")?;
        let node = configuration.node.canonicalize().map_err(|_| "The bundled Node runtime is missing.")?;
        let script = configuration.script.canonicalize().map_err(|_| "The bundled service is missing.")?;
        if configuration.packaged && (!node.starts_with(&resources) || !script.starts_with(&resources)) {
            return Err("The native service must use its bundled executable and script.".into());
        }
        if !configuration.directory.is_absolute() || !node.is_file() || !script.is_file() {
            return Err("Invalid native service configuration.".into());
        }
        let handle = unsafe { CreateJobObjectW(std::ptr::null(), std::ptr::null()) };
        if handle.is_null() { return Err("Windows could not create the service lifetime boundary.".into()); }
        let job = unsafe { OwnedHandle::from_raw_handle(handle) };
        let mut limits: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = unsafe { std::mem::zeroed() };
        limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        if unsafe { SetInformationJobObject(job.as_raw_handle(), JobObjectExtendedLimitInformation,
            &limits as *const _ as *const _, std::mem::size_of_val(&limits) as u32) } == 0 {
            return Err("Windows could not configure the service lifetime boundary.".into());
        }
        let nonce = format!("{}{}", uuid::Uuid::new_v4().simple(), uuid::Uuid::new_v4().simple());
        let mut command = Command::new(node);
        command.arg(&script).arg(&configuration.directory).arg(&resources)
            .arg(&configuration.version).arg(if configuration.packaged { "true" } else { "false" })
            .current_dir(&resources).stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::null())
            .creation_flags(0x08000000).env_clear().env("RECORD_MAKER_HOST_NONCE", &nonce);
        // No inherited NODE_OPTIONS, Electron launch variables, OAuth secrets,
        // arbitrary executables or developer paths in an installed release.
        for name in ["SystemRoot", "WINDIR", "TEMP", "TMP", "APPDATA", "LOCALAPPDATA", "USERPROFILE", "HOMEDRIVE", "HOMEPATH"] {
            if let Some(value) = std::env::var_os(name) { command.env(name, value); }
        }
        if !configuration.packaged && cfg!(debug_assertions) {
            for name in ["PATH", "RECORD_MAKER_PYTHON"] {
                if let Some(value) = std::env::var_os(name) { command.env(name, value); }
            }
        }
        let mut child = command.spawn().map_err(|_| "The native storage service could not start.")?;
        // Node does not initialize credentials or fork children until host-ready.
        if unsafe { AssignProcessToJobObject(job.as_raw_handle(), child.as_raw_handle()) } == 0 {
            let _ = child.kill(); let _ = child.wait();
            return Err("Windows could not attach the service to its lifetime boundary.".into());
        }
        let input = child.stdin.take().ok_or("The native service input is unavailable.")?;
        let output = child.stdout.take().ok_or("The native service output is unavailable.")?;
        let channel = Arc::new(Channel {
            stdin: Mutex::new(input), pending: Mutex::new(HashMap::new()),
            stopped: AtomicBool::new(false), callbacks: AtomicUsize::new(0),
        });
        let read_channel = channel.clone();
        thread::spawn(move || {
            let mut reader = BufReader::new(output);
            while let Ok(frame) = read_frame(&mut reader, MAX_FRAME_BYTES) {
                if read_channel.stopped.load(Ordering::SeqCst) { break; }
                if frame.kind == "result" {
                    if let Ok(mut pending) = read_channel.pending.lock() {
                        if let Some(caller) = pending.remove(&frame.id) {
                            let response = if frame.ok == Some(true) { Ok(frame.result.unwrap_or(Value::Null)) }
                                else { Err(frame.error.unwrap_or_else(|| "The desktop operation failed.".into())) };
                            let _ = caller.send(response);
                        }
                    }
                } else {
                    if read_channel.callbacks.fetch_add(1, Ordering::SeqCst) >= 8 {
                        read_channel.callbacks.fetch_sub(1, Ordering::SeqCst);
                        break;
                    }
                    let channel = read_channel.clone();
                    let native = native.clone();
                    thread::spawn(move || {
                        let result = native(frame.action.as_deref().unwrap_or(""), frame.payload.unwrap_or(Value::Null));
                        let response = match result {
                            Ok(result) => json!({"protocol":1,"kind":"native-result","id":frame.id,"ok":true,"result":result}),
                            Err(error) => json!({"protocol":1,"kind":"native-result","id":frame.id,"ok":false,"error":error.chars().take(500).collect::<String>()}),
                        };
                        let _ = channel.send(response);
                        channel.callbacks.fetch_sub(1, Ordering::SeqCst);
                    });
                }
            }
            read_channel.fail();
        });
        let service = Self { child: Mutex::new(child), job, channel };
        service.channel.send(json!({"protocol":1,"kind":"host-ready","nonce":nonce}))?;
        Ok(service)
    }
    pub fn request(&self, method: &str, payload: Value, timeout: Duration) -> Response {
        if !allowed_method(method) { return Err("Unsupported desktop service method.".into()); }
        if self.channel.stopped.load(Ordering::SeqCst) { return Err("Native service stopped. Restart the application before continuing.".into()); }
        let id = uuid::Uuid::new_v4().to_string();
        let (sender, receiver) = mpsc::channel();
        {
            let mut pending = self.channel.pending.lock().map_err(|_| "Native service state is unavailable.")?;
            if pending.len() >= 64 { return Err("The desktop service is busy. Wait for an operation to finish.".into()); }
            pending.insert(id.clone(), sender);
        }
        if self.channel.send(json!({"protocol":1,"kind":"request","id":id,"method":method,"payload":payload})).is_err() {
            self.stop();
            return Err("Native service stopped. Its operations were not retried.".into());
        }
        match receiver.recv_timeout(timeout) {
            Ok(result) => result,
            Err(_) => {
                // A timed-out write might have committed. Stop this generation,
                // reject every waiter, and require an explicit reload/restart.
                self.stop();
                Err("The native service timed out. Restart to check saved work; the operation was not retried.".into())
            }
        }
    }
    pub fn stop(&self) {
        self.channel.fail();
        unsafe { TerminateJobObject(self.job.as_raw_handle(), 1); }
        if let Ok(mut child) = self.child.lock() { let _ = child.wait(); }
    }
}
impl Drop for NativeService {
    fn drop(&mut self) { self.stop(); }
}

/// Shared native policy helper; canonicalization rejects escaped symlink paths.
pub fn managed_file(root: &Path, selected: &Path) -> Result<PathBuf, String> {
    let root = root.canonicalize().map_err(|_| "Local workspace is unavailable.")?;
    let selected = selected.canonicalize().map_err(|_| "The generated document is unavailable.")?;
    if !selected.starts_with(root) || !selected.is_file() { return Err("The document is outside this workspace.".into()); }
    Ok(selected)
}

#[cfg(test)]
mod tests {
    use super::*;
    use windows_sys::Win32::System::JobObjects::{
        QueryInformationJobObject, JobObjectBasicAccountingInformation, JOBOBJECT_BASIC_ACCOUNTING_INFORMATION,
    };
    fn process_count(service: &NativeService) -> u32 {
        let mut info: JOBOBJECT_BASIC_ACCOUNTING_INFORMATION = unsafe { std::mem::zeroed() };
        let ok = unsafe { QueryInformationJobObject(service.job.as_raw_handle(), JobObjectBasicAccountingInformation,
            &mut info as *mut _ as *mut _, std::mem::size_of_val(&info) as u32, std::ptr::null_mut()) };
        assert_ne!(ok, 0); info.ActiveProcesses
    }
    #[test]
    fn owned_real_service_saves_and_stops_only_its_process_tree() {
        // This is required in the Windows foundation workflow. No fake Node
        // transport or student workspace is substituted when configuration is missing.
        let node = std::env::var_os("RECORD_MAKER_TEST_NODE").expect("Run via the Windows foundation workflow with Node configured.");
        let root = std::env::temp_dir().join(format!("record-native-owner-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&root).unwrap();
        let artifact = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..").canonicalize().unwrap();
        let registration = root.join("fixture-registration.json");
        std::fs::write(&registration, json!({"installed":{"client_id":"test.apps.googleusercontent.com","client_secret":"not-a-real-secret-fixture"}}).to_string()).unwrap();
        let configuration = |node: PathBuf, resources: PathBuf| ServiceConfiguration {
            node, script: resources.join("dist/tauri-host/service-host.cjs"),
            directory: root.clone(), resources, version: "0.2.0".into(), packaged: false,
        };
        let native: Arc<NativeHandler> = Arc::new(move |action, payload| {
            if action.starts_with("vault-") { return crate::vault::callback(action, payload); }
            if action == "open-dialog" { return Ok(json!({"canceled":false,"filePaths":[registration]})); }
            Err("No other native callback is expected for this fixture.".into())
        });
        let service = NativeService::spawn(configuration(PathBuf::from(node.clone()), artifact.clone()), native.clone()).unwrap();
        let timeout = Duration::from_secs(30);
        let workspace = service.request("load", Value::Null, timeout).unwrap();
        assert_eq!(workspace, json!({"schemaVersion":1,"subjects":[]}));
        let receipt = service.request("save", workspace.clone(), timeout).unwrap();
        assert!(receipt["revisionId"].as_str().is_some());
        assert_eq!(service.request("load", Value::Null, timeout).unwrap(), workspace);
        service.request("workflow", json!({"action":"configure-google","input":{}}), timeout).unwrap();
        let encrypted = std::fs::read(root.join("credentials/google-client.bin")).unwrap();
        assert!(!String::from_utf8_lossy(&encrypted).contains("not-a-real-secret-fixture"));
        assert!(process_count(&service) >= 2, "The storage child must inherit the native-owned job.");
        service.request("shutdown", Value::Null, timeout).unwrap();
        service.stop();
        assert_eq!(process_count(&service), 0, "No owned Node/Python descendants may remain.");
        assert!(service.request("save", workspace, timeout).is_err(), "A stopped host must not retry writes.");
        drop(service);
        let reopened = NativeService::spawn(configuration(PathBuf::from(node), artifact), native).unwrap();
        reopened.request("load", Value::Null, timeout).unwrap();
        reopened.request("shutdown", Value::Null, timeout).unwrap();
        drop(reopened);
        std::fs::remove_dir_all(root).unwrap();
    }
}
