// SPDX-License-Identifier: GPL-3.0-or-later
// License: GNU GPLv3 or later. See the license file in the project root for more information.
// Copyright © 2021 - present Aleksey Hoffman. All rights reserved.

import uniqueId from '@/utils/unique-id';
import { basenameFromPath } from '@/utils/source-display-name';
import type {
  Project,
  ProjectTask,
  ProjectTaskStatusId,
  ProjectTasksViewMode,
  ProjectWorkspaceLink,
  UserProjects,
} from '@/types/user-projects';
import {
  DEFAULT_USER_PROJECTS,
  PROJECT_TASK_STATUS_IDS,
  USER_PROJECTS_SCHEMA_VERSION,
} from '@/types/user-projects';
import {
  getNumber,
  getString,
  isRecord,
} from './schema-utils';

export const USER_PROJECTS_SCHEMA_VERSION_KEY = 'schemaVersion';

function parseTaskStatusId(value: unknown): ProjectTaskStatusId {
  if (typeof value === 'string' && (PROJECT_TASK_STATUS_IDS as string[]).includes(value)) {
    return value as ProjectTaskStatusId;
  }

  return 'backlog';
}

function parseTasksViewMode(value: unknown): ProjectTasksViewMode {
  return value === 'board' ? 'board' : 'list';
}

function parseWorkspaceLink(value: unknown, fallbackPath?: string): ProjectWorkspaceLink | null {
  if (typeof value === 'string' && value) {
    return {
      id: uniqueId(),
      path: value,
      label: basenameFromPath(value),
      kind: 'folder',
      addedAt: Date.now(),
    };
  }

  if (!isRecord(value)) {
    if (fallbackPath) {
      return {
        id: uniqueId(),
        path: fallbackPath,
        label: basenameFromPath(fallbackPath),
        kind: 'folder',
        addedAt: Date.now(),
      };
    }

    return null;
  }

  const path = getString(value.path, fallbackPath ?? '');

  if (!path) {
    return null;
  }

  return {
    id: getString(value.id, uniqueId()),
    path,
    label: getString(value.label, basenameFromPath(path)),
    kind: 'folder',
    addedAt: getNumber(value.addedAt, Date.now()),
  };
}

function parseTask(value: unknown, index: number): ProjectTask | null {
  if (!isRecord(value)) {
    return null;
  }

  const title = getString(value.title, '').trim();

  if (!title) {
    return null;
  }

  const now = Date.now();
  const statusId = parseTaskStatusId(value.statusId);
  const createdAt = getNumber(value.createdAt, now);
  const updatedAt = getNumber(value.updatedAt, createdAt);

  return {
    id: getString(value.id, uniqueId()),
    title,
    body: getString(value.body, ''),
    statusId,
    sortKey: getNumber(value.sortKey, index),
    workspaceLinkId: typeof value.workspaceLinkId === 'string' ? value.workspaceLinkId : null,
    outcomeUrl: typeof value.outcomeUrl === 'string' && value.outcomeUrl.trim()
      ? value.outcomeUrl.trim()
      : null,
    createdAt,
    updatedAt,
    completedAt: statusId === 'done'
      ? (typeof value.completedAt === 'number' ? value.completedAt : updatedAt)
      : null,
  };
}

function migrateLegacyProject(value: Record<string, unknown>): Project {
  const now = Date.now();
  const path = getString(value.path, '');
  const addedAt = getNumber(value.addedAt, now);
  const name = getString(value.name, path ? basenameFromPath(path) : 'Project');
  const workspaceLinks: ProjectWorkspaceLink[] = [];

  if (Array.isArray(value.workspaceLinks)) {
    for (const linkValue of value.workspaceLinks) {
      const link = parseWorkspaceLink(linkValue);
      if (link) {
        workspaceLinks.push(link);
      }
    }
  }

  if (workspaceLinks.length === 0 && path) {
    const migratedLink = parseWorkspaceLink(null, path);
    if (migratedLink) {
      workspaceLinks.push(migratedLink);
    }
  }

  const tasks: ProjectTask[] = [];

  if (Array.isArray(value.tasks)) {
    value.tasks.forEach((taskValue, index) => {
      const task = parseTask(taskValue, index);
      if (task) {
        tasks.push(task);
      }
    });
  }

  const primaryPath = workspaceLinks[0]?.path ?? path;
  const tagIds = Array.isArray(value.tagIds)
    ? value.tagIds.filter((tagId): tagId is string => typeof tagId === 'string')
    : [];

  return {
    id: getString(value.id, `project-${uniqueId()}`),
    name,
    description: getString(value.description, ''),
    workspaceLinks,
    tasks,
    contextNotes: getString(value.contextNotes, ''),
    path: primaryPath,
    tagIds,
    ideCommand: typeof value.ideCommand === 'string' ? value.ideCommand : null,
    terminalProfile: typeof value.terminalProfile === 'string' ? value.terminalProfile : null,
    addedAt,
    lastOpenedAt: typeof value.lastOpenedAt === 'number' ? value.lastOpenedAt : null,
    openCount: getNumber(value.openCount, 0),
    createdAt: getNumber(value.createdAt, addedAt),
    updatedAt: getNumber(value.updatedAt, addedAt),
    tasksViewMode: parseTasksViewMode(value.tasksViewMode),
  };
}

export function parseProject(value: unknown): Project | null {
  if (!isRecord(value)) {
    return null;
  }

  const project = migrateLegacyProject(value);

  if (!project.name.trim() && project.workspaceLinks.length === 0) {
    return null;
  }

  return project;
}

export function parseUserProjects(value: unknown): UserProjects {
  if (!isRecord(value)) {
    return structuredClone(DEFAULT_USER_PROJECTS);
  }

  const projects: Project[] = [];

  if (Array.isArray(value.projects)) {
    for (const projectValue of value.projects) {
      const project = parseProject(projectValue);
      if (project) {
        projects.push(project);
      }
    }
  }

  const activeProjectIdRaw = value.activeProjectId;
  const activeProjectId = typeof activeProjectIdRaw === 'string'
    && projects.some(project => project.id === activeProjectIdRaw)
    ? activeProjectIdRaw
    : null;

  return {
    schemaVersion: USER_PROJECTS_SCHEMA_VERSION,
    projects,
    activeProjectId,
  };
}

export function migrateUserProjectsRecord(
  record: Record<string, unknown> | null | undefined,
): UserProjects {
  if (!record) {
    return structuredClone(DEFAULT_USER_PROJECTS);
  }

  return parseUserProjects(record);
}
