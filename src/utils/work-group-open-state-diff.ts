// SPDX-License-Identifier: GPL-3.0-or-later
// License: GNU GPLv3 or later. See the license file in the project root for more information.
// Copyright © 2021 - present Aleksey Hoffman. All rights reserved.

import type { WorkGroupOpenState } from '@/types/user-work-groups';
import { normalizePathForComparison } from '@/utils/file-operation-paths';

export type OpenStatePathChurn = {
  addedCount: number;
  closedCount: number;
  addedPaths: string[];
  closedPaths: string[];
};

function collectComparablePaths(openState: WorkGroupOpenState | null | undefined): string[] {
  if (!openState) {
    return [];
  }

  const paths: string[] = [];

  for (const tabGroup of openState.tabGroups) {
    for (const tab of tabGroup) {
      const comparable = normalizePathForComparison(tab.path);
      if (comparable) {
        paths.push(comparable);
      }
    }
  }

  return paths;
}

export function diffOpenStatePaths(
  fromState: WorkGroupOpenState | null | undefined,
  toState: WorkGroupOpenState | null | undefined,
): OpenStatePathChurn {
  const fromSet = new Set(collectComparablePaths(fromState));
  const toSet = new Set(collectComparablePaths(toState));

  const addedPaths: string[] = [];
  const closedPaths: string[] = [];

  for (const path of toSet) {
    if (!fromSet.has(path)) {
      addedPaths.push(path);
    }
  }

  for (const path of fromSet) {
    if (!toSet.has(path)) {
      closedPaths.push(path);
    }
  }

  return {
    addedCount: addedPaths.length,
    closedCount: closedPaths.length,
    addedPaths,
    closedPaths,
  };
}
