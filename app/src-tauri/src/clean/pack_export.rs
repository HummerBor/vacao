use crate::clean::pack::export_pack_json;
use crate::config::AppConfig;
use serde::Serialize;
use std::fs::File;
use std::io::Write;
use std::path::PathBuf;
use walkdir::WalkDir;
use zip::write::SimpleFileOptions;
use zip::ZipWriter;

fn skill_bundle_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("skill-bundle")
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportPackToExeResult {
    pub path: String,
    pub overwritten: bool,
}

pub fn export_pack_to_exe_dir() -> Result<ExportPackToExeResult, String> {
    let mut cfg = AppConfig::load().map_err(|e| e.to_string())?;
    let json = export_pack_json(&cfg)?;
    let dest = cfg.exe_dir().join("clean-pack.json");
    let overwritten = dest.exists();
    std::fs::write(&dest, json).map_err(|e| e.to_string())?;
    cfg.clean_pack_path = dest.display().to_string();
    cfg.save().map_err(|e| e.to_string())?;
    Ok(ExportPackToExeResult {
        path: dest.display().to_string(),
        overwritten,
    })
}

/// Open the folder containing `path` (if `path` is a file) or `path` itself (if a directory).
pub fn open_folder_in_shell(path: &str) -> Result<(), String> {
    let p = PathBuf::from(path);
    if !p.exists() {
        return Err(format!("路径不存在: {}", p.display()));
    }
    #[cfg(windows)]
    {
        use std::process::Command;
        let dir = if p.is_file() {
            p.parent()
                .ok_or_else(|| format!("无法解析父目录: {}", p.display()))?
                .to_path_buf()
        } else {
            p
        };
        Command::new("explorer.exe")
            .arg(dir)
            .spawn()
            .map_err(|e| e.to_string())?;
        Ok(())
    }
    #[cfg(not(windows))]
    {
        let _ = path;
        Err("仅支持 Windows".into())
    }
}

pub fn export_skill_zip() -> Result<String, String> {
    let bundle = skill_bundle_dir();
    if !bundle.is_dir() {
        return Err(format!(
            "未找到 skill-bundle 目录: {}",
            bundle.display()
        ));
    }
    let downloads = std::env::var_os("USERPROFILE")
        .map(PathBuf::from)
        .map(|h| h.join("Downloads"))
        .filter(|d| d.is_dir())
        .unwrap_or_else(|| bundle.clone());
    let dest = downloads.join("disk-cleaner-pack-skill.zip");

    let file = File::create(&dest).map_err(|e| e.to_string())?;
    let mut zip = ZipWriter::new(file);
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    for entry in WalkDir::new(&bundle).into_iter().filter_map(|e| e.ok()) {
        let path = entry.path();
        let rel = path
            .strip_prefix(&bundle)
            .map_err(|e| e.to_string())?;
        if rel.as_os_str().is_empty() {
            continue;
        }
        let name = rel
            .to_string_lossy()
            .replace('\\', "/");
        if path.is_file() {
            zip.start_file(name, options)
                .map_err(|e| e.to_string())?;
            zip.write_all(&std::fs::read(path).map_err(|e| e.to_string())?)
                .map_err(|e| e.to_string())?;
        }
    }
    zip.finish().map_err(|e| e.to_string())?;
    Ok(dest.display().to_string())
}
