//! Windows-user-bound DPAPI. These functions are only for the owned service
//! callback channel; never expose them as renderer commands.
use windows_sys::Win32::{
    Foundation::LocalFree,
    Security::Cryptography::{CryptProtectData, CryptUnprotectData, CRYPT_INTEGER_BLOB, CRYPTPROTECT_UI_FORBIDDEN},
};
use base64::{engine::general_purpose::STANDARD, Engine};
use serde_json::{json, Value};

const PREFIX: &[u8] = b"CRMTAURI\0\x01";
const ENTROPY: &[u8] = b"CollegeRecordMaker:Tauri:Credentials:v1";
const MAX_PLAINTEXT: usize = 64 * 1024;

fn transform(input: &[u8], encrypt: bool) -> Result<Vec<u8>, String> {
    let data = CRYPT_INTEGER_BLOB { cbData: input.len() as u32, pbData: input.as_ptr() as *mut u8 };
    let entropy = CRYPT_INTEGER_BLOB { cbData: ENTROPY.len() as u32, pbData: ENTROPY.as_ptr() as *mut u8 };
    let mut output: CRYPT_INTEGER_BLOB = unsafe { std::mem::zeroed() };
    let success = unsafe {
        if encrypt {
            CryptProtectData(&data, std::ptr::null(), &entropy, std::ptr::null(), std::ptr::null(), CRYPTPROTECT_UI_FORBIDDEN, &mut output)
        } else {
            CryptUnprotectData(&data, std::ptr::null_mut(), &entropy, std::ptr::null(), std::ptr::null(), CRYPTPROTECT_UI_FORBIDDEN, &mut output)
        }
    };
    if success == 0 { return Err("Windows could not unlock the saved credentials. Originals were preserved.".into()); }
    if output.pbData.is_null() || output.cbData as usize > 128 * 1024 {
        if !output.pbData.is_null() { unsafe { LocalFree(output.pbData as *mut _); } }
        return Err("Invalid Windows credential response.".into());
    }
    let bytes = unsafe { std::slice::from_raw_parts(output.pbData, output.cbData as usize) }.to_vec();
    unsafe {
        // Clear the native DPAPI allocation before returning it to Windows.
        std::ptr::write_bytes(output.pbData, 0, output.cbData as usize);
        LocalFree(output.pbData as *mut _);
    }
    Ok(bytes)
}

pub fn encrypt(plaintext: &str) -> Result<Vec<u8>, String> {
    if plaintext.len() > MAX_PLAINTEXT { return Err("Credential payload is too large.".into()); }
    let mut bytes = PREFIX.to_vec();
    bytes.extend_from_slice(&transform(plaintext.as_bytes(), true)?);
    Ok(bytes)
}
pub fn decrypt(bytes: &[u8]) -> Result<String, String> {
    if bytes.len() > 128 * 1024 || !bytes.starts_with(PREFIX) {
        return Err("These credentials require explicit sign-in recovery. Originals were preserved.".into());
    }
    let decoded = transform(&bytes[PREFIX.len()..], false)?;
    if decoded.len() > MAX_PLAINTEXT { return Err("Invalid credential payload.".into()); }
    String::from_utf8(decoded).map_err(|_| "Invalid credential payload.".into())
}

/// Private child-process callback only. Never register as a WebView command.
pub fn callback(action: &str, payload: Value) -> Result<Value, String> {
    match action {
        "vault-available" => Ok(json!(encrypt("{}").is_ok())),
        "vault-encrypt" => {
            let value = payload["value"].as_str().ok_or("Invalid vault request.")?;
            Ok(json!(STANDARD.encode(encrypt(value)?)))
        }
        "vault-decrypt" => {
            let encoded = payload["value"].as_str().filter(|value| value.len() <= 180_000).ok_or("Invalid vault request.")?;
            let bytes = STANDARD.decode(encoded).map_err(|_| "Invalid vault request.")?;
            Ok(json!(decrypt(&bytes)?))
        }
        _ => Err("Unsupported vault operation.".into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn windows_vault_roundtrips_without_assuming_electron_compatibility() {
        let plaintext = "{\"fixture\":\"not-a-real-token\"}";
        let encrypted = encrypt(plaintext).unwrap();
        assert_ne!(encrypted, plaintext.as_bytes());
        assert_eq!(decrypt(&encrypted).unwrap(), plaintext);
        assert!(decrypt(b"electron-opaque-fixture").is_err());
        let mut damaged = encrypted; *damaged.last_mut().unwrap() ^= 0xff;
        assert!(decrypt(&damaged).is_err());
    }
}
