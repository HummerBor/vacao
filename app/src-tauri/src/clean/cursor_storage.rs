//! C17/C18：Cursor workspaceStorage 与 globalStorage（spec 2026-05-24）。

use crate::clean::targets::dir_size_bytes;
use crate::config::AppConfig;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

pub fn cursor_workspace_storage_root() -> Option<PathBuf> {
    std::env::var_os("APPDATA").map(|ad| {
        PathBuf::from(ad)
            .join("Cursor")
            .join("User")
            .join("workspaceStorage")
    })
}

pub fn cursor_global_storage_dir() -> Option<PathBuf> {
    std::env::var_os("APPDATA").map(|ad| {
        PathBuf::from(ad)
            .join("Cursor")
            .join("User")
            .join("globalStorage")
    })
}

pub fn ws_dir_last_modified_secs(path: &Path) -> Option<u64> {
    if !path.is_dir() {
        return None;
    }
    let mut max_secs = file_or_dir_mtime(path)?;
    for e in walkdir::WalkDir::new(path)
        .follow_links(false)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        if e.file_type().is_file() {
            if let Some(t) = file_or_dir_mtime(e.path()) {
                max_secs = max_secs.max(t);
            }
        }
    }
    Some(max_secs)
}

fn file_or_dir_mtime(path: &Path) -> Option<u64> {
    let modified = std::fs::metadata(path).ok()?.modified().ok()?;
    modified.duration_since(UNIX_EPOCH).ok().map(|d| d.as_secs())
}

pub fn matches_ws_filter(cfg: &AppConfig, size_bytes: u64, last_modified_secs: u64) -> bool {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .ok()
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let age_secs = cfg.cursor_ws_min_age_days as u64 * 86400;
    let age_ok = now.saturating_sub(last_modified_secs) >= age_secs;
    let min_bytes = cfg.cursor_ws_min_size_mb.saturating_mul(1024 * 1024);
    let size_ok = size_bytes >= min_bytes;
    match cfg.cursor_ws_match_mode.as_str() {
        "any" => age_ok || size_ok,
        _ => age_ok && size_ok,
    }
}

pub fn collect_c17_workspace_dirs(cfg: &AppConfig) -> Vec<PathBuf> {
    let Some(root) = cursor_workspace_storage_root() else {
        return vec![];
    };
    if !root.is_dir() {
        return vec![];
    }
    let Ok(rd) = std::fs::read_dir(&root) else {
        return vec![];
    };
    let mut out = Vec::new();
    for e in rd.flatten() {
        let p = e.path();
        if !p.is_dir() {
            continue;
        }
        let size = dir_size_bytes(&p);
        let Some(mtime) = ws_dir_last_modified_secs(&p) else {
            continue;
        };
        if matches_ws_filter(cfg, size, mtime) {
            out.push(p);
        }
    }
    out.sort();
    out
}

pub fn collect_c18_files(cfg: &AppConfig) -> (Vec<PathBuf>, String) {
    let Some(gs) = cursor_global_storage_dir() else {
        return (vec![], "未找到 Cursor globalStorage 目录".into());
    };
    let mut files = Vec::new();
    for name in [
        "state.vscdb.bak",
        "state.vscdb.backup",
        "state.vscdb-wal",
        "state.vscdb-shm",
    ] {
        let p = gs.join(name);
        if p.is_file() {
            files.push(p);
        }
    }
    let main = gs.join("state.vscdb");
    let hint = if main.is_file() {
        let len = std::fs::metadata(&main).map(|m| m.len()).unwrap_or(0);
        let mb = len as f64 / (1024.0 * 1024.0);
        let threshold = cfg.cursor_global_min_mb.saturating_mul(1024 * 1024);
        if cfg.cursor_global_force_reset || len >= threshold {
            files.push(main);
            format!("主库 {:.1} MB，将删除", mb)
        } else {
            format!(
                "主库当前 {:.1} MB，阈值 {} MB，已跳过主库",
                mb, cfg.cursor_global_min_mb
            )
        }
    } else {
        "主库 state.vscdb 不存在".into()
    };
    files.sort();
    (files, hint)
}

fn fmt_bytes(n: u64) -> String {
    if n == 0 {
        return "0 B".into();
    }
    if n < 1024 * 1024 {
        return format!("{:.1} KB", n as f64 / 1024.0);
    }
    if n < 1024 * 1024 * 1024 {
        return format!("{:.1} MB", n as f64 / (1024.0 * 1024.0));
    }
    format!("{:.2} GB", n as f64 / (1024.0 * 1024.0 * 1024.0))
}

pub fn estimate_c17_bytes(cfg: &AppConfig) -> (usize, u64) {
    let dirs = collect_c17_workspace_dirs(cfg);
    let bytes: u64 = dirs.iter().map(|p| dir_size_bytes(p)).sum();
    (dirs.len(), bytes)
}

/// C17 详情栏：根目录 + 筛选说明 + 将清理的子目录绝对路径列表。
pub fn format_c17_paths_hint(cfg: &AppConfig) -> String {
    let dirs = collect_c17_workspace_dirs(cfg);
    let bytes: u64 = dirs.iter().map(|p| dir_size_bytes(p)).sum();
    let mode_label = if cfg.cursor_ws_match_mode == "any" {
        "满足任一"
    } else {
        "全部满足"
    };
    let root = cursor_workspace_storage_root()
        .map(|p| p.display().to_string())
        .unwrap_or_else(|| "（未找到 workspaceStorage）".into());
    let mut lines = vec![
        format!("根目录：{root}"),
        format!(
            "将清理 {} 个子目录，合计约 {}（筛选：≥{} 天未修改，≥{} MB，{}）",
            dirs.len(),
            fmt_bytes(bytes),
            cfg.cursor_ws_min_age_days,
            cfg.cursor_ws_min_size_mb,
            mode_label,
        ),
        String::new(),
    ];
    if dirs.is_empty() {
        lines.push("（无符合筛选条件的子目录）".into());
    } else {
        const MAX: usize = 12;
        for p in dirs.iter().take(MAX) {
            lines.push(p.display().to_string());
        }
        if dirs.len() > MAX {
            lines.push(format!("… 另有 {} 个子目录", dirs.len() - MAX));
        }
    }
    lines.join("\n")
}

/// C18 详情栏：globalStorage 目录 + 将删除的文件绝对路径。
pub fn format_c18_paths_hint(cfg: &AppConfig) -> String {
    let gs = cursor_global_storage_dir()
        .map(|p| p.display().to_string())
        .unwrap_or_else(|| "（未找到 globalStorage）".into());
    let (files, main_note) = collect_c18_files(cfg);
    let mut lines = vec![format!("目录：{gs}"), String::new()];
    if files.is_empty() {
        lines.push("（当前无匹配文件可删）".into());
    } else {
        lines.push("将删除的文件：".into());
        for p in &files {
            lines.push(p.display().to_string());
        }
    }
    lines.push(String::new());
    lines.push(main_note);
    lines.join("\n")
}

pub fn estimate_c18_bytes(cfg: &AppConfig) -> (u64, String) {
    let (files, hint) = collect_c18_files(cfg);
    let bytes: u64 = files
        .iter()
        .filter_map(|p| std::fs::metadata(p).ok())
        .map(|m| m.len())
        .sum();
    (bytes, hint)
}

#[cfg(windows)]
pub fn is_cursor_running() -> bool {
    let out = std::process::Command::new("tasklist")
        .args(["/FI", "IMAGENAME eq Cursor.exe", "/NH"])
        .output();
    match out {
        Ok(o) => {
            let s = String::from_utf8_lossy(&o.stdout);
            s.to_ascii_lowercase().contains("cursor.exe")
        }
        Err(_) => false,
    }
}

#[cfg(not(windows))]
pub fn is_cursor_running() -> bool {
    false
}

pub fn purge_files(paths: &[PathBuf]) -> (usize, Vec<String>) {
    let mut n = 0usize;
    let mut errors = Vec::new();
    for p in paths {
        if !p.is_file() {
            continue;
        }
        match std::fs::remove_file(p) {
            Ok(()) => n += 1,
            Err(e) => errors.push(format!("{}: {e}", p.display())),
        }
    }
    (n, errors)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::AppConfig;

    #[test]
    fn matches_ws_filter_all_requires_both() {
        let mut cfg = AppConfig::default();
        cfg.cursor_ws_min_age_days = 30;
        cfg.cursor_ws_min_size_mb = 10;
        cfg.cursor_ws_match_mode = "all".into();
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();
        let old = now - 31 * 86400;
        assert!(matches_ws_filter(&cfg, 11 * 1024 * 1024, old));
        assert!(!matches_ws_filter(&cfg, 11 * 1024 * 1024, now - 86400));
    }

    #[test]
    fn matches_ws_filter_any_either() {
        let mut cfg = AppConfig::default();
        cfg.cursor_ws_match_mode = "any".into();
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();
        assert!(matches_ws_filter(&cfg, 100, now - 31 * 86400));
        assert!(matches_ws_filter(&cfg, 20 * 1024 * 1024, now));
    }
}
