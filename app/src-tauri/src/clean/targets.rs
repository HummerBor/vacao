use crate::clean::agent_tools;
use crate::clean::browser_tools;
use crate::clean::cursor_storage;
use crate::config::AppConfig;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

pub const ALL_CLEAN_IDS: &[&str] = &[
    "C01", "C02", "C03", "C04", "C05", "C06", "C08", "C09", "C10", "C11", "C12", "C13",
    "C16", "C17", "C18",
];

pub fn is_known_clean_id(id: &str) -> bool {
    ALL_CLEAN_IDS.contains(&id)
}

/// 解析该项会触及的路径（文件或目录）；清理时对这些路径执行「删文件」。
pub fn collect_targets(id: &str, cfg: &AppConfig) -> Vec<PathBuf> {
    match id {
        "C01" => user_temp_paths(),
        "C02" => vec![PathBuf::from(r"C:\Windows\Temp")],
        "C03" => vec![], // 回收站：不走目录枚举
        "C04" => browser_cache_paths(cfg),
        "C05" => vec![PathBuf::from(r"C:\Windows\SoftwareDistribution\Download")],
        "C06" => thumbnail_cache_paths(),
        "C08" => delivery_optimization_paths(),
        "C09" => cfg
            .extra_roots
            .iter()
            .map(PathBuf::from)
            .collect(),
        "C10" => dev_cache_paths(),
        "C11" => vec![PathBuf::from(r"C:\Windows\Prefetch")],
        "C12" => directx_shader_cache_paths(),
        "C13" => wer_cache_paths(),
        "C16" => agent_state_cache_paths(),
        "C17" => cursor_storage::collect_c17_workspace_dirs(cfg),
        "C18" => cursor_storage::collect_c18_files(cfg).0,
        _ => vec![],
    }
}

pub fn dir_size_bytes(path: &Path) -> u64 {
    if !path.exists() {
        return 0;
    }
    let meta = match std::fs::metadata(path) {
        Ok(m) => m,
        Err(_) => return 0,
    };
    if meta.is_file() {
        return meta.len();
    }
    let mut sum = 0u64;
    for e in WalkDir::new(path)
        .follow_links(false)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        if e.file_type().is_file() {
            if let Ok(m) = e.metadata() {
                sum = sum.saturating_add(m.len());
            }
        }
    }
    sum
}

pub fn estimate_targets_bytes(paths: &[PathBuf]) -> u64 {
    paths.iter().map(|p| dir_size_bytes(p)).sum()
}

/// 仅删除路径下的**文件**（目录保留），与原先 purge_files_under 一致。
pub fn purge_targets(paths: &[PathBuf]) -> std::io::Result<usize> {
    let mut n = 0usize;
    for p in paths {
        if !p.exists() {
            continue;
        }
        if p.is_file() {
            if std::fs::remove_file(p).is_ok() {
                n += 1;
            }
            continue;
        }
        for e in WalkDir::new(p)
            .follow_links(false)
            .into_iter()
            .filter_map(|e| e.ok())
        {
            if e.file_type().is_file() && std::fs::remove_file(e.path()).is_ok() {
                n += 1;
            }
        }
    }
    Ok(n)
}

fn user_temp_paths() -> Vec<PathBuf> {
    let mut v = Vec::new();
    if let Some(p) = std::env::var_os("TEMP") {
        v.push(PathBuf::from(p));
    }
    if let Some(la) = std::env::var_os("LOCALAPPDATA") {
        v.push(PathBuf::from(la).join("Temp"));
    }
    v
}

fn local_app_data() -> Option<PathBuf> {
    std::env::var_os("LOCALAPPDATA").map(PathBuf::from)
}

fn app_data() -> Option<PathBuf> {
    std::env::var_os("APPDATA").map(PathBuf::from)
}

fn push_if_exists(v: &mut Vec<PathBuf>, p: PathBuf) {
    if p.exists() {
        v.push(p);
    }
}

/// C04 浏览器缓存（见 `browser_tools.rs`）
fn browser_cache_paths(cfg: &AppConfig) -> Vec<PathBuf> {
    browser_tools::collect_browser_cache_paths(cfg)
}

pub fn browser_paths_hint(cfg: &AppConfig) -> String {
    browser_tools::browser_paths_hint(cfg)
}

fn thumbnail_cache_paths() -> Vec<PathBuf> {
    let mut v = Vec::new();
    let Some(la) = local_app_data() else {
        return v;
    };
    let explorer = la.join("Microsoft").join("Windows").join("Explorer");
    if !explorer.is_dir() {
        return v;
    }
    if let Ok(rd) = std::fs::read_dir(&explorer) {
        for e in rd.flatten() {
            let name = e.file_name().to_string_lossy().to_lowercase();
            if name.starts_with("thumbcache_") && name.ends_with(".db") {
                v.push(e.path());
            }
        }
    }
    v
}

/// C16：编辑器/智能体状态缓存（见 `agent_tools.rs` 路径表，含原 C07 Cursor/VS Code 缓存与日志）
fn agent_state_cache_paths() -> Vec<PathBuf> {
    agent_tools::collect_agent_state_paths()
}

fn delivery_optimization_paths() -> Vec<PathBuf> {
    let mut v = Vec::new();
    push_if_exists(
        &mut v,
        PathBuf::from(r"C:\Windows\ServiceProfiles\NetworkService\AppData\Local\Microsoft\Windows\DeliveryOptimization\Cache"),
    );
    push_if_exists(
        &mut v,
        PathBuf::from(r"C:\ProgramData\Microsoft\Windows\DeliveryOptimization\Cache"),
    );
    v
}

fn directx_shader_cache_paths() -> Vec<PathBuf> {
    let mut v = Vec::new();
    if let Some(la) = local_app_data() {
        push_if_exists(&mut v, la.join("D3DSCache"));
        push_if_exists(&mut v, la.join("NVIDIA").join("DXCache"));
        push_if_exists(&mut v, la.join("NVIDIA").join("GLCache"));
    }
    v
}

fn wer_cache_paths() -> Vec<PathBuf> {
    let mut v = Vec::new();
    push_if_exists(
        &mut v,
        PathBuf::from(r"C:\ProgramData\Microsoft\Windows\WER\ReportQueue"),
    );
    push_if_exists(
        &mut v,
        PathBuf::from(r"C:\ProgramData\Microsoft\Windows\WER\ReportArchive"),
    );
    if let Some(la) = local_app_data() {
        push_if_exists(&mut v, la.join("Microsoft").join("Windows").join("WER"));
    }
    v
}

fn dev_cache_paths() -> Vec<PathBuf> {
    let mut v = Vec::new();
    if let Some(app) = app_data() {
        push_if_exists(&mut v, app.join("npm-cache"));
    }
    if let Some(la) = local_app_data() {
        push_if_exists(&mut v, la.join("pip").join("cache"));
        push_if_exists(&mut v, la.join("pnpm-cache"));
        push_if_exists(&mut v, la.join("pnpm").join("store"));
        push_if_exists(&mut v, la.join("Yarn").join("Cache"));
        push_if_exists(&mut v, la.join("npm-cache"));
    }
    v
}

#[cfg(windows)]
pub fn estimate_recycle_bin_bytes() -> Option<u64> {
    let script = r#"
$shell = New-Object -ComObject Shell.Application
$bin = $shell.NameSpace(10)
$sum = 0
if ($bin -ne $null) {
  foreach ($i in $bin.Items()) { $sum += [int64]$i.Size }
}
Write-Output $sum
"#;
    let out = std::process::Command::new("powershell.exe")
        .args(["-NoProfile", "-NonInteractive", "-Command", script])
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
    s.parse::<u64>().ok()
}

#[cfg(not(windows))]
pub fn estimate_recycle_bin_bytes() -> Option<u64> {
    None
}
