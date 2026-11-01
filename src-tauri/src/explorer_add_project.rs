// SPDX-License-Identifier: GPL-3.0-or-later
// License: GNU GPLv3 or later. See the license file in the project root for more information.
// Copyright © 2021 - present Aleksey Hoffman. All rights reserved.

#[cfg(windows)]
use crate::default_file_manager::registry::{
    delete_registry_key_tree, read_string_value, write_string_value, write_shell_command,
};
#[cfg(windows)]
use crate::windows_installation;

#[cfg(windows)]
const MENU_KEY: &str = r"SOFTWARE\Classes\Directory\shell\SigmaAddProject";
#[cfg(windows)]
const COMMAND_KEY: &str = r"SOFTWARE\Classes\Directory\shell\SigmaAddProject\command";
#[cfg(windows)]
const MENU_TITLE: &str = "Add to Sigma File Manager projects";

#[cfg(windows)]
const MICROSOFT_STORE_UNAVAILABLE_ERROR: &str =
    "The Explorer add-project context menu is not available in the Microsoft Store version.";

#[cfg(windows)]
fn normalize_command(command: &str) -> String {
    command.trim().replace('/', "\\").to_ascii_lowercase()
}

#[cfg(windows)]
fn expected_command() -> Result<String, String> {
    let launcher_path = windows_installation::deployed_launcher_path().ok_or_else(|| {
        "Failed to resolve LOCALAPPDATA for the Explorer add-project launcher".to_string()
    })?;

    Ok(format!(
        "\"{}\" --sfm-add-project \"%1\"",
        launcher_path.to_string_lossy()
    ))
}

#[cfg(windows)]
pub(crate) fn command_key_is_owned_by_sfm() -> Result<bool, String> {
    let expected = expected_command()?;
    let command = read_string_value(COMMAND_KEY, "")?
        .map(|value| normalize_command(&value))
        .unwrap_or_default();
    let delegate_execute = read_string_value(COMMAND_KEY, "DelegateExecute")?.unwrap_or_default();

    Ok(command == normalize_command(&expected) && delegate_execute.is_empty())
}

#[cfg(windows)]
fn enable_explorer_add_project() -> Result<bool, String> {
    let expected = expected_command()?;

    if let Some(existing_command) = read_string_value(COMMAND_KEY, "")? {
        if normalize_command(&existing_command) != normalize_command(&expected) {
            return Err(
                "The Explorer context menu registry key already contains a command from another application. Refusing to overwrite it.".to_string(),
            );
        }
    }

    crate::default_file_manager::ensure_launcher_deployment()?;

    let icon_path = std::env::current_exe()
        .map(|path| path.to_string_lossy().into_owned())
        .map_err(|error| format!("Failed to resolve executable path: {error}"))?;

    write_string_value(MENU_KEY, "", MENU_TITLE)?;
    write_string_value(MENU_KEY, "Icon", &icon_path)?;
    write_shell_command(COMMAND_KEY, &expected)?;

    command_key_is_owned_by_sfm()
}

#[cfg(windows)]
fn disable_explorer_add_project() -> Result<bool, String> {
    if command_key_is_owned_by_sfm()? {
        delete_registry_key_tree(MENU_KEY)?;
    } else if crate::default_file_manager::registry::registry_key_exists(COMMAND_KEY) {
        return Err(
            "The Explorer context menu registry key contains a command from another application. Refusing to remove it.".to_string(),
        );
    } else if crate::default_file_manager::registry::registry_key_exists(MENU_KEY) {
        delete_registry_key_tree(MENU_KEY)?;
    }

    // The launcher deployment is shared with the default file manager
    // integration, so it is removed only when that integration is inactive.
    if let Ok(false) = crate::default_file_manager::is_current_default_file_manager() {
        if let Err(error) = crate::default_file_manager::remove_launcher_deployment_if_unused() {
            eprintln!("Failed to remove the Explorer add-project launcher: {error}");
        }
    }

    command_key_is_owned_by_sfm()
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;

    #[test]
    fn expected_command_references_deployed_launcher_and_add_project_flag() {
        let expected = expected_command().unwrap();

        assert!(expected.starts_with('"'));
        assert!(expected.contains("--sfm-add-project"));
        assert!(expected.ends_with("\"%1\""));
    }

    #[test]
    fn command_normalization_ignores_separator_style() {
        assert_eq!(
            normalize_command(r"C:/tools/launcher.exe --flag"),
            normalize_command(r"C:\tools\launcher.exe --flag")
        );
    }
}

#[tauri::command]
pub fn explorer_add_project_available() -> bool {
    #[cfg(windows)]
    {
        crate::default_file_manager::default_file_manager_is_supported()
    }

    #[cfg(not(windows))]
    {
        false
    }
}

#[tauri::command]
pub fn is_explorer_add_project_enabled() -> Result<bool, String> {
    #[cfg(windows)]
    {
        command_key_is_owned_by_sfm()
    }

    #[cfg(not(windows))]
    {
        Ok(false)
    }
}

#[tauri::command]
pub fn set_explorer_add_project_enabled(enabled: bool) -> Result<bool, String> {
    #[cfg(windows)]
    {
        if !crate::default_file_manager::default_file_manager_is_supported() {
            return Err(MICROSOFT_STORE_UNAVAILABLE_ERROR.to_string());
        }

        if enabled {
            enable_explorer_add_project()
        } else {
            disable_explorer_add_project()
        }
    }

    #[cfg(not(windows))]
    {
        let _ = enabled;
        Ok(false)
    }
}
