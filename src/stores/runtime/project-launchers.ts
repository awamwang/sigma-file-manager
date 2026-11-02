// SPDX-License-Identifier: GPL-3.0-or-later
// License: GNU GPLv3 or later. See the license file in the project root for more information.
// Copyright © 2021 - present Aleksey Hoffman. All rights reserved.

import { defineStore } from 'pinia';
import { ref } from 'vue';
import { invoke } from '@tauri-apps/api/core';

export type ProjectLauncherKind = 'editor' | 'agent';

export type ProjectLauncherOpenMode = 'directory' | 'project-file';

export interface ProjectLauncherInfo {
  id: string;
  name: string;
  kind: ProjectLauncherKind;
  openMode: ProjectLauncherOpenMode;
  path: string | null;
  macosAppName: string | null;
}

interface GetAvailableProjectLaunchersResult {
  success: boolean;
  launchers: ProjectLauncherInfo[];
  error: string | null;
}

interface OpenProjectResult {
  success: boolean;
  error: string | null;
}

export const useProjectLaunchersStore = defineStore('projectLaunchers', () => {
  const launchers = ref<ProjectLauncherInfo[]>([]);
  const loadError = ref<string | null>(null);
  const hasLoaded = ref(false);

  async function init() {
    loadError.value = null;

    try {
      const result = await invoke<GetAvailableProjectLaunchersResult>('get_available_project_launchers');

      if (result.success) {
        launchers.value = result.launchers;
        hasLoaded.value = true;
      }
      else {
        loadError.value = result.error || 'Failed to detect project launchers';
        hasLoaded.value = true;
      }
    }
    catch (invokeError) {
      loadError.value = String(invokeError);
      hasLoaded.value = true;
    }
  }

  async function openProject(projectPath: string, launcherId: string) {
    try {
      const result = await invoke<OpenProjectResult>('open_project_with_launcher', {
        launcherId,
        projectPath,
      });

      if (!result.success) {
        console.error('Failed to open project:', result.error);
      }
    }
    catch (invokeError) {
      console.error('Failed to open project:', invokeError);
    }
  }

  return {
    launchers,
    loadError,
    hasLoaded,
    init,
    openProject,
  };
});
