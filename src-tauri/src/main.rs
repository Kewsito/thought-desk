// Hide the console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod cards;
mod commands;
mod db;
mod files;
mod library;
mod memory;
mod organize;
mod planner;
mod reminders;

use std::path::PathBuf;
use tauri::{Emitter, Manager};
use tauri_plugin_global_shortcut::{Code, Modifiers, Shortcut, ShortcutState};
use tauri_plugin_window_state::StateFlags;

/// THOUGHTDESK_DATA_DIR points the app at another notes folder (portable
/// installs, or a scratch copy for testing).
fn custom_data_dir() -> Option<PathBuf> {
    std::env::var_os("THOUGHTDESK_DATA_DIR")
        .filter(|d| !d.is_empty())
        .map(PathBuf::from)
}

/// The system-wide Quick Capture shortcut.
pub fn capture_shortcut() -> Shortcut {
    Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::Space)
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
        .plugin(tauri_plugin_notification::init())
        .manage(reminders::Reminders::default())
        .plugin(
            // Quick Capture from anywhere: bring the window up and ask the UI
            // to open the capture box. Registered on demand (Settings).
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    if event.state() != ShortcutState::Pressed || *shortcut != capture_shortcut() {
                        return;
                    }
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.unminimize();
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                    let _ = app.emit("td-quick-capture", ());
                })
                .build(),
        )
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

            reminders::start(app.handle().clone());

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
            commands::list_files,
            commands::update_file,
            commands::file_usage,
            commands::open_file,
            commands::reveal_file,
            commands::export_file,
            commands::list_courses,
            commands::create_course,
            commands::update_course,
            commands::delete_course,
            commands::list_assignments,
            commands::create_assignment,
            commands::update_assignment,
            commands::list_events,
            commands::create_event,
            commands::update_event,
            commands::list_tags,
            commands::set_item_tags,
            commands::set_tag_color,
            commands::rename_tag,
            commands::backlinks,
            commands::list_todos,
            commands::set_todo,
            commands::set_capture_shortcut,
            commands::list_occurrence_pages,
            commands::set_occurrence_page,
            commands::set_reminders,
            commands::export_document,
            commands::print_page,
            commands::list_cards,
            commands::save_review,
            commands::reset_reviews,
            commands::trash_item,
            commands::restore_item,
            commands::delete_item,
            commands::export_markdown,
            commands::data_info,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Thought Desk");
}
