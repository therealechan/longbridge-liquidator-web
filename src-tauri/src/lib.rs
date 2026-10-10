use std::net::TcpStream;
use std::process::{Child, Command};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::webview::PageLoadEvent;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_window_state::{AppHandleExt, StateFlags};

const SERVER_ADDR: &str = "127.0.0.1:3456";
const REPO_URL: &str = "https://github.com/therealechan/longbridge-liquidator-web";
const MAIN_WINDOW: &str = "main";

/// Menu item ids forwarded to the frontend as the payload of the `menu` event.
const FRONTEND_MENU_ACTIONS: &[&str] = &[
    "settings",
    "refresh",
    "toggle_sidebar",
    "toggle_details",
    "shortcuts",
    "view_positions",
    "view_orders",
    "about",
];

/// Window-state flags we persist: geometry only (never visibility/decorations).
fn window_state_flags() -> StateFlags {
    StateFlags::SIZE | StateFlags::POSITION | StateFlags::MAXIMIZED
}

/// Holds the handle to the spawned Node.js server process.
struct NodeProcess(Arc<Mutex<Option<Child>>>);

/// Kill the Node server (and anything it spawned) if we started it.
/// Idempotent: the child is taken out of the slot, so later calls are no-ops.
fn stop_node_server(app: &AppHandle) {
    let Some(state) = app.try_state::<NodeProcess>() else { return };
    let child = match state.0.lock() {
        Ok(mut guard) => guard.take(),
        Err(poisoned) => poisoned.into_inner().take(),
    };
    let Some(mut child) = child else { return };
    let pid = child.id();
    eprintln!("[lb-liquidator] stopping node server (pid {pid})");

    #[cfg(unix)]
    {
        // The child was spawned as the leader of its own process group
        // (process_group(0)), so signalling -pid reaches any grandchildren too.
        // SIGTERM first for a clean shutdown, then SIGKILL if it lingers.
        let pgid = pid as i32;
        unsafe { libc::kill(-pgid, libc::SIGTERM) };
        let deadline = std::time::Instant::now() + Duration::from_millis(1500);
        loop {
            match child.try_wait() {
                Ok(Some(_)) => break,
                Ok(None) if std::time::Instant::now() < deadline => {
                    std::thread::sleep(Duration::from_millis(50));
                }
                _ => {
                    unsafe { libc::kill(-pgid, libc::SIGKILL) };
                    break;
                }
            }
        }
        // Reap stragglers in the group that outlived the leader.
        unsafe { libc::kill(-pgid, libc::SIGKILL) };
    }

    let _ = child.kill();
    let _ = child.wait();
}

/// Persist window geometry and stop the server — shared by every exit path.
fn shutdown(app: &AppHandle) {
    let _ = app.save_window_state(window_state_flags());
    stop_node_server(app);
}

/// Last fatal server-startup error, replayed to the frontend after page load
/// in case the `server-error` event fired before its listener was registered.
struct ServerError(Arc<Mutex<Option<String>>>);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(window_state_flags())
                .build(),
        )
        .setup(|app| {
            // ── Build app menu ────────────────────────────────────────────────
            let about_item = MenuItemBuilder::with_id("about", "About LB Liquidator").build(app)?;
            let check_update_item =
                MenuItemBuilder::with_id("check_update", "Check for Updates…").build(app)?;
            let settings_item = MenuItemBuilder::with_id("settings", "Settings…")
                .accelerator("CmdOrCtrl+,")
                .build(app)?;

            let app_submenu = SubmenuBuilder::new(app, "LB Liquidator")
                .item(&about_item)
                .separator()
                .item(&check_update_item)
                .separator()
                .item(&settings_item)
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

            let positions_item = MenuItemBuilder::with_id("view_positions", "Positions")
                .accelerator("CmdOrCtrl+1")
                .build(app)?;
            let orders_item = MenuItemBuilder::with_id("view_orders", "Orders")
                .accelerator("CmdOrCtrl+2")
                .build(app)?;
            let sidebar_item = MenuItemBuilder::with_id("toggle_sidebar", "Toggle Sidebar")
                .accelerator("CmdOrCtrl+B")
                .build(app)?;
            let details_item = MenuItemBuilder::with_id("toggle_details", "Toggle Details")
                .accelerator("CmdOrCtrl+D")
                .build(app)?;
            let refresh_item = MenuItemBuilder::with_id("refresh", "Refresh")
                .accelerator("CmdOrCtrl+R")
                .build(app)?;

            let view_submenu = SubmenuBuilder::new(app, "View")
                .item(&positions_item)
                .item(&orders_item)
                .separator()
                .item(&sidebar_item)
                .item(&details_item)
                .separator()
                .item(&refresh_item)
                .build()?;

            let window_submenu = SubmenuBuilder::new(app, "Window")
                .minimize()
                .maximize()
                .separator()
                .close_window()
                .build()?;

            let shortcuts_item = MenuItemBuilder::with_id("shortcuts", "Keyboard Shortcuts")
                .accelerator("CmdOrCtrl+/")
                .build(app)?;
            let github_item =
                MenuItemBuilder::with_id("open_github", "GitHub Repository").build(app)?;

            let help_submenu = SubmenuBuilder::new(app, "Help")
                .item(&shortcuts_item)
                .separator()
                .item(&github_item)
                .build()?;

            let menu = MenuBuilder::new(app)
                .item(&app_submenu)
                .item(&edit_submenu)
                .item(&view_submenu)
                .item(&window_submenu)
                .item(&help_submenu)
                .build()?;

            app.set_menu(menu)?;

            #[cfg(target_os = "macos")]
            {
                let _ = window_submenu.set_as_windows_menu_for_nsapp();
                let _ = help_submenu.set_as_help_menu_for_nsapp();
            }

            // ── Handle menu events ────────────────────────────────────────────
            app.on_menu_event(|app, event| {
                let id = event.id().as_ref();
                match id {
                    "check_update" => {
                        let handle = app.clone();
                        tauri::async_runtime::spawn(async move {
                            check_for_updates_manual(handle).await;
                        });
                    }
                    "open_github" => {
                        if let Err(e) = app.opener().open_url(REPO_URL, None::<&str>) {
                            eprintln!("[lb-liquidator] failed to open GitHub URL: {e}");
                        }
                    }
                    _ if FRONTEND_MENU_ACTIONS.contains(&id) => {
                        if let Err(e) = app.emit_to(MAIN_WINDOW, "menu", id) {
                            eprintln!("[lb-liquidator] failed to emit menu event '{id}': {e}");
                        }
                    }
                    _ => {}
                }
            });

            // ── Auto-check for updates in background on launch ────────────────
            let update_handle = app.handle().clone();
            std::thread::spawn(move || {
                std::thread::sleep(Duration::from_secs(5));
                tauri::async_runtime::block_on(check_for_updates(update_handle));
            });

            // ── Start Node.js API server ──────────────────────────────────────
            // The UI is bundled (frontendDist) and polls /api/health itself;
            // here we only spawn the server and report definite failures.
            let child_arc: Arc<Mutex<Option<Child>>> = Arc::new(Mutex::new(None));
            let error_arc: Arc<Mutex<Option<String>>> = Arc::new(Mutex::new(None));
            app.manage(NodeProcess(child_arc.clone()));
            app.manage(ServerError(error_arc.clone()));

            let app_handle = app.handle().clone();

            if TcpStream::connect(SERVER_ADDR).is_ok() {
                // e.g. `tauri dev`, where beforeDevCommand already runs `npm start`
                eprintln!("[lb-liquidator] server already listening on {SERVER_ADDR} — not spawning");
                return Ok(());
            }

            let resource_dir = app_handle.path().resource_dir()?;
            let server_dir = resource_dir.join("server-bundle");
            let server_script = server_dir.join("src").join("server.js");

            eprintln!("[lb-liquidator] resource_dir: {:?}", resource_dir);
            eprintln!("[lb-liquidator] server_script: {:?}", server_script);

            let node_bin = find_node();
            eprintln!("[lb-liquidator] using node: {}", node_bin);

            let mut cmd = Command::new(&node_bin);
            cmd.arg(&server_script)
                .current_dir(&server_dir)
                .env("PORT", "3456");
            // Own process group, so shutdown can kill Node and its children together.
            #[cfg(unix)]
            {
                use std::os::unix::process::CommandExt;
                cmd.process_group(0);
            }

            match cmd.spawn() {
                Ok(child) => {
                    if let Ok(mut guard) = child_arc.lock() {
                        *guard = Some(child);
                    }
                }
                Err(e) => {
                    let msg = if e.kind() == std::io::ErrorKind::NotFound {
                        "Node.js was not found. Please install Node.js (https://nodejs.org) and restart LB Liquidator.".to_string()
                    } else {
                        format!("Failed to start the local server ({node_bin}): {e}")
                    };
                    report_server_error(&app_handle, &error_arc, msg);
                    return Ok(());
                }
            }

            std::thread::spawn(move || {
                for _ in 0..60 {
                    std::thread::sleep(Duration::from_millis(500));
                    if TcpStream::connect(SERVER_ADDR).is_ok() {
                        eprintln!("[lb-liquidator] server ready on {SERVER_ADDR}");
                        return;
                    }
                    // Node exited before the port opened → definite failure.
                    let exited = child_arc
                        .lock()
                        .ok()
                        .and_then(|mut g| g.as_mut().and_then(|c| c.try_wait().ok().flatten()));
                    if let Some(status) = exited {
                        // A concurrent instance may own the port; re-check once.
                        if TcpStream::connect(SERVER_ADDR).is_ok() {
                            eprintln!("[lb-liquidator] node exited ({status}) but {SERVER_ADDR} is reachable");
                            return;
                        }
                        report_server_error(
                            &app_handle,
                            &error_arc,
                            format!("The local server exited unexpectedly ({status})."),
                        );
                        return;
                    }
                }
                report_server_error(
                    &app_handle,
                    &error_arc,
                    "The local server did not start within 30 seconds.".to_string(),
                );
            });

            Ok(())
        })
        .on_page_load(|webview, payload| {
            // Replay a startup failure that may have happened before the
            // frontend registered its `server-error` listener.
            if payload.event() != PageLoadEvent::Finished {
                return;
            }
            let Some(state) = webview.try_state::<ServerError>() else { return };
            let pending = state.0.lock().ok().and_then(|g| g.clone());
            if let Some(msg) = pending {
                let handle = webview.app_handle().clone();
                std::thread::spawn(move || {
                    std::thread::sleep(Duration::from_millis(750));
                    let _ = handle.emit_to(MAIN_WINDOW, "server-error", msg);
                });
            }
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                // Closing the (only) window quits the app. We exit the process
                // directly, so RunEvent::Exit never fires — clean up first.
                shutdown(window.app_handle());
                std::process::exit(0);
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building lb-liquidator");

    // ⌘Q / the Quit menu item / `quit app` Apple Events / app.exit() go through
    // the run loop rather than closing the window, so the Destroyed handler
    // above never runs for them. Stop the server on every exit path here.
    app.run(|app_handle, event| match event {
        tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit => shutdown(app_handle),
        _ => {}
    });
}

/// Record a fatal server-startup error and notify the frontend.
fn report_server_error(app: &AppHandle, slot: &Arc<Mutex<Option<String>>>, msg: String) {
    eprintln!("[lb-liquidator] ERROR: {msg}");
    if let Ok(mut guard) = slot.lock() {
        *guard = Some(msg.clone());
    }
    let _ = app.emit_to(MAIN_WINDOW, "server-error", msg);
}

/// Silent background update check on launch — prompts user if an update is found.
async fn check_for_updates(app: tauri::AppHandle) {
    use tauri_plugin_updater::UpdaterExt;

    match app.updater() {
        Ok(updater) => match updater.check().await {
            Ok(Some(update)) => offer_update(&app, update).await,
            Ok(None) => eprintln!("[lb-liquidator] app is up to date"),
            Err(e) => eprintln!("[lb-liquidator] update check failed: {e}"),
        },
        Err(e) => eprintln!("[lb-liquidator] updater init error: {e}"),
    }
}

/// Manual update check triggered from the menu — always shows feedback to the user.
async fn check_for_updates_manual(app: tauri::AppHandle) {
    use tauri_plugin_dialog::{DialogExt, MessageDialogKind};
    use tauri_plugin_updater::UpdaterExt;

    match app.updater() {
        Ok(updater) => match updater.check().await {
            Ok(Some(update)) => offer_update(&app, update).await,
            Ok(None) => {
                show_app_alert(&app, "No Updates Available", "LB Liquidator is up to date.", &["OK"]);
            }
            Err(e) => {
                eprintln!("[lb-liquidator] update check failed: {e}");
                app.dialog()
                    .message(format!("Update check failed: {e}\n\nPlease check your internet connection and try again."))
                    .title("Update Error")
                    .kind(MessageDialogKind::Error)
                    .blocking_show();
            }
        },
        Err(e) => eprintln!("[lb-liquidator] updater init error: {e}"),
    }
}

/// Asks the user whether to install `update`, then downloads and installs it.
async fn offer_update(app: &AppHandle, update: tauri_plugin_updater::Update) {
    use tauri_plugin_dialog::{DialogExt, MessageDialogKind};

    let version = update.version.clone();
    eprintln!("[lb-liquidator] update available: v{version}");

    let choice = show_app_alert(
        app,
        "Update Available",
        &format!(
            "LB Liquidator v{version} is available.\n\nWould you like to download and install it now? The app will restart automatically.",
        ),
        &["Install Update", "Later"],
    );
    if choice != Some(0) {
        return;
    }

    show_app_alert(
        app,
        "Updating LB Liquidator",
        &format!("Downloading v{version}…\n\nThe app will restart when the update is ready."),
        &["OK"],
    );

    if let Err(e) = update.download_and_install(|_, _| {}, || {}).await {
        eprintln!("[lb-liquidator] update install error: {e}");
        app.dialog()
            .message(format!("Update failed: {e}\n\nPlease download the latest version from GitHub manually."))
            .title("Update Error")
            .kind(MessageDialogKind::Error)
            .blocking_show();
    }
}

/// Shows an informational alert and blocks until it is dismissed, returning
/// the index of the pressed button (`None` if the alert could not be shown).
/// The last of several buttons acts as Cancel (Escape). Never call this on the
/// main thread: it waits for the main thread to run the alert.
///
/// On macOS the alert is a native `NSAlert` carrying the app icon; the stock
/// dialog plugin leaves the icon to AppKit, which shows a generic placeholder.
#[cfg(target_os = "macos")]
fn show_app_alert(app: &AppHandle, title: &str, message: &str, buttons: &[&str]) -> Option<usize> {
    let (tx, rx) = std::sync::mpsc::channel();
    let (owned_title, message) = (title.to_owned(), message.to_owned());
    let buttons: Vec<String> = buttons.iter().map(|b| (*b).to_owned()).collect();
    let scheduled = app.run_on_main_thread(move || {
        let _ = tx.send(macos_alert::run(&owned_title, &message, &buttons));
    });
    if let Err(e) = scheduled {
        eprintln!("[lb-liquidator] failed to show alert '{title}': {e}");
        return None;
    }
    rx.recv().ok().flatten()
}

#[cfg(not(target_os = "macos"))]
fn show_app_alert(app: &AppHandle, title: &str, message: &str, buttons: &[&str]) -> Option<usize> {
    use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};

    let dialog = app.dialog().message(message).title(title).kind(MessageDialogKind::Info);
    match buttons {
        [ok, cancel] => {
            let buttons = MessageDialogButtons::OkCancelCustom((*ok).to_owned(), (*cancel).to_owned());
            Some(if dialog.buttons(buttons).blocking_show() { 0 } else { 1 })
        }
        _ => {
            dialog.blocking_show();
            Some(0)
        }
    }
}

#[cfg(target_os = "macos")]
mod macos_alert {
    use objc2::rc::Retained;
    use objc2::{AllocAnyThread, MainThreadMarker};
    use objc2_app_kit::{NSAlert, NSAlertFirstButtonReturn, NSAlertStyle, NSApplication, NSImage};
    use objc2_foundation::{NSBundle, NSString};

    /// Runs an app-modal alert. Must be called on the main thread.
    pub fn run(title: &str, message: &str, buttons: &[String]) -> Option<usize> {
        let mtm = MainThreadMarker::new()?;
        let app = NSApplication::sharedApplication(mtm);
        let key_window = app.keyWindow();

        let alert = NSAlert::new(mtm);
        alert.setAlertStyle(NSAlertStyle::Informational);
        alert.setMessageText(&NSString::from_str(title));
        alert.setInformativeText(&NSString::from_str(message));
        for (i, title) in buttons.iter().enumerate() {
            let button = alert.addButtonWithTitle(&NSString::from_str(title));
            if i > 0 && i + 1 == buttons.len() {
                button.setKeyEquivalent(&NSString::from_str("\u{1b}"));
            }
        }
        if let Some(icon) = app_icon(&app) {
            unsafe { alert.setIcon(Some(&icon)) };
        }

        let response = alert.runModal();
        if let Some(window) = key_window {
            window.makeKeyAndOrderFront(None);
        }
        usize::try_from(response - NSAlertFirstButtonReturn).ok()
    }

    /// The app's icon, falling back to the bundled `icon.icns`.
    fn app_icon(app: &NSApplication) -> Option<Retained<NSImage>> {
        app.applicationIconImage().or_else(|| {
            let path = NSBundle::mainBundle().pathForResource_ofType(
                Some(&NSString::from_str("icon")),
                Some(&NSString::from_str("icns")),
            )?;
            NSImage::initWithContentsOfFile(NSImage::alloc(), &path)
        })
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
