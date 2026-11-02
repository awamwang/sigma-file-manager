// SPDX-License-Identifier: GPL-3.0-or-later
// License: GNU GPLv3 or later. See the license file in the project root for more information.
// Copyright © 2021 - present Aleksey Hoffman. All rights reserved.

import { normalizePathForComparison } from '@/utils/file-operation-paths';

export type MemberPathDiff = {
  nextMemberPaths: string[];
  addedPaths: string[];
  removedPaths: string[];
  hasChanges: boolean;
};

export function isExactMemberPath(path: string, memberPaths: string[]): boolean {
  const comparisonPath = normalizePathForComparison(path);

  if (!comparisonPath) {
    return false;
  }

  return memberPaths.some(memberPath => normalizePathForComparison(memberPath) === comparisonPath);
}

export function isPathUnderMemberFolders(path: string, memberPaths: string[]): boolean {
  const comparisonPath = normalizePathForComparison(path);

  if (!comparisonPath) {
    return false;
  }

  return memberPaths.some((memberPath) => {
    const comparisonMemberPath = normalizePathForComparison(memberPath);

    if (!comparisonMemberPath) {
      return false;
    }

    return comparisonPath === comparisonMemberPath
      || comparisonPath.startsWith(`${comparisonMemberPath}/`);
  });
}

/** Deduplicate paths by comparison key while preserving first-seen original form and order. */
export function uniqueMemberPaths(paths: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const path of paths) {
    const comparable = normalizePathForComparison(path);

    if (!comparable || seen.has(comparable)) {
      continue;
    }

    seen.add(comparable);
    unique.push(path);
  }

  return unique;
}

export function diffMemberPaths(
  currentMemberPaths: string[],
  nextMemberPaths: string[],
): MemberPathDiff {
  const nextUnique = uniqueMemberPaths(nextMemberPaths);
  const addedPaths = nextUnique.filter(path => !isExactMemberPath(path, currentMemberPaths));
  const removedPaths = currentMemberPaths.filter(path => !isExactMemberPath(path, nextUnique));

  return {
    nextMemberPaths: nextUnique,
    addedPaths,
    removedPaths,
    hasChanges: addedPaths.length > 0 || removedPaths.length > 0,
  };
}
