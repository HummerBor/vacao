use crate::clean::cursor_storage;
use crate::clean::pack::clean_one_pack_id;
use crate::clean::targets::{collect_targets, is_known_clean_id, purge_targets};
use crate::config::AppConfig;
use serde::Serialize;
use std::path::Path;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanResultItem {
    pub id: String,
    pub status: String,
    pub detail: Option<String>,
}

pub fn clean_run(ids: Vec<String>) -> Result<Vec<CleanResultItem>, String> {
    let cfg = AppConfig::load().map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for id in &ids {
        let item = if id.starts_with('X') {
            clean_one_pack_id(id, &cfg)
        } else if is_known_clean_id(id) {
            match id.as_str() {
                "C03" => empty_recycle_bin(),
                "C17" | "C18" => clean_cursor_id(id, &cfg),
                _ => clean_paths(id, &cfg),
            }
        } else {
            err(id, format!("unknown clean id: {id}"))
        };
        out.push(item);
    }
    Ok(out)
}

fn clean_cursor_id(id: &str, cfg: &AppConfig) -> CleanResultItem {
    if cursor_storage::is_cursor_running() {
        return skip(id, "请先完全退出 Cursor（检测到 Cursor.exe 正在运行）");
    }
    if id == "C17" {
        let dirs = cursor_storage::collect_c17_workspace_dirs(cfg);
        if dirs.is_empty() {
            return skip(
                id,
                "无符合条件的工作区目录（请检查设置中的天数/体积/匹配模式）",
            );
        }
        match purge_targets(&dirs) {
            Ok(n) => ok(
                id,
                Some(format!(
                    "已清理 {} 个工作区目录，约 {} 个文件",
                    dirs.len(),
                    n
                )),
            ),
            Err(e) => err(id, e.to_string()),
        }
    } else {
        let (files, hint) = cursor_storage::collect_c18_files(cfg);
        if files.is_empty() {
            return skip(id, format!("无可删除文件。{hint}"));
        }
        let (n, errs) = cursor_storage::purge_files(&files);
        let mut detail = format!("已删除 {} 个文件。{}", n, hint);
        if !errs.is_empty() {
            detail.push_str(&format!(" 部分失败: {}", errs.join("; ")));
        }
        ok(id, Some(detail))
    }
}

fn clean_paths(id: &str, cfg: &AppConfig) -> CleanResultItem {
    if id == "C09" && cfg.extra_roots.is_empty() {
        return skip(id, "设置中自定义清理目录为空，已跳过");
    }
    let paths = collect_targets(id, cfg);
    if paths.is_empty() && id != "C03" {
        return skip(id, "未找到可清理路径（可能未安装对应软件）");
    }
    match purge_targets(&paths) {
        Ok(n) => ok(
            id,
            Some(format!(
                "已删除约 {} 个文件（{}）",
                n,
                paths
                    .iter()
                    .take(2)
                    .map(|p| p.display().to_string())
                    .collect::<Vec<_>>()
                    .join("; ")
            )),
        ),
        Err(e) => err(id, e.to_string()),
    }
}

pub(crate) fn ok(id: &str, detail: Option<String>) -> CleanResultItem {
    CleanResultItem {
        id: id.into(),
        status: "ok".into(),
        detail,
    }
}

pub(crate) fn err(id: &str, msg: String) -> CleanResultItem {
    CleanResultItem {
        id: id.into(),
        status: "error".into(),
        detail: Some(msg),
    }
}

pub(crate) fn skip(id: &str, reason: impl Into<String>) -> CleanResultItem {
    CleanResultItem {
        id: id.into(),
        status: "skipped".into(),
        detail: Some(reason.into()),
    }
}

#[cfg(windows)]
fn empty_recycle_bin() -> CleanResultItem {
    if let Some(detail) = empty_recycle_bin_shell_api() {
        return ok("C03", Some(detail));
    }
    empty_recycle_bin_powershell_fallback()
}

#[cfg(windows)]
fn empty_recycle_bin_shell_api() -> Option<String> {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::Shell::SHEmptyRecycleBinW;

    const SHERB_NOCONFIRMATION: u32 = 0x0000_0001;
    const SHERB_NOPROGRESSUI: u32 = 0x0000_0002;
    const SHERB_NOSOUND: u32 = 0x0000_0004;
    let flags = SHERB_NOCONFIRMATION | SHERB_NOPROGRESSUI | SHERB_NOSOUND;

    unsafe {
        match SHEmptyRecycleBinW(HWND::default(), None, flags) {
            Ok(()) => Some("回收站已清空".into()),
            Err(_) => None,
        }
    }
}

#[cfg(windows)]
fn empty_recycle_bin_powershell_fallback() -> CleanResultItem {
    let script = r#"
$ErrorActionPreference = 'SilentlyContinue'
$cleared = $false
try {
  Clear-RecycleBin -Force -ErrorAction SilentlyContinue
  if ($?) { $cleared = $true }
} catch {}
if (-not $cleared) {
  Get-PSDrive -PSProvider FileSystem | ForEach-Object {
    $letter = $_.Name
    if ($letter.Length -eq 1) {
      Clear-RecycleBin -DriveLetter $letter -Force -ErrorAction SilentlyContinue | Out-Null
    }
  }
}
exit 0
"#;
    let out = crate::win_ps::run(script);
    match out {
        Ok(o) if o.status.success() => ok("C03", Some("回收站已清空".into())),
        Ok(o) => err(
            "C03",
            format!(
                "exit {}: {}",
                o.status.code().unwrap_or(-1),
                String::from_utf8_lossy(&o.stderr).trim()
            ),
        ),
        Err(e) => err("C03", e.to_string()),
    }
}

#[cfg(not(windows))]
fn empty_recycle_bin() -> CleanResultItem {
    skip("C03", "仅支持 Windows")
}

#[allow(dead_code)]
fn _path_exists(p: &Path) -> bool {
    p.exists()
}
