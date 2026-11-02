// SPDX-License-Identifier: GPL-3.0-or-later
// License: GNU GPLv3 or later. See the license file in the project root for more information.
// Copyright © 2021 - present Aleksey Hoffman. All rights reserved.

import { normalizePathForComparison } from '@/utils/file-operation-paths';

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
