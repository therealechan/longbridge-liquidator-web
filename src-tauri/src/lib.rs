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
        .setup(|app| {
            let resource_dir = app.handle().path().resource_dir()
                .expect("cannot resolve resource dir");

            // The server bundle is at {resource_dir}/server-bundle/
            let server_dir = resource_dir.join("server-bundle");
            let server_script = server_dir.join("src").join("server.js");

            eprintln!("[liquidator] resource_dir: {:?}", resource_dir);
            eprintln!("[liquidator] server_script: {:?}", server_script);

            // Locate the `node` binary
            let node_bin = find_node();
            eprintln!("[liquidator] using node: {}", node_bin);

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
            let window = app.handle()
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
                    eprintln!("[liquidator] server ready — navigating webview");
                    let url: tauri::Url = "http://127.0.0.1:3456"
                        .parse()
                        .expect("invalid app URL");
                    let _ = window.navigate(url);
                } else {
                    eprintln!("[liquidator] ERROR: server did not start within 30 seconds");
                    // Show error in the loading page
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
                            eprintln!("[liquidator] killing node server (pid {})", child.id());
                            let _ = child.kill();
                            let _ = child.wait();
                        }
                    }
                }
                // On macOS, closing the last window doesn't quit by default — force quit
                std::process::exit(0);
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running liquidator");
}

/// Find a suitable `node` binary. Checks common macOS paths and nvm installations.
fn find_node() -> String {
    // 1. Honour explicit override
    if let Ok(val) = std::env::var("NODE_BIN") {
        if std::path::Path::new(&val).exists() {
            return val;
        }
    }

    // 2. `which node` via shell (works when PATH is set correctly)
    if let Ok(out) = Command::new("sh")
        .args(["-c", "which node"])
        .output()
    {
        if out.status.success() {
            let path = String::from_utf8_lossy(&out.stdout).trim().to_string();
            if !path.is_empty() && std::path::Path::new(&path).exists() {
                return path;
            }
        }
    }

    // 3. Common hardcoded locations (Apple Silicon Homebrew first, then Intel)
    let candidates = [
        "/opt/homebrew/bin/node",   // Apple Silicon Homebrew
        "/usr/local/bin/node",       // Intel Homebrew / Volta / pkgman
        "/usr/bin/node",
    ];
    for c in &candidates {
        if std::path::Path::new(c).exists() {
            return c.to_string();
        }
    }

    // 4. Scan nvm installations, pick lexicographically latest version
    if let Ok(home) = std::env::var("HOME") {
        let nvm_node_dir = std::path::Path::new(&home)
            .join(".nvm")
            .join("versions")
            .join("node");
        if nvm_node_dir.exists() {
            if let Ok(entries) = std::fs::read_dir(&nvm_node_dir) {
                let mut versions: Vec<_> = entries
                    .filter_map(|e| e.ok())
                    .filter(|e| e.path().is_dir())
                    .collect();
                // Sort descending so the latest version is first
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

    // 5. Fallback — rely on PATH at runtime
    "node".to_string()
}
