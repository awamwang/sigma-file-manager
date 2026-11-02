// SPDX-License-Identifier: GPL-3.0-or-later
// License: GNU GPLv3 or later. See the license file in the project root for more information.
// Copyright © 2021 - present Aleksey Hoffman. All rights reserved.

import { describe, expect, it } from 'vitest';
import { isExactMemberPath, isPathUnderMemberFolders } from '@/utils/work-group-paths';

describe('work-group-paths', () => {
  it('matches exact member paths only for close-member semantics', () => {
    expect(isExactMemberPath('D:/work/client', ['D:/work/client'])).toBe(true);
    expect(isExactMemberPath('D:/work/client/src', ['D:/work/client'])).toBe(false);
  });

  it('treats descendants as under member folders for group defaults', () => {
    expect(isPathUnderMemberFolders('D:/work/client/src', ['D:/work/client'])).toBe(true);
    expect(isPathUnderMemberFolders('D:/temp', ['D:/work/client'])).toBe(false);
  });
});
