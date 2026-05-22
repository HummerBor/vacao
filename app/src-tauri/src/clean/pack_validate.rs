use crate::clean::pack_types::CleanPackFile;
use crate::clean::targets::is_known_clean_id;
use std::path::PathBuf;

pub fn validate_pack(file: &CleanPackFile) -> Result<(), Vec<String>> {
    let mut errs = Vec::new();
    if file.schema_version != 1 {
        errs.push(format!("unsupported schemaVersion: {}", file.schema_version));
    }
    if file.pack.items.len() > 50 {
        errs.push("pack.items exceeds 50".into());
    }
    let mut seen_ids = std::collections::HashSet::new();
    for item in &file.pack.items {
        if !is_valid_pack_id(&item.id) {
            errs.push(format!("invalid pack id: {}", item.id));
        }
        if !seen_ids.insert(item.id.clone()) {
            errs.push(format!("duplicate pack id: {}", item.id));
        }
        if item.label.trim().is_empty() {
            errs.push(format!("{}: empty label", item.id));
        }
        if item.paths.is_empty() {
            errs.push(format!("{}: paths required", item.id));
        }
        if item.paths.len() > 20 {
            errs.push(format!("{}: too many paths", item.id));
        }
        for p in &item.paths {
            if let Err(e) = validate_pack_path(p) {
                errs.push(format!("{}: {e}", item.id));
            }
        }
    }
    for id in file
        .profile
        .enabled_built_in_ids
        .iter()
        .chain(file.profile.disabled_built_in_ids.iter())
    {
        if !is_known_clean_id(id) {
            errs.push(format!("unknown built-in id in profile: {id}"));
        }
    }
    for p in &file.profile.extra_roots {
        if let Err(e) = validate_pack_path(p) {
            errs.push(format!("profile.extraRoots: {e}"));
        }
    }
    if errs.is_empty() {
        Ok(())
    } else {
        Err(errs)
    }
}

pub fn is_valid_pack_id(id: &str) -> bool {
    let Some(rest) = id.strip_prefix('X') else {
        return false;
    };
    rest.len() >= 2 && rest.chars().all(|c| c.is_ascii_digit())
}

pub fn validate_pack_path(p: &str) -> Result<PathBuf, String> {
    let t = p.trim();
    if t.is_empty() {
        return Err("empty path".into());
    }
    let pb = crate::paths::normalize_scan_root(t)?;
    let lower = pb.to_string_lossy().to_lowercase().replace('/', "\\");
    if lower.len() <= 3 && lower.ends_with(":\\") {
        return Err("drive root not allowed".into());
    }
    const BLOCK: &[&str] = &[
        "\\windows\\",
        "\\program files\\",
        "\\program files (x86)\\",
        "\\desktop\\",
        "\\documents\\",
        "\\downloads\\",
    ];
    for b in BLOCK {
        if lower.contains(b) {
            return Err(format!("blocked path segment: {b}"));
        }
    }
    Ok(pb)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_drive_root() {
        assert!(validate_pack_path("C:\\").is_err());
    }

    #[test]
    fn accepts_user_temp() {
        assert!(validate_pack_path("C:\\Users\\x\\AppData\\Local\\Temp").is_ok());
    }

    #[test]
    fn pack_id_pattern() {
        assert!(is_valid_pack_id("X01"));
        assert!(!is_valid_pack_id("C01"));
        assert!(!is_valid_pack_id("X1"));
    }
}
