<!-- SPDX-License-Identifier: GPL-3.0-or-later
License: GNU GPLv3 or later. See the license file in the project root for more information.
Copyright © 2021 - present Aleksey Hoffman. All rights reserved.
-->

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Container, Draggable, type DropResult } from 'vue3-smooth-dnd';
import { ExternalLinkIcon, PlusIcon } from '@lucide/vue';
import { Button } from '@/components/ui/button';
import type {
  Project,
  ProjectTask,
  ProjectTaskStatusId,
} from '@/types/user-projects';
import { PROJECT_TASK_STATUS_IDS } from '@/types/user-projects';

const props = defineProps<{
  project: Project;
}>();

const emit = defineEmits<{
  add: [statusId: ProjectTaskStatusId];
  edit: [task: ProjectTask];
  reorder: [statusId: ProjectTaskStatusId, orderedTaskIds: string[]];
}>();

const { t } = useI18n();

const tasksByStatus = computed(() => {
  const grouped: Record<ProjectTaskStatusId, ProjectTask[]> = {
    backlog: [],
    doing: [],
    review: [],
    done: [],
  };

  for (const statusId of PROJECT_TASK_STATUS_IDS) {
    grouped[statusId] = props.project.tasks
      .filter(task => task.statusId === statusId)
      .sort((left, right) => left.sortKey - right.sortKey || left.createdAt - right.createdAt);
  }

  return grouped;
});

function getWorkspaceLinkLabel(task: ProjectTask): string | null {
  if (!task.workspaceLinkId) {
    return null;
  }

  return props.project.workspaceLinks.find(link => link.id === task.workspaceLinkId)?.label ?? null;
}

function getChildPayload(statusId: ProjectTaskStatusId) {
  return (index: number) => tasksByStatus.value[statusId][index] ?? null;
}

function handleDrop(statusId: ProjectTaskStatusId, dropResult: DropResult) {
  const { removedIndex, addedIndex, payload } = dropResult;

  if (addedIndex === null && removedIndex === null) {
    return;
  }

  const columnTasks = [...tasksByStatus.value[statusId]];

  if (removedIndex !== null) {
    columnTasks.splice(removedIndex, 1);
  }

  const incomingTask = payload as ProjectTask | null;

  if (addedIndex !== null && incomingTask) {
    columnTasks.splice(addedIndex, 0, incomingTask);
  }

  emit('reorder', statusId, columnTasks.map(task => task.id));
}
</script>

<template>
  <div class="project-task-board">
    <section
      v-for="statusId in PROJECT_TASK_STATUS_IDS"
      :key="statusId"
      class="project-task-board__column"
    >
      <div class="project-task-board__column-header">
        <h3>{{ t(`projectsPage.status.${statusId}`) }}</h3>
        <span>{{ tasksByStatus[statusId].length }}</span>
        <Button
          size="xs"
          variant="ghost"
          :aria-label="t('projectsPage.addTask')"
          @click="emit('add', statusId)"
        >
          <PlusIcon :size="14" />
        </Button>
      </div>

      <Container
        class="project-task-board__list"
        group-name="project-tasks"
        drag-class="project-task-board__card--dragging"
        :get-child-payload="getChildPayload(statusId)"
        @drop="(dropResult: DropResult) => handleDrop(statusId, dropResult)"
      >
        <Draggable
          v-for="task in tasksByStatus[statusId]"
          :key="task.id"
        >
          <button
            type="button"
            class="project-task-board__card"
            @click="emit('edit', task)"
          >
            <span class="project-task-board__card-title">{{ task.title }}</span>
            <span
              v-if="getWorkspaceLinkLabel(task)"
              class="project-task-board__card-meta"
            >
              {{ getWorkspaceLinkLabel(task) }}
            </span>
            <a
              v-if="task.outcomeUrl"
              class="project-task-board__card-link"
              :href="task.outcomeUrl"
              target="_blank"
              rel="noreferrer"
              @click.stop
            >
              <ExternalLinkIcon :size="12" />
              {{ t('projectsPage.outcomeLink') }}
            </a>
          </button>
        </Draggable>
      </Container>
    </section>
  </div>
</template>

<style>
.project-task-board {
  display: grid;
  grid-template-columns: repeat(4, minmax(180px, 1fr));
  gap: 12px;
  align-items: start;
  overflow-x: auto;
}

.project-task-board__column {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 220px;
  padding: 10px;
  border: 1px solid hsl(var(--border));
  border-radius: 10px;
  background: hsl(var(--background) / 0.45);
}

.project-task-board__column-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.project-task-board__column-header h3 {
  margin: 0;
  flex: 1;
  font-size: 13px;
  font-weight: 600;
}

.project-task-board__column-header span {
  color: hsl(var(--muted-foreground));
  font-size: 12px;
}

.project-task-board__list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 120px;
}

.project-task-board__card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
  padding: 10px;
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
  background: hsl(var(--card));
  color: inherit;
  text-align: left;
  cursor: grab;
}

.project-task-board__card--dragging {
  opacity: 0.7;
}

.project-task-board__card-title {
  font-size: 13px;
  font-weight: 600;
}

.project-task-board__card-meta,
.project-task-board__card-link {
  color: hsl(var(--muted-foreground));
  font-size: 12px;
}

.project-task-board__card-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  text-decoration: none;
}

@media (max-width: 1100px) {
  .project-task-board {
    grid-template-columns: repeat(2, minmax(200px, 1fr));
  }
}
</style>
