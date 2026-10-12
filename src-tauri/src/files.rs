//! Serves stored files to the webview through the `tdfile` scheme, and
//! removes stray files that neither the library nor any page knows about.

use crate::db::Db;
use crate::library::mime_for;
use std::path::PathBuf;
use std::time::{Duration, SystemTime};
use tauri::http::{Request, Response, StatusCode};
use tauri::{Manager, Runtime, UriSchemeContext, UriSchemeResponder};

pub fn is_valid_name(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 64
        && name.chars().all(|c| c.is_ascii_alphanumeric() || c == '.')
        && !name.starts_with('.')
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
            Some(bytes) => {
                let mime = mime_for(&name);
                // Documents can be edited in another app, so revalidate those;
                // images are never rewritten in place.
                let cache = if mime.starts_with("image/") { "max-age=31536000, immutable" } else { "no-cache" };
                Response::builder()
                    .status(StatusCode::OK)
                    .header("Content-Type", mime)
                    .header("X-Content-Type-Options", "nosniff")
                    // The app reads text files with fetch() for previews, and
                    // the app's origin differs from this scheme's.
                    .header("Access-Control-Allow-Origin", "*")
                    .header("Cache-Control", cache)
                    .body(bytes)
            }
            None => Response::builder()
                .status(StatusCode::NOT_FOUND)
                .body(Vec::new()),
        };
        if let Ok(r) = response {
            responder.respond(r);
        }
    });
}

/// Deletes stored files that the library doesn't list and no page refers to
/// (left over from a failed save, say). Files younger than a day are kept.
pub fn collect_garbage(db: &Db) {
    let Ok(content) = db.all_content() else { return };
    let Ok(known) = db.known_files() else { return };
    let Ok(entries) = std::fs::read_dir(&db.files_dir) else { return };
    let cutoff = SystemTime::now() - Duration::from_secs(24 * 60 * 60);
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        if known.contains(&name) || content.contains(&name) {
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
