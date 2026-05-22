//! C04 浏览器缓存路径（白名单）。新增浏览器：在 `CHROMIUM_APPS` 或 `EXTRA_CACHE_DIRS` 追加。
//!
//! Chromium 系：仅 `Cache`、`Code Cache`、`GPUCache`（及可选 Cookies）；不碰 History、Bookmarks 等。
//! Firefox：仅各配置目录下的 `cache2`。

use crate::config::AppConfig;
use std::path::{Path, PathBuf};

#[derive(Clone, Copy)]
enum DataRoot {
    LocalAppData,
    AppDataRoaming,
}

/// 路径片段：拼到 Local/Roaming 后接 `User Data\<Profile>\...`
struct ChromiumApp {
    root: DataRoot,
    segments: &'static [&'static str],
}

/// `%LOCALAPPDATA%` 或 `%APPDATA%` 下 → `...\User Data\<配置>\Cache`
const CHROMIUM_APPS: &[ChromiumApp] = &[
    ChromiumApp {
        root: DataRoot::LocalAppData,
        segments: &["Google", "Chrome"],
    },
    ChromiumApp {
        root: DataRoot::LocalAppData,
        segments: &["Microsoft", "Edge"],
    },
    ChromiumApp {
        root: DataRoot::LocalAppData,
        segments: &["Tencent", "QQBrowser"],
    },
    ChromiumApp {
        root: DataRoot::LocalAppData,
        segments: &["360Chrome", "Chrome"],
    },
    ChromiumApp {
        root: DataRoot::LocalAppData,
        segments: &["360ChromeX", "Chrome"],
    },
    ChromiumApp {
        root: DataRoot::LocalAppData,
        segments: &["360browser", "chrome"],
    },
    ChromiumApp {
        root: DataRoot::AppDataRoaming,
        segments: &["360se6"],
    },
    ChromiumApp {
        root: DataRoot::LocalAppData,
        segments: &["BraveSoftware", "Brave-Browser"],
    },
    ChromiumApp {
        root: DataRoot::LocalAppData,
        segments: &["Opera Software", "Opera Stable"],
    },
    ChromiumApp {
        root: DataRoot::LocalAppData,
        segments: &["Vivaldi"],
    },
    ChromiumApp {
        root: DataRoot::LocalAppData,
        segments: &["Sogou", "SogouExplorer"],
    },
    ChromiumApp {
        root: DataRoot::LocalAppData,
        segments: &["liebao"],
    },
    ChromiumApp {
        root: DataRoot::LocalAppData,
        segments: &["Chromium"],
    },
    ChromiumApp {
        root: DataRoot::LocalAppData,
        segments: &["CocCoc", "Browser"],
    },
];

/// 非标准 User Data 布局的纯缓存目录（整目录内文件可删）
const EXTRA_CACHE_DIRS: &[(&str, DataRoot, &[&str])] = &[(
    "QQ浏览器 webkit 缓存",
    DataRoot::AppDataRoaming,
    &["Tencent", "QQBrowser", "webkit_cache"],
)];

const CACHE_SUBDIRS: &[&str] = &["Cache", "Code Cache", "GPUCache"];

fn local_app_data() -> Option<PathBuf> {
    std::env::var_os("LOCALAPPDATA").map(PathBuf::from)
}

fn app_data() -> Option<PathBuf> {
    std::env::var_os("APPDATA").map(PathBuf::from)
}

fn resolve_root(kind: DataRoot) -> Option<PathBuf> {
    match kind {
        DataRoot::LocalAppData => local_app_data(),
        DataRoot::AppDataRoaming => app_data(),
    }
}

fn push_if_exists(v: &mut Vec<PathBuf>, p: PathBuf) {
    if p.exists() {
        v.push(p);
    }
}

fn chromium_user_data_base(app: &ChromiumApp) -> Option<PathBuf> {
    let root = resolve_root(app.root)?;
    let mut p = root;
    for s in app.segments {
        p.push(s);
    }
    let user_data = p.join("User Data");
    if user_data.is_dir() {
        Some(user_data)
    } else {
        None
    }
}

fn discover_chromium_profiles(user_data: &Path) -> Vec<PathBuf> {
    let mut profiles = Vec::new();
    let default = user_data.join("Default");
    if default.is_dir() {
        profiles.push(default);
    }
    if let Ok(rd) = std::fs::read_dir(user_data) {
        for e in rd.flatten() {
            let name = e.file_name().to_string_lossy().into_owned();
            if (name.starts_with("Profile ") || name == "Guest Profile") && e.path().is_dir() {
                profiles.push(e.path());
            }
        }
    }
    profiles
}

fn push_chromium_profile_caches(v: &mut Vec<PathBuf>, profile: &Path, clear_cookies: bool) {
    for sub in CACHE_SUBDIRS {
        push_if_exists(v, profile.join(sub));
    }
    if clear_cookies {
        push_if_exists(v, profile.join("Cookies"));
        push_if_exists(v, profile.join("Network").join("Cookies"));
    }
}

fn firefox_cache_paths(v: &mut Vec<PathBuf>) {
    let Some(la) = local_app_data() else {
        return;
    };
    let profiles = la.join("Mozilla").join("Firefox").join("Profiles");
    if !profiles.is_dir() {
        return;
    }
    if let Ok(rd) = std::fs::read_dir(&profiles) {
        for e in rd.flatten() {
            if e.path().is_dir() {
                push_if_exists(v, e.path().join("cache2"));
            }
        }
    }
}

pub fn collect_browser_cache_paths(cfg: &AppConfig) -> Vec<PathBuf> {
    let mut v = Vec::new();

    for app in CHROMIUM_APPS {
        if let Some(user_data) = chromium_user_data_base(app) {
            for profile in discover_chromium_profiles(&user_data) {
                push_chromium_profile_caches(&mut v, &profile, cfg.browser_clear_cookies);
            }
        }
    }

    for (_label, root, segs) in EXTRA_CACHE_DIRS {
        if let Some(base) = resolve_root(*root) {
            let mut p = base;
            for s in *segs {
                p.push(s);
            }
            push_if_exists(&mut v, p);
        }
    }

    firefox_cache_paths(&mut v);
    v
}

pub fn browser_paths_hint(cfg: &AppConfig) -> String {
    const KEEP: &str = "不含浏览记录(History)、书签、密码、Local Storage";
    const LIST: &str =
        "支持：Chrome、Edge、QQ浏览器、360安全/极速、Brave、Opera、Vivaldi、Firefox、搜狗、猎豹等（本机已安装且路径匹配者）";
    if cfg.browser_clear_cookies {
        format!("Cache、Code Cache、GPUCache、Cookies（会退出网站登录；{KEEP}；{LIST}；请先关闭浏览器）")
    } else {
        format!("仅 Cache、Code Cache、GPUCache；{KEEP}；默认也不含 Cookies；{LIST}")
    }
}
