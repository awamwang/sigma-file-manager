// SPDX-License-Identifier: GPL-3.0-or-later
// License: GNU GPLv3 or later. See the license file in the project root for more information.
// Copyright © 2021 - present Aleksey Hoffman. All rights reserved.

import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';

const {
  routerPushMock,
  getCurrentPathMock,
  isProjectMock,
  getProjectByPathMock,
  addProjectMock,
  toastCustomMock,
  tMock,
  openProjectsPickerMock,
} = vi.hoisted(() => ({
  routerPushMock: vi.fn(),
  getCurrentPathMock: vi.fn(),
  isProjectMock: vi.fn(),
  getProjectByPathMock: vi.fn(),
  addProjectMock: vi.fn(),
  toastCustomMock: vi.fn(),
  tMock: vi.fn((key: string) => key),
  openProjectsPickerMock: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(),
  save: vi.fn(),
}));

vi.mock('@/stores/runtime/quick-view', () => ({
  useQuickViewStore: () => ({
    openFileFromMainWindow: vi.fn(),
    closeWindow: vi.fn(),
  }),
}));

vi.mock('@/stores/storage/user-projects', () => ({
  useUserProjectsStore: () => ({
    isProject: isProjectMock,
    getProjectByPath: getProjectByPathMock,
    addProject: addProjectMock,
  }),
}));

vi.mock('@/components/ui/toaster', () => ({
  toast: {
    custom: toastCustomMock,
  },
  ToastStatic: {},
}));

vi.mock('@/localization', () => ({
  i18n: {
    global: {
      t: tMock,
    },
  },
}));

vi.mock('@/modules/extensions/context', () => ({
  getCurrentPath: getCurrentPathMock,
}));

vi.mock('@/router', () => ({
  default: {
    push: routerPushMock,
  },
}));

import {
  getBuiltinCommandDefinitions,
  getBuiltinCommandHandler,
  registerOpenProjectsPicker,
  unregisterOpenProjectsPicker,
} from '@/modules/extensions/builtin-commands';

describe('extension builtin commands', () => {
  it('opens extension pages through the router', async () => {
    const handler = getBuiltinCommandHandler('sigma.app.openExtensionPage');

    await expect(handler?.('sigma.excalidraw.excalidraw')).resolves.toBeUndefined();
    expect(routerPushMock).toHaveBeenCalledWith({
      name: 'extension-page',
      params: {
        fullPageId: 'sigma.excalidraw.excalidraw',
      },
    });
  });
});

describe('projects builtin commands', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    unregisterOpenProjectsPicker();
  });

  it('exposes the project commands in the palette', () => {
    const definitions = getBuiltinCommandDefinitions();
    const openProject = definitions.find(
      definition => definition.id === 'sigma.projects.open',
    );
    const addCurrentFolder = definitions.find(
      definition => definition.id === 'sigma.projects.addCurrentFolder',
    );

    expect(openProject?.showInPalette).toBe(true);
    expect(addCurrentFolder?.showInPalette).toBe(true);
  });

  it('opens the registered projects quick picker', async () => {
    registerOpenProjectsPicker(openProjectsPickerMock);
    const handler = getBuiltinCommandHandler('sigma.projects.open');

    await expect(handler?.()).resolves.toBeUndefined();
    expect(openProjectsPickerMock).toHaveBeenCalledTimes(1);
  });

  it('throws when the projects quick picker is not registered', async () => {
    const handler = getBuiltinCommandHandler('sigma.projects.open');

    await expect(handler?.()).rejects.toThrow(
      'Projects quick picker is not available',
    );
  });

  it('adds the current folder to projects', async () => {
    getCurrentPathMock.mockReturnValue('/home/user/project-a');
    isProjectMock.mockReturnValue(false);
    addProjectMock.mockResolvedValue(null);
    const handler = getBuiltinCommandHandler('sigma.projects.addCurrentFolder');

    await expect(handler?.()).resolves.toBeUndefined();
    expect(addProjectMock).toHaveBeenCalledWith('/home/user/project-a');
    expect(toastCustomMock).toHaveBeenCalledTimes(1);
  });

  it('shows an info toast when the current folder is already a project', async () => {
    getCurrentPathMock.mockReturnValue('/home/user/project-a');
    isProjectMock.mockReturnValue(true);
    getProjectByPathMock.mockReturnValue({
      id: 'project-1',
      name: 'project-a',
      path: '/home/user/project-a',
    });
    const handler = getBuiltinCommandHandler('sigma.projects.addCurrentFolder');

    await expect(handler?.()).resolves.toBeUndefined();
    expect(addProjectMock).not.toHaveBeenCalled();
    expect(toastCustomMock).toHaveBeenCalledTimes(1);
    expect(tMock).toHaveBeenCalledWith('projectsPicker.alreadyInProjects', {
      name: 'project-a',
    });
  });

  it('shows a toast when no folder is open in the active tab', async () => {
    getCurrentPathMock.mockReturnValue(null);
    const handler = getBuiltinCommandHandler('sigma.projects.addCurrentFolder');

    await expect(handler?.()).resolves.toBeUndefined();
    expect(addProjectMock).not.toHaveBeenCalled();
    expect(toastCustomMock).toHaveBeenCalledTimes(1);
    expect(tMock).toHaveBeenCalledWith('projectsPicker.noActiveFolder');
  });
});
