<!-- SPDX-License-Identifier: GPL-3.0-or-later
License: GNU GPLv3 or later. See the license file in the project root for more information.
Copyright © 2021 - present Aleksey Hoffman. All rights reserved.
-->

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { ExternalLinkIcon, PlusIcon } from '@lucide/vue';
import { Button } from '@/components/ui/button';
import type { Project, ProjectTask, ProjectTaskStatusId } from '@/types/user-projects';
import { PROJECT_TASK_STATUS_IDS } from '@/types/user-projects';

const props = defineProps<{
  project: Project;
}>();

const emit = defineEmits<{
  add: [];
  edit: [task: ProjectTask];
}>();

const { t } = useI18n();

const sortedTasks = computed(() => {
  const statusOrder = new Map(
    PROJECT_TASK_STATUS_IDS.map((statusId, index) => [statusId, index]),
  );

  return [...props.project.tasks].sort((left, right) => {
    const statusDelta = (statusOrder.get(left.statusId) ?? 0) - (statusOrder.get(right.statusId) ?? 0);

    if (statusDelta !== 0) {
      return statusDelta;
    }

    return left.sortKey - right.sortKey || left.createdAt - right.createdAt;
  });
});

function getWorkspaceLinkLabel(task: ProjectTask): string | null {
  if (!task.workspaceLinkId) {
    return null;
  }

  return props.project.workspaceLinks.find(link => link.id === task.workspaceLinkId)?.label ?? null;
}

function statusLabel(statusId: ProjectTaskStatusId): string {
  return t(`projectsPage.status.${statusId}`);
}
</script>

<template>
  <div class="project-task-list">
    <div class="project-task-list__header">
      <h3>{{ t('projectsPage.tasks') }}</h3>
      <Button
        size="sm"
        variant="outline"
        @click="emit('add')"
      >
        <PlusIcon :size="14" />
        {{ t('projectsPage.addTask') }}
      </Button>
    </div>

    <p
      v-if="sortedTasks.length === 0"
      class="project-task-list__empty"
    >
      {{ t('projectsPage.emptyTasks') }}
    </p>

    <ul
      v-else
      class="project-task-list__items"
    >
      <li
        v-for="task in sortedTasks"
        :key="task.id"
      >
        <button
          type="button"
          class="project-task-list__item"
          @click="emit('edit', task)"
        >
          <span class="project-task-list__status">{{ statusLabel(task.statusId) }}</span>
          <span class="project-task-list__title">{{ task.title }}</span>
          <span
            v-if="getWorkspaceLinkLabel(task)"
            class="project-task-list__meta"
          >
            {{ getWorkspaceLinkLabel(task) }}
          </span>
          <a
            v-if="task.outcomeUrl"
            class="project-task-list__link"
            :href="task.outcomeUrl"
            target="_blank"
            rel="noreferrer"
            @click.stop
          >
            <ExternalLinkIcon :size="12" />
          </a>
        </button>
      </li>
    </ul>
  </div>
</template>

<style>
.project-task-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.project-task-list__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.project-task-list__header h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
}

.project-task-list__empty {
  margin: 0;
  color: hsl(var(--muted-foreground));
  font-size: 13px;
}

.project-task-list__items {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.project-task-list__item {
  display: grid;
  grid-template-columns: 88px minmax(0, 1fr) auto auto;
  gap: 10px;
  align-items: center;
  width: 100%;
  padding: 10px 12px;
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
  background: hsl(var(--background) / 0.5);
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.project-task-list__status {
  color: hsl(var(--muted-foreground));
  font-size: 12px;
  font-weight: 600;
}

.project-task-list__title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 600;
}

.project-task-list__meta,
.project-task-list__link {
  color: hsl(var(--muted-foreground));
  font-size: 12px;
}

.project-task-list__link {
  display: inline-flex;
  align-items: center;
}
</style>
