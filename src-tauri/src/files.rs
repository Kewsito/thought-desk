//! Serves stored files (images) to the webview through the `tdfile` scheme,
//! and removes files no page refers to anymore.

use crate::db::Db;
use std::path::PathBuf;
use std::time::{Duration, SystemTime};
use tauri::http::{Request, Response, StatusCode};
use tauri::{Manager, Runtime, UriSchemeContext, UriSchemeResponder};

fn is_valid_name(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 64
        && name.chars().all(|c| c.is_ascii_alphanumeric() || c == '.')
        && !name.starts_with('.')
}

fn mime_for(name: &str) -> &'static str {
    match name.rsplit('.').next().unwrap_or("") {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "avif" => "image/avif",
        "svg" => "image/svg+xml",
        "bmp" => "image/bmp",
        "ico" => "image/x-icon",
        _ => "application/octet-stream",
    }
}

pub fn protocol<R: Runtime>(
    ctx: UriSchemeContext<'_, R>,
    request: Request<Vec<u8>>,
    responder: UriSchemeResponder,
) {
    let dir: PathBuf = ctx.app_handle().state::<Db>().files_dir.clone();
    let name = request.uri().path().trim_start_matches('/').to_string();
    // File reads happen off the main thread so big images never stall the UI.
    std::thread::spawn(move || {
        let response = if !is_valid_name(&name) {
            None
        } else {
            std::fs::read(dir.join(&name)).ok()
        };
        let response = match response {
            Some(bytes) => Response::builder()
                .status(StatusCode::OK)
                .header("Content-Type", mime_for(&name))
                .header("Cache-Control", "max-age=31536000, immutable")
                .body(bytes),
            None => Response::builder()
                .status(StatusCode::NOT_FOUND)
                .body(Vec::new()),
        };
        if let Ok(r) = response {
            responder.respond(r);
        }
    });
}

/// Deletes stored files that no page references. Files younger than a day
/// are kept, since a page that uses them may not have been saved yet.
pub fn collect_garbage(db: &Db) {
    let Ok(content) = db.all_content() else { return };
    let Ok(entries) = std::fs::read_dir(&db.files_dir) else { return };
    let cutoff = SystemTime::now() - Duration::from_secs(24 * 60 * 60);
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        if content.contains(&name) {
            continue;
        }
        let old = entry
            .metadata()
            .and_then(|m| m.modified())
            .map(|t| t < cutoff)
            .unwrap_or(false);
        if old {
            let _ = std::fs::remove_file(entry.path());
        }
    }
}
