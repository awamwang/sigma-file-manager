// SPDX-License-Identifier: GPL-3.0-or-later
// License: GNU GPLv3 or later. See the license file in the project root for more information.
// Copyright © 2021 - present Aleksey Hoffman. All rights reserved.

export interface Project {
  id: string;
  path: string;
  name: string;
  tagIds: string[];
  ideCommand: string | null;
  terminalProfile: string | null;
  addedAt: number;
  lastOpenedAt: number | null;
  openCount: number;
}

export interface UserProjects {
  projects: Project[];
}

export const DEFAULT_USER_PROJECTS: UserProjects = {
  projects: [],
};
