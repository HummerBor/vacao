use serde::Serialize;
use std::collections::HashSet;

pub struct CategoryDef {
    pub id: &'static str,
    pub label: &'static str,
    pub extensions: &'static [&'static str],
}

pub struct ScanUiGroup {
    pub id: &'static str,
    pub label: &'static str,
    pub members: &'static [&'static str],
}

/// Scan-tab chips (expanded to fine-grained ids before filtering).
pub const SCAN_UI_GROUPS: &[ScanUiGroup] = &[
    ScanUiGroup {
        id: "all",
        label: "全部类型",
        members: &[],
    },
    ScanUiGroup {
        id: "video",
        label: "视频",
        members: &["video"],
    },
    ScanUiGroup {
        id: "image",
        label: "图片",
        members: &["image"],
    },
    ScanUiGroup {
        id: "archive",
        label: "压缩包",
        members: &["archive"],
    },
    ScanUiGroup {
        id: "disk_image",
        label: "磁盘镜像",
        members: &["disk_image"],
    },
    ScanUiGroup {
        id: "installer",
        label: "安装包",
        members: &["installer"],
    },
    ScanUiGroup {
        id: "document",
        label: "文档",
        members: &["word", "pdf", "ppt", "excel"],
    },
    ScanUiGroup {
        id: "other",
        label: "其它",
        members: &[
            "audio", "ebook", "database", "dev_cache", "cad", "vm", "other",
        ],
    },
];

pub const CATEGORIES: &[CategoryDef] = &[
    CategoryDef {
        id: "word",
        label: "Word 文档",
        extensions: &["doc", "docx", "dot", "dotx", "rtf", "wps"],
    },
    CategoryDef {
        id: "pdf",
        label: "PDF",
        extensions: &["pdf"],
    },
    CategoryDef {
        id: "ppt",
        label: "PPT / 演示",
        extensions: &["ppt", "pptx", "pps", "ppsx", "pot", "potx"],
    },
    CategoryDef {
        id: "excel",
        label: "Excel 表格",
        extensions: &["xls", "xlsx", "xlsm", "xlsb", "csv"],
    },
    CategoryDef {
        id: "video",
        label: "视频",
        extensions: &[
            "mp4", "mkv", "avi", "mov", "wmv", "flv", "webm", "m4v", "mpg", "mpeg", "ts",
            "vob", "3gp", "rmvb", "rm",
        ],
    },
    CategoryDef {
        id: "image",
        label: "图片",
        extensions: &[
            "jpg", "jpeg", "png", "gif", "webp", "bmp", "tiff", "tif", "heic", "heif", "psd",
            "raw", "cr2", "nef", "svg", "ico",
        ],
    },
    CategoryDef {
        id: "archive",
        label: "压缩包",
        extensions: &["zip", "rar", "7z", "tar", "gz", "bz2", "xz", "zst", "cab", "arj", "lzh"],
    },
    CategoryDef {
        id: "disk_image",
        label: "磁盘镜像",
        extensions: &["iso", "img", "bin", "nrg", "vhd", "vhdx"],
    },
    CategoryDef {
        id: "audio",
        label: "音频",
        extensions: &["mp3", "flac", "wav", "aac", "m4a", "wma", "ogg", "ape", "aiff"],
    },
    CategoryDef {
        id: "installer",
        label: "安装包",
        extensions: &["exe", "msi", "msix", "msp", "apk"],
    },
    CategoryDef {
        id: "ebook",
        label: "电子书",
        extensions: &["epub", "mobi", "azw", "azw3"],
    },
    CategoryDef {
        id: "database",
        label: "数据库/备份",
        extensions: &["mdb", "accdb", "sqlite", "db", "bak"],
    },
    CategoryDef {
        id: "dev_cache",
        label: "开发/缓存大包",
        extensions: &["log", "jar", "war", "pak", "unity3d", "bundle", "cache", "tmp", "temp", "dmp"],
    },
    CategoryDef {
        id: "cad",
        label: "图纸/模型",
        extensions: &["dwg", "dxf", "stl", "obj", "fbx", "blend"],
    },
    CategoryDef {
        id: "vm",
        label: "虚拟机磁盘",
        extensions: &["vmdk", "vdi", "qcow2", "dmg"],
    },
    CategoryDef {
        id: "other",
        label: "其它大文件",
        extensions: &[],
    },
];

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CategoryInfo {
    pub id: String,
    pub label: String,
}

#[derive(Clone, Debug)]
pub enum ScanCategoryFilter {
    All,
    Selected(HashSet<String>),
}

pub fn list_scan_ui_groups() -> Vec<CategoryInfo> {
    SCAN_UI_GROUPS
        .iter()
        .map(|g| CategoryInfo {
            id: g.id.to_string(),
            label: g.label.to_string(),
        })
        .collect()
}

pub fn list_all_category_labels() -> Vec<CategoryInfo> {
    CATEGORIES
        .iter()
        .map(|c| CategoryInfo {
            id: c.id.to_string(),
            label: c.label.to_string(),
        })
        .collect()
}

pub fn category_label(id: &str) -> &str {
    CATEGORIES
        .iter()
        .find(|c| c.id == id)
        .map(|c| c.label)
        .unwrap_or(id)
}

/// Map file extension (no dot) to category id; unknown → `other`.
pub fn lookup_category(ext: &str) -> &'static str {
    let e = ext.to_ascii_lowercase();
    for c in CATEGORIES {
        if c.id == "other" {
            continue;
        }
        if c.extensions.iter().any(|x| *x == e) {
            return c.id;
        }
    }
    "other"
}

fn expand_group_id(group_id: &str, set: &mut HashSet<String>) -> Result<(), String> {
    let g = SCAN_UI_GROUPS
        .iter()
        .find(|g| g.id == group_id)
        .ok_or_else(|| format!("未知扫描分组: {group_id}"))?;
    if g.id == "all" {
        return Err("internal: all handled separately".into());
    }
    for m in g.members {
        set.insert((*m).to_string());
    }
    Ok(())
}

pub fn parse_scan_categories(raw: &[String]) -> Result<ScanCategoryFilter, String> {
    if raw.is_empty() {
        return Err("请至少选择「全部类型」或一种文件类别".into());
    }
    let lower: Vec<String> = raw.iter().map(|s| s.trim().to_ascii_lowercase()).collect();
    if lower.iter().any(|s| s == "all") {
        return Ok(ScanCategoryFilter::All);
    }
    let mut set = HashSet::new();
    for id in lower {
        if id.is_empty() {
            continue;
        }
        if SCAN_UI_GROUPS.iter().any(|g| g.id == id) {
            expand_group_id(&id, &mut set)?;
        } else if CATEGORIES.iter().any(|c| c.id == id) {
            set.insert(id);
        } else {
            return Err(format!("未知类别: {id}"));
        }
    }
    if set.is_empty() {
        return Err("请至少选择一种文件类别".into());
    }
    Ok(ScanCategoryFilter::Selected(set))
}

pub fn matches_filter(category_id: &str, filter: &ScanCategoryFilter) -> bool {
    match filter {
        ScanCategoryFilter::All => true,
        ScanCategoryFilter::Selected(set) => set.contains(category_id),
    }
}
