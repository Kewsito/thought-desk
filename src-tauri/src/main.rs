// Hide the console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod db;
mod files;
mod memory;

use std::path::PathBuf;
use tauri::Manager;
use tauri_plugin_window_state::StateFlags;

/// THOUGHTDESK_DATA_DIR points the app at another notes folder (portable
/// installs, or a scratch copy for testing).
fn custom_data_dir() -> Option<PathBuf> {
    std::env::var_os("THOUGHTDESK_DATA_DIR")
        .filter(|d| !d.is_empty())
        .map(PathBuf::from)
}

fn main() {
    let mut builder = tauri::Builder::default();

    // A second launch focuses the running window instead of opening another
    // view onto the same database. A custom data folder is a separate
    // workspace, so it may run alongside.
    if custom_data_dir().is_none() {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }));
    }

    builder
        .plugin(tauri_plugin_opener::init())
        .plugin(
            // Remember size, position and maximized state. Visibility is left
            // alone: the frontend shows the window once it has painted, which
            // avoids a white flash on startup.
            tauri_plugin_window_state::Builder::new()
                .with_state_flags(StateFlags::SIZE | StateFlags::POSITION | StateFlags::MAXIMIZED)
                .build(),
        )
        .register_asynchronous_uri_scheme_protocol("tdfile", files::protocol)
        .setup(|app| {
            let dir = match custom_data_dir() {
                Some(dir) => dir,
                None => app.path().app_data_dir()?,
            };
            let db = db::Db::open(&dir).map_err(|e| e.0)?;
            app.manage(db);

            let handle = app.handle().clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_secs(20));
                files::collect_garbage(&handle.state::<db::Db>());
            });
            Ok(())
        })
        .on_window_event(memory::on_window_event)
        .invoke_handler(tauri::generate_handler![
            commands::list_pages,
            commands::get_page,
            commands::create_page,
            commands::update_page,
            commands::move_page,
            commands::duplicate_page,
            commands::trash_page,
            commands::restore_page,
            commands::delete_page,
            commands::empty_trash,
            commands::search,
            commands::save_file,
            commands::export_markdown,
            commands::data_info,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Thought Desk");
}
