use std::path::{Path, PathBuf};

/// True for junctions / symlinks / mount points (reparse points) on Windows.
#[cfg(windows)]
pub fn is_reparse_point_path(path: &Path) -> bool {
    use std::os::windows::fs::MetadataExt;
    const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x400;
    std::fs::metadata(path)
        .map(|m| m.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0)
        .unwrap_or(false)
}

#[cfg(not(windows))]
pub fn is_reparse_point_path(_path: &Path) -> bool {
    false
}

/// Require an absolute root (drive or UNC) for scanning.
pub fn normalize_scan_root(s: &str) -> Result<PathBuf, String> {
    let t = s.trim();
    if t.is_empty() {
        return Err("empty path".into());
    }
    let p = PathBuf::from(t);
    if !p.has_root() {
        return Err("root path must be absolute (e.g. C:\\ or D:\\work)".into());
    }
    Ok(dunce::simplified(&p).to_path_buf())
}

fn path_lower_normalized(p: &Path) -> String {
    let pb = dunce::canonicalize(p).unwrap_or_else(|_| dunce::simplified(p).to_path_buf());
    pb.as_os_str().to_string_lossy().to_lowercase().replace('/', "\\")
}

/// `child` must be under one of `roots` (Windows: case-insensitive path prefix).
pub fn path_allowed_under_roots(roots: &[PathBuf], child: &Path) -> bool {
    let child_s = path_lower_normalized(child);
    for root in roots {
        let base = path_lower_normalized(root);
        if child_s == base {
            return true;
        }
        let prefix = if base.ends_with('\\') {
            base.clone()
        } else {
            format!("{}\\", base)
        };
        if child_s.starts_with(&prefix) {
            return true;
        }
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_relative_root() {
        assert!(normalize_scan_root("relative\\path").is_err());
    }

    #[test]
    fn accepts_drive_root() {
        assert!(normalize_scan_root("C:\\").is_ok());
    }
}
