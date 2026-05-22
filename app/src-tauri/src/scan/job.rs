use crate::paths::{is_reparse_point_path, normalize_scan_root};
use crate::scan::categories::{
    lookup_category, matches_filter, parse_scan_categories, ScanCategoryFilter,
};
use parking_lot::Mutex;
use serde::Serialize;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tauri::Emitter;
use walkdir::WalkDir;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScannedFileRow {
    pub path: String,
    pub size: u64,
    pub modified_ms: i64,
    pub category: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ScanProgressPayload {
    pub job_id: String,
    pub files_seen: u64,
    pub bytes_seen: u64,
    pub hits: u64,
    pub current_path: String,
}

#[derive(Default)]
pub struct ScanJobInner {
    pub state: String,
    pub allowed_roots: Vec<PathBuf>,
    pub results: Vec<ScannedFileRow>,
    pub error: Option<String>,
    pub files_seen: u64,
    pub bytes_seen: u64,
    pub hits: u64,
    pub current_path: String,
}

pub type JobCell = Arc<Mutex<ScanJobInner>>;
pub type CancelFlag = Arc<AtomicBool>;
pub type PauseFlag = Arc<AtomicBool>;

#[derive(Default)]
pub struct ScanManager {
    pub jobs: Mutex<HashMap<String, (JobCell, CancelFlag, PauseFlag)>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanStatusDto {
    pub state: String,
    pub results: Option<Vec<ScannedFileRow>>,
    pub error: Option<String>,
    pub files_seen: u64,
    pub bytes_seen: u64,
    pub hits: u64,
    pub current_path: String,
}

pub fn start_scan(
    app: tauri::AppHandle,
    manager: &ScanManager,
    roots: Vec<String>,
    min_size_mb: u64,
    max_size_mb: Option<u64>,
    categories: Vec<String>,
    exclude_dir_names: Option<Vec<String>>,
) -> Result<String, String> {
    let max_bytes = max_size_mb
        .filter(|&m| m > 0)
        .map(|m| m.saturating_mul(1024 * 1024))
        .unwrap_or(u64::MAX);
    let min_bytes = min_size_mb.saturating_mul(1024 * 1024);
    if max_bytes < min_bytes {
        return Err("最大 MB 不能小于最小 MB".into());
    }
    let filter = parse_scan_categories(&categories)?;

    let mut normalized_roots = Vec::new();
    for r in roots {
        normalized_roots.push(normalize_scan_root(&r)?);
    }
    let job_id = uuid::Uuid::new_v4().to_string();
    let exclude: Vec<String> = exclude_dir_names
        .unwrap_or_default()
        .into_iter()
        .map(|s| s.to_lowercase())
        .collect();

    let inner = Arc::new(Mutex::new(ScanJobInner {
        state: "running".into(),
        allowed_roots: normalized_roots.clone(),
        ..Default::default()
    }));
    let cancel = Arc::new(AtomicBool::new(false));
    let pause = Arc::new(AtomicBool::new(false));
    manager.jobs.lock().insert(
        job_id.clone(),
        (inner.clone(), cancel.clone(), pause.clone()),
    );

    let app2 = app.clone();
    let jid = job_id.clone();
    std::thread::spawn(move || {
        run_scan_worker(
            app2,
            jid,
            normalized_roots,
            min_bytes,
            max_bytes,
            filter,
            exclude,
            cancel,
            pause,
            inner,
        );
    });

    Ok(job_id)
}

fn wait_while_paused(cancel: &AtomicBool, pause: &AtomicBool) -> bool {
    while pause.load(Ordering::Relaxed) {
        if cancel.load(Ordering::Relaxed) {
            return true;
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    cancel.load(Ordering::Relaxed)
}

fn extension_of(path: &std::path::Path) -> String {
    path.extension()
        .map(|e| e.to_string_lossy().to_string())
        .unwrap_or_default()
}

fn run_scan_worker(
    app: tauri::AppHandle,
    job_id: String,
    roots: Vec<PathBuf>,
    min_bytes: u64,
    max_bytes: u64,
    filter: ScanCategoryFilter,
    exclude_lower: Vec<String>,
    cancel: Arc<AtomicBool>,
    pause: Arc<AtomicBool>,
    inner: JobCell,
) {
    let mut results: Vec<ScannedFileRow> = Vec::new();
    let mut files_seen: u64 = 0;
    let mut bytes_seen: u64 = 0;
    const MAX_RESULTS: usize = 50_000;
    let mut run_err: Option<String> = None;
    let mut at_cap = false;

    let mut current_path: Option<String> = None;
    let sync_progress = |snapshot: &[ScannedFileRow],
                         files_seen: u64,
                         bytes_seen: u64,
                         current_path: &str| {
        let hits = snapshot.len() as u64;
        let _ = app.emit(
            "scan-progress",
            ScanProgressPayload {
                job_id: job_id.clone(),
                files_seen,
                bytes_seen,
                hits,
                current_path: current_path.to_string(),
            },
        );
        let mut w = inner.lock();
        w.files_seen = files_seen;
        w.bytes_seen = bytes_seen;
        w.hits = hits;
        w.current_path = current_path.to_string();
        w.results = snapshot.to_vec();
    };

    'roots: for root in roots {
        if wait_while_paused(&cancel, &pause) {
            break;
        }
        if !root.exists() {
            run_err = Some(format!("root does not exist: {}", root.display()));
            break;
        }

        let walker = WalkDir::new(&root)
            .follow_links(false)
            .into_iter()
            .filter_entry(|e| {
                if e.depth() == 0 {
                    return true;
                }
                let name = e.file_name().to_string_lossy().to_lowercase();
                if exclude_lower.contains(&name) {
                    return false;
                }
                if e.file_type().is_dir() && is_reparse_point_path(e.path()) {
                    return false;
                }
                true
            });

        for entry in walker {
            if wait_while_paused(&cancel, &pause) {
                break 'roots;
            }
            let entry = match entry {
                Ok(e) => e,
                Err(_) => continue,
            };
            if entry.file_type().is_dir() {
                continue;
            }
            files_seen += 1;
            current_path = Some(entry.path().to_string_lossy().to_string());
            let meta = match entry.metadata() {
                Ok(m) => m,
                Err(_) => continue,
            };
            let len = meta.len();
            bytes_seen = bytes_seen.saturating_add(len);

            if len >= min_bytes && len <= max_bytes && results.len() < MAX_RESULTS {
                let ext = extension_of(entry.path());
                let cat = lookup_category(&ext);
                if matches_filter(cat, &filter) {
                    let modified_ms = meta
                        .modified()
                        .ok()
                        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                        .map(|d| d.as_millis() as i64)
                        .unwrap_or(0);
                    results.push(ScannedFileRow {
                        path: entry.path().to_string_lossy().to_string(),
                        size: len,
                        modified_ms,
                        category: cat.to_string(),
                    });
                }
            } else if results.len() >= MAX_RESULTS && !at_cap {
                at_cap = true;
            }

            if files_seen % 512 == 0 {
                sync_progress(
                    &results,
                    files_seen,
                    bytes_seen,
                    current_path.as_deref().unwrap_or(""),
                );
            }
        }
    }

    let mut w = inner.lock();
    w.files_seen = files_seen;
    w.bytes_seen = bytes_seen;
    w.hits = results.len() as u64;
    w.results = results;
    if cancel.load(Ordering::Relaxed) {
        w.state = "cancelled".into();
        return;
    }
    if let Some(e) = run_err {
        w.state = "failed".into();
        w.error = Some(e);
        return;
    }
    w.state = "completed".into();
    if at_cap {
        w.error = Some("已达展示上限 5 万条，请缩小范围或提高最小 MB".into());
    }
}

pub fn get_scan_status(manager: &ScanManager, job_id: String) -> Result<ScanStatusDto, String> {
    let g = manager.jobs.lock();
    let pair = g.get(&job_id).ok_or_else(|| "unknown job".to_string())?;
    let inner = pair.0.lock();
    let results = if inner.state == "running"
        || inner.state == "paused"
        || inner.state == "completed"
        || inner.state == "cancelled"
        || inner.state == "failed"
    {
        Some(inner.results.clone())
    } else {
        None
    };
    Ok(ScanStatusDto {
        state: inner.state.clone(),
        results,
        error: inner.error.clone(),
        files_seen: inner.files_seen,
        bytes_seen: inner.bytes_seen,
        hits: inner.hits,
        current_path: inner.current_path.clone(),
    })
}

pub fn cancel_scan(manager: &ScanManager, job_id: String) -> Result<(), String> {
    let g = manager.jobs.lock();
    let triple = g.get(&job_id).ok_or_else(|| "unknown job".to_string())?;
    triple.1.store(true, Ordering::SeqCst);
    triple.2.store(false, Ordering::SeqCst);
    Ok(())
}

pub fn pause_scan(manager: &ScanManager, job_id: String) -> Result<(), String> {
    let g = manager.jobs.lock();
    let triple = g.get(&job_id).ok_or_else(|| "unknown job".to_string())?;
    let inner = triple.0.lock();
    if inner.state != "running" {
        return Err("scan not running".into());
    }
    drop(inner);
    triple.2.store(true, Ordering::SeqCst);
    triple.0.lock().state = "paused".into();
    Ok(())
}

pub fn resume_scan(manager: &ScanManager, job_id: String) -> Result<(), String> {
    let g = manager.jobs.lock();
    let triple = g.get(&job_id).ok_or_else(|| "unknown job".to_string())?;
    let inner = triple.0.lock();
    if inner.state != "paused" {
        return Err("scan not paused".into());
    }
    drop(inner);
    triple.2.store(false, Ordering::SeqCst);
    triple.0.lock().state = "running".into();
    Ok(())
}

pub fn job_allowed_roots(manager: &ScanManager, job_id: &str) -> Result<Vec<PathBuf>, String> {
    let g = manager.jobs.lock();
    let pair = g.get(job_id).ok_or_else(|| "unknown job".to_string())?;
    let inner = pair.0.lock();
    let ok = matches!(
        inner.state.as_str(),
        "completed" | "cancelled" | "failed"
    );
    if !ok {
        return Err("scan job not finished yet".into());
    }
    Ok(inner.allowed_roots.clone())
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanStartArgs {
    pub roots: Vec<String>,
    pub min_size_mb: u64,
    pub max_size_mb: Option<u64>,
    pub categories: Vec<String>,
    pub exclude_dir_names: Option<Vec<String>>,
}
