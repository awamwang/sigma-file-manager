// SPDX-License-Identifier: GPL-3.0-or-later
// License: GNU GPLv3 or later. See the license file in the project root for more information.
// Copyright © 2021 - present Aleksey Hoffman. All rights reserved.

import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';
import type { ExtensionPermission } from '@/types/extension';
import type { ExtensionContext } from '@/modules/extensions/api/extension-context';
import { createPinia, setActivePinia } from 'pinia';
import { useStatusCenterStore } from '@/stores/runtime/status-center';
import { requestExtensionOperationCancel } from '@/modules/extensions/api/extension-progress';
import { runStatusCenterProgress } from '@/modules/extensions/api/ui-progress';

function createContext(): ExtensionContext {
  return {
    extensionId: 'test.extension',
    hasPermission: (permission: ExtensionPermission) => permission === 'notifications',
    t: (key: string) => key,
    getExtensionPath: vi.fn(),
    getExtensionStoragePath: vi.fn(),
    isPathWithinDirectory: vi.fn(),
    isInExtensionDir: vi.fn(),
    isInExtensionStorageDir: vi.fn(),
    getSharedBinariesDir: vi.fn(),
    isInSharedBinariesDir: vi.fn(),
    isInAllowedReadDir: vi.fn(),
    isInAllowedWriteDir: vi.fn(),
    normalizeRelativePath: vi.fn(),
    resolvePrivatePath: vi.fn(),
    resolveStoragePath: vi.fn(),
    getExtensionName: vi.fn(() => 'Test Extension'),
    getExtensionIconPath: vi.fn(() => 'assets/icon.png'),
    getExtensionToastTitle: vi.fn(),
    grantDialogReadAccess: vi.fn(),
    hasDialogReadAccess: vi.fn(),
    grantDialogWriteAccess: vi.fn(),
    consumeDialogWriteAccess: vi.fn(),
    grantSessionAccessFromNavigation: vi.fn(),
    grantSessionAccessFromCurrentNavigation: vi.fn(),
  };
}

describe('runStatusCenterProgress', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('registers an extension operation with the extension identity', async () => {
    const statusCenterStore = useStatusCenterStore();
    const context = createContext();

    await runStatusCenterProgress(context, { subtitle: 'Indexing files' }, async () => 'done');

    expect(statusCenterStore.operationsList).toHaveLength(1);

    const operation = statusCenterStore.operationsList[0];
    expect(operation.type).toBe('extension');
    expect(operation.status).toBe('completed');
    expect(operation.label).toBe('Indexing files');
    expect(operation.extensionId).toBe('test.extension');
    expect(operation.extensionName).toBe('Test Extension');
    expect(operation.extensionIconPath).toBe('assets/icon.png');
    expect(operation.cancellable).toBe(true);
  });

  it('marks the operation as non-cancellable when requested', async () => {
    const statusCenterStore = useStatusCenterStore();

    await runStatusCenterProgress(
      createContext(),
      {
        subtitle: 'Working',
        cancellable: false,
      },
      async () => 'done',
    );

    expect(statusCenterStore.operationsList[0].cancellable).toBe(false);
  });

  it('reports progress updates to the operation', async () => {
    const statusCenterStore = useStatusCenterStore();
    let messageDuringTask = '';

    await runStatusCenterProgress(createContext(), { subtitle: 'Working' }, async (progress) => {
      progress.report({ value: 25 });
      progress.report({ increment: 50 });
      progress.report({ description: 'Compressing' });
      messageDuringTask = statusCenterStore.operationsList[0].message ?? '';
      return 'done';
    });

    const operation = statusCenterStore.operationsList[0];
    expect(operation.progress).toBe(75);
    expect(messageDuringTask).toBe('Compressing');
  });

  it('completes the operation when the task resolves', async () => {
    const statusCenterStore = useStatusCenterStore();

    const result = await runStatusCenterProgress(
      createContext(),
      { subtitle: 'Working' },
      async () => 'task-result',
    );

    expect(result).toBe('task-result');
    expect(statusCenterStore.operationsList[0].status).toBe('completed');
    expect(statusCenterStore.operationsList[0].completedAt).toBeDefined();
  });

  it('cancels the operation through the registered cancel handler', async () => {
    const statusCenterStore = useStatusCenterStore();
    let operationId = '';

    await runStatusCenterProgress(
      createContext(),
      {
        subtitle: 'Working',
        cancellable: true,
      },
      async (progress, token) => {
        operationId = statusCenterStore.operationsList[0].id;

        const cancellationRequested = new Promise<void>((resolve) => {
          token.onCancellationRequested(() => resolve());
        });

        requestExtensionOperationCancel(operationId);
        expect(token.isCancellationRequested).toBe(true);

        progress.report({ value: 90 });
        await cancellationRequested;

        return 'stopped';
      },
    );

    const operation = statusCenterStore.operationsList[0];
    expect(operation.progress).toBe(0);
    expect(operation.status).toBe('cancelled');
  });

  it('marks the operation as errored with the error message when the task rejects', async () => {
    const statusCenterStore = useStatusCenterStore();

    await expect(
      runStatusCenterProgress(createContext(), { subtitle: 'Working' }, async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    const operation = statusCenterStore.operationsList[0];
    expect(operation.status).toBe('error');
    expect(operation.message).toBe('boom');
  });

  it('marks the operation as cancelled when the task rejects after cancellation', async () => {
    const statusCenterStore = useStatusCenterStore();

    const taskPromise = runStatusCenterProgress(
      createContext(),
      { subtitle: 'Working' },
      async (_progress, token) => {
        await new Promise<void>((resolve) => {
          token.onCancellationRequested(() => resolve());
        });

        throw new Error('interrupted');
      },
    );

    await vi.waitFor(() => {
      expect(statusCenterStore.operationsList).toHaveLength(1);
    });

    requestExtensionOperationCancel(statusCenterStore.operationsList[0].id);

    await expect(taskPromise).rejects.toThrow('interrupted');
    expect(statusCenterStore.operationsList[0].status).toBe('cancelled');
  });
});
