use crate::clean::cursor_storage;
use crate::clean::targets::{
    browser_paths_hint, collect_targets, estimate_recycle_bin_bytes, estimate_targets_bytes,
};
use crate::config::AppConfig;
use serde::Serialize;
use std::path::PathBuf;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanCatalogItem {
    pub id: String,
    pub label: String,
    pub paths_hint: String,
    pub purpose: String,
    pub delete_note: String,
    pub tag: String,
    pub warn: bool,
    pub default_checked: bool,
    pub size_bytes: u64,
    pub size_display: String,
}

struct ItemDef {
    id: &'static str,
    label: &'static str,
    purpose: &'static str,
    delete_note: &'static str,
    tag: &'static str,
    warn: bool,
    default_checked: bool,
}

fn fmt_bytes(n: u64) -> String {
    if n == 0 {
        return "0 B".into();
    }
    if n < 1024 {
        return format!("{} B", n);
    }
    if n < 1024 * 1024 {
        return format!("{:.1} KB", n as f64 / 1024.0);
    }
    if n < 1024 * 1024 * 1024 {
        return format!("{:.1} MB", n as f64 / (1024.0 * 1024.0));
    }
    format!("{:.2} GB", n as f64 / (1024.0 * 1024.0 * 1024.0))
}

fn static_catalog() -> Vec<ItemDef> {
    vec![
        ItemDef {
            id: "C01",
            label: "用户临时文件",
            purpose: "存放应用安装、解压、更新时产生的临时文件；过期后通常不再需要。",
            delete_note: "仅删除目录内的文件，保留文件夹结构；正在使用的文件可能删除失败并被跳过。",
            tag: "可安全清理",
            warn: false,
            default_checked: true,
        },
        ItemDef {
            id: "C06",
            label: "缩略图缓存",
            purpose: "资源管理器为图片/视频生成的缩略图数据库，用于加快文件夹预览。",
            delete_note: "删除后首次浏览文件夹会稍慢，缩略图会自动重新生成。",
            tag: "可安全清理",
            warn: false,
            default_checked: true,
        },
        ItemDef {
            id: "C04",
            label: "浏览器缓存（多品牌）",
            purpose: "Chrome、Edge、QQ浏览器、360、Firefox、Brave 等已安装产品的网页缓存；路径表见 browser_tools.rs。",
            delete_note: "请先关闭对应浏览器；默认不删 Cookies/浏览记录，可在设置中开启 Cookies。",
            tag: "可安全清理",
            warn: false,
            default_checked: true,
        },
        ItemDef {
            id: "C10",
            label: "npm / pip / pnpm / yarn 缓存",
            purpose: "包管理器下载的安装包与元数据缓存，避免重复从网络拉取。",
            delete_note: "删除后下次安装相同版本会重新下载；不影响已安装到项目中的依赖。",
            tag: "可安全清理",
            warn: false,
            default_checked: true,
        },
        ItemDef {
            id: "C16",
            label: "编辑器 / 智能体缓存",
            purpose: "Cursor/VS Code/Trae、Claude Code、Codex、OpenCode、Kilo Code、灵码、WorkBuddy、QClaw、OpenClaw 等缓存/日志/快照；路径表见 agent_tools.rs。",
            delete_note: "请先退出相关程序。不删 auth/config/skills/主 state.vscdb；Claude 的 downloads 为包下载缓存；部分 agent-transcripts 会清除。",
            tag: "可安全清理",
            warn: false,
            default_checked: true,
        },
        ItemDef {
            id: "C17",
            label: "Cursor 工作区缓存",
            purpose: "按设置清理 workspaceStorage 中符合条件的工作区目录内缓存（每个哈希文件夹对应一个曾打开的项目）。",
            delete_note: "【前提】须退出 Cursor。\n【会失去】该工作区侧边栏本地 Agent/聊天与索引；该项目的 UI/会话缓存（重开项目后会重建）。\n【不会失去】登录态；项目源码与 .cursor 配置；conversation-backups。\n【其它】筛选条件见设置「Cursor 存储」。",
            tag: "需谨慎",
            warn: true,
            default_checked: false,
        },
        ItemDef {
            id: "C18",
            label: "Cursor 全局库重置",
            purpose: "删除 globalStorage 的 state.vscdb 及 .bak/.backup、wal/shm，缓解全局库过大（如数百 MB～GB）导致的卡顿。",
            delete_note: "【前提】须退出 Cursor。\n【会失去】登录态（需重登）；全局侧边栏聊天历史；部分扩展/MCP 可能需重新授权。\n【不会失去】项目源码；各项目 workspaceStorage（除非你另勾「Cursor 工作区缓存」）。\n【主库】默认仅当体积 ≥ 设置阈值(MB) 时删除；可勾选强制删除。备份/wal 存在即删。建议先备份 conversation-backups。",
            tag: "需谨慎",
            warn: true,
            default_checked: false,
        },
        ItemDef {
            id: "C08",
            label: "传递优化缓存",
            purpose: "Windows 更新/应用商店的点对点分发缓存，用于在局域网内共享已下载片段。",
            delete_note: "删除后不影响已安装软件；系统可能在更新时重新下载。",
            tag: "可安全清理",
            warn: false,
            default_checked: true,
        },
        ItemDef {
            id: "C11",
            label: "Prefetch 预读缓存",
            purpose: "系统根据使用习惯预加载常用程序的启动信息，以缩短下次启动时间。",
            delete_note: "删除后短期内程序首次启动可能略慢，会随使用自动重建。",
            tag: "可安全清理",
            warn: false,
            default_checked: true,
        },
        ItemDef {
            id: "C12",
            label: "DirectX / 显卡着色器缓存",
            purpose: "游戏与图形应用编译后的着色器缓存，避免每次重新编译。",
            delete_note: "删除后进入游戏可能有一次卡顿并重建缓存；不影响存档。",
            tag: "可安全清理",
            warn: false,
            default_checked: true,
        },
        ItemDef {
            id: "C13",
            label: "Windows 错误报告缓存",
            purpose: "程序崩溃时生成的诊断报告与队列，供系统或开发者分析问题。",
            delete_note: "仅清理历史报告缓存；不影响当前正在运行的程序。",
            tag: "可安全清理",
            warn: false,
            default_checked: true,
        },
        ItemDef {
            id: "C02",
            label: "系统临时目录",
            purpose: "Windows 与安装程序使用的系统级临时目录（如安装残留）。",
            delete_note: "常需以管理员运行本工具；被系统占用的文件会跳过。",
            tag: "可安全清理",
            warn: false,
            default_checked: false,
        },
        ItemDef {
            id: "C05",
            label: "Windows Update 下载缓存",
            purpose: "已下载、待安装或备用的更新包文件。",
            delete_note: "若更新正在进行中可能失败；安装完成后清理较稳妥。",
            tag: "一般安全",
            warn: false,
            default_checked: false,
        },
        ItemDef {
            id: "C03",
            label: "清空回收站",
            purpose: "各磁盘回收站中「已删除但未彻底移除」的文件，仍占用磁盘空间。",
            delete_note: "清空后无法从回收站恢复，请确认没有误删仍需找回的文件。",
            tag: "一般安全",
            warn: false,
            default_checked: false,
        },
        ItemDef {
            id: "C09",
            label: "可配置目录",
            purpose: "由你在设置页指定的目录，工具仅删除其下的文件（不删子文件夹本身）。",
            delete_note: "切勿填写桌面、文档、项目根目录；路径配错可能导致重要文件被删。",
            tag: "需谨慎",
            warn: true,
            default_checked: false,
        },
    ]
}

fn format_resolved_paths(id: &str, cfg: &AppConfig, paths: &[PathBuf]) -> String {
    if id == "C03" {
        return "各盘符回收站（$Recycle.Bin）".into();
    }
    if id == "C04" {
        let hint = browser_paths_hint(cfg);
        if paths.is_empty() {
            return format!("{hint}\n（本机未匹配到已安装浏览器的缓存目录）");
        }
        let mut list: Vec<String> = paths.iter().map(|p| p.display().to_string()).collect();
        list.sort();
        return format!("{hint}\n\n共 {} 个路径：\n\n{}", list.len(), list.join("\n"));
    }
    if paths.is_empty() {
        return match id {
            "C09" => "设置 → 自定义清理目录为空，请先在设置页添加路径".into(),
            "C16" => {
                "需先退出 Cursor/Claude Code/Codex/OpenCode/Kilo 等。\n（本机未匹配 agent_tools.rs 中的缓存路径，安装对应产品后刷新）".into()
            }
            _ => "（本机未找到对应路径，可能未安装相关软件）".into(),
        };
    }
    let mut list: Vec<String> = paths.iter().map(|p| p.display().to_string()).collect();
    list.sort();
    // C16 路径较多，详情栏可滚动，全部列出便于核对
    if id == "C16" {
        return format!("共 {} 个路径：\n\n{}", list.len(), list.join("\n"));
    }
    const MAX_LINES: usize = 12;
    if list.len() <= MAX_LINES {
        list.join("\n")
    } else {
        let shown = list[..MAX_LINES].join("\n");
        format!("{shown}\n… 另有 {} 个路径", list.len() - MAX_LINES)
    }
}

fn delete_note_for(id: &str, base: &str, cfg: &AppConfig) -> String {
    if id == "C04" && cfg.browser_clear_cookies {
        format!(
            "{base}\n\n【当前设置】已开启「同时删除 Cookies」：清理时会导致多数网站退出登录。"
        )
    } else {
        base.into()
    }
}

pub fn build_clean_catalog(cfg: &AppConfig) -> Vec<CleanCatalogItem> {
    static_catalog()
        .into_iter()
        .map(|item| {
            let paths = collect_targets(item.id, cfg);
            let (paths_hint, size_bytes) = if item.id == "C17" {
                let (_, bytes) = cursor_storage::estimate_c17_bytes(cfg);
                (cursor_storage::format_c17_paths_hint(cfg), bytes)
            } else if item.id == "C18" {
                let (bytes, _) = cursor_storage::estimate_c18_bytes(cfg);
                (
                    cursor_storage::format_c18_paths_hint(cfg),
                    bytes,
                )
            } else {
                let hint = format_resolved_paths(item.id, cfg, &paths);
                let size = if item.id == "C03" {
                    estimate_recycle_bin_bytes().unwrap_or(0)
                } else {
                    estimate_targets_bytes(&paths)
                };
                (hint, size)
            };
            let warn = item.warn || (item.id == "C04" && cfg.browser_clear_cookies);
            CleanCatalogItem {
                id: item.id.into(),
                label: item.label.into(),
                paths_hint,
                purpose: item.purpose.into(),
                delete_note: delete_note_for(item.id, item.delete_note, cfg),
                tag: item.tag.into(),
                warn,
                default_checked: item.default_checked,
                size_bytes,
                size_display: fmt_bytes(size_bytes),
            }
        })
        .collect()
}
