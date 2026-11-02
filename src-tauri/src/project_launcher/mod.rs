// SPDX-License-Identifier: GPL-3.0-or-later
// License: GNU GPLv3 or later. See the license file in the project root for more information.
// Copyright © 2021 - present Aleksey Hoffman. All rights reserved.

mod types;

pub use types::{
    GetAvailableProjectLaunchersResult, OpenProjectResult, ProjectLauncherInfo,
    ProjectLauncherKind, ProjectLauncherOpenMode,
};

use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

/// Editor definitions probed against the system PATH with optional
/// well-known installation directories as fallback.
struct EditorDefinition {
    id: &'static str,
    name: &'static str,
    /// Launcher commands probed in order against the system PATH.
    commands: &'static [&'static str],
    /// Well-known installation directories probed in order (Windows).
    #[cfg(target_os = "windows")]
    known_paths: &'static [&'static str],
    #[cfg(not(target_os = "windows"))]
    _known_paths: &'static [&'static str],
    /// macOS application name started with `open -a`.
    #[cfg(target_os = "macos")]
    macos_app_name: &'static str,
    #[cfg(not(target_os = "macos"))]
    _macos_app_name: &'static str,
}

const EDITOR_DEFINITIONS: &[EditorDefinition] = &[
    EditorDefinition {
        id: "vscode",
        name: "Visual Studio Code",
        commands: &["code"],
        #[cfg(target_os = "windows")]
        known_paths: &[r"%LOCALAPPDATA%\Programs\Microsoft VS Code\Code.exe"],
        #[cfg(not(target_os = "windows"))]
        _known_paths: &[],
        #[cfg(target_os = "macos")]
        macos_app_name: "Visual Studio Code",
        #[cfg(not(target_os = "macos"))]
        _macos_app_name: "",
    },
    EditorDefinition {
        id: "cursor",
        name: "Cursor",
        commands: &["cursor"],
        #[cfg(target_os = "windows")]
        known_paths: &[r"%LOCALAPPDATA%\Programs\cursor\Cursor.exe"],
        #[cfg(not(target_os = "windows"))]
        _known_paths: &[],
        #[cfg(target_os = "macos")]
        macos_app_name: "Cursor",
        #[cfg(not(target_os = "macos"))]
        _macos_app_name: "",
    },
    EditorDefinition {
        id: "windsurf",
        name: "Windsurf",
        commands: &["windsurf"],
        #[cfg(target_os = "windows")]
        known_paths: &[r"%LOCALAPPDATA%\Programs\Windsurf\Windsurf.exe"],
        #[cfg(not(target_os = "windows"))]
        _known_paths: &[],
        #[cfg(target_os = "macos")]
        macos_app_name: "Windsurf",
        #[cfg(not(target_os = "macos"))]
        _macos_app_name: "",
    },
    EditorDefinition {
        id: "idea",
        name: "IntelliJ IDEA",
        commands: &["idea64", "idea"],
        #[cfg(target_os = "windows")]
        known_paths: &[],
        #[cfg(not(target_os = "windows"))]
        _known_paths: &[],
        #[cfg(target_os = "macos")]
        macos_app_name: "IntelliJ IDEA",
        #[cfg(not(target_os = "macos"))]
        _macos_app_name: "",
    },
    EditorDefinition {
        id: "webstorm",
        name: "WebStorm",
        commands: &["webstorm64", "webstorm"],
        #[cfg(target_os = "windows")]
        known_paths: &[],
        #[cfg(not(target_os = "windows"))]
        _known_paths: &[],
        #[cfg(target_os = "macos")]
        macos_app_name: "WebStorm",
        #[cfg(not(target_os = "macos"))]
        _macos_app_name: "",
    },
];

#[tauri::command]
pub async fn get_available_project_launchers() -> GetAvailableProjectLaunchersResult {
    tauri::async_runtime::spawn_blocking(detect_launchers)
        .await
        .unwrap_or_else(|join_error| GetAvailableProjectLaunchersResult {
            success: false,
            launchers: vec![],
            error: Some(format!("Failed to detect project launchers: {join_error}")),
        })
}

#[tauri::command]
pub async fn open_project_with_launcher(
    launcher_id: String,
    project_path: String,
) -> OpenProjectResult {
    tauri::async_runtime::spawn_blocking(move || {
        open_project_with_launcher_impl(&launcher_id, &project_path)
    })
    .await
    .unwrap_or_else(|join_error| OpenProjectResult {
        success: false,
        error: Some(format!("Failed to open project: {join_error}")),
    })
}

fn detect_launchers() -> GetAvailableProjectLaunchersResult {
    let mut launchers: Vec<ProjectLauncherInfo> = Vec::new();

    for definition in EDITOR_DEFINITIONS {
        if let Some(launcher) = detect_editor(definition) {
            launchers.push(launcher);
        }
    }

    if let Some(launcher) = detect_qoder_cn() {
        launchers.push(launcher);
    }

    GetAvailableProjectLaunchersResult {
        success: true,
        launchers,
        error: None,
    }
}

fn detect_editor(definition: &EditorDefinition) -> Option<ProjectLauncherInfo> {
    for command in definition.commands {
        if let Some(path) = crate::extensions::processes::resolve_from_system_path(command) {
            return Some(ProjectLauncherInfo {
                id: definition.id.to_string(),
                name: definition.name.to_string(),
                kind: ProjectLauncherKind::Editor,
                open_mode: ProjectLauncherOpenMode::Directory,
                path: Some(path.to_string_lossy().to_string()),
                macos_app_name: None,
            });
        }
    }

    #[cfg(target_os = "windows")]
    {
        for known_path in definition.known_paths {
            if let Some(path) = resolve_known_path(known_path) {
                return Some(ProjectLauncherInfo {
                    id: definition.id.to_string(),
                    name: definition.name.to_string(),
                    kind: ProjectLauncherKind::Editor,
                    open_mode: ProjectLauncherOpenMode::Directory,
                    path: Some(path.to_string_lossy().to_string()),
                    macos_app_name: None,
                });
            }
        }
    }

    #[cfg(target_os = "macos")]
    {
        let applications_path = Path::new("/Applications").join(format!(
            "{}.app",
            definition.macos_app_name
        ));
        if applications_path.exists() {
            return Some(ProjectLauncherInfo {
                id: definition.id.to_string(),
                name: definition.name.to_string(),
                kind: ProjectLauncherKind::Editor,
                open_mode: ProjectLauncherOpenMode::Directory,
                path: None,
                macos_app_name: Some(definition.macos_app_name.to_string()),
            });
        }
    }

    None
}

/// Detects the Qoder CN Agent Workbench. The application cannot open project
/// directories directly, so a representative file from the project is passed
/// instead (see `ProjectLauncherOpenMode::ProjectFile`).
fn detect_qoder_cn() -> Option<ProjectLauncherInfo> {
    #[cfg(target_os = "windows")]
    {
        let path = detect_qoder_cn_windows()?;
        Some(ProjectLauncherInfo {
            id: "qoder-cn".to_string(),
            name: "Qoder CN".to_string(),
            kind: ProjectLauncherKind::Agent,
            open_mode: ProjectLauncherOpenMode::ProjectFile,
            path: Some(path.to_string_lossy().to_string()),
            macos_app_name: None,
        })
    }

    #[cfg(target_os = "macos")]
    {
        let applications_path = Path::new("/Applications/Qoder CN.app");
        if !applications_path.exists() {
            return None;
        }

        Some(ProjectLauncherInfo {
            id: "qoder-cn".to_string(),
            name: "Qoder CN".to_string(),
            kind: ProjectLauncherKind::Agent,
            open_mode: ProjectLauncherOpenMode::ProjectFile,
            path: None,
            macos_app_name: Some("Qoder CN".to_string()),
        })
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        None
    }
}

#[cfg(target_os = "windows")]
fn detect_qoder_cn_windows() -> Option<PathBuf> {
    let install_root = known_path_root(r"%LOCALAPPDATA%\Programs\Qoder CN")?;

    let stable_launcher = install_root.join("Qoder CN.exe");
    if stable_launcher.is_file() {
        return Some(stable_launcher);
    }

    // Fallback: the versioned application copies managed by the updater.
    let versions_root = install_root.join(".qoder-versions");
    let entries = fs::read_dir(&versions_root).ok()?;

    let mut best: Option<(Vec<u64>, PathBuf)> = None;

    for entry in entries.filter_map(|entry| entry.ok()) {
        let version = entry.file_name().to_string_lossy().to_string();
        let Some(version_numbers) = parse_version_segments(&version) else {
            continue;
        };

        let executable = entry.path().join("Qoder CN.exe");
        if !executable.is_file() {
            continue;
        }

        if best
            .as_ref()
            .is_none_or(|(best_version, _)| version_numbers > *best_version)
        {
            best = Some((version_numbers, executable));
        }
    }

    best.map(|(_, path)| path)
}

#[cfg(target_os = "windows")]
fn resolve_known_path(known_path: &str) -> Option<PathBuf> {
    let path = known_path_root(known_path)?;
    if path.is_file() {
        Some(path)
    }
    else {
        None
    }
}

#[cfg(target_os = "windows")]
fn known_path_root(known_path: &str) -> Option<PathBuf> {
    if let Some(rest) = known_path.strip_prefix(r"%LOCALAPPDATA%\") {
        let local_app_data = std::env::var("LOCALAPPDATA").ok()?;
        return Some(Path::new(&local_app_data).join(rest));
    }

    if let Some(rest) = known_path.strip_prefix(r"%APPDATA%\") {
        let app_data = std::env::var("APPDATA").ok()?;
        return Some(Path::new(&app_data).join(rest));
    }

    if let Some(rest) = known_path.strip_prefix(r"%PROGRAMFILES%\") {
        let program_files = std::env::var("PROGRAMFILES").ok()?;
        return Some(Path::new(&program_files).join(rest));
    }

    Some(PathBuf::from(known_path))
}

#[cfg(target_os = "windows")]
fn parse_version_segments(version: &str) -> Option<Vec<u64>> {
    if version.is_empty() {
        return None;
    }

    let mut numbers = Vec::new();

    for segment in version.split('.') {
        let number = segment.parse::<u64>().ok()?;
        numbers.push(number);
    }

    Some(numbers)
}

fn open_project_with_launcher_impl(launcher_id: &str, project_path: &str) -> OpenProjectResult {
    let project = Path::new(project_path);

    if !project.exists() || !project.is_dir() {
        return OpenProjectResult {
            success: false,
            error: Some(format!("Project directory not found: {project_path}")),
        };
    }

    let detection = detect_launchers();
    let Some(launcher) = detection
        .launchers
        .iter()
        .find(|launcher| launcher.id == launcher_id)
    else {
        return OpenProjectResult {
            success: false,
            error: Some(format!("Project launcher not found: {launcher_id}")),
        };
    };

    let open_target = match launcher.open_mode {
        ProjectLauncherOpenMode::Directory => project.to_path_buf(),
        ProjectLauncherOpenMode::ProjectFile => {
            pick_project_file(project).unwrap_or_else(|| project.to_path_buf())
        }
    };

    spawn_launcher(launcher, &open_target, project)
}

/// Picks a representative file from the project directory for launchers that
/// cannot open directories directly. Preference order: README, package.json,
/// then the first non-hidden file.
fn pick_project_file(project: &Path) -> Option<PathBuf> {
    let entries = fs::read_dir(project).ok()?;

    let mut readme_file: Option<PathBuf> = None;
    let mut manifest_file: Option<PathBuf> = None;
    let mut first_file: Option<PathBuf> = None;

    for entry in entries.filter_map(|entry| entry.ok()) {
        let file_name = entry.file_name().to_string_lossy().to_string();

        if file_name.starts_with('.') {
            continue;
        }

        let entry_path = entry.path();
        if !entry_path.is_file() {
            continue;
        }

        let lowercased_name = file_name.to_lowercase();

        if readme_file.is_none() && lowercased_name.starts_with("readme.") {
            readme_file = Some(entry_path);
        }
        else if manifest_file.is_none() && lowercased_name == "package.json" {
            manifest_file = Some(entry_path);
        }
        else if first_file.is_none() {
            first_file = Some(entry_path);
        }
    }

    readme_file
        .or(manifest_file)
        .or(first_file)
}

fn spawn_launcher(
    launcher: &ProjectLauncherInfo,
    open_target: &Path,
    project: &Path,
) -> OpenProjectResult {
    #[cfg(target_os = "macos")]
    {
        if let Some(app_name) = &launcher.macos_app_name {
            return spawn_result(
                Command::new("open")
                    .arg("-a")
                    .arg(app_name)
                    .arg(open_target)
                    .current_dir(project)
                    .spawn(),
            );
        }

        if let Some(path) = &launcher.path {
            return spawn_result(
                Command::new(path)
                    .arg(open_target)
                    .current_dir(project)
                    .spawn(),
            );
        }

        OpenProjectResult {
            success: false,
            error: Some(format!("Project launcher has no executable: {}", launcher.id)),
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        let Some(path) = &launcher.path else {
            return OpenProjectResult {
                success: false,
                error: Some(format!("Project launcher has no executable: {}", launcher.id)),
            };
        };

        let mut command = Command::new(path);
        command.arg(open_target);

        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            const DETACHED_PROCESS: u32 = 0x00000008;
            command.creation_flags(DETACHED_PROCESS);
        }

        if let Some(parent_directory) = open_target.parent() {
            if parent_directory.exists() {
                command.current_dir(parent_directory);
            }
        }
        else if project.exists() {
            command.current_dir(project);
        }

        spawn_result(command.spawn())
    }
}

fn spawn_result(spawn_result: std::io::Result<std::process::Child>) -> OpenProjectResult {
    match spawn_result {
        Ok(_) => OpenProjectResult {
            success: true,
            error: None,
        },
        Err(error) => OpenProjectResult {
            success: false,
            error: Some(format!("Failed to start project launcher: {error}")),
        },
    }
}

#[cfg(all(test, target_os = "windows"))]
mod tests {
    use super::*;

    #[test]
    fn parse_version_segments_parses_dotted_numbers() {
        assert_eq!(
            parse_version_segments("0.5.1"),
            Some(vec![0, 5, 1])
        );
        assert_eq!(parse_version_segments("0.4.11"), Some(vec![0, 4, 11]));
        assert_eq!(parse_version_segments("not-a-version"), None);
        assert_eq!(parse_version_segments(""), None);
    }

    #[test]
    fn version_segments_compare_numerically() {
        let older = parse_version_segments("0.4.9").unwrap();
        let newer = parse_version_segments("0.4.11").unwrap();
        assert!(newer > older);
    }
}
