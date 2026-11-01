<!-- SPDX-License-Identifier: GPL-3.0-or-later
License: GNU GPLv3 or later. See the license file in the project root for more information.
Copyright © 2021 - present Aleksey Hoffman. All rights reserved.
-->

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { XIcon } from '@lucide/vue';
import { DirEntryInteractive } from '@/components/dir-entry-interactive';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useUserProjectsStore } from '@/stores/storage/user-projects';
import { formatDashboardRelativeTime } from '@/utils/dashboard-relative-time';
import {
  DASHBOARD_CARD_ENTRANCE,
  getDashboardContentEntranceBinding,
  getStaggerSlideUpBinding,
} from '@/utils/stagger-animation';
import DashboardActionBar from '@/modules/dashboard/components/dashboard-action-bar.vue';
import DashboardEmptyState from '@/modules/dashboard/components/dashboard-empty-state.vue';
import DashboardOpenFolderButton from '@/modules/dashboard/components/dashboard-open-folder-button.vue';
import EntryCard from '@/modules/dashboard/components/entry-card.vue';
import { useDashboardItemOpener } from '@/modules/dashboard/composables/use-dashboard-item-opener';
import type { Project } from '@/types/user-projects';

const { t } = useI18n();
const dashboardContentEntrance = getDashboardContentEntranceBinding();
const userProjectsStore = useUserProjectsStore();
const { openItem } = useDashboardItemOpener();

const projects = computed(() => userProjectsStore.projects);

function formatRelativeTime(timestamp: number): string {
  return formatDashboardRelativeTime(timestamp, (key, count) => {
    return count === undefined ? t(key) : t(key, count);
  });
}

function getProjectBadgeLabel(project: Project): string {
  if (project.lastOpenedAt !== null && project.lastOpenedAt > 0) {
    return formatRelativeTime(project.lastOpenedAt);
  }

  return t('dashboard.projectNeverOpened');
}

async function openProject(project: Project) {
  await userProjectsStore.recordProjectOpened(project.path);
  openItem(project.path, false);
}
</script>

<template>
  <DashboardActionBar
    :title="t('dashboard.tabs.projects')"
    :is-empty="projects.length === 0"
    @clear-all="userProjectsStore.clearAllProjects()"
  />
  <DashboardEmptyState
    v-if="projects.length === 0"
    v-bind="dashboardContentEntrance"
    type="projects"
    :title="t('dashboard.emptyProjects')"
    :description="t('dashboard.emptyProjectsDescription')"
  />
  <div
    v-else
    v-bind="dashboardContentEntrance"
    class="dashboard-page__items-grid"
  >
    <DirEntryInteractive
      v-for="(project, projectIndex) in projects"
      :key="project.id"
      :path="project.path"
      :is-file="false"
    >
      <EntryCard
        v-bind="getStaggerSlideUpBinding(projectIndex, DASHBOARD_CARD_ENTRANCE)"
        :path="project.path"
        :is-file="false"
        @click="openProject(project)"
      >
        <span class="entry-card__time">{{ getProjectBadgeLabel(project) }}</span>
        <template #actions>
          <Tooltip>
            <TooltipTrigger as-child>
              <Button
                variant="ghost"
                size="icon"
                class="entry-card__action dashboard-page__remove-action"
                :aria-label="t('dashboard.actions.confirmRemove')"
                @click="userProjectsStore.removeProject(project.path)"
              >
                <XIcon :size="14" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {{ t('dashboard.actions.confirmRemove') }}
            </TooltipContent>
          </Tooltip>
          <DashboardOpenFolderButton :path="project.path" />
        </template>
      </EntryCard>
    </DirEntryInteractive>
  </div>
</template>
