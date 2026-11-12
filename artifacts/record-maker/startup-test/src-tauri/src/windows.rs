use crate::protocol::{Milestones, Options, DEADLINE_SECONDS, SETTLE_SECONDS};
use serde_json::{json, Value};
use std::{
    fs::{self, File, OpenOptions},
    io::{BufRead, BufReader, Read, Write},
    os::windows::{fs::OpenOptionsExt, io::{AsRawHandle, FromRawHandle, OwnedHandle}, process::CommandExt},
    path::PathBuf,
    process::{Child, Command, Stdio},
    sync::{Arc, Mutex},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
use windows_sys::Win32::System::JobObjects::{
    CreateJobObjectW, SetInformationJobObject, AssignProcessToJobObject,
    JobObjectExtendedLimitInformation, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
    JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
};

fn service_job() -> Result<OwnedHandle, ()> {
    // A Windows-owned lifetime boundary: even a blocked Node read cannot leave
    // an orphan service when the native watchdog or external launcher exits us.
    let raw = unsafe { CreateJobObjectW(std::ptr::null(), std::ptr::null()) };
    if raw.is_null() { return Err(()); }
    let job = unsafe { OwnedHandle::from_raw_handle(raw) };
    let mut limits: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = unsafe { std::mem::zeroed() };
    limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
    let ok = unsafe { SetInformationJobObject(job.as_raw_handle(), JobObjectExtendedLimitInformation,
        &limits as *const _ as *const _, std::mem::size_of_val(&limits) as u32) };
    if ok == 0 { return Err(()); }
    Ok(job)
}

struct Service {
    child: Child,
    output: BufReader<std::process::ChildStdout>,
}
struct State {
    options: Options,
    start: Instant,
    directory: PathBuf,
    fixture: PathBuf,
    log: Mutex<File>,
    milestones: Mutex<Milestones>,
    service: Mutex<Option<Service>>,
    job: OwnedHandle,
    ready: Mutex<Option<u64>>,
}
impl State {
    fn record(&self, event: &str, details: Value) {
        let line = json!({"event":event, "elapsedMs":self.start.elapsed().as_millis(),
            "unixMs":SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis(),
            "details":details});
        if let Ok(mut log) = self.log.lock() {
            let _ = writeln!(log, "{line}");
            let _ = log.flush();
        }
    }
    fn finish(&self, result: &str) {
        let milestones = self.milestones.lock().unwrap();
        let summary = json!({"schemaVersion":1, "host":"tauri", "benchmarkVersion":"0.1.0",
            "mode":self.options.mode, "condition":self.options.condition, "profile":self.options.profile,
            "clock":"milliseconds from Rust entry; launcher measures earlier process creation",
            "result":result, "readyAtMs":*self.ready.lock().unwrap(),
            "summaryUnixMs":SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis(),
            "milestones":milestones.milestones, "graphicsPolicy":"software-compatibility",
            "productionFeatureParity":false});
        let temp = self.directory.join("summary.tmp");
        if fs::write(&temp, serde_json::to_vec_pretty(&summary).unwrap()).is_ok() {
            let _ = fs::rename(temp, self.directory.join("startup-summary.json"));
        }
    }
    fn stop_service(&self) {
        if let Ok(mut service) = self.service.try_lock() {
            if let Some(s) = service.as_mut() {
                let _ = s.child.kill();
                let _ = s.child.wait();
            }
        }
    }
}
#[tauri::command]
fn browser_version(window: tauri::WebviewWindow, state: tauri::State<'_, Arc<State>>, version: String) -> Result<(), String> {
    if window.label() != "startup" || version.len() > 40 || version.is_empty()
        || !version.bytes().all(|b| b.is_ascii_digit() || b == b'.') {
        return Err("Invalid browser version.".into());
    }
    state.record("webview-browser-version", json!({"chromiumVersion":version}));
    Ok(())
}
#[tauri::command]
fn probe(window: tauri::WebviewWindow, state: tauri::State<'_, Arc<State>>, stage: String) -> Result<String, String> {
    if window.label() != "startup" || !state.milestones.lock().unwrap().mark(&stage, state.start.elapsed().as_millis() as u64) {
        return Err("Invalid benchmark signal.".into());
    }
    state.record("page-milestone", json!({"stage":stage}));
    if stage == "pageError" {
        state.finish("page-error");
        state.stop_service();
        window.app_handle().exit(2);
        return Ok("error-recorded".into());
    }
    let complete = state.milestones.lock().unwrap().ready(&state.options.mode);
    if complete {
        let mut ready = state.ready.lock().unwrap();
        if ready.is_none() {
            *ready = Some(state.start.elapsed().as_millis() as u64);
            drop(ready);
            state.record("interactive-ready", json!({}));
            state.finish("ready");
        }
    }
    Ok("ack".into())
}

#[tauri::command]
async fn load_fixture(window: tauri::WebviewWindow, state: tauri::State<'_, Arc<State>>) -> Result<Value, String> {
    if window.label() != "startup" || state.options.mode != "dashboard" {
        return Err("This command is available only to the synthetic dashboard.".into());
    }
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut service = state.service.lock().map_err(|_| "Service state unavailable.")?;
        if service.is_none() {
            state.record("node-start-requested", json!({}));
            let base = std::env::current_exe().map_err(|_| "Test package unavailable.")?
                .parent().ok_or("Test package unavailable.")?.to_owned();
            // Fixed packaged files and a fixed test-only fixture root. Never a shell or caller path.
            let mut child = Command::new(base.join("node.exe"))
                .arg(base.join("fixture-service.cjs")).arg("--serve")
                .arg(&state.fixture)
                .env_remove("NODE_OPTIONS").env_remove("NODE_PATH")
                .creation_flags(0x08000000)
                .stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::null())
                .spawn().map_err(|_| "Bundled Node service could not start.")?;
            if unsafe { AssignProcessToJobObject(state.job.as_raw_handle(), child.as_raw_handle()) } == 0 {
                let _ = child.kill(); let _ = child.wait();
                return Err("Could not isolate the diagnostic service.");
            }
            let output = BufReader::new(child.stdout.take().ok_or("Service output unavailable.")?);
            *service = Some(Service { child, output });
            state.record("node-spawned", json!({}));
        }
        let s = service.as_mut().unwrap();
        s.child.stdin.as_mut().ok_or("Service input unavailable.")?
            .write_all(b"load\n").map_err(|_| "Service request failed.")?;
        let mut line = String::new();
        // The native watchdog and independent launcher also bound blocked sidecar reads.
        s.output.by_ref().take(16 * 1024 * 1024).read_line(&mut line)
            .map_err(|_| "Service response failed.")?;
        let value: Value = serde_json::from_str(&line).map_err(|_| "Invalid fixture response.")?;
        if value.get("ok") != Some(&Value::Bool(true)) {
            return Err("Synthetic fixture could not be loaded.");
        }
        state.record("fixture-loaded", json!({"subjects":4,"programs":80}));
        Ok(value["workspace"].clone())
    }).await.map_err(|_| "Fixture operation failed.".to_owned())?
        .map_err(str::to_owned)
}

pub fn run() {
    let start = Instant::now();
    let Ok(options) = Options::parse(&std::env::args().skip(1).collect::<Vec<_>>()) else { return; };
    let Some(local) = std::env::var_os("LOCALAPPDATA") else { return; };
    let base = PathBuf::from(local).join("CollegeRecordMaker-TauriChecks");
    let directory = base.join(&options.run);
    // The launcher creates this new run folder; refuse arbitrary locations/reparse roots.
    if !directory.is_dir() { return; }
    let Ok(canonical_base) = base.canonicalize() else { return; };
    let Ok(canonical_run) = directory.canonicalize() else { return; };
    if canonical_run.parent() != Some(canonical_base.as_path()) { return; }
    // Share-mode zero is a Windows process-lifetime lock, not a stale sentinel.
    let Ok(_exclusive) = OpenOptions::new().create(true).write(true).share_mode(0)
        .open(base.join("active-test.lock")) else { return; };
    let Ok(mut log) = OpenOptions::new().create_new(true).write(true).open(directory.join("performance.jsonl")) else { return; };
    let Ok(job) = service_job() else {
        let _ = writeln!(log, "{{\"event\":\"service-isolation-failed\"}}");
        return;
    };
    let state = Arc::new(State {
        fixture: base.join("fixture-v1"), options, start, directory,
        log: Mutex::new(log), milestones: Mutex::new(Milestones::default()),
        service: Mutex::new(None), ready: Mutex::new(None), job,
    });
    state.record("rust-entry", json!({"mode":state.options.mode,"profile":state.options.profile,
        "condition":state.options.condition, "tauriVersion":tauri::VERSION}));
    let setup_state = state.clone();
    let exit_state = state.clone();
    let app = tauri::Builder::default()
        .manage(state.clone())
        .invoke_handler(tauri::generate_handler![probe, load_fixture, browser_version])
        .setup(move |app| {
            let state = setup_state.clone();
            state.record("host-setup", json!({}));
            let handle = app.handle().clone();
            let watch = state.clone();
            std::thread::spawn(move || loop {
                std::thread::sleep(Duration::from_secs(1));
                let ready = *watch.ready.lock().unwrap();
                if let Some(ms) = ready {
                    if watch.start.elapsed().as_millis() >= ms as u128 + (SETTLE_SECONDS * 1000) as u128 {
                        watch.record("test-finished", json!({"result":"ready"}));
                        watch.stop_service();
                        handle.exit(0);
                        break;
                    }
                } else if watch.start.elapsed() >= Duration::from_secs(DEADLINE_SECONDS) {
                    watch.record("deadline", json!({}));
                    watch.finish("timeout");
                    watch.stop_service();
                    // Force exit only this diagnostic process; launcher owns child-tree cleanup.
                    std::process::exit(2);
                }
            });
            let profile = if state.options.profile == "fresh" {
                state.directory.join("webview-profile")
            } else {
                state.directory.parent().unwrap().join("profiles").join(&state.options.mode)
            };
            state.record("profile-selected", json!({"requested":state.options.profile,
                "previouslyExisted":profile.exists(),"isolated":true}));
            fs::create_dir_all(&profile)?;
            let file = if state.options.mode == "minimal" { "minimal.html" } else { "dashboard.html" };
            state.record("window-create-start", json!({}));
            WebviewWindowBuilder::new(app, "startup", WebviewUrl::App(file.into()))
                .title("Record Maker — isolated Tauri startup test")
                .inner_size(if state.options.mode == "minimal" { 920.0 } else { 1440.0 },
                    if state.options.mode == "minimal" { 650.0 } else { 960.0 })
                .data_directory(profile)
                // Match Electron's existing software-graphics compatibility policy.
                .additional_browser_args("--disable-gpu --disable-background-networking --disable-features=msEdgeSidebarV2")
                .on_navigation(|url| {
                    (url.scheme() == "tauri" && url.host_str() == Some("localhost"))
                        || (url.scheme() == "http" && url.host_str() == Some("tauri.localhost"))
                })
                .on_new_window(|_, _| tauri::webview::NewWindowResponse::Deny)
                .on_page_load(|window, payload| {
                    window.state::<Arc<State>>().record("native-page-load", json!({"event":format!("{:?}",payload.event())}));
                })
                .build()?;
            state.record("window-created", json!({}));
            Ok(())
        })
        .build(tauri::generate_context!());
    match app {
        Ok(app) => app.run(move |_handle, event| {
            if let tauri::RunEvent::Exit = event {
                exit_state.stop_service();
                if exit_state.ready.lock().unwrap().is_none() { exit_state.finish("closed-before-ready"); }
            }
        }),
        Err(_) => { state.record("host-error", json!({})); state.finish("host-error"); state.stop_service(); }
    }
}
