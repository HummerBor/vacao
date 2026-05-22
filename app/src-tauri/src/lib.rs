use tauri::Manager;

mod clean;
mod commands;
mod config;
mod delete;
mod paths;
mod scan;

pub use scan::ScanManager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.set_theme(Some(tauri::Theme::Dark));
                // Win10: shadow + decorations:false leaves a mismatched system border
                let _ = win.set_shadow(false);
                // WebView2 default menu (Back / Inspect) — JS in page also blocks; belt-and-suspenders
                let _ = win.eval(
                    r"(function(){var b=function(e){e.preventDefault();};
document.addEventListener('contextmenu',b,{capture:true});
window.addEventListener('contextmenu',b,{capture:true});})();",
                );
            }
            Ok(())
        })
        .manage(ScanManager::default())
        .invoke_handler(tauri::generate_handler![
            commands::get_config,
            commands::save_config,
            commands::scan_start,
            commands::scan_categories,
            commands::scan_category_labels,
            commands::scan_status,
            commands::scan_cancel,
            commands::scan_pause,
            commands::scan_resume,
            commands::pick_scan_folder,
            commands::delete_to_recycle,
            commands::clean_catalog,
            commands::clean_run,
            commands::get_clean_pack,
            commands::import_clean_pack,
            commands::import_clean_pack_from_path,
            commands::pick_clean_pack_file,
            commands::export_clean_pack,
            commands::apply_clean_profile,
            commands::clear_clean_pack,
            commands::export_clean_pack_to_exe_dir,
            commands::open_path_in_shell,
            commands::export_skill_zip_bundle,
            commands::list_drives,
            commands::is_elevated,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
