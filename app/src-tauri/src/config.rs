use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    #[serde(default = "default_true")]
    pub use_built_in_defaults: bool,
    #[serde(default)]
    pub extra_roots: Vec<String>,
    #[serde(default = "default_min_mb")]
    pub min_size_mb: u64,
    #[serde(default = "default_exclude_dir_names")]
    pub exclude_dir_names: Vec<String>,
    /// 为 true 时 C04 会额外删除 Chrome/Edge 的 Cookies（会导致网站退出登录）。
    /// 无论此项如何，均不删除 History（浏览记录）、Bookmarks 等。
    #[serde(default)]
    pub browser_clear_cookies: bool,
    /// 相对 exe 目录或绝对路径；空表示未配置扩展包。
    #[serde(default)]
    pub clean_pack_path: String,
    /// 为 true 时导入扩展包后自动将 Profile 应用到一键清理（不弹窗）。
    #[serde(default)]
    pub clean_pack_apply_profile_on_import: bool,
    /// C17：工作区子目录至少未修改天数。
    #[serde(default = "default_cursor_ws_min_age_days")]
    pub cursor_ws_min_age_days: u32,
    /// C17：工作区子目录至少体积（MB）。
    #[serde(default = "default_cursor_ws_min_size_mb")]
    pub cursor_ws_min_size_mb: u64,
    /// C17：`all`（且）或 `any`（或）。
    #[serde(default = "default_cursor_ws_match_mode")]
    pub cursor_ws_match_mode: String,
    /// C18：主 state.vscdb 删除阈值（MB）。
    #[serde(default = "default_cursor_global_min_mb")]
    pub cursor_global_min_mb: u64,
    /// C18：为 true 时忽略阈值，勾选即删主库。
    #[serde(default)]
    pub cursor_global_force_reset: bool,
}

fn default_true() -> bool {
    true
}
fn default_cursor_ws_min_age_days() -> u32 {
    30
}
fn default_cursor_ws_min_size_mb() -> u64 {
    10
}
fn default_cursor_ws_match_mode() -> String {
    "all".into()
}
fn default_cursor_global_min_mb() -> u64 {
    500
}
fn default_min_mb() -> u64 {
    100
}
fn default_exclude_dir_names() -> Vec<String> {
    vec![
        "$Recycle.Bin".into(),
        "System Volume Information".into(),
    ]
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            use_built_in_defaults: true,
            extra_roots: vec![],
            min_size_mb: 100,
            exclude_dir_names: default_exclude_dir_names(),
            browser_clear_cookies: false,
            clean_pack_path: String::new(),
            clean_pack_apply_profile_on_import: false,
            cursor_ws_min_age_days: default_cursor_ws_min_age_days(),
            cursor_ws_min_size_mb: default_cursor_ws_min_size_mb(),
            cursor_ws_match_mode: default_cursor_ws_match_mode(),
            cursor_global_min_mb: default_cursor_global_min_mb(),
            cursor_global_force_reset: false,
        }
    }
}

impl AppConfig {
    pub fn normalize(&mut self) {
        self.cursor_ws_min_age_days = self.cursor_ws_min_age_days.clamp(1, 3650);
        self.cursor_ws_min_size_mb = self.cursor_ws_min_size_mb.min(1024 * 1024);
        self.cursor_global_min_mb = self.cursor_global_min_mb.clamp(50, 4096);
        let mode = self.cursor_ws_match_mode.trim().to_lowercase();
        self.cursor_ws_match_mode = if mode == "any" {
            "any".into()
        } else {
            "all".into()
        };
    }
}

impl AppConfig {
    pub fn clean_pack_absolute_path(&self) -> Option<PathBuf> {
        let t = self.clean_pack_path.trim();
        if t.is_empty() {
            return None;
        }
        let p = PathBuf::from(t);
        if p.is_absolute() {
            return Some(p);
        }
        let exe = std::env::current_exe().ok()?;
        Some(exe.parent()?.join(p))
    }

    pub fn exe_dir(&self) -> PathBuf {
        std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(|d| d.to_path_buf()))
            .unwrap_or_else(|| PathBuf::from("."))
    }
    pub fn config_path() -> PathBuf {
        let exe = std::env::current_exe().expect("current_exe");
        exe.parent()
            .unwrap_or_else(|| std::path::Path::new("."))
            .join("config.json")
    }

    pub fn load() -> Result<Self> {
        let p = Self::config_path();
        if !p.exists() {
            return Ok(Self::default());
        }
        let s = std::fs::read_to_string(&p).with_context(|| format!("read {:?}", p))?;
        let mut c: Self = serde_json::from_str(&s).context("parse config.json")?;
        c.normalize();
        Ok(c)
    }

    pub fn save(&self) -> Result<()> {
        let mut c = self.clone();
        c.normalize();
        let p = Self::config_path();
        let s = serde_json::to_string_pretty(&c)?;
        std::fs::write(&p, s).with_context(|| format!("write {:?}", p))?;
        Ok(())
    }
}
