// SPDX-License-Identifier: GPL-3.0-or-later
// License: GNU GPLv3 or later. See the license file in the project root for more information.
// Copyright © 2021 - present Aleksey Hoffman. All rights reserved.

import { useRouter } from 'vue-router';
import { useWorkspacesStore } from '@/stores/storage/workspaces';
import { useUserProjectsStore } from '@/stores/storage/user-projects';
import type { Project } from '@/types/user-projects';
import { getProjectPrimaryPath } from '@/types/user-projects';

export function useProjectLinkOpener() {
  const router = useRouter();
  const workspacesStore = useWorkspacesStore();
  const userProjectsStore = useUserProjectsStore();

  async function openPathInNavigator(path: string, options?: { activateProjectId?: string }) {
    if (!path) {
      return;
    }

    if (options?.activateProjectId) {
      await userProjectsStore.recordProjectOpened(options.activateProjectId);
    }

    await workspacesStore.openOrFocusTabGroup(path);
    await router.push({ name: 'navigator' });
  }

  async function openProjectPrimary(project: Project) {
    const path = getProjectPrimaryPath(project);
    await openPathInNavigator(path, { activateProjectId: project.id });
  }

  async function openAllWorkspaceLinks(project: Project) {
    await userProjectsStore.recordProjectOpened(project.id);

    for (const link of project.workspaceLinks) {
      await workspacesStore.openOrFocusTabGroup(link.path);
    }

    if (project.workspaceLinks.length > 0) {
      await router.push({ name: 'navigator' });
    }
  }

  return {
    openPathInNavigator,
    openProjectPrimary,
    openAllWorkspaceLinks,
  };
}
