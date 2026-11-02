// SPDX-License-Identifier: GPL-3.0-or-later
// License: GNU GPLv3 or later. See the license file in the project root for more information.
// Copyright © 2021 - present Aleksey Hoffman. All rights reserved.

import type { NavigatorFolderSettings } from '@/types/user-settings';

export const DEFAULT_WORK_GROUP_ID = 'default-work-group';

export type WorkGroupOpenStateTab = {
  id: string;
  name: string;
  path: string;
  type: 'directory' | 'file' | 'search';
  paneWidth: number;
  filterQuery: string;
};

export type WorkGroupOpenState = {
  tabGroups: WorkGroupOpenStateTab[][];
  currentTabGroupIndex: number;
  currentTabIndex: number;
};

export type WorkGroup = {
  id: string;
  name: string;
  isDefault: boolean;
  memberPaths: string[];
  navigatorDefaults: NavigatorFolderSettings | null;
  openState: WorkGroupOpenState | null;
};

export type UserWorkGroups = {
  workGroups: WorkGroup[];
  activeWorkGroupId: string;
};

export type WorkGroupAlignedBaseline = {
  workGroupId: string;
  memberPaths: string[];
  navigatorDefaults: NavigatorFolderSettings | null;
};

export type WorkGroupSessionAlignPending = {
  workGroupId: string;
  addedMemberPaths: string[];
  removedMemberPaths: string[];
  defaultsChanged: boolean;
};

export const DEFAULT_USER_WORK_GROUPS: UserWorkGroups = {
  workGroups: [],
  activeWorkGroupId: DEFAULT_WORK_GROUP_ID,
};
