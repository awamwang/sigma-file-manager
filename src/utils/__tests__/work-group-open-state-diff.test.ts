// SPDX-License-Identifier: GPL-3.0-or-later
// License: GNU GPLv3 or later. See the license file in the project root for more information.
// Copyright © 2021 - present Aleksey Hoffman. All rights reserved.

import { describe, expect, it } from 'vitest';
import { diffOpenStatePaths } from '@/utils/work-group-open-state-diff';
import type { WorkGroupOpenState } from '@/types/user-work-groups';

function openState(paths: string[]): WorkGroupOpenState {
  return {
    tabGroups: paths.map((path, index) => ([{
      id: `tab-${index}`,
      name: path,
      path,
      type: 'directory',
      paneWidth: 1,
      filterQuery: '',
    }])),
    currentTabGroupIndex: 0,
    currentTabIndex: 0,
  };
}

describe('diffOpenStatePaths', () => {
  it('counts added and closed paths between snapshots', () => {
    const churn = diffOpenStatePaths(
      openState(['C:/a', 'C:/b']),
      openState(['C:/b', 'C:/c']),
    );

    expect(churn.addedCount).toBe(1);
    expect(churn.closedCount).toBe(1);
    expect(churn.addedPaths).toEqual(['c:/c']);
    expect(churn.closedPaths).toEqual(['c:/a']);
  });

  it('treats null as empty', () => {
    const churn = diffOpenStatePaths(null, openState(['C:/a']));
    expect(churn.addedCount).toBe(1);
    expect(churn.closedCount).toBe(0);
  });
});
