// SPDX-License-Identifier: GPL-3.0-or-later
// License: GNU GPLv3 or later. See the license file in the project root for more information.
// Copyright © 2021 - present Aleksey Hoffman. All rights reserved.

import { defineStore } from 'pinia';
import { LazyStore } from '@tauri-apps/plugin-store';
import { ref, computed } from 'vue';
import { useUserPathsStore } from './user-paths';
import type { Project, UserProjects } from '@/types/user-projects';
import { DEFAULT_USER_PROJECTS } from '@/types/user-projects';
import {
  canUseStartupStorageFastPath,
  getStartupStorageFile,
  getStartupStorageRecord,
  type StartupStorageFileBootstrap,
} from './utils/startup-storage-bootstrap';
import { basenameFromPath } from '@/utils/source-display-name';
import { haveSameKeyOrder, haveSameKeys } from '@/utils/reorder-matching-items';

export const useUserProjectsStore = defineStore('userProjects', () => {
  const userPathsStore = useUserPathsStore();
  const userProjectsStorage = ref<LazyStore | null>(null);
  const userProjects = ref<UserProjects>(structuredClone(DEFAULT_USER_PROJECTS));

  const projects = computed(() => userProjects.value.projects);

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
    if (!projectsRecord) {
      return;
    }

    for (const [key, value] of Object.entries(projectsRecord)) {
      if (key in userProjects.value) {
        (userProjects.value as Record<string, unknown>)[key] = value;
      }
    }
  }

  async function loadProjects() {
    try {
      const storedProjects = await userProjectsStorage.value?.entries();

      applyProjectsRecord(storedProjects ? Object.fromEntries(storedProjects) : null);
      await deduplicateProjects();
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
    const seenPaths = new Set<string>();
    const deduplicatedProjects: Project[] = [];

    for (const project of userProjects.value.projects) {
      if (!seenPaths.has(project.path)) {
        seenPaths.add(project.path);
        deduplicatedProjects.push(project);
      }
    }

    if (deduplicatedProjects.length !== userProjects.value.projects.length) {
      userProjects.value.projects = deduplicatedProjects;
      await saveProjects();
    }
  }

  async function saveProjects() {
    try {
      if (userProjectsStorage.value) {
        await userProjectsStorage.value.set('projects', userProjects.value.projects);
        await userProjectsStorage.value.save();
      }
    }
    catch (error) {
      console.error('Failed to save user projects:', error);
    }
  }

  function isProject(path: string): boolean {
    return userProjects.value.projects.some(project => project.path === path);
  }

  function getProjectByPath(path: string): Project | null {
    return userProjects.value.projects.find(project => project.path === path) ?? null;
  }

  function getProjectsByPaths(paths: string[]): Project[] {
    const pathSet = new Set(paths);

    return userProjects.value.projects.filter(project => pathSet.has(project.path));
  }

  async function addProject(path: string, options?: { name?: string }): Promise<Project | null> {
    const existingProject = getProjectByPath(path);

    if (existingProject) {
      return existingProject;
    }

    const newProject: Project = {
      id: `project-${Date.now()}`,
      path,
      name: options?.name ?? basenameFromPath(path),
      tagIds: [],
      ideCommand: null,
      terminalProfile: null,
      addedAt: Date.now(),
      lastOpenedAt: null,
      openCount: 0,
    };

    userProjects.value.projects.push(newProject);
    await saveProjects();
    return newProject;
  }

  async function removeProject(path: string) {
    const projectIndex = userProjects.value.projects.findIndex(project => project.path === path);

    if (projectIndex !== -1) {
      userProjects.value.projects.splice(projectIndex, 1);
      await saveProjects();
    }
  }

  async function removeProjects(paths: string[]) {
    const pathSet = new Set(paths);
    const nextProjects = userProjects.value.projects.filter(project => !pathSet.has(project.path));

    if (nextProjects.length !== userProjects.value.projects.length) {
      userProjects.value.projects = nextProjects;
      await saveProjects();
    }
  }

  async function updateProject(id: string, patch: Partial<Omit<Project, 'id'>>) {
    const project = userProjects.value.projects.find(projectItem => projectItem.id === id);

    if (!project) {
      return;
    }

    Object.assign(project, patch);
    await saveProjects();
  }

  async function renameProject(id: string, name: string) {
    const trimmed = name.trim();

    if (!trimmed) {
      return;
    }

    await updateProject(id, { name: trimmed });
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

  async function recordProjectOpened(path: string) {
    const project = getProjectByPath(path);

    if (!project) {
      return;
    }

    project.lastOpenedAt = Date.now();
    project.openCount += 1;
    await saveProjects();
  }

  async function clearAllProjects() {
    if (userProjects.value.projects.length === 0) {
      return;
    }

    userProjects.value.projects = [];
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
      const updated = replacePathPrefix(project.path, oldPath, newPath);

      if (updated !== null) {
        project.path = updated;
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
    const originalCount = userProjects.value.projects.length;

    userProjects.value.projects = userProjects.value.projects.filter(
      project => !isPathAffectedByDeletion(project.path, paths),
    );

    if (userProjects.value.projects.length !== originalCount) {
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
  }

  return {
    userProjects,
    projects,
    init,
    isProject,
    getProjectByPath,
    getProjectsByPaths,
    addProject,
    removeProject,
    removeProjects,
    updateProject,
    renameProject,
    setProjects,
    recordProjectOpened,
    clearAllProjects,
    handlePathRenamed,
    handlePathsDeleted,
  };
});
