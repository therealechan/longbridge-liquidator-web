use std::net::TcpStream;
use std::process::{Child, Command};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::Manager;
use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};

/// Holds the handle to the spawned Node.js server process.
struct NodeProcess(Arc<Mutex<Option<Child>>>);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // ── Build app menu ────────────────────────────────────────────────
            let check_update_item = MenuItemBuilder::with_id("check_update", "Check for Updates…")
                .build(app)?;

            let app_submenu = SubmenuBuilder::new(app, "LB Liquidator")
                .about(None)
                .separator()
                .item(&check_update_item)
                .separator()
                .hide()
                .hide_others()
                .separator()
                .quit()
                .build()?;

            let edit_submenu = SubmenuBuilder::new(app, "Edit")
                .undo()
                .redo()
                .separator()
                .cut()
                .copy()
                .paste()
                .select_all()
                .build()?;

            let window_submenu = SubmenuBuilder::new(app, "Window")
                .minimize()
                .maximize()
                .separator()
                .close_window()
                .build()?;

            let menu = MenuBuilder::new(app)
                .item(&app_submenu)
                .item(&edit_submenu)
                .item(&window_submenu)
                .build()?;

            app.set_menu(menu)?;

            // ── Handle menu events ────────────────────────────────────────────
            app.on_menu_event(|app, event| {
                if event.id() == "check_update" {
                    let handle = app.clone();
                    tauri::async_runtime::spawn(async move {
                        check_for_updates_manual(handle).await;
                    });
                }
            });

            // ── Auto-check for updates in background on launch ────────────────
            let update_handle = app.handle().clone();
            std::thread::spawn(move || {
                std::thread::sleep(Duration::from_secs(5));
                tauri::async_runtime::block_on(check_for_updates(update_handle));
            });

            // ── Start Node.js server ──────────────────────────────────────────
            let app_handle = app.handle().clone();
            let resource_dir = app_handle
                .path()
                .resource_dir()
                .expect("cannot resolve resource dir");

            let server_dir = resource_dir.join("server-bundle");
            let server_script = server_dir.join("src").join("server.js");

            eprintln!("[lb-liquidator] resource_dir: {:?}", resource_dir);
            eprintln!("[lb-liquidator] server_script: {:?}", server_script);

            let node_bin = find_node();
            eprintln!("[lb-liquidator] using node: {}", node_bin);

            let child = Command::new(&node_bin)
                .arg(&server_script)
                .current_dir(&server_dir)
                .env("PORT", "3456")
                .spawn()
                .expect("failed to spawn node server — is Node.js installed?");

            let child_arc = Arc::new(Mutex::new(Some(child)));
            app.manage(NodeProcess(child_arc.clone()));

            let window = app_handle
                .get_webview_window("main")
                .expect("main window not found");

            std::thread::spawn(move || {
                let mut ready = false;
                for _ in 0..60 {
                    std::thread::sleep(Duration::from_millis(500));
                    if TcpStream::connect("127.0.0.1:3456").is_ok() {
                        ready = true;
                        break;
                    }
                }

                if ready {
                    eprintln!("[lb-liquidator] server ready — navigating webview");
                    let url: tauri::Url = "http://127.0.0.1:3456"
                        .parse()
                        .expect("invalid app URL");
                    let _ = window.navigate(url);
                } else {
                    eprintln!("[lb-liquidator] ERROR: server did not start within 30 seconds");
                    let _ = window.eval(
                        "document.getElementById('status').textContent = \
                         '❌ Failed to start server. Please ensure Node.js is installed.';"
                    );
                }
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                if let Some(state) = window.try_state::<NodeProcess>() {
                    if let Ok(mut guard) = state.0.lock() {
                        if let Some(mut child) = guard.take() {
                            eprintln!("[lb-liquidator] killing node server (pid {})", child.id());
                            let _ = child.kill();
                            let _ = child.wait();
                        }
                    }
                }
                std::process::exit(0);
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running lb-liquidator");
}

/// Silent background update check on launch — prompts user if an update is found.
async fn check_for_updates(app: tauri::AppHandle) {
    use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
    use tauri_plugin_updater::UpdaterExt;

    match app.updater() {
        Ok(updater) => match updater.check().await {
            Ok(Some(update)) => {
                let version = update.version.clone();
                eprintln!("[lb-liquidator] update available: v{}", version);

                let confirmed = app
                    .dialog()
                    .message(format!(
                        "LB Liquidator v{version} is available.\n\nWould you like to download and install it now? The app will restart automatically.",
                    ))
                    .title("Update Available")
                    .buttons(MessageDialogButtons::OkCancelCustom(
                        "Install Update".to_string(),
                        "Later".to_string(),
                    ))
                    .blocking_show();

                if confirmed {
                    app.dialog()
                        .message(format!("Downloading v{version}…\n\nThe app will restart when the update is ready."))
                        .title("Updating LB Liquidator")
                        .blocking_show();

                    if let Err(e) = update.download_and_install(|_, _| {}, || {}).await {
                        eprintln!("[lb-liquidator] update install error: {e}");
                        app.dialog()
                            .message(format!("Update failed: {e}\n\nPlease download the latest version from GitHub manually."))
                            .title("Update Error")
                            .blocking_show();
                    }
                }
            }
            Ok(None) => eprintln!("[lb-liquidator] app is up to date"),
            Err(e) => eprintln!("[lb-liquidator] update check failed: {e}"),
        },
        Err(e) => eprintln!("[lb-liquidator] updater init error: {e}"),
    }
}

/// Manual update check triggered from the menu — always shows feedback to the user.
async fn check_for_updates_manual(app: tauri::AppHandle) {
    use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
    use tauri_plugin_updater::UpdaterExt;

    match app.updater() {
        Ok(updater) => match updater.check().await {
            Ok(Some(update)) => {
                let version = update.version.clone();
                eprintln!("[lb-liquidator] update available: v{}", version);

                let confirmed = app
                    .dialog()
                    .message(format!(
                        "LB Liquidator v{version} is available.\n\nWould you like to download and install it now? The app will restart automatically.",
                    ))
                    .title("Update Available")
                    .buttons(MessageDialogButtons::OkCancelCustom(
                        "Install Update".to_string(),
                        "Later".to_string(),
                    ))
                    .blocking_show();

                if confirmed {
                    app.dialog()
                        .message(format!("Downloading v{version}…\n\nThe app will restart when the update is ready."))
                        .title("Updating LB Liquidator")
                        .blocking_show();

                    if let Err(e) = update.download_and_install(|_, _| {}, || {}).await {
                        eprintln!("[lb-liquidator] update install error: {e}");
                        app.dialog()
                            .message(format!("Update failed: {e}\n\nPlease download the latest version from GitHub manually."))
                            .title("Update Error")
                            .blocking_show();
                    }
                }
            }
            Ok(None) => {
                app.dialog()
                    .message("LB Liquidator is up to date.")
                    .title("No Updates Available")
                    .blocking_show();
            }
            Err(e) => {
                eprintln!("[lb-liquidator] update check failed: {e}");
                app.dialog()
                    .message(format!("Update check failed: {e}\n\nPlease check your internet connection and try again."))
                    .title("Update Error")
                    .blocking_show();
            }
        },
        Err(e) => eprintln!("[lb-liquidator] updater init error: {e}"),
    }
}

/// Find a suitable `node` binary. Checks common macOS paths and nvm installations.
fn find_node() -> String {
    if let Ok(val) = std::env::var("NODE_BIN") {
        if std::path::Path::new(&val).exists() {
            return val;
        }
    }

    if let Ok(out) = Command::new("sh").args(["-c", "which node"]).output() {
        if out.status.success() {
            let path = String::from_utf8_lossy(&out.stdout).trim().to_string();
            if !path.is_empty() && std::path::Path::new(&path).exists() {
                return path;
            }
        }
    }

    let candidates = [
        "/opt/homebrew/bin/node",
        "/usr/local/bin/node",
        "/usr/bin/node",
    ];
    for c in &candidates {
        if std::path::Path::new(c).exists() {
            return c.to_string();
        }
    }

    if let Ok(home) = std::env::var("HOME") {
        let nvm_dir = std::path::Path::new(&home)
            .join(".nvm")
            .join("versions")
            .join("node");
        if nvm_dir.exists() {
            if let Ok(entries) = std::fs::read_dir(&nvm_dir) {
                let mut versions: Vec<_> = entries
                    .filter_map(|e| e.ok())
                    .filter(|e| e.path().is_dir())
                    .collect();
                versions.sort_by(|a, b| b.file_name().cmp(&a.file_name()));
                for entry in versions {
                    let node_bin = entry.path().join("bin").join("node");
                    if node_bin.exists() {
                        return node_bin.to_string_lossy().to_string();
                    }
                }
            }
        }
    }

    "node".to_string()
}
