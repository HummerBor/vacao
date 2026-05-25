use crate::clean::{
    apply_profile, build_clean_catalog, build_pack_catalog, clean_run as run_clean, clear_pack,
    default_clean_pack_browse_dir, export_pack_json, export_pack_to_exe_dir, export_skill_zip,
    get_pack_meta, import_pack_content, import_pack_from_path,
    open_folder_in_shell, ApplyProfileResult, CleanCatalogItem, CleanPackMetaDto, CleanResultItem,
    ExportPackToExeResult, ImportPackResult,
};
use crate::config::AppConfig;
use crate::delete::delete_to_recycle_batch;
use crate::delete::DeleteResultRow;
use crate::scan::{
    cancel_scan, get_scan_status, job_allowed_roots, list_all_category_labels, list_scan_ui_groups,
    pause_scan, resume_scan, start_scan, CategoryInfo,
    ScanManager, ScanStartArgs, ScanStatusDto,
};
use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DriveInfo {
    pub letter: String,
    pub root_path: String,
}

#[tauri::command]
pub fn get_config() -> Result<AppConfig, String> {
    AppConfig::load().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_config(cfg: AppConfig) -> Result<(), String> {
    cfg.save().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn scan_start(
    app: tauri::AppHandle,
    manager: tauri::State<ScanManager>,
    args: ScanStartArgs,
) -> Result<String, String> {
    start_scan(
        app,
        &manager,
        args.roots,
        args.min_size_mb,
        args.max_size_mb,
        args.categories,
        args.exclude_dir_names,
    )
}

#[tauri::command]
pub fn scan_categories() -> Vec<CategoryInfo> {
    list_scan_ui_groups()
}

#[tauri::command]
pub fn scan_category_labels() -> Vec<CategoryInfo> {
    list_all_category_labels()
}

#[tauri::command]
pub fn scan_status(
    manager: tauri::State<ScanManager>,
    job_id: String,
) -> Result<ScanStatusDto, String> {
    get_scan_status(&manager, job_id)
}

#[tauri::command]
pub fn scan_cancel(
    manager: tauri::State<ScanManager>,
    job_id: String,
) -> Result<(), String> {
    cancel_scan(&manager, job_id)
}

#[tauri::command]
pub fn scan_pause(
    manager: tauri::State<ScanManager>,
    job_id: String,
) -> Result<(), String> {
    pause_scan(&manager, job_id)
}

#[tauri::command]
pub fn scan_resume(
    manager: tauri::State<ScanManager>,
    job_id: String,
) -> Result<(), String> {
    resume_scan(&manager, job_id)
}

/// Native folder picker (Rust dialog plugin — no frontend npm package required).
#[tauri::command]
pub async fn pick_scan_folder(
    app: tauri::AppHandle,
    default_path: Option<String>,
) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let default = default_path.unwrap_or_else(|| "C:\\".to_string());
    let app = app.clone();
    let picked = tauri::async_runtime::spawn_blocking(move || {
        app.dialog()
            .file()
            .set_title("选择扫描文件夹")
            .set_directory(&default)
            .blocking_pick_folder()
    })
    .await
    .map_err(|e| e.to_string())?;
    Ok(picked.map(|fp| fp.to_string()))
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeletePayload {
    pub job_id: String,
    pub paths: Vec<String>,
}

#[tauri::command]
pub fn delete_to_recycle(
    manager: tauri::State<ScanManager>,
    payload: DeletePayload,
) -> Result<Vec<DeleteResultRow>, String> {
    let roots = job_allowed_roots(&manager, &payload.job_id)?;
    Ok(delete_to_recycle_batch(&roots, &payload.paths))
}

#[tauri::command]
pub fn clean_catalog() -> Result<Vec<CleanCatalogItem>, String> {
    let cfg = AppConfig::load().map_err(|e| e.to_string())?;
    let mut items = build_clean_catalog(&cfg);
    items.extend(build_pack_catalog(&cfg)?);
    Ok(items)
}

#[tauri::command]
pub fn clean_run(ids: Vec<String>) -> Result<Vec<CleanResultItem>, String> {
    run_clean(ids)
}

#[tauri::command]
pub fn get_clean_pack() -> Result<CleanPackMetaDto, String> {
    let cfg = AppConfig::load().map_err(|e| e.to_string())?;
    get_pack_meta(&cfg)
}

#[tauri::command]
pub fn import_clean_pack(content: String, save_as: Option<String>) -> Result<ImportPackResult, String> {
    import_pack_content(&content, save_as.as_deref())
}

#[tauri::command]
pub fn import_clean_pack_from_path(path: String) -> Result<ImportPackResult, String> {
    import_pack_from_path(&path)
}

/// Native JSON file picker; returns absolute path of selected file.
#[tauri::command]
pub async fn pick_clean_pack_file(
    app: tauri::AppHandle,
    default_path: Option<String>,
) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let cfg = AppConfig::load().map_err(|e| e.to_string())?;
    let default = default_path
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| default_clean_pack_browse_dir(&cfg).display().to_string());
    let app = app.clone();
    let picked = tauri::async_runtime::spawn_blocking(move || {
        app.dialog()
            .file()
            .set_title("选择扩展包 JSON")
            .add_filter("JSON", &["json"])
            .set_directory(&default)
            .blocking_pick_file()
    })
    .await
    .map_err(|e| e.to_string())?;
    Ok(picked.map(|fp| fp.to_string()))
}

#[tauri::command]
pub fn export_clean_pack() -> Result<String, String> {
    let cfg = AppConfig::load().map_err(|e| e.to_string())?;
    export_pack_json(&cfg)
}

#[tauri::command]
pub fn apply_clean_profile() -> Result<ApplyProfileResult, String> {
    apply_profile()
}

#[tauri::command]
pub fn clear_clean_pack() -> Result<(), String> {
    let mut cfg = AppConfig::load().map_err(|e| e.to_string())?;
    clear_pack(&mut cfg)
}

#[tauri::command]
pub fn export_clean_pack_to_exe_dir() -> Result<ExportPackToExeResult, String> {
    export_pack_to_exe_dir()
}

#[tauri::command]
pub fn open_path_in_shell(path: String) -> Result<(), String> {
    open_folder_in_shell(&path)
}

#[tauri::command]
pub fn export_skill_zip_bundle() -> Result<String, String> {
    export_skill_zip()
}

/// Windows: fixed drives with a filesystem root (PowerShell).
#[tauri::command]
pub fn list_drives() -> Result<Vec<DriveInfo>, String> {
    #[cfg(windows)]
    {
        let script = r#"Get-PSDrive -PSProvider FileSystem | ForEach-Object { "$($_.Name)|$($_.Root)" }"#;
        let out = crate::win_ps::run(script).map_err(|e| e.to_string())?;
        if !out.status.success() {
            return Err(
                String::from_utf8_lossy(&out.stderr)
                    .trim()
                    .to_string(),
            );
        }
        let s = String::from_utf8_lossy(&out.stdout);
        let mut v = Vec::new();
        for line in s.lines() {
            let line = line.trim();
            if line.is_empty() {
                continue;
            }
            let mut parts = line.splitn(2, '|');
            let name = parts.next().unwrap_or("").trim();
            let root = parts.next().unwrap_or("").trim();
            if root.is_empty() {
                continue;
            }
            let letter = if name.len() == 1 {
                format!("{}:", name.to_uppercase())
            } else {
                name.to_uppercase()
            };
            v.push(DriveInfo {
                letter,
                root_path: root.to_string(),
            });
        }
        if v.is_empty() {
            return Err("no drives returned from PowerShell".into());
        }
        Ok(v)
    }
    #[cfg(not(windows))]
    {
        Err("Windows only".into())
    }
}

#[tauri::command]
pub fn is_elevated() -> bool {
    #[cfg(windows)]
    {
        let script = r#"([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)"#;
        match crate::win_ps::run(script) {
            Ok(o) if o.status.success() => {
                let t = String::from_utf8_lossy(&o.stdout).trim().to_ascii_lowercase();
                t == "true"
            }
            _ => false,
        }
    }
    #[cfg(not(windows))]
    {
        false
    }
}
