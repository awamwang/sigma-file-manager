<!-- SPDX-License-Identifier: GPL-3.0-or-later
License: GNU GPLv3 or later. See the license file in the project root for more information.
Copyright © 2021 - present Aleksey Hoffman. All rights reserved.
-->

<script setup lang="ts">
import {
  computed, markRaw, onBeforeUnmount, onMounted, ref,
} from 'vue';
import { useI18n } from 'vue-i18n';
import { FolderIcon, FolderPlusIcon, XIcon } from '@lucide/vue';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { toast, ToastStatic } from '@/components/ui/toaster';
import { useUserProjectsStore } from '@/stores/storage/user-projects';
import { formatDashboardRelativeTime } from '@/utils/dashboard-relative-time';
import {
  registerOpenProjectsPicker,
  unregisterOpenProjectsPicker,
} from '@/modules/extensions/builtin-commands';
import { useDashboardItemOpener } from '@/modules/dashboard/composables/use-dashboard-item-opener';
import type { Project } from '@/types/user-projects';

const { t } = useI18n();
const userProjectsStore = useUserProjectsStore();
const { openItem } = useDashboardItemOpener();

const isOpen = ref(false);

const dialogOpen = computed({
  get: () => isOpen.value,
  set: (value: boolean) => {
    isOpen.value = value;
  },
});

const sortedProjects = computed(() => {
  return [...userProjectsStore.projects].sort((projectA, projectB) => {
    const lastOpenedA = projectA.lastOpenedAt ?? 0;
    const lastOpenedB = projectB.lastOpenedAt ?? 0;

    if (lastOpenedA !== lastOpenedB) {
      return lastOpenedB - lastOpenedA;
    }

    return projectA.name.localeCompare(projectB.name);
  });
});

function getProjectBadgeLabel(project: Project): string {
  if (project.lastOpenedAt !== null && project.lastOpenedAt > 0) {
    return formatDashboardRelativeTime(project.lastOpenedAt, (key, count) => {
      return count === undefined ? t(key) : t(key, count);
    });
  }

  return t('dashboard.projectNeverOpened');
}

function getProjectItemValue(project: Project): string {
  return `${project.name} ${project.path}`;
}

function open() {
  isOpen.value = true;
}

function close() {
  isOpen.value = false;
}

async function openProject(project: Project) {
  close();
  await userProjectsStore.recordProjectOpened(project.path);
  openItem(project.path, false);
}

function removeProject(project: Project) {
  void userProjectsStore.removeProject(project.path);

  toast.custom(markRaw(ToastStatic), {
    componentProps: {
      data: {
        title: t('projectsPicker.removed', { name: project.name }),
        description: '',
      },
    },
  });
}

onMounted(() => {
  registerOpenProjectsPicker(open);
});

onBeforeUnmount(() => {
  unregisterOpenProjectsPicker();
});
</script>

<template>
  <CommandDialog
    v-model:open="dialogOpen"
    command-reset-search-term-on-blur
    :accessible-title="t('projectsPicker.title')"
    :accessible-description="t('projectsPicker.searchPlaceholder')"
  >
    <CommandInput :placeholder="t('projectsPicker.searchPlaceholder')" />
    <CommandList>
      <div
        v-if="sortedProjects.length === 0"
        class="projects-quick-picker__empty"
      >
        <FolderPlusIcon
          :size="32"
          class="projects-quick-picker__empty-icon"
        />
        <p class="projects-quick-picker__empty-title">
          {{ t('projectsPicker.emptyTitle') }}
        </p>
        <p class="projects-quick-picker__empty-description">
          {{ t('projectsPicker.emptyDescription') }}
        </p>
      </div>
      <template v-else>
        <CommandEmpty>{{ t('projectsPicker.noResults') }}</CommandEmpty>
        <CommandGroup :heading="t('dashboard.tabs.projects')">
          <CommandItem
            v-for="project in sortedProjects"
            :key="project.id"
            :value="getProjectItemValue(project)"
            @select="openProject(project)"
          >
            <FolderIcon
              :size="16"
              class="projects-quick-picker__icon"
            />
            <span class="projects-quick-picker__name">{{ project.name }}</span>
            <span class="projects-quick-picker__path">{{ project.path }}</span>
            <span class="projects-quick-picker__badge">
              {{ getProjectBadgeLabel(project) }}
            </span>
            <Tooltip>
              <TooltipTrigger as-child>
                <Button
                  variant="ghost"
                  size="icon"
                  class="projects-quick-picker__remove"
                  :aria-label="t('projectsPicker.remove')"
                  @click.stop="removeProject(project)"
                  @keydown.stop
                >
                  <XIcon :size="14" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {{ t('projectsPicker.remove') }}
              </TooltipContent>
            </Tooltip>
          </CommandItem>
        </CommandGroup>
      </template>
    </CommandList>
  </CommandDialog>
</template>

<style>
.projects-quick-picker__icon {
  flex-shrink: 0;
  color: hsl(var(--primary));
}

.projects-quick-picker__name {
  overflow: hidden;
  max-width: 40%;
  flex-shrink: 0;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.projects-quick-picker__path {
  overflow: hidden;
  min-width: 0;
  flex: 1;
  color: hsl(var(--muted-foreground));
  text-overflow: ellipsis;
  white-space: nowrap;
}

.projects-quick-picker__badge {
  flex-shrink: 0;
  color: hsl(var(--muted-foreground));
  font-size: 0.75rem;
}

.projects-quick-picker__remove {
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.sigma-ui-command-item:hover .projects-quick-picker__remove,
.sigma-ui-command-item[data-highlighted] .projects-quick-picker__remove {
  opacity: 1;
}

.projects-quick-picker__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 36px 24px;
  color: hsl(var(--muted-foreground));
  gap: 8px;
  text-align: center;
}

.projects-quick-picker__empty-icon {
  margin-bottom: 6px;
}

.projects-quick-picker__empty-title {
  color: hsl(var(--foreground));
  font-size: 0.9375rem;
}

.projects-quick-picker__empty-description {
  max-width: 380px;
  font-size: 0.8125rem;
  line-height: 1.4;
}
</style>
