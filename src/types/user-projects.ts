// SPDX-License-Identifier: GPL-3.0-or-later
// License: GNU GPLv3 or later. See the license file in the project root for more information.
// Copyright © 2021 - present Aleksey Hoffman. All rights reserved.

export const USER_PROJECTS_SCHEMA_VERSION = 2;

export type ProjectTaskStatusId = 'backlog' | 'doing' | 'review' | 'done';

export const PROJECT_TASK_STATUS_IDS: ProjectTaskStatusId[] = [
  'backlog',
  'doing',
  'review',
  'done',
];

export type ProjectWorkspaceLink = {
  id: string;
  path: string;
  label: string;
  kind: 'folder';
  addedAt: number;
};

export type ProjectTask = {
  id: string;
  title: string;
  body: string;
  statusId: ProjectTaskStatusId;
  sortKey: number;
  workspaceLinkId: string | null;
  outcomeUrl: string | null;
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
};

export type ProjectTasksViewMode = 'list' | 'board';

export interface Project {
  id: string;
  name: string;
  description: string;
  workspaceLinks: ProjectWorkspaceLink[];
  tasks: ProjectTask[];
  contextNotes: string;
  /** @deprecated Prefer primary workspace link; kept for migration / open-stats UX */
  path: string;
  tagIds: string[];
  ideCommand: string | null;
  terminalProfile: string | null;
  addedAt: number;
  lastOpenedAt: number | null;
  openCount: number;
  createdAt: number;
  updatedAt: number;
  tasksViewMode: ProjectTasksViewMode;
}

export interface UserProjects {
  schemaVersion: number;
  projects: Project[];
  activeProjectId: string | null;
}

export const DEFAULT_USER_PROJECTS: UserProjects = {
  schemaVersion: USER_PROJECTS_SCHEMA_VERSION,
  projects: [],
  activeProjectId: null,
};

export function getProjectPrimaryPath(project: Project): string {
  return project.workspaceLinks[0]?.path ?? project.path ?? '';
}

export function getProjectOpenTaskCount(project: Project): number {
  return project.tasks.filter(task => task.statusId !== 'done').length;
}
