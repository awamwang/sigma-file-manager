<!-- SPDX-License-Identifier: GPL-3.0-or-later
License: GNU GPLv3 or later. See the license file in the project root for more information.
Copyright © 2021 - present Aleksey Hoffman. All rights reserved.
-->

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type {
  Project,
  ProjectTask,
  ProjectTaskStatusId,
} from '@/types/user-projects';
import { PROJECT_TASK_STATUS_IDS } from '@/types/user-projects';

const props = defineProps<{
  open: boolean;
  project: Project;
  task: ProjectTask | null;
  defaultStatusId?: ProjectTaskStatusId;
}>();

const emit = defineEmits<{
  'update:open': [value: boolean];
  save: [payload: {
    title: string;
    body: string;
    statusId: ProjectTaskStatusId;
    workspaceLinkId: string | null;
    outcomeUrl: string | null;
  }];
  delete: [];
}>();

const { t } = useI18n();

const title = ref('');
const body = ref('');
const statusId = ref<ProjectTaskStatusId>('backlog');
const workspaceLinkId = ref<string>('');
const outcomeUrl = ref('');

const dialogOpen = computed({
  get: () => props.open,
  set: (value: boolean) => emit('update:open', value),
});

const isEditing = computed(() => props.task !== null);

watch(
  () => [props.open, props.task, props.defaultStatusId] as const,
  ([isOpen]) => {
    if (!isOpen) {
      return;
    }

    title.value = props.task?.title ?? '';
    body.value = props.task?.body ?? '';
    statusId.value = props.task?.statusId ?? props.defaultStatusId ?? 'backlog';
    workspaceLinkId.value = props.task?.workspaceLinkId ?? '';
    outcomeUrl.value = props.task?.outcomeUrl ?? '';
  },
);

function handleSave() {
  const trimmedTitle = title.value.trim();

  if (!trimmedTitle) {
    return;
  }

  emit('save', {
    title: trimmedTitle,
    body: body.value,
    statusId: statusId.value,
    workspaceLinkId: workspaceLinkId.value || null,
    outcomeUrl: outcomeUrl.value.trim() || null,
  });
}
</script>

<template>
  <Dialog v-model:open="dialogOpen">
    <DialogContent class="project-task-dialog">
      <DialogHeader>
        <DialogTitle>
          {{ isEditing ? t('projectsPage.editTask') : t('projectsPage.addTask') }}
        </DialogTitle>
        <DialogDescription>
          {{ t('projectsPage.taskDialogDescription') }}
        </DialogDescription>
      </DialogHeader>

      <div class="project-task-dialog__fields">
        <label class="project-task-dialog__field">
          <span>{{ t('projectsPage.taskTitle') }}</span>
          <Input
            v-model="title"
            @keydown.enter.prevent="handleSave"
          />
        </label>

        <label class="project-task-dialog__field">
          <span>{{ t('projectsPage.taskBody') }}</span>
          <textarea
            v-model="body"
            class="project-task-dialog__textarea"
            rows="4"
          />
        </label>

        <label class="project-task-dialog__field">
          <span>{{ t('projectsPage.taskStatus') }}</span>
          <select
            v-model="statusId"
            class="project-task-dialog__select"
          >
            <option
              v-for="status in PROJECT_TASK_STATUS_IDS"
              :key="status"
              :value="status"
            >
              {{ t(`projectsPage.status.${status}`) }}
            </option>
          </select>
        </label>

        <label class="project-task-dialog__field">
          <span>{{ t('projectsPage.taskWorkspaceLink') }}</span>
          <select
            v-model="workspaceLinkId"
            class="project-task-dialog__select"
          >
            <option value="">
              {{ t('projectsPage.taskWorkspaceLinkNone') }}
            </option>
            <option
              v-for="link in project.workspaceLinks"
              :key="link.id"
              :value="link.id"
            >
              {{ link.label }}
            </option>
          </select>
        </label>

        <label class="project-task-dialog__field">
          <span>{{ t('projectsPage.taskOutcomeUrl') }}</span>
          <Input v-model="outcomeUrl" />
        </label>
      </div>

      <DialogFooter class="project-task-dialog__footer">
        <Button
          v-if="isEditing"
          variant="destructive"
          @click="emit('delete')"
        >
          {{ t('projectsPage.deleteTask') }}
        </Button>
        <div class="project-task-dialog__footer-spacer" />
        <Button
          variant="ghost"
          @click="dialogOpen = false"
        >
          {{ t('projectsPage.cancel') }}
        </Button>
        <Button @click="handleSave">
          {{ t('projectsPage.saveTask') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<style>
.project-task-dialog__fields {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.project-task-dialog__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
}

.project-task-dialog__textarea,
.project-task-dialog__select {
  width: 100%;
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
  background: hsl(var(--background));
  color: inherit;
  padding: 8px 10px;
  font: inherit;
}

.project-task-dialog__textarea {
  resize: vertical;
  min-height: 96px;
}

.project-task-dialog__footer {
  display: flex;
  align-items: center;
  gap: 8px;
}

.project-task-dialog__footer-spacer {
  flex: 1;
}
</style>
