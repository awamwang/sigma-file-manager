// SPDX-License-Identifier: GPL-3.0-or-later
// License: GNU GPLv3 or later. See the license file in the project root for more information.
// Copyright © 2021 - present Aleksey Hoffman. All rights reserved.

import { useStatusCenterStore, type Operation } from '@/stores/runtime/status-center';
import {
  registerExtensionOperationCancelHandler,
  unregisterExtensionOperationCancelHandler,
} from '@/modules/extensions/api/extension-progress';
import type { ExtensionContext } from '@/modules/extensions/api/extension-context';
import type {
  CancellationToken,
  Disposable,
  Progress,
  ProgressOptions,
  ProgressReport,
} from '@/types/extension';

export async function runStatusCenterProgress<T>(
  context: ExtensionContext,
  options: ProgressOptions,
  task: (progress: Progress, token: CancellationToken) => Promise<T>,
): Promise<T> {
  const statusCenterStore = useStatusCenterStore();
  const operationId = `extension-progress-${context.extensionId}-${Date.now()}`;

  let currentProgress = 0;
  let isCancelled = false;
  const cancellationListeners: Array<() => void> = [];

  statusCenterStore.addOperation({
    id: operationId,
    type: 'extension',
    status: 'in-progress',
    label: options.subtitle,
    path: '',
    progress: 0,
    cancellable: options.cancellable !== false,
    extensionId: context.extensionId,
    extensionName: context.getExtensionName(),
    extensionIconPath: context.getExtensionIconPath(),
  });

  registerExtensionOperationCancelHandler(operationId, () => {
    if (isCancelled) {
      return;
    }

    isCancelled = true;
    cancellationListeners.forEach(listener => listener());
  });

  const progress: Progress = {
    report: (value: ProgressReport): void => {
      if (isCancelled && (value.increment !== undefined || value.value !== undefined)) {
        return;
      }

      const updates: Partial<Operation> = {};

      if (value.description !== undefined) {
        updates.message = value.description;
      }
      else if (value.subtitle !== undefined) {
        updates.message = value.subtitle;
      }

      if (value.value !== undefined && Number.isFinite(value.value)) {
        currentProgress = Math.max(0, Math.min(100, value.value));
        updates.progress = Math.round(currentProgress);
      }
      else if (value.increment !== undefined) {
        currentProgress = Math.min(100, currentProgress + value.increment);
        updates.progress = Math.round(currentProgress);
      }

      if (Object.keys(updates).length > 0) {
        statusCenterStore.updateOperation(operationId, updates);
      }
    },
  };

  const token: CancellationToken = {
    get isCancellationRequested() {
      return isCancelled;
    },
    onCancellationRequested: (listener: () => void): Disposable => {
      cancellationListeners.push(listener);

      return {
        dispose: () => {
          const listenerIndex = cancellationListeners.indexOf(listener);

          if (listenerIndex !== -1) {
            cancellationListeners.splice(listenerIndex, 1);
          }
        },
      };
    },
  };

  try {
    const result = await task(progress, token);

    statusCenterStore.completeOperation(operationId, isCancelled ? 'cancelled' : 'completed');
    return result;
  }
  catch (error) {
    if (isCancelled) {
      statusCenterStore.completeOperation(operationId, 'cancelled');
    }
    else {
      statusCenterStore.completeOperation(
        operationId,
        'error',
        error instanceof Error ? error.message : String(error),
      );
    }

    throw error;
  }
  finally {
    unregisterExtensionOperationCancelHandler(operationId);
  }
}
