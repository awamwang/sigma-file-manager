// SPDX-License-Identifier: GPL-3.0-or-later
// License: GNU GPLv3 or later. See the license file in the project root for more information.
// Copyright © 2021 - present Aleksey Hoffman. All rights reserved.

use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProjectLauncherInfo {
    pub id: String,
    pub name: String,
    pub kind: ProjectLauncherKind,
    pub open_mode: ProjectLauncherOpenMode,
    /// Resolved executable path used to spawn the launcher directly.
    /// `None` on macOS when the launcher is started through `open -a`.
    pub path: Option<String>,
    /// macOS application name used with `open -a`.
    pub macos_app_name: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum ProjectLauncherKind {
    Editor,
    Agent,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum ProjectLauncherOpenMode {
    /// The launcher accepts a project directory directly.
    Directory,
    /// The launcher only opens files, so a representative file from the
    /// project directory is passed instead (e.g. Qoder CN Agent Workbench).
    ProjectFile,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetAvailableProjectLaunchersResult {
    pub success: bool,
    pub launchers: Vec<ProjectLauncherInfo>,
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenProjectResult {
    pub success: bool,
    pub error: Option<String>,
}
