<!-- SPDX-License-Identifier: GPL-3.0-or-later
License: GNU GPLv3 or later. See the license file in the project root for more information.
Copyright © 2021 - present Aleksey Hoffman. All rights reserved.
-->

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import {
  FolderKanbanIcon,
  FolderPlusIcon,
  LayoutGridIcon,
  ListIcon,
  Trash2Icon,
  TriangleAlertIcon,
} from '@lucide/vue';
import { PageDefaultLayout } from '@/layouts';
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
import { useUserProjectsStore } from '@/stores/storage/user-projects';
import type {
  Project,
  ProjectTask,
  ProjectTaskStatusId,
} from '@/types/user-projects';
import {
  getProjectOpenTaskCount,
  getProjectPrimaryPath,
} from '@/types/user-projects';
import normalizePath from '@/utils/normalize-path';
import { useProjectLinkOpener } from '@/modules/projects/composables/use-project-link-opener';
import ProjectTaskBoard from '@/modules/projects/components/project-task-board.vue';
import ProjectTaskList from '@/modules/projects/components/project-task-list.vue';
import ProjectTaskDialog from '@/modules/projects/components/project-task-dialog.vue';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const userProjectsStore = useUserProjectsStore();
const {
  openPathInNavigator,
  openAllWorkspaceLinks,
} = useProjectLinkOpener();

const selectedProjectId = ref<string | null>(null);
const renameDraft = ref('');
const descriptionDraft = ref('');
const contextNotesDraft = ref('');
const deleteDialogOpen = ref(false);
const pendingDeleteId = ref<string | null>(null);
const missingLinkPaths = ref<Set<string>>(new Set());
const taskDialogOpen = ref(false);
const editingTask = ref<ProjectTask | null>(null);
const defaultTaskStatusId = ref<ProjectTaskStatusId>('backlog');
let missingLinksRequestId = 0;

const projects = computed(() => userProjectsStore.projects);
const selectedProject = computed(() => (
  projects.value.find(project => project.id === selectedProjectId.value)
  ?? projects.value[0]
  ?? null
));
const missingLinkCount = computed(() => missingLinkPaths.value.size);
const tasksViewMode = computed(() => selectedProject.value?.tasksViewMode ?? 'list');

function selectProject(project: Project) {
  selectedProjectId.value = project.id;
  renameDraft.value = project.name;
  descriptionDraft.value = project.description;
  contextNotesDraft.value = project.contextNotes;
  void userProjectsStore.setActiveProjectId(project.id);
  void router.replace({
    name: 'projects',
    query: { projectId: project.id },
  });
}

function isMissingLink(path: string): boolean {
  return missingLinkPaths.value.has(path);
}

async function refreshMissingLinks(paths: string[]) {
  const requestId = ++missingLinksRequestId;

  if (paths.length === 0) {
    missingLinkPaths.value = new Set();
    return;
  }

  const results = await Promise.all(paths.map(async (path) => {
    try {
      const exists = await invoke<boolean>('path_exists', { path });
      return exists ? null : path;
    }
    catch {
      return path;
    }
  }));

  if (requestId !== missingLinksRequestId) {
    return;
  }

  missingLinkPaths.value = new Set(results.filter((path): path is string => Boolean(path)));
}

watch(
  () => selectedProject.value?.workspaceLinks.map(link => link.path) ?? [],
  (paths) => {
    void refreshMissingLinks(paths);
  },
  { immediate: true, deep: true },
);

watch(
  () => route.query.projectId,
  (projectId) => {
    if (typeof projectId === 'string' && projects.value.some(project => project.id === projectId)) {
      const project = projects.value.find(item => item.id === projectId);

      if (project && selectedProjectId.value !== project.id) {
        selectProject(project);
      }
    }
  },
  { immediate: true },
);

async function createEmptyProject() {
  const project = await userProjectsStore.createProject({
    name: t('projectsPage.untitled'),
  });
  selectProject(project);
}

async function saveRename() {
  if (!selectedProject.value) {
    return;
  }

  await userProjectsStore.renameProject(selectedProject.value.id, renameDraft.value);
  renameDraft.value = selectedProject.value.name;
}

async function saveDescription() {
  if (!selectedProject.value) {
    return;
  }

  await userProjectsStore.setProjectDescription(selectedProject.value.id, descriptionDraft.value);
  descriptionDraft.value = selectedProject.value.description;
}

async function saveContextNotes() {
  if (!selectedProject.value) {
    return;
  }

  await userProjectsStore.setContextNotes(selectedProject.value.id, contextNotesDraft.value);
  contextNotesDraft.value = selectedProject.value.contextNotes;
}

async function requestDelete(project: Project) {
  pendingDeleteId.value = project.id;
  deleteDialogOpen.value = true;
}

async function confirmDelete() {
  const id = pendingDeleteId.value;

  if (!id) {
    return;
  }

  await userProjectsStore.removeProjectById(id);
  pendingDeleteId.value = null;
  deleteDialogOpen.value = false;
  selectedProjectId.value = userProjectsStore.activeProject?.id ?? projects.value[0]?.id ?? null;

  if (selectedProject.value) {
    selectProject(selectedProject.value);
  }
  else {
    await router.replace({ name: 'projects' });
  }
}

async function addWorkspaceLink() {
  if (!selectedProject.value) {
    return;
  }

  const selected = await open({
    directory: true,
    multiple: false,
  });

  if (typeof selected !== 'string' || !selected) {
    return;
  }

  await userProjectsStore.addWorkspaceLink(selectedProject.value.id, normalizePath(selected));
}

async function removeWorkspaceLink(linkId: string) {
  if (!selectedProject.value) {
    return;
  }

  await userProjectsStore.removeWorkspaceLink(selectedProject.value.id, linkId);
}

async function openWorkspaceLink(path: string) {
  if (!selectedProject.value) {
    return;
  }

  await openPathInNavigator(path, { activateProjectId: selectedProject.value.id });
}

async function openAllLinks() {
  if (!selectedProject.value) {
    return;
  }

  await openAllWorkspaceLinks(selectedProject.value);
}

async function setViewMode(mode: 'list' | 'board') {
  if (!selectedProject.value) {
    return;
  }

  await userProjectsStore.setTasksViewMode(selectedProject.value.id, mode);
}

function openCreateTask(statusId: ProjectTaskStatusId = 'backlog') {
  editingTask.value = null;
  defaultTaskStatusId.value = statusId;
  taskDialogOpen.value = true;
}

function openEditTask(task: ProjectTask) {
  editingTask.value = task;
  defaultTaskStatusId.value = task.statusId;
  taskDialogOpen.value = true;
}

async function saveTask(payload: {
  title: string;
  body: string;
  statusId: ProjectTaskStatusId;
  workspaceLinkId: string | null;
  outcomeUrl: string | null;
}) {
  if (!selectedProject.value) {
    return;
  }

  if (editingTask.value) {
    await userProjectsStore.updateTask(selectedProject.value.id, editingTask.value.id, payload);
  }
  else {
    await userProjectsStore.addTask(selectedProject.value.id, payload);
  }

  taskDialogOpen.value = false;
  editingTask.value = null;
}

async function deleteTask() {
  if (!selectedProject.value || !editingTask.value) {
    return;
  }

  await userProjectsStore.deleteTask(selectedProject.value.id, editingTask.value.id);
  taskDialogOpen.value = false;
  editingTask.value = null;
}

async function reorderTasks(statusId: ProjectTaskStatusId, orderedTaskIds: string[]) {
  if (!selectedProject.value) {
    return;
  }

  await userProjectsStore.reorderTasksInStatus(selectedProject.value.id, statusId, orderedTaskIds);
}

if (projects.value[0] && !selectedProjectId.value) {
  const queryId = typeof route.query.projectId === 'string' ? route.query.projectId : null;
  const initial = projects.value.find(project => project.id === queryId)
    ?? userProjectsStore.activeProject
    ?? projects.value[0];
  selectProject(initial);
}
</script>

<template>
  <PageDefaultLayout
    :title="t('projectsPage.title')"
    :subtitle="t('projectsPage.subtitle')"
  >
    <div class="projects-page">
      <aside class="projects-page__list">
        <div class="projects-page__list-header">
          <Button
            size="sm"
            @click="createEmptyProject"
          >
            <FolderPlusIcon :size="14" />
            {{ t('projectsPage.create') }}
          </Button>
        </div>

        <button
          v-for="project in projects"
          :key="project.id"
          type="button"
          class="projects-page__list-item"
          :class="{ 'projects-page__list-item--selected': selectedProject?.id === project.id }"
          @click="selectProject(project)"
        >
          <FolderKanbanIcon :size="16" />
          <span class="projects-page__list-item-main">
            <span class="projects-page__list-item-name">{{ project.name }}</span>
            <span class="projects-page__list-item-meta">
              {{ t('projectsPage.listMeta', {
                links: project.workspaceLinks.length,
                tasks: getProjectOpenTaskCount(project),
              }) }}
            </span>
          </span>
        </button>

        <p
          v-if="projects.length === 0"
          class="projects-page__empty"
        >
          {{ t('projectsPage.empty') }}
        </p>
      </aside>

      <section
        v-if="selectedProject"
        class="projects-page__detail"
      >
        <div class="projects-page__detail-header">
          <Input
            v-model="renameDraft"
            class="projects-page__rename-input"
            @keydown.enter.prevent="saveRename"
            @blur="saveRename"
          />
          <div class="projects-page__view-toggle">
            <Button
              size="sm"
              :variant="tasksViewMode === 'list' ? 'default' : 'outline'"
              @click="setViewMode('list')"
            >
              <ListIcon :size="14" />
              {{ t('projectsPage.viewList') }}
            </Button>
            <Button
              size="sm"
              :variant="tasksViewMode === 'board' ? 'default' : 'outline'"
              @click="setViewMode('board')"
            >
              <LayoutGridIcon :size="14" />
              {{ t('projectsPage.viewBoard') }}
            </Button>
          </div>
          <Button
            size="sm"
            variant="outline"
            :disabled="selectedProject.workspaceLinks.length === 0"
            @click="openAllLinks"
          >
            {{ t('projectsPage.openAllLinks') }}
          </Button>
          <Button
            size="sm"
            variant="destructive"
            @click="requestDelete(selectedProject)"
          >
            <Trash2Icon :size="14" />
            {{ t('projectsPage.delete') }}
          </Button>
        </div>

        <Input
          v-model="descriptionDraft"
          :placeholder="t('projectsPage.descriptionPlaceholder')"
          @keydown.enter.prevent="saveDescription"
          @blur="saveDescription"
        />

        <div class="projects-page__section">
          <div class="projects-page__section-header">
            <h2>{{ t('projectsPage.workspaceLinks') }}</h2>
            <Button
              size="xs"
              variant="outline"
              @click="addWorkspaceLink"
            >
              {{ t('projectsPage.addLink') }}
            </Button>
          </div>

          <p
            v-if="missingLinkCount > 0"
            class="projects-page__missing-banner"
          >
            <TriangleAlertIcon :size="14" />
            {{ t('projectsPage.missingLinksBanner', { count: missingLinkCount }) }}
          </p>

          <p
            v-if="selectedProject.workspaceLinks.length === 0"
            class="projects-page__empty"
          >
            {{ t('projectsPage.noLinks') }}
          </p>
          <ul
            v-else
            class="projects-page__links"
          >
            <li
              v-for="link in selectedProject.workspaceLinks"
              :key="link.id"
              class="projects-page__link"
              :class="{ 'projects-page__link--missing': isMissingLink(link.path) }"
            >
              <div class="projects-page__link-main">
                <button
                  type="button"
                  class="projects-page__link-open"
                  @click="openWorkspaceLink(link.path)"
                >
                  <span class="projects-page__link-label">{{ link.label }}</span>
                  <span class="projects-page__link-path">{{ link.path }}</span>
                </button>
                <span
                  v-if="isMissingLink(link.path)"
                  class="projects-page__link-error"
                >
                  {{ t('projectsPage.missingLinkBadge') }}
                </span>
                <span
                  v-if="link.path === getProjectPrimaryPath(selectedProject)"
                  class="projects-page__badge"
                >
                  {{ t('projectsPage.primaryLink') }}
                </span>
              </div>
              <Button
                size="xs"
                variant="ghost"
                @click="removeWorkspaceLink(link.id)"
              >
                {{ t('projectsPage.removeLink') }}
              </Button>
            </li>
          </ul>
        </div>

        <div class="projects-page__section">
          <div class="projects-page__section-header">
            <h2>{{ t('projectsPage.contextNotes') }}</h2>
          </div>
          <textarea
            v-model="contextNotesDraft"
            class="projects-page__context"
            rows="5"
            :placeholder="t('projectsPage.contextNotesPlaceholder')"
            @blur="saveContextNotes"
          />
        </div>

        <div class="projects-page__section">
          <ProjectTaskList
            v-if="tasksViewMode === 'list'"
            :project="selectedProject"
            @add="openCreateTask('backlog')"
            @edit="openEditTask"
          />
          <ProjectTaskBoard
            v-else
            :project="selectedProject"
            @add="openCreateTask"
            @edit="openEditTask"
            @reorder="reorderTasks"
          />
        </div>
      </section>
    </div>

    <Dialog v-model:open="deleteDialogOpen">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{{ t('projectsPage.deleteConfirmTitle') }}</DialogTitle>
          <DialogDescription>
            {{ t('projectsPage.deleteConfirmDescription') }}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="ghost"
            @click="deleteDialogOpen = false"
          >
            {{ t('projectsPage.cancel') }}
          </Button>
          <Button
            variant="destructive"
            @click="confirmDelete"
          >
            {{ t('projectsPage.deleteConfirmAction') }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <ProjectTaskDialog
      v-if="selectedProject"
      v-model:open="taskDialogOpen"
      :project="selectedProject"
      :task="editingTask"
      :default-status-id="defaultTaskStatusId"
      @save="saveTask"
      @delete="deleteTask"
    />
  </PageDefaultLayout>
</template>

<style>
.projects-page {
  display: grid;
  grid-template-columns: minmax(220px, 280px) minmax(0, 1fr);
  gap: 20px;
  min-height: 480px;
}

.projects-page__list,
.projects-page__detail {
  border: 1px solid hsl(var(--border));
  border-radius: 12px;
  background: hsl(var(--card) / 0.35);
}

.projects-page__list {
  display: flex;
  flex-direction: column;
  padding: 12px;
  gap: 8px;
}

.projects-page__list-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  width: 100%;
  padding: 8px 10px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.projects-page__list-item--selected,
.projects-page__list-item:hover {
  background: hsl(var(--accent));
}

.projects-page__list-item-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}

.projects-page__list-item-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
}

.projects-page__list-item-meta,
.projects-page__empty {
  margin: 0;
  color: hsl(var(--muted-foreground));
  font-size: 12px;
}

.projects-page__detail {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px;
}

.projects-page__detail-header {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.projects-page__rename-input {
  min-width: 200px;
  flex: 1;
}

.projects-page__view-toggle {
  display: inline-flex;
  gap: 4px;
}

.projects-page__section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.projects-page__section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.projects-page__section-header h2 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
}

.projects-page__missing-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  padding: 8px 10px;
  border: 1px solid hsl(var(--destructive) / 0.35);
  border-radius: 8px;
  background: hsl(var(--destructive) / 0.08);
  color: hsl(var(--destructive));
  font-size: 13px;
}

.projects-page__links {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.projects-page__link {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 10px;
  border-radius: 8px;
  background: hsl(var(--background) / 0.5);
}

.projects-page__link--missing {
  border: 1px solid hsl(var(--destructive) / 0.35);
}

.projects-page__link-main {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  flex: 1;
}

.projects-page__link-open {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.projects-page__link-label {
  font-size: 13px;
  font-weight: 600;
}

.projects-page__link-path,
.projects-page__link-error {
  font-size: 12px;
  word-break: break-all;
}

.projects-page__link-error {
  color: hsl(var(--destructive));
  font-weight: 600;
}

.projects-page__badge {
  width: fit-content;
  padding: 1px 6px;
  border-radius: 999px;
  background: hsl(var(--muted));
  color: hsl(var(--muted-foreground));
  font-size: 11px;
}

.projects-page__context {
  width: 100%;
  min-height: 120px;
  resize: vertical;
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
  background: hsl(var(--background));
  color: inherit;
  padding: 10px 12px;
  font: inherit;
}

@media (max-width: 900px) {
  .projects-page {
    grid-template-columns: 1fr;
  }
}
</style>
