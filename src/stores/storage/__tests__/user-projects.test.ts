// SPDX-License-Identifier: GPL-3.0-or-later
// License: GNU GPLv3 or later. See the license file in the project root for more information.
// Copyright © 2021 - present Aleksey Hoffman. All rights reserved.

import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import type { StartupStorageFileBootstrap } from '@/stores/storage/utils/startup-storage-bootstrap';
import { useUserProjectsStore } from '@/stores/storage/user-projects';
import type { Project } from '@/types/user-projects';
import { USER_PROJECTS_SCHEMA_VERSION } from '@/types/user-projects';
import { migrateUserProjectsRecord } from '@/stores/schemas/user-projects';

const {
  lazyStoreSaveMock,
  lazyStoreSetMock,
  storedValues,
} = vi.hoisted(() => ({
  lazyStoreSaveMock: vi.fn(),
  lazyStoreSetMock: vi.fn(),
  storedValues: new Map<string, unknown>(),
}));

vi.mock('@tauri-apps/plugin-store', () => ({
  LazyStore: class {
    async save(): Promise<void> {
      await lazyStoreSaveMock();
    }

    async set(key: string, value: unknown): Promise<void> {
      storedValues.set(key, value);
      await lazyStoreSetMock(key, value);
    }

    async entries(): Promise<[string, unknown][]> {
      return Array.from(storedValues.entries());
    }
  },
}));

vi.mock('@/stores/storage/user-paths', () => ({
  useUserPathsStore: () => ({
    customPaths: {
      appUserDataProjectsPath: '/tmp/user-data/user-projects.json',
    },
  }),
}));

function createLegacyProject(overrides: Record<string, unknown> = {}) {
  return {
    id: 'project-1',
    path: '/home/user/project-a',
    name: 'project-a',
    tagIds: [],
    ideCommand: null,
    terminalProfile: null,
    addedAt: 1,
    lastOpenedAt: null,
    openCount: 0,
    ...overrides,
  };
}

function createProject(overrides: Partial<Project> = {}): Project {
  const migrated = migrateUserProjectsRecord({
    projects: [createLegacyProject(overrides as Record<string, unknown>)],
  }).projects[0];

  return {
    ...migrated,
    ...overrides,
    workspaceLinks: overrides.workspaceLinks ?? migrated.workspaceLinks,
    tasks: overrides.tasks ?? migrated.tasks,
  };
}

function createProjectsBootstrap(data: Record<string, unknown>): StartupStorageFileBootstrap {
  return {
    path: '/tmp/user-data/user-projects.json',
    status: 'ready',
    data,
    schemaVersion: 1,
    error: null,
  };
}

describe('user projects migration', () => {
  it('migrates legacy single-path projects into workspaceLinks', () => {
    const migrated = migrateUserProjectsRecord({
      projects: [createLegacyProject({ ideCommand: 'cursor' })],
    });

    expect(migrated.schemaVersion).toBe(USER_PROJECTS_SCHEMA_VERSION);
    expect(migrated.projects).toHaveLength(1);
    expect(migrated.projects[0].workspaceLinks).toHaveLength(1);
    expect(migrated.projects[0].workspaceLinks[0].path).toBe('/home/user/project-a');
    expect(migrated.projects[0].path).toBe('/home/user/project-a');
    expect(migrated.projects[0].ideCommand).toBe('cursor');
    expect(migrated.projects[0].tasks).toEqual([]);
    expect(migrated.projects[0].contextNotes).toBe('');
  });
});

describe('user projects store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    storedValues.clear();
    lazyStoreSaveMock.mockReset();
    lazyStoreSetMock.mockReset();
  });

  it('initializes from the startup bootstrap fast path and migrates', async () => {
    const store = useUserProjectsStore();
    await store.init(createProjectsBootstrap({
      projects: [createLegacyProject()],
    }));

    expect(store.projects).toHaveLength(1);
    expect(store.isProject('/home/user/project-a')).toBe(true);
    expect(store.projects[0].workspaceLinks[0].path).toBe('/home/user/project-a');
  });

  it('adds a project with a workspace link derived from the path', async () => {
    const store = useUserProjectsStore();
    await store.init(createProjectsBootstrap({ projects: [] }));
    lazyStoreSetMock.mockClear();
    lazyStoreSaveMock.mockClear();

    const addedProject = await store.addProject('/home/user/project-b');

    expect(addedProject?.name).toBe('project-b');
    expect(store.projects.map(project => project.path)).toEqual(['/home/user/project-b']);
    expect(addedProject?.workspaceLinks).toHaveLength(1);
    expect(lazyStoreSetMock).toHaveBeenCalledWith('projects', store.projects);
    expect(lazyStoreSaveMock).toHaveBeenCalled();
  });

  it('does not duplicate a project that already owns the path', async () => {
    const existingProject = createProject();
    const store = useUserProjectsStore();
    await store.init(createProjectsBootstrap({ projects: [existingProject] }));
    lazyStoreSetMock.mockClear();

    const addedProject = await store.addProject('/home/user/project-a');

    expect(addedProject?.id).toBe(existingProject.id);
    expect(store.projects).toHaveLength(1);
    expect(lazyStoreSetMock).not.toHaveBeenCalled();
  });

  it('removes a workspace link or deletes the project when last link is removed', async () => {
    const store = useUserProjectsStore();
    await store.init(createProjectsBootstrap({ projects: [] }));
    const project = await store.createProject({ name: 'Multi', path: '/home/user/a' });
    await store.addWorkspaceLink(project.id, '/home/user/b');
    lazyStoreSetMock.mockClear();

    await store.removeProject('/home/user/a');

    expect(store.projects).toHaveLength(1);
    expect(store.projects[0].workspaceLinks.map(link => link.path)).toEqual(['/home/user/b']);

    await store.removeProject('/home/user/b');
    expect(store.projects).toHaveLength(0);
  });

  it('records project opens by path or id', async () => {
    const store = useUserProjectsStore();
    await store.init(createProjectsBootstrap({ projects: [createProject()] }));
    lazyStoreSetMock.mockClear();

    await store.recordProjectOpened('/home/user/project-a');

    const project = store.getProjectByPath('/home/user/project-a');
    expect(project?.openCount).toBe(1);
    expect(project?.lastOpenedAt).not.toBeNull();
    expect(store.activeProjectId).toBe(project?.id);
  });

  it('adds and reorders tasks within a status column', async () => {
    const store = useUserProjectsStore();
    await store.init(createProjectsBootstrap({ projects: [] }));
    const project = await store.createProject({ name: 'Board' });
    const taskA = await store.addTask(project.id, { title: 'A' });
    const taskB = await store.addTask(project.id, { title: 'B' });

    expect(taskA && taskB).toBeTruthy();

    await store.reorderTasksInStatus(project.id, 'backlog', [taskB!.id, taskA!.id]);

    const backlog = store.getProjectById(project.id)?.tasks
      .filter(task => task.statusId === 'backlog')
      .sort((left, right) => left.sortKey - right.sortKey)
      .map(task => task.title);

    expect(backlog).toEqual(['B', 'A']);
  });

  it('moves a task across columns', async () => {
    const store = useUserProjectsStore();
    await store.init(createProjectsBootstrap({ projects: [] }));
    const project = await store.createProject({ name: 'Board' });
    const task = await store.addTask(project.id, { title: 'Ship' });

    await store.moveTask(project.id, task!.id, 'doing', 0);

    expect(store.getProjectById(project.id)?.tasks[0].statusId).toBe('doing');
  });

  it('updates project fields and context notes', async () => {
    const store = useUserProjectsStore();
    await store.init(createProjectsBootstrap({ projects: [createProject()] }));
    lazyStoreSetMock.mockClear();

    await store.updateProject('project-1', { ideCommand: 'code --new-window' });
    await store.setContextNotes('project-1', 'Remember local workers');

    expect(store.getProjectByPath('/home/user/project-a')?.ideCommand).toBe('code --new-window');
    expect(store.getProjectByPath('/home/user/project-a')?.contextNotes).toBe('Remember local workers');
  });

  it('rewrites workspace link paths after a rename', async () => {
    const store = useUserProjectsStore();
    await store.init(createProjectsBootstrap({
      projects: [
        createLegacyProject(),
        createLegacyProject({ id: 'project-2', path: '/home/user/project-a/nested', name: 'nested' }),
      ],
    }));
    lazyStoreSetMock.mockClear();

    await store.handlePathRenamed('/home/user/project-a', '/home/user/project-renamed');

    expect(store.projects.map(project => project.path)).toEqual([
      '/home/user/project-renamed',
      '/home/user/project-renamed/nested',
    ]);
  });

  it('drops workspace links affected by a deletion', async () => {
    const store = useUserProjectsStore();
    await store.init(createProjectsBootstrap({ projects: [] }));
    const project = await store.createProject({ name: 'Keep', path: '/home/user/project-b' });
    await store.addWorkspaceLink(project.id, '/home/user/project-a/nested');
    await store.createProject({ name: 'Gone', path: '/home/user/project-a' });
    lazyStoreSetMock.mockClear();

    await store.handlePathsDeleted(['/home/user/project-a']);

    expect(store.projects.map(projectItem => projectItem.name)).toEqual(['Keep']);
    expect(store.projects[0].workspaceLinks.map(link => link.path)).toEqual(['/home/user/project-b']);
  });
});
