#![cfg_attr(windows, windows_subsystem = "windows")]
#[cfg(windows)]
mod app;
fn main() {
    #[cfg(windows)]
    app::run();
    #[cfg(not(windows))]
    eprintln!("College Record Maker is supported on Windows 10/11 x64.");
}
