use crate::clean::catalog::CleanCatalogItem;
use crate::clean::items::{err as clean_err, ok as clean_ok, skip as clean_skip, CleanResultItem};
use crate::clean::pack_types::{CleanPackFile, CleanPackProfile, PackItem};
use crate::clean::pack_validate::{is_valid_pack_id, validate_pack};
use crate::clean::targets::{estimate_targets_bytes, is_known_clean_id, purge_targets};
use crate::config::AppConfig;
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;

const MAX_PACK_BYTES: usize = 512 * 1024;

fn fmt_bytes(n: u64) -> String {
    if n == 0 {
        return "0 B".into();
    }
    if n < 1024 {
        return format!("{n} B");
    }
    if n < 1024 * 1024 {
        return format!("{:.1} KB", n as f64 / 1024.0);
    }
    if n < 1024 * 1024 * 1024 {
        return format!("{:.1} MB", n as f64 / (1024.0 * 1024.0));
    }
    format!("{:.2} GB", n as f64 / (1024.0 * 1024.0 * 1024.0))
}

pub fn parse_pack_json(s: &str) -> Result<CleanPackFile, String> {
    if s.len() > MAX_PACK_BYTES {
        return Err("clean pack JSON too large (max 512KB)".into());
    }
    serde_json::from_str(s).map_err(|e| format!("parse clean pack: {e}"))
}

pub fn load_pack_from_config(cfg: &AppConfig) -> Result<Option<CleanPackFile>, String> {
    let Some(path) = cfg.clean_pack_absolute_path() else {
        return Ok(None);
    };
    if !path.exists() {
        return Ok(None);
    }
    let s = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let file = parse_pack_json(&s)?;
    validate_pack(&file).map_err(|v| v.join("\n"))?;
    Ok(Some(file))
}

pub fn write_pack_file(path: &PathBuf, file: &CleanPackFile) -> Result<(), String> {
    let s = serde_json::to_string_pretty(file).map_err(|e| e.to_string())?;
    std::fs::write(path, s).map_err(|e| e.to_string())
}

pub fn default_pack_template() -> CleanPackFile {
    CleanPackFile {
        schema_version: 1,
        generated_at: None,
        generator: Some("vacao/1.0".into()),
        machine_hint: None,
        profile: CleanPackProfile {
            enabled_built_in_ids: vec!["C01".into(), "C16".into()],
            disabled_built_in_ids: vec![],
            browser_clear_cookies: Some(false),
            extra_roots: vec![],
            comment: Some("在此填写本机推荐的内置项勾选".into()),
        },
        pack: crate::clean::pack_types::CleanPackBody { items: vec![] },
    }
}

pub fn build_pack_catalog(cfg: &AppConfig) -> Result<Vec<CleanCatalogItem>, String> {
    let Some(file) = load_pack_from_config(cfg)? else {
        return Ok(vec![]);
    };
    Ok(file
        .pack
        .items
        .iter()
        .filter(|i| !i.paths.is_empty())
        .map(pack_item_to_catalog)
        .collect())
}

fn pack_item_to_catalog(item: &PackItem) -> CleanCatalogItem {
    let paths: Vec<PathBuf> = item.paths.iter().map(PathBuf::from).collect();
    let mut paths_hint: Vec<String> = paths.iter().map(|p| p.display().to_string()).collect();
    paths_hint.sort();
    let paths_hint = if paths_hint.is_empty() {
        "（无路径）".into()
    } else {
        format!("共 {} 个路径：\n\n{}", paths_hint.len(), paths_hint.join("\n"))
    };
    let warn = item.warn || item.tag.contains("需谨慎");
    let size_bytes = estimate_targets_bytes(&paths);
    CleanCatalogItem {
        id: item.id.clone(),
        label: item.label.clone(),
        paths_hint,
        purpose: item.purpose.clone(),
        delete_note: item.delete_note.clone(),
        tag: item.tag.clone(),
        warn,
        default_checked: item.default_checked,
        size_bytes,
        size_display: fmt_bytes(size_bytes),
    }
}

/// Run cleanup for a single pack id (X01…).
pub fn clean_one_pack_id(id: &str, cfg: &AppConfig) -> CleanResultItem {
    if id.starts_with('C') || !is_valid_pack_id(id) {
        return clean_err(id, format!("not a pack id: {id}"));
    }
    let file = match load_pack_from_config(cfg) {
        Ok(Some(f)) => f,
        Ok(None) => {
            return clean_err(id, "未加载扩展包，请先在设置中导入 clean-pack.json".into());
        }
        Err(e) => return clean_err(id, e),
    };
    let Some(item) = file.pack.items.iter().find(|i| i.id == id) else {
        return clean_err(id, format!("unknown pack id: {id}"));
    };
    let paths: Vec<PathBuf> = item.paths.iter().map(PathBuf::from).collect();
    if paths.is_empty() {
        return clean_skip(id, "paths 为空，已跳过");
    }
    match purge_targets(&paths) {
        Ok(n) => clean_ok(id, Some(format!("已删除约 {n} 个文件"))),
        Err(e) => clean_err(id, e.to_string()),
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanPackMetaDto {
    pub loaded: bool,
    pub path: Option<String>,
    pub generated_at: Option<String>,
    pub generator: Option<String>,
    pub machine_hint: Option<String>,
    pub profile_comment: Option<String>,
    pub enabled_built_in_ids: Vec<String>,
    pub disabled_built_in_ids: Vec<String>,
    pub item_count: usize,
}

pub fn get_pack_meta(cfg: &AppConfig) -> Result<CleanPackMetaDto, String> {
    let path = cfg.clean_pack_absolute_path();
    let path_str = path.as_ref().map(|p| p.display().to_string());
    let Some(abs) = path else {
        return Ok(CleanPackMetaDto {
            loaded: false,
            path: None,
            generated_at: None,
            generator: None,
            machine_hint: None,
            profile_comment: None,
            enabled_built_in_ids: vec![],
            disabled_built_in_ids: vec![],
            item_count: 0,
        });
    };
    if !abs.exists() {
        return Ok(CleanPackMetaDto {
            loaded: false,
            path: path_str,
            generated_at: None,
            generator: None,
            machine_hint: None,
            profile_comment: None,
            enabled_built_in_ids: vec![],
            disabled_built_in_ids: vec![],
            item_count: 0,
        });
    }
    let file = match load_pack_from_config(cfg) {
        Ok(Some(f)) => f,
        Ok(None) => unreachable!("exists checked"),
        Err(e) => return Err(e),
    };
    Ok(CleanPackMetaDto {
        loaded: true,
        path: path_str,
        generated_at: file.generated_at,
        generator: file.generator,
        machine_hint: file.machine_hint,
        profile_comment: file.profile.comment,
        enabled_built_in_ids: file.profile.enabled_built_in_ids,
        disabled_built_in_ids: file.profile.disabled_built_in_ids,
        item_count: file.pack.items.len(),
    })
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplyProfileResult {
    pub checks: HashMap<String, bool>,
    pub browser_clear_cookies: Option<bool>,
    pub extra_roots: Vec<String>,
}

pub fn build_profile_checks(profile: &CleanPackProfile) -> HashMap<String, bool> {
    let mut checks = HashMap::new();
    let disabled: HashSet<_> = profile.disabled_built_in_ids.iter().cloned().collect();
    for id in &profile.enabled_built_in_ids {
        if is_known_clean_id(id) {
            checks.insert(id.clone(), !disabled.contains(id));
        }
    }
    for id in &profile.disabled_built_in_ids {
        if is_known_clean_id(id) {
            checks.insert(id.clone(), false);
        }
    }
    checks
}

pub fn apply_profile_to_config(cfg: &mut AppConfig, profile: &CleanPackProfile) -> ApplyProfileResult {
    if let Some(v) = profile.browser_clear_cookies {
        cfg.browser_clear_cookies = v;
    }
    let mut roots: HashSet<String> = cfg.extra_roots.iter().cloned().collect();
    for r in &profile.extra_roots {
        roots.insert(r.clone());
    }
    cfg.extra_roots = roots.into_iter().collect();
    let checks = build_profile_checks(profile);
    ApplyProfileResult {
        checks,
        browser_clear_cookies: profile.browser_clear_cookies,
        extra_roots: cfg.extra_roots.clone(),
    }
}

pub fn apply_profile() -> Result<ApplyProfileResult, String> {
    let mut cfg = AppConfig::load().map_err(|e| e.to_string())?;
    let file = load_pack_from_config(&cfg)?.ok_or("未加载扩展包")?;
    let result = apply_profile_to_config(&mut cfg, &file.profile);
    cfg.save().map_err(|e| e.to_string())?;
    Ok(result)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportPackResult {
    pub ok: bool,
    pub path: String,
    pub preview: CleanPackMetaDto,
    pub errors: Vec<String>,
}

/// Default folder for the native pack file picker (dev: `app/samples`).
pub fn default_clean_pack_browse_dir(cfg: &AppConfig) -> PathBuf {
    let dev_samples = cfg.exe_dir().join("../../../samples");
    if dev_samples.exists() {
        return dev_samples;
    }
    if let Some(p) = cfg.clean_pack_absolute_path() {
        if let Some(parent) = p.parent() {
            if parent.exists() {
                return parent.to_path_buf();
            }
        }
    }
    cfg.exe_dir()
}

/// Point config at an existing JSON file (no copy into exe dir).
pub fn import_pack_from_path(source: &str) -> Result<ImportPackResult, String> {
    let path = PathBuf::from(source.trim());
    if !path.is_absolute() {
        return Err("扩展包路径必须是绝对路径".into());
    }
    if !path.exists() {
        return Err(format!("文件不存在: {}", path.display()));
    }
    let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let file = parse_pack_json(&content)?;
    if let Err(errs) = validate_pack(&file) {
        return Ok(ImportPackResult {
            ok: false,
            path: path.display().to_string(),
            preview: CleanPackMetaDto {
                loaded: false,
                path: Some(path.display().to_string()),
                generated_at: None,
                generator: None,
                machine_hint: None,
                profile_comment: None,
                enabled_built_in_ids: vec![],
                disabled_built_in_ids: vec![],
                item_count: 0,
            },
            errors: errs,
        });
    }
    let mut cfg = AppConfig::load().map_err(|e| e.to_string())?;
    cfg.clean_pack_path = path.display().to_string();
    cfg.save().map_err(|e| e.to_string())?;
    let preview = get_pack_meta(&cfg)?;
    Ok(ImportPackResult {
        ok: true,
        path: path.display().to_string(),
        preview,
        errors: vec![],
    })
}

pub fn import_pack_content(content: &str, save_as: Option<&str>) -> Result<ImportPackResult, String> {
    let file = parse_pack_json(content)?;
    if let Err(errs) = validate_pack(&file) {
        return Ok(ImportPackResult {
            ok: false,
            path: String::new(),
            preview: CleanPackMetaDto {
                loaded: false,
                path: None,
                generated_at: None,
                generator: None,
                machine_hint: None,
                profile_comment: None,
                enabled_built_in_ids: vec![],
                disabled_built_in_ids: vec![],
                item_count: 0,
            },
            errors: errs,
        });
    }
    let mut cfg = AppConfig::load().map_err(|e| e.to_string())?;
    let file_name = save_as.unwrap_or("clean-pack.json");
    let dest = if PathBuf::from(file_name).is_absolute() {
        PathBuf::from(file_name)
    } else {
        cfg.exe_dir().join(file_name)
    };
    write_pack_file(&dest, &file)?;
    cfg.clean_pack_path = dest.display().to_string();
    cfg.save().map_err(|e| e.to_string())?;
    let preview = get_pack_meta(&cfg)?;
    Ok(ImportPackResult {
        ok: true,
        path: dest.display().to_string(),
        preview,
        errors: vec![],
    })
}

pub fn export_pack_json(cfg: &AppConfig) -> Result<String, String> {
    match load_pack_from_config(cfg) {
        Ok(Some(f)) => serde_json::to_string_pretty(&f).map_err(|e| e.to_string()),
        Ok(None) => serde_json::to_string_pretty(&default_pack_template()).map_err(|e| e.to_string()),
        Err(_) => serde_json::to_string_pretty(&default_pack_template()).map_err(|e| e.to_string()),
    }
}

pub fn clear_pack(cfg: &mut AppConfig) -> Result<(), String> {
    if let Some(p) = cfg.clean_pack_absolute_path() {
        if p.exists() {
            std::fs::remove_file(&p).map_err(|e| e.to_string())?;
        }
    }
    cfg.clean_pack_path.clear();
    cfg.save().map_err(|e| e.to_string())
}
