<!-- SPDX-License-Identifier: GPL-3.0-or-later
License: GNU GPLv3 or later. See the license file in the project root for more information.
Copyright © 2021 - present Aleksey Hoffman. All rights reserved.
-->

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { DirEntry } from '@/types/dir-entry';
import { ContextMenuSub } from 'reka-ui';
import {
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuLabel,
  ContextMenuSubTrigger,
  ContextMenuSubContent,
} from '@/components/ui/context-menu';
import { useProjectLaunchersStore } from '@/stores/runtime/project-launchers';
import { getDirectoryPathFromEntry } from '@/utils/virtual-location-action-target';
import { isVirtualLocationPath } from '@/utils/virtual-path-constants';
import {
  FolderGit2Icon,
  CodeIcon,
  BotIcon,
  Loader2Icon,
} from '@lucide/vue';

const props = defineProps<{
  selectedEntries: DirEntry[];
}>();

const { t } = useI18n();
const projectLaunchersStore = useProjectLaunchersStore();

const projectPath = computed(() => {
  const firstEntry = props.selectedEntries[0];

  if (!firstEntry || !firstEntry.is_dir) {
    return null;
  }

  const path = getDirectoryPathFromEntry(firstEntry);

  if (!path || isVirtualLocationPath(path)) {
    return null;
  }

  return path;
});

const editors = computed(() => {
  return projectLaunchersStore.launchers.filter(launcher => launcher.kind === 'editor');
});

const agentTools = computed(() => {
  return projectLaunchersStore.launchers.filter(launcher => launcher.kind === 'agent');
});

async function handleOpenProject(launcherId: string) {
  if (!projectPath.value) return;

  await projectLaunchersStore.openProject(projectPath.value, launcherId);
}
</script>

<template>
  <ContextMenuSub>
    <ContextMenuSubTrigger class="open-project-submenu__trigger">
      <FolderGit2Icon :size="16" />
      <span>{{ t('openProject.title') }}</span>
    </ContextMenuSubTrigger>
    <ContextMenuSubContent class="open-project-submenu">
      <div
        v-if="projectLaunchersStore.hasLoaded && projectLaunchersStore.loadError"
        class="open-project-submenu__error"
      >
        {{ t('openProject.failedToDetect') }}
      </div>

      <div
        v-else-if="projectLaunchersStore.hasLoaded
          && editors.length === 0
          && agentTools.length === 0"
        class="open-project-submenu__empty"
      >
        {{ t('openProject.noLaunchers') }}
      </div>

      <div
        v-else-if="!projectLaunchersStore.hasLoaded"
        class="open-project-submenu__loading"
      >
        <Loader2Icon
          :size="16"
          class="open-project-submenu__spinner"
        />
        <span>{{ t('openProject.loading') }}</span>
      </div>

      <template v-else>
        <ContextMenuLabel
          v-if="editors.length > 0"
          class="open-project-submenu__label"
        >
          {{ t('openProject.editors') }}
        </ContextMenuLabel>
        <ContextMenuItem
          v-for="launcher in editors"
          :key="launcher.id"
          class="open-project-submenu__item"
          @select="handleOpenProject(launcher.id)"
        >
          <CodeIcon :size="16" />
          <span>{{ launcher.name }}</span>
        </ContextMenuItem>

        <ContextMenuSeparator v-if="agentTools.length > 0" />

        <ContextMenuLabel
          v-if="agentTools.length > 0"
          class="open-project-submenu__label"
        >
          {{ t('openProject.agents') }}
        </ContextMenuLabel>
        <ContextMenuItem
          v-for="launcher in agentTools"
          :key="launcher.id"
          class="open-project-submenu__item"
          @select="handleOpenProject(launcher.id)"
        >
          <BotIcon :size="16" />
          <span>{{ launcher.name }}</span>
        </ContextMenuItem>
      </template>
    </ContextMenuSubContent>
  </ContextMenuSub>
</template>

<style>
.open-project-submenu {
  min-width: 220px;
  max-width: 300px;
}

.open-project-submenu__trigger {
  display: flex;
  align-items: center;
  gap: 8px;
}

.open-project-submenu__loading {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  color: hsl(var(--muted-foreground));
  font-size: 13px;
  gap: 8px;
}

.open-project-submenu__spinner {
  animation: open-project-spin 1s linear infinite;
}

@keyframes open-project-spin {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}

.open-project-submenu__error {
  padding: 8px 12px;
  color: hsl(var(--destructive));
  font-size: 13px;
}

.open-project-submenu__empty {
  padding: 8px 12px;
  color: hsl(var(--muted-foreground));
  font-size: 13px;
}

.open-project-submenu__label {
  padding: 4px 8px;
  color: hsl(var(--muted-foreground));
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.03em;
  text-transform: uppercase;
}

.open-project-submenu__item {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
