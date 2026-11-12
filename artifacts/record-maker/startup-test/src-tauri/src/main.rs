#![cfg_attr(windows, windows_subsystem = "windows")]

mod protocol;
mod summary;
#[cfg(windows)]
mod windows;

fn main() {
    #[cfg(windows)]
    windows::run();
    #[cfg(not(windows))]
    eprintln!("This startup comparison executable is Windows-only.");
}
