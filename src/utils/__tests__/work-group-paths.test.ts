// SPDX-License-Identifier: GPL-3.0-or-later
// License: GNU GPLv3 or later. See the license file in the project root for more information.
// Copyright © 2021 - present Aleksey Hoffman. All rights reserved.

import { describe, expect, it } from 'vitest';
import {
  diffMemberPaths,
  isExactMemberPath,
  isPathUnderMemberFolders,
  uniqueMemberPaths,
} from '@/utils/work-group-paths';

describe('work-group-paths', () => {
  it('matches exact member paths only for close-member semantics', () => {
    expect(isExactMemberPath('D:/work/client', ['D:/work/client'])).toBe(true);
    expect(isExactMemberPath('D:/work/client/src', ['D:/work/client'])).toBe(false);
  });

  it('treats descendants as under member folders for group defaults', () => {
    expect(isPathUnderMemberFolders('D:/work/client/src', ['D:/work/client'])).toBe(true);
    expect(isPathUnderMemberFolders('D:/temp', ['D:/work/client'])).toBe(false);
  });

  it('deduplicates member paths by comparison key', () => {
    expect(uniqueMemberPaths(['D:/work/A', 'D:/work/a', 'D:/work/B'])).toEqual([
      'D:/work/A',
      'D:/work/B',
    ]);
  });

  it('diffs member path replacements for confirmation UI', () => {
    const diff = diffMemberPaths(
      ['D:/old', 'D:/keep'],
      ['D:/keep', 'D:/new', 'D:/KEEP'],
    );

    expect(diff.nextMemberPaths).toEqual(['D:/keep', 'D:/new']);
    expect(diff.addedPaths).toEqual(['D:/new']);
    expect(diff.removedPaths).toEqual(['D:/old']);
    expect(diff.hasChanges).toBe(true);
  });
});
