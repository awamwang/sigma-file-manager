<!-- SPDX-License-Identifier: GPL-3.0-or-later
License: GNU GPLv3 or later. See the license file in the project root for more information.
Copyright © 2021 - present Aleksey Hoffman. All rights reserved.
-->

<script setup lang="ts">
import { computed, markRaw } from 'vue';
import { useI18n } from 'vue-i18n';
import { CheckIcon, FolderKanbanIcon } from '@lucide/vue';
import { ContextMenuSub } from 'reka-ui';
import {
  ContextMenuItem,
  ContextMenuSubTrigger,
  ContextMenuSubContent,
} from '@/components/ui/context-menu';
import { toast, ToastStatic } from '@/components/ui/toaster';
import type { DirEntry } from '@/types/dir-entry';
import { useUserProjectsStore } from '@/stores/storage/user-projects';
import { getDirectoryPathFromEntry } from '@/utils/virtual-location-action-target';
import { isVirtualLocationPath } from '@/utils/virtual-path-constants';
import normalizePath from '@/utils/normalize-path';

const props = defineProps<{
  selectedEntries: DirEntry[];
}>();

const { t } = useI18n();
const userProjectsStore = useUserProjectsStore();

const directoryPath = computed(() => {
  const firstEntry = props.selectedEntries[0];

  if (!firstEntry?.is_dir) {
    return null;
  }

  const path = getDirectoryPathFromEntry(firstEntry);

  if (!path || isVirtualLocationPath(path)) {
    return null;
  }

  return normalizePath(path);
});

const projects = computed(() => userProjectsStore.projects);

function isAttached(projectId: string): boolean {
  if (!directoryPath.value) {
    return false;
  }

  const project = userProjectsStore.getProjectById(projectId);
  return Boolean(
    project?.workspaceLinks.some(link => normalizePath(link.path) === directoryPath.value),
  );
}

async function attachToProject(projectId: string, event?: Event) {
  event?.preventDefault();

  if (!directoryPath.value) {
    return;
  }

  if (isAttached(projectId)) {
    const project = userProjectsStore.getProjectById(projectId);
    const link = project?.workspaceLinks.find(
      item => normalizePath(item.path) === directoryPath.value,
    );

    if (project && link) {
      await userProjectsStore.removeWorkspaceLink(project.id, link.id);
      toast.custom(markRaw(ToastStatic), {
        componentProps: {
          data: {
            title: t('projectsPage.detachedFromProject', { name: project.name }),
            description: '',
          },
        },
      });
    }

    return;
  }

  const link = await userProjectsStore.addWorkspaceLink(projectId, directoryPath.value);
  const project = userProjectsStore.getProjectById(projectId);

  if (!link || !project) {
    toast.custom(markRaw(ToastStatic), {
      componentProps: {
        data: {
          title: t('projectsPage.attachFailed'),
          description: t('projectsPage.attachFailedDescription'),
        },
      },
    });
    return;
  }

  toast.custom(markRaw(ToastStatic), {
    componentProps: {
      data: {
        title: t('projectsPage.attachedToProject', { name: project.name }),
        description: '',
      },
    },
  });
}

async function createProjectFromFolder(event?: Event) {
  event?.preventDefault();

  if (!directoryPath.value) {
    return;
  }

  const project = await userProjectsStore.createProject({ path: directoryPath.value });
  toast.custom(markRaw(ToastStatic), {
    componentProps: {
      data: {
        title: t('projectsPage.createdFromFolder', { name: project.name }),
        description: '',
      },
    },
  });
}
</script>

<template>
  <ContextMenuSub v-if="directoryPath">
    <ContextMenuSubTrigger class="attach-to-project-submenu__trigger">
      <FolderKanbanIcon :size="16" />
      <span>{{ t('fileBrowser.actions.attachToProject') }}</span>
    </ContextMenuSubTrigger>
    <ContextMenuSubContent class="attach-to-project-submenu">
      <ContextMenuItem
        class="attach-to-project-submenu__item"
        @select="createProjectFromFolder($event)"
      >
        <span class="attach-to-project-submenu__check-spacer" />
        <span>{{ t('projectsPage.createFromFolder') }}</span>
      </ContextMenuItem>
      <ContextMenuItem
        v-for="project in projects"
        :key="project.id"
        class="attach-to-project-submenu__item"
        @select="attachToProject(project.id, $event)"
      >
        <CheckIcon
          v-if="isAttached(project.id)"
          :size="16"
        />
        <span
          v-else
          class="attach-to-project-submenu__check-spacer"
        />
        <span>{{ project.name }}</span>
      </ContextMenuItem>
    </ContextMenuSubContent>
  </ContextMenuSub>
</template>

<style>
.attach-to-project-submenu {
  min-width: 220px;
  max-width: 320px;
}

.attach-to-project-submenu__trigger,
.attach-to-project-submenu__item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.attach-to-project-submenu__check-spacer {
  width: 16px;
  height: 16px;
}
</style>
