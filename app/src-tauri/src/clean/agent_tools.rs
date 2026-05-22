//! C16 智能体 / AI 编辑器缓存路径（白名单）。
//!
//! 新增产品：在对应常量表追加条目。原则：只删 cache / logs / temp / 备份 / 快照；
//! 不删 config、auth、skills、rules、SOUL/MEMORY、主 state.vscdb。

use std::path::{Path, PathBuf};

const SAFE_CACHE_SUBDIRS: &[&str] = &[
    "cache", "logs", "log", "tmp", "temp", "Cache", "CachedData", "CachedExtensions",
    "GPUCache", "Code Cache",
];

const VSCODE_LIKE_CACHE_SUBDIRS: &[&str] = &[
    "Cache", "CachedData", "CachedExtensions", "logs", "GPUCache", "Code Cache",
];

const VSCODE_LIKE_ROAMING: &[&str] = &["Cursor", "Code", "Trae", "Windsurf", "Qoder", "Marscode"];

const ROAMING_EXTRA: &[(&str, &[&str])] = &[(
    "Trae",
    &["ModularData/ai-agent/snapshot"],
)];

/// 点目录：通用 cache/logs/tmp + 可选专属子目录（见 `DOT_AGENT_EXTRAS`）
const DOT_AGENT_DIRS: &[&str] = &[
    "openclaw",
    "qclaw",
    "workbuddy",
    "lingma",
    "codebuddy",
    "trae",
    "skillhub",
    "tongyi",
    "marscode",
    "claude",
    "codex",
    "kilocode",
    "kilo",
    "continue",
    "aider",
];

/// 点目录名 → 除通用子目录外额外可清理的子目录
const DOT_AGENT_EXTRAS: &[(&str, &[&str])] = &[
    (
        "claude",
        &[
            "telemetry",
            "shell-snapshots",
            "file-history",
            "backups",
            "downloads",
        ],
    ),
    ("codex", &["archived_sessions"]),
];

/// 整目录视为缓存（目录内文件可删，不删目录本身）
const CACHE_ONLY_HOME_REL: &[&[&str]] = &[&[".cache", "opencode"]];

/// 仅清理 logs 子目录
const HOME_LOGS_ONLY_REL: &[&[&str]] = &[&[".local", "share", "opencode"]];

const LOCAL_APP_SUBDIRS: &[(&str, &[&str])] = &[
    ("QClaw", &["logs", "cache", "temp", "tmp"]),
    (".lingma", &["cache", "logs", "temp", "tmp"]),
    ("Lingma", &["cache", "logs", "temp", "tmp"]),
    ("WorkBuddy", &["cache", "logs", "temp", "tmp"]),
    ("Trae", &["Cache", "logs", "GPUCache", "CachedData"]),
];

const ROAMING_APP_SUBDIRS: &[(&str, &[&str])] = &[
    ("Lingma", &["cache", "logs", "temp", "tmp"]),
    ("CodeBuddy", &["cache", "logs", "temp", "tmp"]),
];

/// VS Code / Cursor 扩展 globalStorage 下的缓存
const EXTENSION_GLOBAL_STORAGE: &[&str] = &[
    "kilocode.kilo-code",
    "continue.continue",
    "rooveterinaryinc.roo-cline",
    "saoudrizwan.claude-dev",
    "openai.chatgpt",
    "anthropic.claude-code",
];

const EXTENSION_CACHE_SUBDIRS: &[&str] = &["cache", "logs", "tmp", "temp"];

fn app_data() -> Option<PathBuf> {
    std::env::var_os("APPDATA").map(PathBuf::from)
}

fn local_app_data() -> Option<PathBuf> {
    std::env::var_os("LOCALAPPDATA").map(PathBuf::from)
}

fn user_profile() -> Option<PathBuf> {
    std::env::var_os("USERPROFILE").map(PathBuf::from)
}

fn push_if_exists(v: &mut Vec<PathBuf>, p: PathBuf) {
    if p.exists() {
        v.push(p);
    }
}

fn join_home(home: &Path, parts: &[&str]) -> PathBuf {
    let mut p = home.to_path_buf();
    for s in parts {
        p.push(s);
    }
    p
}

fn push_safe_subdirs(v: &mut Vec<PathBuf>, base: &Path) {
    if !base.is_dir() {
        return;
    }
    for sub in SAFE_CACHE_SUBDIRS {
        push_if_exists(v, base.join(sub));
    }
}

fn push_extra_subdirs(v: &mut Vec<PathBuf>, base: &Path, extras: &[&str]) {
    for sub in extras {
        push_if_exists(v, base.join(sub));
    }
}

fn push_vscode_like_roaming(v: &mut Vec<PathBuf>, ad: &Path, name: &str) {
    let root = ad.join(name);
    for sub in VSCODE_LIKE_CACHE_SUBDIRS {
        push_if_exists(v, root.join(sub));
    }
    push_if_exists(v, root.join("snapshots"));
    let gs = root.join("User").join("globalStorage");
    push_if_exists(v, gs.join("state.vscdb.backup"));
    push_if_exists(v, gs.join("state.vscdb.bak"));
    for (product, rels) in ROAMING_EXTRA {
        if *product == name {
            for rel in *rels {
                let mut p = root.clone();
                for part in rel.split('/') {
                    p.push(part);
                }
                push_if_exists(v, p);
            }
        }
    }
}

fn push_extension_global_storage(v: &mut Vec<PathBuf>, ad: &Path) {
    for ide in VSCODE_LIKE_ROAMING {
        let gs = ad.join(ide).join("User").join("globalStorage");
        for ext_id in EXTENSION_GLOBAL_STORAGE {
            let base = gs.join(ext_id);
            for sub in EXTENSION_CACHE_SUBDIRS {
                push_if_exists(v, base.join(sub));
            }
        }
    }
}

fn push_local_subdirs(v: &mut Vec<PathBuf>, la: &Path) {
    for (folder, subs) in LOCAL_APP_SUBDIRS {
        let base = la.join(folder);
        for sub in *subs {
            push_if_exists(v, base.join(sub));
        }
    }
}

fn push_roaming_app_subdirs(v: &mut Vec<PathBuf>, ad: &Path) {
    for (folder, subs) in ROAMING_APP_SUBDIRS {
        let base = ad.join(folder);
        for sub in *subs {
            push_if_exists(v, base.join(sub));
        }
    }
}

fn push_cursor_style_transcripts(v: &mut Vec<PathBuf>, home: &Path, dot_dir: &str) {
    let projects = home.join(dot_dir).join("projects");
    if !projects.is_dir() {
        return;
    }
    if let Ok(rd) = std::fs::read_dir(&projects) {
        for e in rd.flatten() {
            push_if_exists(v, e.path().join("agent-transcripts"));
        }
    }
}

fn extras_for_dot(name: &str) -> &[&str] {
    DOT_AGENT_EXTRAS
        .iter()
        .find(|(n, _)| *n == name)
        .map(|(_, subs)| *subs)
        .unwrap_or(&[])
}

pub fn collect_agent_state_paths() -> Vec<PathBuf> {
    let mut v = Vec::new();

    if let Some(ad) = app_data() {
        for name in VSCODE_LIKE_ROAMING {
            push_vscode_like_roaming(&mut v, &ad, name);
        }
        push_roaming_app_subdirs(&mut v, &ad);
        push_extension_global_storage(&mut v, &ad);
    }

    if let Some(la) = local_app_data() {
        push_local_subdirs(&mut v, &la);
    }

    if let Some(home) = user_profile() {
        for dot in DOT_AGENT_DIRS {
            let base = home.join(dot);
            push_safe_subdirs(&mut v, &base);
            push_extra_subdirs(&mut v, &base, extras_for_dot(dot));
        }

        for parts in CACHE_ONLY_HOME_REL {
            push_if_exists(&mut v, join_home(&home, parts));
        }
        for parts in HOME_LOGS_ONLY_REL {
            push_if_exists(&mut v, join_home(&home, parts).join("logs"));
        }

        push_cursor_style_transcripts(&mut v, &home, ".cursor");
        push_cursor_style_transcripts(&mut v, &home, ".trae");
    }

    v
}
