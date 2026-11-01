// SPDX-License-Identifier: GPL-3.0-or-later
// License: GNU GPLv3 or later. See the license file in the project root for more information.
// Copyright © 2021 - present Aleksey Hoffman. All rights reserved.

import { invoke } from '@tauri-apps/api/core';

export async function isExplorerAddProjectEnabled(): Promise<boolean> {
  return await invoke<boolean>('is_explorer_add_project_enabled');
}

export async function setExplorerAddProjectEnabled(enabled: boolean): Promise<boolean> {
  return await invoke<boolean>('set_explorer_add_project_enabled', { enabled });
}
