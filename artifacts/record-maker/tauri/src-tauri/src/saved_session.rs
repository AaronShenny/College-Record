use serde_json::Value;

pub struct SavedIdentity {
    pub sub: String,
    pub email: String,
    pub name: String,
}
/// Invalid-but-decryptable sessions take the same non-destructive recovery
/// path as an unavailable vault. Never return tokens across the native bridge.
pub fn identity(plain: &str) -> Option<SavedIdentity> {
    if plain.len() > 128 * 1024 { return None; }
    let value: Value = serde_json::from_str(plain).ok()?;
    let account = &value["identity"];
    let sub = account["sub"].as_str()?;
    let email = account["email"].as_str()?;
    let name = account["name"].as_str()?.trim();
    let token = value["tokens"]["refresh_token"].as_str()?.trim();
    if sub.trim().is_empty() || sub != sub.trim() || name.is_empty() || token.is_empty() ||
        email.contains(char::is_whitespace) || email.matches('@').count() != 1 ||
        !email.to_lowercase().ends_with("@rajagiri.edu") || email.starts_with('@') { return None; }
    Some(SavedIdentity { sub: sub.into(), email: email.into(), name: name.into() })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn corrupt_sessions_need_recovery_without_revealing_content() {
        for input in ["null", "{}", "not json", r#"{"identity":{"sub":"x"}}"#] {
            assert!(identity(input).is_none());
        }
        assert!(identity(&" ".repeat(128 * 1024 + 1)).is_none());
        let valid = r#"{"identity":{"sub":"x","email":"x@rajagiri.edu","name":"Fixture"},"tokens":{"refresh_token":"opaque"}}"#;
        assert_eq!(identity(valid).unwrap().sub, "x");
        assert!(identity(&valid.replace("rajagiri.edu", "other.edu")).is_none());
        assert!(identity(&valid.replace("refresh_token", "access_token")).is_none());
    }
}
