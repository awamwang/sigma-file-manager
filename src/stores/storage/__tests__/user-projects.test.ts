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

function createProject(overrides: Partial<Project> = {}): Project {
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

function createProjectsBootstrap(data: Record<string, unknown>): StartupStorageFileBootstrap {
  return {
    path: '/tmp/user-data/user-projects.json',
    status: 'ready',
    data,
    schemaVersion: 1,
    error: null,
  };
}

describe('user projects store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    storedValues.clear();
    lazyStoreSaveMock.mockReset();
    lazyStoreSetMock.mockReset();
  });

  it('initializes from the startup bootstrap fast path', async () => {
    const projects = [createProject()];
    const store = useUserProjectsStore();
    await store.init(createProjectsBootstrap({ projects }));

    expect(store.projects).toEqual(projects);
    expect(store.isProject('/home/user/project-a')).toBe(true);
  });

  it('adds a project with a name derived from the path and persists it', async () => {
    const store = useUserProjectsStore();
    await store.init(createProjectsBootstrap({ projects: [] }));
    lazyStoreSetMock.mockClear();
    lazyStoreSaveMock.mockClear();

    const addedProject = await store.addProject('/home/user/project-b');

    expect(addedProject?.name).toBe('project-b');
    expect(store.projects.map(project => project.path)).toEqual(['/home/user/project-b']);
    expect(lazyStoreSetMock).toHaveBeenCalledWith('projects', store.projects);
    expect(lazyStoreSaveMock).toHaveBeenCalled();
  });

  it('does not duplicate a project that already exists', async () => {
    const existingProject = createProject();
    const store = useUserProjectsStore();
    await store.init(createProjectsBootstrap({ projects: [existingProject] }));
    lazyStoreSetMock.mockClear();

    const addedProject = await store.addProject('/home/user/project-a');

    expect(addedProject?.id).toBe(existingProject.id);
    expect(store.projects).toHaveLength(1);
    expect(lazyStoreSetMock).not.toHaveBeenCalled();
  });

  it('removes projects by path', async () => {
    const projects = [createProject(), createProject({
      id: 'project-2',
      path: '/home/user/project-b',
      name: 'project-b',
    })];
    const store = useUserProjectsStore();
    await store.init(createProjectsBootstrap({ projects }));
    lazyStoreSetMock.mockClear();

    await store.removeProjects(['/home/user/project-a']);

    expect(store.projects.map(project => project.path)).toEqual(['/home/user/project-b']);
    expect(lazyStoreSetMock).toHaveBeenCalledWith('projects', store.projects);
  });

  it('records project opens', async () => {
    const store = useUserProjectsStore();
    await store.init(createProjectsBootstrap({ projects: [createProject()] }));
    lazyStoreSetMock.mockClear();

    await store.recordProjectOpened('/home/user/project-a');

    const project = store.getProjectByPath('/home/user/project-a');
    expect(project?.openCount).toBe(1);
    expect(project?.lastOpenedAt).not.toBeNull();
    expect(lazyStoreSetMock).toHaveBeenCalledWith('projects', store.projects);
  });

  it('saves reordered projects with matching membership', async () => {
    const projects = [
      createProject(),
      createProject({ id: 'project-2', path: '/home/user/project-b', name: 'project-b' }),
      createProject({ id: 'project-3', path: '/home/user/project-c', name: 'project-c' }),
    ];
    const store = useUserProjectsStore();
    await store.init(createProjectsBootstrap({ projects }));
    lazyStoreSetMock.mockClear();
    lazyStoreSaveMock.mockClear();

    await store.setProjects([projects[2], projects[0], projects[1]]);

    expect(store.projects.map(project => project.id)).toEqual([
      'project-3',
      'project-1',
      'project-2',
    ]);
    expect(lazyStoreSetMock).toHaveBeenCalledWith('projects', store.projects);
    expect(lazyStoreSaveMock).toHaveBeenCalled();
  });

  it('does not persist a reorder that changes membership', async () => {
    const projects = [
      createProject(),
      createProject({ id: 'project-2', path: '/home/user/project-b', name: 'project-b' }),
    ];
    const store = useUserProjectsStore();
    await store.init(createProjectsBootstrap({ projects }));
    lazyStoreSetMock.mockClear();

    await store.setProjects([projects[0]]);

    expect(store.projects).toHaveLength(2);
    expect(lazyStoreSetMock).not.toHaveBeenCalled();
  });

  it('updates project fields', async () => {
    const store = useUserProjectsStore();
    await store.init(createProjectsBootstrap({ projects: [createProject()] }));
    lazyStoreSetMock.mockClear();

    await store.updateProject('project-1', { ideCommand: 'code --new-window' });

    expect(store.getProjectByPath('/home/user/project-a')?.ideCommand).toBe('code --new-window');
    expect(lazyStoreSetMock).toHaveBeenCalledWith('projects', store.projects);
  });

  it('rewrites project paths after a rename', async () => {
    const projects = [
      createProject(),
      createProject({ id: 'project-2', path: '/home/user/project-a/nested', name: 'nested' }),
    ];
    const store = useUserProjectsStore();
    await store.init(createProjectsBootstrap({ projects }));
    lazyStoreSetMock.mockClear();

    await store.handlePathRenamed('/home/user/project-a', '/home/user/project-renamed');

    expect(store.projects.map(project => project.path)).toEqual([
      '/home/user/project-renamed',
      '/home/user/project-renamed/nested',
    ]);
    expect(lazyStoreSetMock).toHaveBeenCalledWith('projects', store.projects);
  });

  it('drops projects affected by a deletion', async () => {
    const projects = [
      createProject(),
      createProject({ id: 'project-2', path: '/home/user/project-b', name: 'project-b' }),
      createProject({
        id: 'project-3',
        path: '/home/user/project-a/nested',
        name: 'nested',
      }),
    ];
    const store = useUserProjectsStore();
    await store.init(createProjectsBootstrap({ projects }));
    lazyStoreSetMock.mockClear();

    await store.handlePathsDeleted(['/home/user/project-a']);

    expect(store.projects.map(project => project.path)).toEqual(['/home/user/project-b']);
    expect(lazyStoreSetMock).toHaveBeenCalledWith('projects', store.projects);
  });

  it('deduplicates projects loaded with duplicate paths', async () => {
    const store = useUserProjectsStore();
    await store.init(createProjectsBootstrap({
      projects: [
        createProject(),
        createProject({ id: 'project-2', name: 'duplicate' }),
      ],
    }));

    expect(store.projects).toHaveLength(1);
  });
});
