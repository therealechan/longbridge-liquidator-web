use std::net::TcpStream;
use std::process::{Child, Command};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::Manager;

/// Holds the handle to the spawned Node.js server process.
struct NodeProcess(Arc<Mutex<Option<Child>>>);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let app_handle = app.handle().clone();

            // ── Check for updates in background after a short delay ──
            let update_handle = app_handle.clone();
            std::thread::spawn(move || {
                // Wait for the app window to load before showing update dialog
                std::thread::sleep(Duration::from_secs(5));
                tauri::async_runtime::block_on(check_for_updates(update_handle));
            });

            let resource_dir = app_handle
                .path()
                .resource_dir()
                .expect("cannot resolve resource dir");

            // The server bundle is at {resource_dir}/server-bundle/
            let server_dir = resource_dir.join("server-bundle");
            let server_script = server_dir.join("src").join("server.js");

            eprintln!("[lb-liquidator] resource_dir: {:?}", resource_dir);
            eprintln!("[lb-liquidator] server_script: {:?}", server_script);

            // Locate the `node` binary
            let node_bin = find_node();
            eprintln!("[lb-liquidator] using node: {}", node_bin);

            // Spawn the Express server
            let child = Command::new(&node_bin)
                .arg(&server_script)
                .current_dir(&server_dir)
                .env("PORT", "3456")
                .spawn()
                .expect("failed to spawn node server — is Node.js installed?");

            let child_arc = Arc::new(Mutex::new(Some(child)));
            app.manage(NodeProcess(child_arc.clone()));

            // Clone window handle for the background thread
            let window = app_handle
                .get_webview_window("main")
                .expect("main window not found");

            std::thread::spawn(move || {
                // Poll TCP port 3456 for up to 30 seconds (60 × 500 ms)
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
                // Kill the node server when the window is closed
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

/// Check for updates and show a native dialog if one is available.
async fn check_for_updates(app: tauri::AppHandle) {
    use tauri_plugin_updater::UpdaterExt;

    match app.updater() {
        Ok(updater) => match updater.check().await {
            Ok(Some(update)) => {
                let version = update.version.clone();
                eprintln!("[lb-liquidator] update available: v{}", version);

                // Download and install; the plugin shows a native dialog via dialog = true
                if let Err(e) = update.download_and_install(|_, _| {}, || {}).await {
                    eprintln!("[lb-liquidator] update install error: {e}");
                }
            }
            Ok(None) => eprintln!("[lb-liquidator] app is up to date"),
            Err(e) => eprintln!("[lb-liquidator] update check failed: {e}"),
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

    // Scan nvm installations — pick lexicographically latest
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
