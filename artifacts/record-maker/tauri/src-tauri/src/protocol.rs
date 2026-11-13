use serde::Deserialize;
use serde_json::Value;
use std::io::{BufRead, Read};

pub const MAX_FRAME_BYTES: usize = 280 * 1024 * 1024;

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ServiceFrame {
    pub protocol: u8,
    pub kind: String,
    pub id: String,
    pub ok: Option<bool>,
    pub result: Option<Value>,
    pub error: Option<String>,
    pub action: Option<String>,
    pub payload: Option<Value>,
}

pub fn allowed_method(method: &str) -> bool {
    matches!(method, "runtime" | "load" | "save" | "workflow" | "import-source" |
        "paste-image" | "python-health" | "inspect" | "renderer-ready" | "diagnostic" | "shutdown" | "close-check")
}

pub fn allowed_native(action: &str) -> bool {
    matches!(action, "exclusive-host" | "vault-available" | "vault-encrypt" | "vault-decrypt" |
        "open-oauth" | "open-document" | "open-dialog" | "save-dialog" |
        "message-dialog" | "paste-image" | "updates-initialize" | "updates-check" | "updates-restart")
}

/// Bounded BEFORE parsing. Never include the raw frame in a returned error.
pub fn read_frame(reader: &mut impl BufRead, limit: usize) -> Result<ServiceFrame, String> {
    let mut bytes = Vec::new();
    let count = reader.take(limit as u64 + 1).read_until(b'\n', &mut bytes)
        .map_err(|_| "Native service output could not be read.")?;
    if count == 0 { return Err("Native service stopped. Its operations were not retried.".into()); }
    if count > limit || bytes.last() != Some(&b'\n') { return Err("Invalid or oversized native service message.".into()); }
    let frame: ServiceFrame = serde_json::from_slice(&bytes).map_err(|_| "Invalid native service protocol.")?;
    if frame.protocol != 1 || uuid::Uuid::parse_str(&frame.id).is_err() {
        return Err("Invalid native service protocol.".into());
    }
    match frame.kind.as_str() {
        "result" if frame.ok.is_some() && frame.action.is_none() && frame.payload.is_none() => {
            if frame.error.as_ref().is_some_and(|error| error.len() > 4000) { return Err("Invalid native service error.".into()); }
        }
        "native" if frame.ok.is_none() && frame.result.is_none() && frame.error.is_none() &&
            frame.action.as_ref().is_some_and(|action| allowed_native(action)) => {}
        _ => return Err("Unsupported native service message.".into()),
    }
    Ok(frame)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;
    #[test]
    fn fixed_methods_do_not_expose_arbitrary_execution_or_file_access() {
        for method in ["runtime", "load", "save", "workflow"] { assert!(allowed_method(method)); }
        for method in ["exec", "read-file", "vault-decrypt", "../load", ""] { assert!(!allowed_method(method)); }
        assert!(!allowed_native("shell"));
    }
    #[test]
    fn malformed_and_oversized_responses_never_echo_payloads() {
        let mut input = Cursor::new(b"{\"sensitive\":\"fixture-only\"}\n");
        let error = read_frame(&mut input, 10).unwrap_err();
        assert!(!error.contains("fixture-only"));
        assert!(read_frame(&mut Cursor::new(b"invalid\n"), 100).is_err());
    }
    #[test]
    fn valid_results_and_callbacks_have_distinct_shapes() {
        let id = uuid::Uuid::new_v4();
        let result = format!("{{\"protocol\":1,\"kind\":\"result\",\"id\":\"{id}\",\"ok\":true,\"result\":{{\"ready\":true}}}}\n");
        assert_eq!(read_frame(&mut Cursor::new(result), 1000).unwrap().kind, "result");
        let invalid = format!("{{\"protocol\":1,\"kind\":\"native\",\"id\":\"{id}\",\"action\":\"exec\",\"payload\":{{}}}}\n");
        assert!(read_frame(&mut Cursor::new(invalid), 1000).is_err());
    }
}
