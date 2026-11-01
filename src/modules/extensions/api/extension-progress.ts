// SPDX-License-Identifier: GPL-3.0-or-later
// License: GNU GPLv3 or later. See the license file in the project root for more information.
// Copyright © 2021 - present Aleksey Hoffman. All rights reserved.

type CancelHandler = () => void;

const cancelHandlers = new Map<string, CancelHandler>();

export function registerExtensionOperationCancelHandler(operationId: string, handler: CancelHandler): void {
  cancelHandlers.set(operationId, handler);
}

export function unregisterExtensionOperationCancelHandler(operationId: string): void {
  cancelHandlers.delete(operationId);
}

export function requestExtensionOperationCancel(operationId: string): boolean {
  const handler = cancelHandlers.get(operationId);

  if (!handler) {
    return false;
  }

  handler();
  return true;
}
