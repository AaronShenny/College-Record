mod adapters;
mod startup;
mod updates;
use record_maker_native::{protocol::{allowed_method, MAX_FRAME_BYTES}, service::{NativeService, ServiceConfiguration}};
use serde_json::{json, Value};
use std::{fs, io::Write, path::PathBuf, sync::{Arc, Mutex, atomic::{AtomicBool, AtomicUsize, Ordering}}, time::{Duration, Instant}};
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

struct State {
    base: PathBuf,
    resources: PathBuf,
    data: Mutex<Option<PathBuf>>,
    service: Mutex<Option<Arc<NativeService>>>,
    start_guard: Mutex<()>,
    instance_lock: Mutex<Option<fs::File>>,
    updates: Mutex<updates::Updates>,
    editing: Mutex<(u64, bool)>,
    active: AtomicUsize,
    closing: AtomicBool,
    started: Instant,
    log_lock: Mutex<()>,
}
impl State {
    fn log(&self, event: &str, details: Value) {
        let Ok(_guard) = self.log_lock.lock() else { return };
        let directory = self.base.join("diagnostics");
        if fs::create_dir_all(&directory).is_err() { return; }
        let filename = directory.join("native-startup.jsonl");
        if fs::metadata(&filename).is_ok_and(|m| m.len() > 2 * 1024 * 1024) {
            let _ = fs::remove_file(directory.join("native-startup.previous.jsonl"));
            let _ = fs::rename(&filename, directory.join("native-startup.previous.jsonl"));
        }
        if let Ok(mut file) = fs::OpenOptions::new().create(true).append(true).open(filename) {
            let _ = writeln!(file, "{}", json!({"event":event,"elapsedMs":self.started.elapsed().as_millis(),"details":details}));
        }
    }
    fn data(&self) -> Result<PathBuf, String> {
        self.data.lock().map_err(|_| "Native startup state is unavailable.")?.clone().ok_or("Finish local onboarding before opening records.".into())
    }
    fn service(self: &Arc<Self>, app: tauri::AppHandle) -> Result<Arc<NativeService>, String> {
        if let Some(service) = self.service.lock().map_err(|_| "Service state is unavailable.")?.clone() { return Ok(service); }
        let _guard = self.start_guard.lock().map_err(|_| "Service startup is unavailable.")?;
        if let Some(service) = self.service.lock().unwrap().clone() { return Ok(service); }
        startup::exclude_electron()?;
        let data = self.data()?;
        let native_state = Arc::downgrade(self);
        let native_app = app.clone();
        let service = NativeService::spawn(ServiceConfiguration {
            node: self.resources.join("node.exe"), script: self.resources.join("host/service-host.cjs"),
            directory: data, resources: self.resources.clone(), version: app.package_info().version.to_string(), packaged: true,
        }, Arc::new(move |action, payload| {
            let state = native_state.upgrade().ok_or("Native app is closing.")?;
            if action == "updates-initialize" || action == "updates-check" {
                return state.updates.try_lock().map_err(|_| "An update check is already running.")?
                    .check(&native_app, &state.resources, &state.data()?);
            }
            if action == "updates-restart" {
                if state.editing.lock().unwrap().1 { return Err("Save your edits and finish draft fields before restarting.".into()); }
                // HostWorkflows already guards document/account jobs and pauses
                // sync before this callback. Do not kill Node before a possibly
                // failed installer launch. On successful updater exit, Windows
                // closes this process's non-inherited Job handle and terminates
                // precisely its owned descendants.
                if state.active.load(Ordering::SeqCst) > 1 { return Err("Wait for other operations before restarting.".into()); }
                return state.updates.lock().map_err(|_| "Update state is unavailable.")?.install();
            }
            adapters::callback(action, payload, &state.data()?)
        }))?;
        let service = Arc::new(service);
        *self.service.lock().unwrap() = Some(service.clone());
        self.log("service-owned", json!({}));
        Ok(service)
    }
}

fn permitted(window: &tauri::WebviewWindow) -> Result<(), String> {
    let url = window.url().map_err(|_| "The app window is unavailable.")?;
    if window.label() != "main" || !((url.scheme() == "tauri" && url.host_str() == Some("localhost")) ||
        (url.scheme() == "http" && url.host_str() == Some("tauri.localhost"))) {
        return Err("Desktop commands are restricted to the local app window.".into());
    }
    Ok(())
}
#[tauri::command]
async fn desktop_request(window: tauri::WebviewWindow, state: tauri::State<'_, Arc<State>>, method: String, payload: Value) -> Result<Value, String> {
    permitted(&window)?;
    if serde_json::to_vec(&payload).map_err(|_| "Invalid desktop message.")?.len() > MAX_FRAME_BYTES {
        return Err("Desktop request exceeds its size limit.".into());
    }
    let state = state.inner().clone();
    let app = window.app_handle().clone();
    tauri::async_runtime::spawn_blocking(move || {
        if method == "boot" {
            let _guard = state.start_guard.lock().map_err(|_| "Onboarding is unavailable.")?;
            if state.instance_lock.lock().unwrap().is_none() {
                *state.instance_lock.lock().unwrap() = Some(startup::lock(&state.base)?);
            }
            let data = startup::onboard(&state.base)?;
            *state.data.lock().unwrap() = Some(data.clone());
            state.log("native-cache-open", json!({}));
            return startup::boot_cache(&data);
        }
        if method == "edit-state" {
            let dirty = payload["dirty"].as_bool().ok_or("Invalid editing state.")?;
            let sequence = payload["sequence"].as_u64().ok_or("Invalid editing sequence.")?;
            let mut editing = state.editing.lock().map_err(|_| "Editing state is unavailable.")?;
            if sequence > editing.0 { *editing = (sequence, dirty); }
            return Ok(Value::Null);
        }
        if method == "summary-ready" {
            state.log("interactive-summary", json!({}));
            return Ok(Value::Null);
        }
        if !allowed_method(&method) || method == "shutdown" { return Err("Unsupported desktop service operation.".into()); }
        if state.closing.load(Ordering::SeqCst) { return Err("The app is closing. No new operation was started.".into()); }
        // Old Electron does not honor the new instance lock. Check explicitly
        // before record mutations or account transitions.
        if method == "save" || method == "workflow" { startup::exclude_electron()?; }
        let service = state.service(app)?;
        state.active.fetch_add(1, Ordering::SeqCst);
        let result = service.request(&method, payload, Duration::from_secs(if method == "workflow" { 900 } else { 120 }));
        state.active.fetch_sub(1, Ordering::SeqCst);
        state.log("service-operation", json!({"method":method,"success":result.is_ok()}));
        result
    }).await.map_err(|_| "Native operation stopped. Local files were preserved.".to_string())?
}

pub fn run() {
    let started = Instant::now();
    tauri::Builder::default().plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![desktop_request])
        .setup(move |app| {
            let base = app.path().app_data_dir()?;
            let resources = app.path().resource_dir()?.join("runtime");
            let state = Arc::new(State {
                base, resources, data: Mutex::new(None), service: Mutex::new(None), start_guard: Mutex::new(()),
                instance_lock: Mutex::new(None), updates: Mutex::new(updates::Updates::default()),
                editing: Mutex::new((0, false)), active: AtomicUsize::new(0), closing: AtomicBool::new(false),
                started, log_lock: Mutex::new(()),
            });
            app.manage(state.clone());
            let window = WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("College Record Maker").inner_size(1180.0, 780.0).min_inner_size(900.0, 600.0)
                .additional_browser_args("--disable-gpu --disable-features=msWebOOUI,msPdfOOUI")
                .on_navigation(|url| (url.scheme() == "tauri" && url.host_str() == Some("localhost")) ||
                    (url.scheme() == "http" && url.host_str() == Some("tauri.localhost")))
                .on_new_window(|_, _| tauri::webview::NewWindowResponse::Deny)
                .build()?;
            let close_app = app.handle().clone();
            window.on_window_event(move |event| {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    if state.closing.load(Ordering::SeqCst) { return; }
                    if state.editing.lock().unwrap().1 || state.active.load(Ordering::SeqCst) != 0 {
                        let state = state.clone();
                        std::thread::spawn(move || {
                            state.log("close-blocked", json!({}));
                            rfd::MessageDialog::new().set_title("Finish saving before closing")
                                .set_description("Wait for processing to finish and save or correct your draft fields. Your work has not been discarded.").show();
                        });
                        return;
                    }
                    state.closing.store(true, Ordering::SeqCst);
                    let state = state.clone(); let app = close_app.clone();
                    std::thread::spawn(move || {
                        if let Some(service) = state.service.lock().unwrap().as_ref() {
                            let _ = service.request("shutdown", Value::Null, Duration::from_secs(10));
                            service.stop();
                        }
                        state.log("closed", json!({}));
                        app.exit(0);
                    });
                }
            });
            Ok(())
        }).run(tauri::generate_context!()).expect("College Record Maker could not initialize its native window.");
}
