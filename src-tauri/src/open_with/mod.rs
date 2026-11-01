// SPDX-License-Identifier: GPL-3.0-or-later
// License: GNU GPLv3 or later. See the license file in the project root for more information.
// Copyright © 2021 - present Aleksey Hoffman. All rights reserved.

mod types;
mod utils;

#[cfg(target_os = "windows")]
pub(crate) mod helper;

#[cfg(target_os = "windows")]
mod windows;

#[cfg(target_os = "linux")]
mod linux;

pub use types::{GetAssociatedProgramsResult, GetShellContextMenuResult, OpenWithResult};

use std::path::Path;
use std::process::Command;
#[cfg(not(windows))]
use utils::canonicalize_path;
#[cfg(windows)]
use utils::{path_for_selection, prepare_shell_path};

// Generous enough for a cold helper start plus a full modern-menu enumeration,
// while still bounding how long a deadlocked extension can stall the submenu.
#[cfg(target_os = "windows")]
const SHELL_EXTENSION_QUERY_TIMEOUT: std::time::Duration =
    std::time::Duration::from_millis(4000);

#[cfg(target_os = "windows")]
const MAX_SHELL_HELPER_PROCESSES: usize = 8;

#[cfg(target_os = "windows")]
static SHELL_HELPER_PROCESSES: std::sync::atomic::AtomicUsize =
    std::sync::atomic::AtomicUsize::new(0);

#[cfg(target_os = "windows")]
struct ShellHelperSlot;

#[cfg(target_os = "windows")]
impl ShellHelperSlot {
    fn acquire() -> Option<Self> {
        use std::sync::atomic::Ordering;

        let mut current = SHELL_HELPER_PROCESSES.load(Ordering::Acquire);
        loop {
            if current >= MAX_SHELL_HELPER_PROCESSES {
                return None;
            }

            match SHELL_HELPER_PROCESSES.compare_exchange_weak(
                current,
                current + 1,
                Ordering::AcqRel,
                Ordering::Acquire,
            ) {
                Ok(_) => return Some(Self),
                Err(observed) => current = observed,
            }
        }
    }
}

#[cfg(target_os = "windows")]
impl Drop for ShellHelperSlot {
    fn drop(&mut self) {
        SHELL_HELPER_PROCESSES.fetch_sub(1, std::sync::atomic::Ordering::AcqRel);
    }
}

/// Runs a shell-extension query in a disposable child process so a deadlocking
/// extension can neither block the host main thread nor keep the host's module
/// loader lock hostage. A helper that overruns the timeout is killed.
#[cfg(target_os = "windows")]
async fn run_shell_extension_task<T>(
    operation: &'static str,
    paths: Vec<String>,
) -> Result<T, String>
where
    T: serde::de::DeserializeOwned,
{
    use std::process::Stdio;
    use tokio::io::AsyncWriteExt;

    // Keeps the helper from flashing a console window next to the app.
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;

    let _slot = ShellHelperSlot::acquire()
        .ok_or_else(|| "Too many shell extension queries are still running".to_string())?;

    let executable = std::env::current_exe()
        .map_err(|error| format!("Failed to locate the application executable: {error}"))?;
    let mut child = tokio::process::Command::new(executable)
        .arg(helper::SHELL_HELPER_FLAG)
        .arg(operation)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .creation_flags(CREATE_NO_WINDOW)
        .kill_on_drop(true)
        .spawn()
        .map_err(|error| format!("Failed to start the shell extension helper: {error}"))?;

    if let Some(mut stdin) = child.stdin.take() {
        let payload = serde_json::to_vec(&paths)
            .map_err(|error| format!("Failed to encode shell extension request: {error}"))?;

        let _ = tokio::time::timeout(std::time::Duration::from_secs(1), async move {
            let _ = stdin.write_all(&payload).await;
            let _ = stdin.shutdown().await;
        })
        .await;
    }

    let output =
        match tokio::time::timeout(SHELL_EXTENSION_QUERY_TIMEOUT, child.wait_with_output()).await {
            Ok(Ok(output)) => output,
            Ok(Err(error)) => return Err(format!("Shell extension helper failed: {error}")),
            Err(_) => return Err("Shell extension query timed out".to_string()),
        };

    if !output.status.success() {
        return Err(format!(
            "Shell extension helper exited with code {}",
            output.status.code().unwrap_or(-1)
        ));
    }

    serde_json::from_slice(&output.stdout)
        .map_err(|error| format!("Shell extension helper returned invalid data: {error}"))
}

#[tauri::command]
pub async fn get_associated_programs(file_path: String) -> GetAssociatedProgramsResult {
    #[cfg(target_os = "windows")]
    {
        match run_shell_extension_task(
            helper::OPERATION_ASSOCIATED_PROGRAMS,
            vec![file_path],
        )
        .await
        {
            Ok(result) => result,
            Err(error) => {
                log::warn!("get_associated_programs failed: {error}");
                GetAssociatedProgramsResult {
                    success: false,
                    recommended_programs: vec![],
                    other_programs: vec![],
                    default_program: None,
                    error: Some(error),
                }
            }
        }
    }
    #[cfg(target_os = "linux")]
    {
        linux::get_associated_programs_impl(&file_path)
    }
    #[cfg(not(any(target_os = "windows", target_os = "linux")))]
    {
        let _ = file_path;
        GetAssociatedProgramsResult {
            success: false,
            recommended_programs: vec![],
            other_programs: vec![],
            default_program: None,
            error: Some(
                "Open With functionality is only supported on Windows and Linux currently"
                    .to_string(),
            ),
        }
    }
}

#[tauri::command]
pub fn open_with_program(
    file_path: String,
    program_path: String,
    arguments: Vec<String>,
) -> OpenWithResult {
    #[cfg(windows)]
    let native_file_path = path_for_selection(&file_path);
    #[cfg(windows)]
    let file = Path::new(&native_file_path);
    #[cfg(not(windows))]
    let file = Path::new(&file_path);

    if !file.exists() {
        return OpenWithResult {
            success: false,
            error: Some(format!("File not found: {}", file_path)),
        };
    }

    #[cfg(windows)]
    let absolute_file_path = prepare_shell_path(&file_path);
    #[cfg(not(windows))]
    let absolute_file_path = canonicalize_path(file);

    #[cfg(target_os = "windows")]
    {
        if arguments.is_empty() {
            let handler_result =
                windows::invoke_handler_for_file(&program_path, &absolute_file_path);
            if handler_result.success {
                return handler_result;
            }
        }
    }

    #[cfg(target_os = "linux")]
    {
        if arguments.is_empty() {
            if let Some(result) = linux::open_with_desktop_id(&program_path, &absolute_file_path) {
                if result.success {
                    return result;
                }
            }
        }
    }

    let program = Path::new(&program_path);
    if !program.exists() {
        return OpenWithResult {
            success: false,
            error: Some(format!("Program not found: {}", program_path)),
        };
    }

    let mut command = Command::new(&program_path);

    if arguments.is_empty() {
        command.arg(&absolute_file_path);
    } else {
        let mut file_arg_added = false;
        for arg in &arguments {
            if arg.contains("%1") {
                command.arg(arg.replace("%1", &absolute_file_path));
                file_arg_added = true;
            } else if arg.contains("\"%1\"") {
                command.arg(arg.replace("\"%1\"", &absolute_file_path));
                file_arg_added = true;
            } else {
                command.arg(arg);
            }
        }
        if !file_arg_added {
            command.arg(&absolute_file_path);
        }
    }

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const DETACHED_PROCESS: u32 = 0x00000008;
        command.creation_flags(DETACHED_PROCESS);
    }

    if let Some(parent_directory) = Path::new(&absolute_file_path).parent() {
        if parent_directory.exists() {
            command.current_dir(parent_directory);
        }
    }

    match command.spawn() {
        Ok(_) => OpenWithResult {
            success: true,
            error: None,
        },
        Err(spawn_error) => OpenWithResult {
            success: false,
            error: Some(format!("Failed to start program: {}", spawn_error)),
        },
    }
}

/// Resolves a command name (e.g. `code`) against the system PATH and returns
/// the absolute path of the first spawnable match. Used by the front-end to
/// detect installed launchers such as IDEs for the "Open with" built-ins.
#[tauri::command]
pub fn resolve_command_in_path(command: String) -> Option<String> {
    let trimmed = command.trim();

    if trimmed.is_empty() {
        return None;
    }

    crate::extensions::processes::resolve_from_system_path(trimmed)
        .map(|path| path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn open_with_default(file_path: String) -> OpenWithResult {
    #[cfg(target_os = "windows")]
    {
        windows::open_path_default_impl(&file_path)
    }
    #[cfg(target_os = "macos")]
    {
        match Command::new("open").arg(&file_path).spawn() {
            Ok(_) => OpenWithResult {
                success: true,
                error: None,
            },
            Err(spawn_error) => OpenWithResult {
                success: false,
                error: Some(format!("Failed to open file: {}", spawn_error)),
            },
        }
    }
    #[cfg(target_os = "linux")]
    {
        match Command::new("xdg-open").arg(&file_path).spawn() {
            Ok(_) => OpenWithResult {
                success: true,
                error: None,
            },
            Err(spawn_error) => OpenWithResult {
                success: false,
                error: Some(format!("Failed to open file: {}", spawn_error)),
            },
        }
    }
}

#[tauri::command]
pub fn open_native_open_with_dialog(file_path: String) -> OpenWithResult {
    #[cfg(target_os = "windows")]
    {
        windows::open_native_open_with_dialog_impl(&file_path)
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = file_path;
        OpenWithResult {
            success: false,
            error: Some("Native Open With dialog is only supported on Windows".to_string()),
        }
    }
}

#[tauri::command]
pub async fn get_shell_context_menu(file_path: String) -> GetShellContextMenuResult {
    #[cfg(target_os = "windows")]
    {
        match run_shell_extension_task(
            helper::OPERATION_LEGACY_CONTEXT_MENU,
            vec![file_path],
        )
        .await
        {
            Ok(result) => result,
            Err(error) => {
                log::warn!("get_shell_context_menu failed: {error}");
                GetShellContextMenuResult {
                    success: false,
                    items: vec![],
                    error: Some(error),
                }
            }
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = file_path;
        GetShellContextMenuResult {
            success: false,
            items: vec![],
            error: Some("Shell context menu is only supported on Windows".to_string()),
        }
    }
}

#[tauri::command]
pub fn invoke_shell_context_menu_item(
    file_path: String,
    command_id: u32,
    command_verb: Option<String>,
) -> OpenWithResult {
    #[cfg(target_os = "windows")]
    {
        windows::invoke_shell_command(&file_path, command_id, command_verb.as_deref())
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (file_path, command_id, command_verb);
        OpenWithResult {
            success: false,
            error: Some("Shell context menu is only supported on Windows".to_string()),
        }
    }
}

#[tauri::command]
pub async fn get_modern_context_menu(file_paths: Vec<String>) -> GetShellContextMenuResult {
    #[cfg(target_os = "windows")]
    {
        match run_shell_extension_task(helper::OPERATION_MODERN_CONTEXT_MENU, file_paths).await
        {
            Ok(result) => result,
            Err(error) => {
                log::warn!("get_modern_context_menu failed: {error}");
                GetShellContextMenuResult {
                    success: false,
                    items: vec![],
                    error: Some(error),
                }
            }
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = file_paths;
        GetShellContextMenuResult {
            success: false,
            items: vec![],
            error: Some("Modern context menu is only supported on Windows".to_string()),
        }
    }
}

#[tauri::command]
pub fn open_native_properties(file_paths: Vec<String>) -> OpenWithResult {
    #[cfg(target_os = "windows")]
    {
        windows::open_native_properties_impl(&file_paths)
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = file_paths;
        OpenWithResult {
            success: false,
            error: Some("Native properties dialog is only supported on Windows".to_string()),
        }
    }
}

#[tauri::command]
pub fn invoke_modern_context_menu_item(file_paths: Vec<String>, command_id: u32) -> OpenWithResult {
    #[cfg(target_os = "windows")]
    {
        windows::invoke_modern_context_menu_item_impl(&file_paths, command_id)
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (file_paths, command_id);
        OpenWithResult {
            success: false,
            error: Some("Modern context menu is only supported on Windows".to_string()),
        }
    }
}
