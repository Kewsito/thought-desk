//! Commands invoked from the frontend.

use crate::db::{Db, Error, Page, PageMeta, PagePatch, Result, SearchHit};
use serde::Serialize;
use tauri::{ipc::InvokeBody, AppHandle, Manager, State};

#[tauri::command]
pub fn list_pages(db: State<Db>) -> Result<Vec<PageMeta>> {
    db.list_pages()
}

#[tauri::command]
pub fn get_page(db: State<Db>, id: String) -> Result<Page> {
    db.get_page(&id)
}

#[tauri::command]
pub fn create_page(
    db: State<Db>,
    parent_id: Option<String>,
    index: Option<usize>,
    title: Option<String>,
    icon: Option<String>,
) -> Result<PageMeta> {
    db.create_page(
        parent_id.as_deref(),
        index,
        title.as_deref().unwrap_or(""),
        icon.as_deref().unwrap_or(""),
    )
}

#[tauri::command]
pub fn update_page(db: State<Db>, id: String, patch: PagePatch) -> Result<i64> {
    db.update_page(&id, patch)
}

#[tauri::command]
pub fn move_page(db: State<Db>, id: String, parent_id: Option<String>, index: usize) -> Result<()> {
    db.move_page(&id, parent_id.as_deref(), index)
}

#[tauri::command]
pub fn duplicate_page(db: State<Db>, id: String) -> Result<PageMeta> {
    db.duplicate_page(&id)
}

#[tauri::command]
pub fn trash_page(db: State<Db>, id: String) -> Result<i64> {
    db.trash_page(&id)
}

#[tauri::command]
pub fn restore_page(db: State<Db>, id: String) -> Result<()> {
    db.restore_page(&id)
}

#[tauri::command]
pub fn delete_page(db: State<Db>, id: String) -> Result<()> {
    db.delete_page(&id)
}

#[tauri::command]
pub fn empty_trash(db: State<Db>) -> Result<()> {
    db.empty_trash()
}

#[tauri::command]
pub fn search(db: State<Db>, query: String, limit: Option<usize>) -> Result<Vec<SearchHit>> {
    db.search(&query, limit.unwrap_or(30))
}

/// Stores an uploaded file (raw request body) and returns its file name.
/// The file's extension is passed in the `x-ext` header.
#[tauri::command]
pub fn save_file(db: State<Db>, request: tauri::ipc::Request<'_>) -> Result<String> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err(Error("Expected raw file bytes".into()));
    };
    let ext: String = request
        .headers()
        .get("x-ext")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("bin")
        .chars()
        .filter(char::is_ascii_alphanumeric)
        .take(8)
        .collect::<String>()
        .to_ascii_lowercase();
    let ext = if ext.is_empty() { "bin".to_string() } else { ext };
    let name = format!("{}.{}", uuid::Uuid::new_v4().simple(), ext);
    std::fs::write(db.files_dir.join(&name), bytes)?;
    Ok(name)
}

/// Writes a Markdown export into the user's Downloads folder.
#[tauri::command]
pub fn export_markdown(app: AppHandle, title: String, markdown: String) -> Result<String> {
    let dir = app.path().download_dir()?;
    let base: String = title
        .chars()
        .map(|c| if r#"<>:"/\|?*"#.contains(c) || c.is_control() { ' ' } else { c })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .chars()
        .take(80)
        .collect();
    let base = if base.is_empty() { "Untitled".to_string() } else { base };
    let mut path = dir.join(format!("{base}.md"));
    let mut n = 1;
    while path.exists() {
        n += 1;
        path = dir.join(format!("{base} ({n}).md"));
    }
    std::fs::write(&path, markdown)?;
    Ok(path.to_string_lossy().into_owned())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DataInfo {
    data_dir: String,
    db_bytes: u64,
    file_bytes: u64,
    file_count: u64,
    page_count: i64,
    version: String,
}

#[tauri::command]
pub fn data_info(app: AppHandle, db: State<Db>) -> Result<DataInfo> {
    let size = |name: &str| {
        std::fs::metadata(db.data_dir.join(name))
            .map(|m| m.len())
            .unwrap_or(0)
    };
    let db_bytes = size("thoughtdesk.db") + size("thoughtdesk.db-wal");
    let (mut file_bytes, mut file_count) = (0, 0);
    if let Ok(entries) = std::fs::read_dir(&db.files_dir) {
        for e in entries.flatten() {
            if let Ok(m) = e.metadata() {
                file_bytes += m.len();
                file_count += 1;
            }
        }
    }
    Ok(DataInfo {
        data_dir: db.data_dir.to_string_lossy().into_owned(),
        db_bytes,
        file_bytes,
        file_count,
        page_count: db.page_count()?,
        version: app.package_info().version.to_string(),
    })
}
