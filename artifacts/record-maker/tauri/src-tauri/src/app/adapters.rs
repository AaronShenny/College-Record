use base64::{engine::general_purpose::STANDARD, Engine};
use serde_json::{json, Value};
use std::path::Path;
use record_maker_native::service::managed_file;

pub fn message(title: &str, description: &str, yes: &str, no: &str) -> bool {
    matches!(rfd::MessageDialog::new().set_title(title).set_description(description)
        .set_buttons(rfd::MessageButtons::OkCancelCustom(no.into(), yes.into())).show(),
        rfd::MessageDialogResult::Custom(value) if value == yes)
}

fn shell_open(target: &str) -> Result<(), String> {
    use windows_sys::Win32::UI::Shell::ShellExecuteW;
    let file: Vec<u16> = target.encode_utf16().chain(Some(0)).collect();
    let verb: Vec<u16> = "open".encode_utf16().chain(Some(0)).collect();
    let result = unsafe { ShellExecuteW(std::ptr::null_mut(), verb.as_ptr(), file.as_ptr(),
        std::ptr::null(), std::ptr::null(), 1) };
    if result as isize <= 32 { return Err("Windows could not open the selected document or browser.".into()); }
    Ok(())
}

pub fn callback(action: &str, payload: Value, root: &Path) -> Result<Value, String> {
    match action {
        "exclusive-host" => { super::startup::exclude_electron()?; Ok(Value::Null) }
        "vault-available" | "vault-encrypt" | "vault-decrypt" => record_maker_native::vault::callback(action, payload),
        "open-oauth" => {
            let url = tauri::Url::parse(payload["url"].as_str().ok_or("Invalid authorization URL.")?).map_err(|_| "Invalid authorization URL.")?;
            if url.scheme() != "https" || url.host_str() != Some("accounts.google.com") ||
                url.path() != "/o/oauth2/v2/auth" || !url.username().is_empty() || url.password().is_some() {
                return Err("Unsupported authorization destination.".into());
            }
            shell_open(url.as_str())?; Ok(Value::Null)
        }
        "open-document" => {
            let file = managed_file(root, Path::new(payload["filename"].as_str().ok_or("Invalid document.")?))?;
            if !matches!(file.extension().and_then(|s| s.to_str()), Some("docx" | "pdf")) { return Err("Unsupported generated document.".into()); }
            shell_open(&record_maker_native::runtime_paths::node_argument(&file).to_string_lossy())?;
            Ok(json!(""))
        }
        "open-dialog" | "save-dialog" => {
            let mut dialog = rfd::FileDialog::new().set_title(payload["title"].as_str().unwrap_or("Recordly"));
            if let Some(filters) = payload["filters"].as_array() {
                for filter in filters.iter().take(20) {
                    let extensions: Vec<&str> = filter["extensions"].as_array().map(|v| v.iter().filter_map(Value::as_str).take(30).collect()).unwrap_or_default();
                    dialog = dialog.add_filter(filter["name"].as_str().unwrap_or("Files"), &extensions);
                }
            }
            if let Some(name) = payload["defaultPath"].as_str() {
                // The service supplies suggested names, not arbitrary destinations.
                if let Some(name) = Path::new(name).file_name() { dialog = dialog.set_file_name(name.to_string_lossy()); }
            }
            if action == "save-dialog" {
                let chosen = dialog.save_file();
                return Ok(json!({"canceled":chosen.is_none(),"filePath":chosen}));
            }
            let folder = payload["properties"].as_array().is_some_and(|p| p.iter().any(|p| p == "openDirectory"));
            let chosen = if folder { dialog.pick_folder() } else { dialog.pick_file() };
            Ok(json!({"canceled":chosen.is_none(),"filePaths":chosen.into_iter().collect::<Vec<_>>()}))
        }
        "message-dialog" => {
            let buttons = payload["buttons"].as_array().ok_or("Invalid native confirmation.")?;
            if buttons.len() != 2 { return Err("Unsupported native confirmation.".into()); }
            let first = buttons[0].as_str().ok_or("Invalid confirmation.")?;
            let second = buttons[1].as_str().ok_or("Invalid confirmation.")?;
            let description = format!("{}\n\n{}", payload["message"].as_str().unwrap_or(""), payload["detail"].as_str().unwrap_or(""));
            // Destructive recovery remains the second, explicitly selected button.
            let selected = message(payload["title"].as_str().unwrap_or("Recordly"), &description, second, first);
            Ok(json!({"response":if selected {1} else {0}}))
        }
        "paste-image" => {
            let mut clipboard = arboard::Clipboard::new().map_err(|_| "Windows clipboard is unavailable.")?;
            let image = match clipboard.get_image() {
                Ok(image) => image,
                Err(arboard::Error::ContentNotAvailable) => return Ok(Value::Null),
                Err(_) => return Err("Could not read the screenshot from the clipboard.".into()),
            };
            if image.width == 0 || image.height == 0 || image.width > 16000 || image.height > 16000 ||
                image.bytes.len() > 32 * 1024 * 1024 { return Err("Clipboard screenshot is too large.".into()); }
            let mut bytes = Vec::new();
            {
                let mut encoder = png::Encoder::new(&mut bytes, image.width as u32, image.height as u32);
                encoder.set_color(png::ColorType::Rgba); encoder.set_depth(png::BitDepth::Eight);
                let mut writer = encoder.write_header().map_err(|_| "Could not encode the screenshot.")?;
                writer.write_image_data(&image.bytes).map_err(|_| "Could not encode the screenshot.")?;
            }
            if bytes.len() > 8 * 1024 * 1024 { return Err("Screenshots must be smaller than 8 MB.".into()); }
            Ok(json!({"dataUrl":format!("data:image/png;base64,{}", STANDARD.encode(bytes))}))
        }
        _ => Err("Unsupported native callback.".into()),
    }
}
