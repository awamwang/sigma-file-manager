// SPDX-License-Identifier: GPL-3.0-or-later
// License: GNU GPLv3 or later. See the license file in the project root for more information.
// Copyright © 2021 - present Aleksey Hoffman. All rights reserved.

import { defineStore } from 'pinia';
import { LazyStore } from '@tauri-apps/plugin-store';
import { ref, computed } from 'vue';
import { useUserPathsStore } from './user-paths';
import type {
  Project,
  ProjectTask,
  ProjectTaskStatusId,
  ProjectTasksViewMode,
  ProjectWorkspaceLink,
  UserProjects,
} from '@/types/user-projects';
import {
  DEFAULT_USER_PROJECTS,
  USER_PROJECTS_SCHEMA_VERSION,
  getProjectPrimaryPath,
} from '@/types/user-projects';
import {
  migrateUserProjectsRecord,
  USER_PROJECTS_SCHEMA_VERSION_KEY,
} from '@/stores/schemas/user-projects';
import {
  canUseStartupStorageFastPath,
  getStartupStorageFile,
  getStartupStorageRecord,
  type StartupStorageFileBootstrap,
} from './utils/startup-storage-bootstrap';
import { basenameFromPath } from '@/utils/source-display-name';
import { haveSameKeyOrder, haveSameKeys } from '@/utils/reorder-matching-items';
import uniqueId from '@/utils/unique-id';
import normalizePath from '@/utils/normalize-path';

function createWorkspaceLink(path: string, options?: { label?: string; addedAt?: number }): ProjectWorkspaceLink {
  const normalizedPath = normalizePath(path);

  return {
    id: uniqueId(),
    path: normalizedPath,
    label: options?.label?.trim() || basenameFromPath(normalizedPath),
    kind: 'folder',
    addedAt: options?.addedAt ?? Date.now(),
  };
}

function createEmptyProject(options?: {
  name?: string;
  path?: string;
  description?: string;
}): Project {
  const now = Date.now();
  const workspaceLinks = options?.path ? [createWorkspaceLink(options.path, { addedAt: now })] : [];
  const primaryPath = workspaceLinks[0]?.path ?? '';

  return {
    id: uniqueId(),
    name: options?.name?.trim() || (primaryPath ? basenameFromPath(primaryPath) : 'New project'),
    description: options?.description?.trim() ?? '',
    workspaceLinks,
    tasks: [],
    contextNotes: '',
    path: primaryPath,
    tagIds: [],
    ideCommand: null,
    terminalProfile: null,
    addedAt: now,
    lastOpenedAt: null,
    openCount: 0,
    createdAt: now,
    updatedAt: now,
    tasksViewMode: 'list',
  };
}

function syncPrimaryPath(project: Project) {
  project.path = getProjectPrimaryPath(project);
  project.updatedAt = Date.now();
}

function pathsEqual(pathA: string, pathB: string): boolean {
  return normalizePath(pathA) === normalizePath(pathB);
}

export const useUserProjectsStore = defineStore('userProjects', () => {
  const userPathsStore = useUserPathsStore();
  const userProjectsStorage = ref<LazyStore | null>(null);
  const userProjects = ref<UserProjects>(structuredClone(DEFAULT_USER_PROJECTS));

  const projects = computed(() => userProjects.value.projects);
  const activeProjectId = computed(() => userProjects.value.activeProjectId);
  const activeProject = computed(() => (
    userProjects.value.projects.find(project => project.id === userProjects.value.activeProjectId)
    ?? null
  ));

  async function initStorage() {
    try {
      if (!userProjectsStorage.value) {
        userProjectsStorage.value = await new LazyStore(userPathsStore.customPaths.appUserDataProjectsPath);
        await userProjectsStorage.value.save();
      }
    }
    catch (error) {
      console.error('Failed to initialize user projects storage:', error);
    }
  }

  function applyProjectsRecord(projectsRecord: Record<string, unknown> | null) {
    userProjects.value = migrateUserProjectsRecord(projectsRecord);
  }

  async function loadProjects() {
    try {
      const storedProjects = await userProjectsStorage.value?.entries();

      applyProjectsRecord(storedProjects ? Object.fromEntries(storedProjects) : null);
      await deduplicateProjects();
      await persistIfNeeded();
    }
    catch (error) {
      console.error('Failed to load user projects:', error);
    }
  }

  async function loadProjectsFromBootstrap(bootstrapFile?: StartupStorageFileBootstrap): Promise<boolean> {
    if (!canUseStartupStorageFastPath(bootstrapFile)) {
      return false;
    }

    applyProjectsRecord(getStartupStorageRecord(bootstrapFile));
    await deduplicateProjects();
    return true;
  }

  async function deduplicateProjects() {
    const seenPrimaryPaths = new Set<string>();
    const deduplicatedProjects: Project[] = [];

    for (const project of userProjects.value.projects) {
      const primaryPath = getProjectPrimaryPath(project);
      const dedupeKey = primaryPath || project.id;

      if (!seenPrimaryPaths.has(dedupeKey)) {
        seenPrimaryPaths.add(dedupeKey);
        deduplicatedProjects.push(project);
      }
    }

    if (deduplicatedProjects.length !== userProjects.value.projects.length) {
      userProjects.value.projects = deduplicatedProjects;
    }
  }

  async function saveProjects() {
    try {
      if (userProjectsStorage.value) {
        userProjects.value.schemaVersion = USER_PROJECTS_SCHEMA_VERSION;
        await userProjectsStorage.value.set(USER_PROJECTS_SCHEMA_VERSION_KEY, USER_PROJECTS_SCHEMA_VERSION);
        await userProjectsStorage.value.set('projects', userProjects.value.projects);
        await userProjectsStorage.value.set('activeProjectId', userProjects.value.activeProjectId);
        await userProjectsStorage.value.save();
      }
    }
    catch (error) {
      console.error('Failed to save user projects:', error);
    }
  }

  async function persistIfNeeded() {
    await saveProjects();
  }

  function getProjectById(id: string): Project | null {
    return userProjects.value.projects.find(project => project.id === id) ?? null;
  }

  function findProjectByWorkspacePath(path: string): Project | null {
    const normalized = normalizePath(path);

    return userProjects.value.projects.find(project => (
      project.workspaceLinks.some(link => pathsEqual(link.path, normalized))
      || pathsEqual(project.path, normalized)
    )) ?? null;
  }

  function isProject(path: string): boolean {
    return findProjectByWorkspacePath(path) !== null;
  }

  function getProjectByPath(path: string): Project | null {
    return findProjectByWorkspacePath(path);
  }

  function getProjectsByPaths(paths: string[]): Project[] {
    const matched = new Map<string, Project>();

    for (const path of paths) {
      const project = findProjectByWorkspacePath(path);
      if (project) {
        matched.set(project.id, project);
      }
    }

    return Array.from(matched.values());
  }

  async function createProject(options?: {
    name?: string;
    path?: string;
    description?: string;
  }): Promise<Project> {
    if (options?.path) {
      const existing = findProjectByWorkspacePath(options.path);
      if (existing) {
        return existing;
      }
    }

    const project = createEmptyProject(options);
    userProjects.value.projects.push(project);
    userProjects.value.activeProjectId = project.id;
    await saveProjects();
    return project;
  }

  async function addProject(path: string, options?: { name?: string }): Promise<Project | null> {
    return createProject({ path, name: options?.name });
  }

  async function removeProjectById(id: string) {
    const nextProjects = userProjects.value.projects.filter(project => project.id !== id);

    if (nextProjects.length === userProjects.value.projects.length) {
      return;
    }

    userProjects.value.projects = nextProjects;

    if (userProjects.value.activeProjectId === id) {
      userProjects.value.activeProjectId = nextProjects[0]?.id ?? null;
    }

    await saveProjects();
  }

  async function removeProject(path: string) {
    const project = findProjectByWorkspacePath(path);

    if (!project) {
      return;
    }

    const normalized = normalizePath(path);
    const remainingLinks = project.workspaceLinks.filter(link => !pathsEqual(link.path, normalized));

    if (remainingLinks.length === 0 || pathsEqual(project.path, normalized) && project.workspaceLinks.length <= 1) {
      await removeProjectById(project.id);
      return;
    }

    project.workspaceLinks = remainingLinks;
    syncPrimaryPath(project);
    await saveProjects();
  }

  async function removeProjects(paths: string[]) {
    for (const path of paths) {
      await removeProject(path);
    }
  }

  async function updateProject(id: string, patch: Partial<Omit<Project, 'id' | 'workspaceLinks' | 'tasks'>>) {
    const project = getProjectById(id);

    if (!project) {
      return;
    }

    Object.assign(project, patch);
    syncPrimaryPath(project);
    await saveProjects();
  }

  async function renameProject(id: string, name: string) {
    const trimmed = name.trim();

    if (!trimmed) {
      return;
    }

    await updateProject(id, { name: trimmed });
  }

  async function setProjectDescription(id: string, description: string) {
    await updateProject(id, { description: description.trim() });
  }

  async function setContextNotes(id: string, contextNotes: string) {
    await updateProject(id, { contextNotes });
  }

  async function setTasksViewMode(id: string, tasksViewMode: ProjectTasksViewMode) {
    await updateProject(id, { tasksViewMode });
  }

  async function setActiveProjectId(id: string | null) {
    if (id !== null && !getProjectById(id)) {
      return;
    }

    userProjects.value.activeProjectId = id;
    await saveProjects();
  }

  async function setProjects(nextProjects: Project[]) {
    if (!haveSameKeys(
      userProjects.value.projects,
      nextProjects,
      project => project.id,
    )) {
      return;
    }

    if (haveSameKeyOrder(
      userProjects.value.projects,
      nextProjects,
      project => project.id,
    )) {
      return;
    }

    userProjects.value.projects = nextProjects;
    await saveProjects();
  }

  async function addWorkspaceLink(projectId: string, path: string, options?: { label?: string }) {
    const project = getProjectById(projectId);

    if (!project) {
      return null;
    }

    const normalized = normalizePath(path);
    const existingInProject = project.workspaceLinks.find(link => pathsEqual(link.path, normalized));

    if (existingInProject) {
      return existingInProject;
    }

    const existingElsewhere = findProjectByWorkspacePath(normalized);

    if (existingElsewhere && existingElsewhere.id !== projectId) {
      return null;
    }

    const link = createWorkspaceLink(normalized, options);
    project.workspaceLinks.push(link);
    syncPrimaryPath(project);
    await saveProjects();
    return link;
  }

  async function removeWorkspaceLink(projectId: string, linkId: string) {
    const project = getProjectById(projectId);

    if (!project) {
      return;
    }

    const nextLinks = project.workspaceLinks.filter(link => link.id !== linkId);

    if (nextLinks.length === project.workspaceLinks.length) {
      return;
    }

    project.workspaceLinks = nextLinks;
    syncPrimaryPath(project);
    await saveProjects();
  }

  async function recordProjectOpened(pathOrProjectId: string) {
    const project = getProjectById(pathOrProjectId) ?? findProjectByWorkspacePath(pathOrProjectId);

    if (!project) {
      return;
    }

    project.lastOpenedAt = Date.now();
    project.openCount += 1;
    project.updatedAt = Date.now();
    userProjects.value.activeProjectId = project.id;
    await saveProjects();
  }

  async function clearAllProjects() {
    if (userProjects.value.projects.length === 0) {
      return;
    }

    userProjects.value.projects = [];
    userProjects.value.activeProjectId = null;
    await saveProjects();
  }

  function createTaskDraft(
    project: Project,
    input: {
      title: string;
      body?: string;
      statusId?: ProjectTaskStatusId;
      workspaceLinkId?: string | null;
      outcomeUrl?: string | null;
    },
  ): ProjectTask {
    const now = Date.now();
    const statusId = input.statusId ?? 'backlog';
    const sameStatusCount = project.tasks.filter(task => task.statusId === statusId).length;

    return {
      id: uniqueId(),
      title: input.title.trim(),
      body: input.body?.trim() ?? '',
      statusId,
      sortKey: sameStatusCount,
      workspaceLinkId: input.workspaceLinkId ?? null,
      outcomeUrl: input.outcomeUrl?.trim() || null,
      createdAt: now,
      updatedAt: now,
      completedAt: statusId === 'done' ? now : null,
    };
  }

  async function addTask(
    projectId: string,
    input: {
      title: string;
      body?: string;
      statusId?: ProjectTaskStatusId;
      workspaceLinkId?: string | null;
      outcomeUrl?: string | null;
    },
  ): Promise<ProjectTask | null> {
    const project = getProjectById(projectId);
    const title = input.title.trim();

    if (!project || !title) {
      return null;
    }

    const task = createTaskDraft(project, { ...input, title });
    project.tasks.push(task);
    project.updatedAt = Date.now();
    await saveProjects();
    return task;
  }

  async function updateTask(
    projectId: string,
    taskId: string,
    patch: Partial<Omit<ProjectTask, 'id' | 'createdAt'>>,
  ) {
    const project = getProjectById(projectId);
    const task = project?.tasks.find(taskItem => taskItem.id === taskId);

    if (!project || !task) {
      return;
    }

    Object.assign(task, patch);
    task.updatedAt = Date.now();

    if (task.statusId === 'done') {
      task.completedAt = task.completedAt ?? Date.now();
    }
    else {
      task.completedAt = null;
    }

    project.updatedAt = Date.now();
    await saveProjects();
  }

  async function deleteTask(projectId: string, taskId: string) {
    const project = getProjectById(projectId);

    if (!project) {
      return;
    }

    const nextTasks = project.tasks.filter(task => task.id !== taskId);

    if (nextTasks.length === project.tasks.length) {
      return;
    }

    project.tasks = nextTasks;
    project.updatedAt = Date.now();
    await saveProjects();
  }

  async function moveTask(
    projectId: string,
    taskId: string,
    statusId: ProjectTaskStatusId,
    sortKey: number,
  ) {
    const project = getProjectById(projectId);
    const task = project?.tasks.find(taskItem => taskItem.id === taskId);

    if (!project || !task) {
      return;
    }

    task.statusId = statusId;
    task.sortKey = sortKey;
    task.updatedAt = Date.now();
    task.completedAt = statusId === 'done' ? (task.completedAt ?? Date.now()) : null;
    project.updatedAt = Date.now();
    await saveProjects();
  }

  async function reorderTasksInStatus(
    projectId: string,
    statusId: ProjectTaskStatusId,
    orderedTaskIds: string[],
  ) {
    const project = getProjectById(projectId);

    if (!project) {
      return;
    }

    const taskById = new Map(project.tasks.map(task => [task.id, task]));

    orderedTaskIds.forEach((taskId, index) => {
      const task = taskById.get(taskId);

      if (!task) {
        return;
      }

      task.statusId = statusId;
      task.sortKey = index;
      task.updatedAt = Date.now();
      task.completedAt = statusId === 'done' ? (task.completedAt ?? Date.now()) : null;
    });

    project.updatedAt = Date.now();
    await saveProjects();
  }

  function replacePathPrefix(path: string, oldPrefix: string, newPrefix: string): string | null {
    if (path === oldPrefix) return newPrefix;
    if (path.startsWith(oldPrefix + '/')) return newPrefix + path.slice(oldPrefix.length);
    return null;
  }

  async function handlePathRenamed(oldPath: string, newPath: string) {
    let hasChanges = false;

    for (const project of userProjects.value.projects) {
      let projectChanged = false;

      for (const link of project.workspaceLinks) {
        const updated = replacePathPrefix(link.path, oldPath, newPath);

        if (updated !== null) {
          link.path = updated;
          projectChanged = true;
        }
      }

      const updatedPrimary = replacePathPrefix(project.path, oldPath, newPath);

      if (updatedPrimary !== null) {
        project.path = updatedPrimary;
        projectChanged = true;
      }

      if (projectChanged) {
        syncPrimaryPath(project);
        hasChanges = true;
      }
    }

    if (hasChanges) {
      await saveProjects();
    }
  }

  function isPathAffectedByDeletion(path: string, deletedPaths: string[]): boolean {
    return deletedPaths.some(deletedPath =>
      path === deletedPath || path.startsWith(deletedPath + '/'),
    );
  }

  async function handlePathsDeleted(paths: string[]) {
    let hasChanges = false;

    for (const project of userProjects.value.projects) {
      const nextLinks = project.workspaceLinks.filter(
        link => !isPathAffectedByDeletion(link.path, paths),
      );

      if (nextLinks.length !== project.workspaceLinks.length) {
        project.workspaceLinks = nextLinks;
        syncPrimaryPath(project);
        hasChanges = true;
      }
    }

    const nextProjects = userProjects.value.projects.filter(
      project => project.workspaceLinks.length > 0 || !isPathAffectedByDeletion(project.path, paths),
    );

    // Drop projects that lost every link and have no remaining path.
    const prunedProjects = nextProjects.filter((project) => {
      if (project.workspaceLinks.length > 0) {
        return true;
      }

      return project.path !== '' && !isPathAffectedByDeletion(project.path, paths);
    });

    if (prunedProjects.length !== userProjects.value.projects.length) {
      userProjects.value.projects = prunedProjects;
      if (
        userProjects.value.activeProjectId
        && !prunedProjects.some(project => project.id === userProjects.value.activeProjectId)
      ) {
        userProjects.value.activeProjectId = prunedProjects[0]?.id ?? null;
      }
      hasChanges = true;
    }

    if (hasChanges) {
      await saveProjects();
    }
  }

  async function init(bootstrapFile?: StartupStorageFileBootstrap) {
    const resolvedBootstrapFile = bootstrapFile ?? await getStartupStorageFile('userProjects');
    await initStorage();
    const loadedFromBootstrap = await loadProjectsFromBootstrap(resolvedBootstrapFile);

    if (!loadedFromBootstrap) {
      await loadProjects();
    }
    else {
      await persistIfNeeded();
    }
  }

  return {
    userProjects,
    projects,
    activeProjectId,
    activeProject,
    init,
    isProject,
    getProjectById,
    getProjectByPath,
    getProjectsByPaths,
    createProject,
    addProject,
    removeProject,
    removeProjectById,
    removeProjects,
    updateProject,
    renameProject,
    setProjectDescription,
    setContextNotes,
    setTasksViewMode,
    setActiveProjectId,
    setProjects,
    addWorkspaceLink,
    removeWorkspaceLink,
    recordProjectOpened,
    clearAllProjects,
    addTask,
    updateTask,
    deleteTask,
    moveTask,
    reorderTasksInStatus,
    handlePathRenamed,
    handlePathsDeleted,
  };
});
