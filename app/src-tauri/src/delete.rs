use crate::paths::path_allowed_under_roots;
use serde::Serialize;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize)]
pub struct DeleteResultRow {
    pub path: String,
    pub ok: bool,
    pub error: Option<String>,
}

pub fn delete_to_recycle_batch(
    allowed_roots: &[PathBuf],
    paths: &[String],
) -> Vec<DeleteResultRow> {
    let mut out = Vec::with_capacity(paths.len());
    for p in paths {
        let pb = PathBuf::from(p);
        if !path_allowed_under_roots(allowed_roots, &pb) {
            out.push(DeleteResultRow {
                path: p.clone(),
                ok: false,
                error: Some("path not under scanned roots".into()),
            });
            continue;
        }
        match trash::delete(&pb) {
            Ok(()) => out.push(DeleteResultRow {
                path: p.clone(),
                ok: true,
                error: None,
            }),
            Err(e) => out.push(DeleteResultRow {
                path: p.clone(),
                ok: false,
                error: Some(e.to_string()),
            }),
        }
    }
    out
}
