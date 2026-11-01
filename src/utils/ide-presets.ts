// SPDX-License-Identifier: GPL-3.0-or-later
// License: GNU GPLv3 or later. See the license file in the project root for more information.
// Copyright © 2021 - present Aleksey Hoffman. All rights reserved.

import { invoke } from '@tauri-apps/api/core';

export interface IdePreset {
  id: string;
  name: string;
  command: string;
}

export interface DetectedIdePreset extends IdePreset {
  programPath: string;
}

// Probed against the system PATH to surface built-in "Open with" entries.
// Windows-specific launcher names (idea64) and their unix counterparts (idea)
// are both listed; only the installed one resolves.
export const IDE_PRESETS: IdePreset[] = [
  {
    id: 'vscode',
    name: 'Visual Studio Code',
    command: 'code',
  },
  {
    id: 'cursor',
    name: 'Cursor',
    command: 'cursor',
  },
  {
    id: 'windsurf',
    name: 'Windsurf',
    command: 'windsurf',
  },
  {
    id: 'idea',
    name: 'IntelliJ IDEA',
    command: 'idea64',
  },
  {
    id: 'idea',
    name: 'IntelliJ IDEA',
    command: 'idea',
  },
  {
    id: 'webstorm',
    name: 'WebStorm',
    command: 'webstorm64',
  },
  {
    id: 'webstorm',
    name: 'WebStorm',
    command: 'webstorm',
  },
];

export async function detectIdePresets(): Promise<DetectedIdePreset[]> {
  const results = await Promise.all(IDE_PRESETS.map(async (preset) => {
    try {
      const programPath = await invoke<string | null>('resolve_command_in_path', {
        command: preset.command,
      });

      return programPath
        ? {
            ...preset,
            programPath,
          }
        : null;
    }
    catch (error) {
      console.warn(`[ide-presets] Failed to resolve command "${preset.command}":`, error);
      return null;
    }
  }));

  return results.filter((preset): preset is DetectedIdePreset => preset !== null);
}
