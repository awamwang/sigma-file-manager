// SPDX-License-Identifier: GPL-3.0-or-later
// License: GNU GPLv3 or later. See the license file in the project root for more information.
// Copyright © 2021 - present Aleksey Hoffman. All rights reserved.

import { defineStore } from 'pinia';
import { LazyStore } from '@tauri-apps/plugin-store';
import { computed, ref } from 'vue';
import { useUserPathsStore } from './user-paths';
import { useWorkspacesStore } from './workspaces';
import type {
  UserWorkGroups,
  WorkGroup,
  WorkGroupAlignedBaseline,
  WorkGroupOpenState,
  WorkGroupSessionAlignPending,
} from '@/types/user-work-groups';
import {
  DEFAULT_USER_WORK_GROUPS,
  DEFAULT_WORK_GROUP_ID,
} from '@/types/user-work-groups';
import type { NavigatorFolderSettings } from '@/types/user-settings';
import {
  canUseStartupStorageFastPath,
  getStartupStorageFile,
  getStartupStorageRecord,
  type StartupStorageFileBootstrap,
} from './utils/startup-storage-bootstrap';
import { normalizePathForComparison } from '@/utils/file-operation-paths';
import { isExactMemberPath } from '@/utils/work-group-paths';
import { diffOpenStatePaths } from '@/utils/work-group-open-state-diff';
import uniqueId from '@/utils/unique-id';
import clone from '@/utils/clone';

export type ActivateWorkGroupSaveMode =
  | { type: 'current'; openUnopenedNewMembers?: boolean }
  | { type: 'discard' }
  | { type: 'create'; name: string; openUnopenedNewMembers?: boolean };

function createDefaultWorkGroup(openState: WorkGroupOpenState | null = null): WorkGroup {
  return {
    id: DEFAULT_WORK_GROUP_ID,
    name: 'Default',
    isDefault: true,
    memberPaths: [],
    navigatorDefaults: null,
    openState,
  };
}

function cloneOpenState(openState: WorkGroupOpenState | null): WorkGroupOpenState | null {
  return openState ? clone(openState) : null;
}

function areOpenStatesEqual(
  left: WorkGroupOpenState | null | undefined,
  right: WorkGroupOpenState | null | undefined,
): boolean {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

export const useUserWorkGroupsStore = defineStore('userWorkGroups', () => {
  const userPathsStore = useUserPathsStore();
  const userWorkGroupsStorage = ref<LazyStore | null>(null);
  const userWorkGroups = ref<UserWorkGroups>(structuredClone(DEFAULT_USER_WORK_GROUPS));
  const isInitialized = ref(false);
  const alignedBaselines = ref<Record<string, WorkGroupAlignedBaseline>>({});
  const sessionAlignPending = ref<WorkGroupSessionAlignPending | null>(null);

  const workGroups = computed(() => userWorkGroups.value.workGroups);

  const activeWorkGroup = computed(() => (
    userWorkGroups.value.workGroups.find(
      workGroup => workGroup.id === userWorkGroups.value.activeWorkGroupId,
    )
    ?? userWorkGroups.value.workGroups.find(workGroup => workGroup.isDefault)
    ?? null
  ));

  function captureAlignedBaseline(workGroup: WorkGroup | null = activeWorkGroup.value) {
    if (!workGroup) {
      sessionAlignPending.value = null;
      return;
    }

    alignedBaselines.value = {
      ...alignedBaselines.value,
      [workGroup.id]: {
        workGroupId: workGroup.id,
        memberPaths: [...workGroup.memberPaths],
        navigatorDefaults: workGroup.navigatorDefaults ? clone(workGroup.navigatorDefaults) : null,
      },
    };

    if (workGroup.id === userWorkGroups.value.activeWorkGroupId) {
      sessionAlignPending.value = null;
    }
  }

  function captureAlignedBaselinesForAll() {
    const nextBaselines: Record<string, WorkGroupAlignedBaseline> = {};

    for (const workGroup of userWorkGroups.value.workGroups) {
      nextBaselines[workGroup.id] = {
        workGroupId: workGroup.id,
        memberPaths: [...workGroup.memberPaths],
        navigatorDefaults: workGroup.navigatorDefaults ? clone(workGroup.navigatorDefaults) : null,
      };
    }

    alignedBaselines.value = nextBaselines;
    sessionAlignPending.value = null;
  }

  function computeSessionAlignPendingFor(
    workGroup: WorkGroup | null,
  ): WorkGroupSessionAlignPending | null {
    if (!workGroup) {
      return null;
    }

    const baseline = alignedBaselines.value[workGroup.id];

    if (!baseline) {
      return null;
    }

    const addedMemberPaths = workGroup.memberPaths.filter(
      path => !isExactMemberPath(path, baseline.memberPaths),
    );
    const removedMemberPaths = baseline.memberPaths.filter(
      path => !isExactMemberPath(path, workGroup.memberPaths),
    );
    const defaultsChanged = JSON.stringify(workGroup.navigatorDefaults)
      !== JSON.stringify(baseline.navigatorDefaults);

    if (addedMemberPaths.length === 0 && removedMemberPaths.length === 0 && !defaultsChanged) {
      return null;
    }

    return {
      workGroupId: workGroup.id,
      addedMemberPaths,
      removedMemberPaths,
      defaultsChanged,
    };
  }

  function recomputeSessionAlignPending() {
    sessionAlignPending.value = computeSessionAlignPendingFor(activeWorkGroup.value);
  }

  function noteDefinitionChanged(workGroupId: string) {
    if (workGroupId !== userWorkGroups.value.activeWorkGroupId) {
      // Inactive groups keep their old baseline so activation can auto-align later.
      return;
    }

    recomputeSessionAlignPending();
  }

  async function applyPendingSessionAlign(workGroup: WorkGroup) {
    const pending = computeSessionAlignPendingFor(workGroup);

    if (pending?.addedMemberPaths.length) {
      await openUnopenedMemberTabs(pending.addedMemberPaths);
    }

    captureAlignedBaseline(workGroup);
  }

  function listUnopenedMemberPaths(memberPaths?: string[]): string[] {
    const active = activeWorkGroup.value;
    const workspacesStore = useWorkspacesStore();
    const workspace = workspacesStore.currentWorkspace;
    const candidates = memberPaths ?? active?.memberPaths ?? [];

    if (!active || !workspace) {
      return [];
    }

    const openExactPaths = workspace.tabGroups.flatMap(tabGroup => (
      tabGroup.map(tab => tab.path)
    ));

    return candidates.filter(path => !isExactMemberPath(path, openExactPaths));
  }

  async function openUnopenedMemberTabs(memberPaths?: string[]) {
    const workspacesStore = useWorkspacesStore();
    const pathsToOpen = listUnopenedMemberPaths(memberPaths);

    for (const path of pathsToOpen) {
      await workspacesStore.openOrFocusTabGroup(path);
    }

    return pathsToOpen;
  }

  async function applySessionAlign() {
    const pending = sessionAlignPending.value;
    const active = activeWorkGroup.value;

    if (!pending || !active || pending.workGroupId !== active.id) {
      captureAlignedBaseline(active);
      return;
    }

    await openUnopenedMemberTabs(pending.addedMemberPaths);
    captureAlignedBaseline(active);
  }

  function clearSessionAlignPending() {
    sessionAlignPending.value = null;
  }

  function getSwitchOpenStateChurn(targetWorkGroupId: string | null) {
    const workspacesStore = useWorkspacesStore();
    const liveOpenState = workspacesStore.captureOpenStateSnapshot();
    const active = activeWorkGroup.value;
    const target = targetWorkGroupId ? getWorkGroupById(targetWorkGroupId) : null;

    return {
      relativeToSaved: diffOpenStatePaths(active?.openState, liveOpenState),
      relativeToTarget: diffOpenStatePaths(liveOpenState, target?.openState),
      unopenedNewMemberPaths: listUnopenedMemberPaths(
        sessionAlignPending.value?.workGroupId === active?.id
          ? sessionAlignPending.value.addedMemberPaths
          : undefined,
      ),
    };
  }

  async function initStorage() {
    try {
      if (!userWorkGroupsStorage.value) {
        userWorkGroupsStorage.value = await new LazyStore(
          userPathsStore.customPaths.appUserDataWorkGroupsPath,
        );
        await userWorkGroupsStorage.value.save();
      }
    }
    catch (error) {
      console.error('Failed to initialize user work groups storage:', error);
    }
  }

  function applyWorkGroupsRecord(workGroupsRecord: Record<string, unknown> | null) {
    if (!workGroupsRecord) {
      return;
    }

    if (Array.isArray(workGroupsRecord.workGroups)) {
      userWorkGroups.value.workGroups = workGroupsRecord.workGroups as WorkGroup[];
    }

    if (typeof workGroupsRecord.activeWorkGroupId === 'string') {
      userWorkGroups.value.activeWorkGroupId = workGroupsRecord.activeWorkGroupId;
    }
  }

  async function saveWorkGroups() {
    try {
      if (!userWorkGroupsStorage.value) {
        return;
      }

      await userWorkGroupsStorage.value.set('workGroups', userWorkGroups.value.workGroups);
      await userWorkGroupsStorage.value.set('activeWorkGroupId', userWorkGroups.value.activeWorkGroupId);
      await userWorkGroupsStorage.value.save();
    }
    catch (error) {
      console.error('Failed to save user work groups:', error);
    }
  }

  async function ensureDefaultWorkGroup(openState: WorkGroupOpenState | null = null) {
    const hasDefault = userWorkGroups.value.workGroups.some(workGroup => workGroup.isDefault);

    if (!hasDefault) {
      userWorkGroups.value.workGroups.unshift(createDefaultWorkGroup(openState));
    }

    const activeExists = userWorkGroups.value.workGroups.some(
      workGroup => workGroup.id === userWorkGroups.value.activeWorkGroupId,
    );

    if (!activeExists) {
      const defaultGroup = userWorkGroups.value.workGroups.find(workGroup => workGroup.isDefault);
      userWorkGroups.value.activeWorkGroupId = defaultGroup?.id ?? DEFAULT_WORK_GROUP_ID;
    }
  }

  async function migrateFromWorkspacesIfNeeded() {
    if (userWorkGroups.value.workGroups.length > 0) {
      await ensureDefaultWorkGroup();
      return;
    }

    const workspacesStore = useWorkspacesStore();
    const openState = workspacesStore.captureOpenStateSnapshot();
    userWorkGroups.value.workGroups = [createDefaultWorkGroup(openState)];
    userWorkGroups.value.activeWorkGroupId = DEFAULT_WORK_GROUP_ID;
    await saveWorkGroups();
  }

  async function loadWorkGroups() {
    try {
      const storedWorkGroups = await userWorkGroupsStorage.value?.entries();
      applyWorkGroupsRecord(storedWorkGroups ? Object.fromEntries(storedWorkGroups) : null);
      await migrateFromWorkspacesIfNeeded();
    }
    catch (error) {
      console.error('Failed to load user work groups:', error);
      await migrateFromWorkspacesIfNeeded();
    }
  }

  async function loadWorkGroupsFromBootstrap(bootstrapFile?: StartupStorageFileBootstrap): Promise<boolean> {
    if (!canUseStartupStorageFastPath(bootstrapFile)) {
      return false;
    }

    const bootstrapRecord = getStartupStorageRecord(bootstrapFile);

    // Mirror workspaces: "missing" is a valid fast path, but there is no record to apply.
    // Fall through to LazyStore load so we never skip a real on-disk file due to bootstrap skew.
    if (!bootstrapRecord) {
      return false;
    }

    applyWorkGroupsRecord(bootstrapRecord);
    await migrateFromWorkspacesIfNeeded();
    return true;
  }

  function getWorkGroupById(id: string): WorkGroup | null {
    return userWorkGroups.value.workGroups.find(workGroup => workGroup.id === id) ?? null;
  }

  function replaceWorkGroup(id: string, nextWorkGroup: WorkGroup): boolean {
    const index = userWorkGroups.value.workGroups.findIndex(workGroup => workGroup.id === id);

    if (index === -1) {
      return false;
    }

    userWorkGroups.value.workGroups.splice(index, 1, nextWorkGroup);
    return true;
  }

  function isOpenStateDirty(): boolean {
    const active = activeWorkGroup.value;

    if (!active) {
      return false;
    }

    const workspacesStore = useWorkspacesStore();
    return !areOpenStatesEqual(workspacesStore.captureOpenStateSnapshot(), active.openState);
  }

  async function writeOpenStateToWorkGroup(workGroupId: string, openState: WorkGroupOpenState) {
    const workGroup = getWorkGroupById(workGroupId);

    if (!workGroup) {
      return;
    }

    replaceWorkGroup(workGroupId, {
      ...workGroup,
      openState: cloneOpenState(openState),
    });
    await saveWorkGroups();
  }

  async function flushActiveOpenState() {
    const active = activeWorkGroup.value;

    if (!active) {
      return;
    }

    const workspacesStore = useWorkspacesStore();
    await writeOpenStateToWorkGroup(active.id, workspacesStore.captureOpenStateSnapshot());
  }

  async function createWorkGroup(options?: {
    name?: string;
    copyFromActive?: boolean;
    openState?: WorkGroupOpenState | null;
  }): Promise<WorkGroup> {
    const active = activeWorkGroup.value;
    const name = options?.name?.trim() || `Work Group ${userWorkGroups.value.workGroups.length + 1}`;
    const shouldCopy = options?.copyFromActive === true && active;

    const newWorkGroup: WorkGroup = {
      id: `work-group-${uniqueId()}`,
      name,
      isDefault: false,
      memberPaths: shouldCopy ? [...active.memberPaths] : [],
      navigatorDefaults: shouldCopy ? clone(active.navigatorDefaults) : null,
      openState: options?.openState !== undefined
        ? cloneOpenState(options.openState)
        : (shouldCopy ? cloneOpenState(active.openState) : null),
    };

    userWorkGroups.value.workGroups.push(newWorkGroup);
    await saveWorkGroups();
    captureAlignedBaseline(newWorkGroup);
    return newWorkGroup;
  }

  async function renameWorkGroup(id: string, name: string) {
    const workGroup = getWorkGroupById(id);
    const trimmed = name.trim();

    if (!workGroup || !trimmed || workGroup.name === trimmed) {
      return;
    }

    replaceWorkGroup(id, {
      ...workGroup,
      name: trimmed,
    });
    await saveWorkGroups();
  }

  async function deleteWorkGroup(id: string): Promise<boolean> {
    const workGroup = getWorkGroupById(id);

    if (!workGroup || workGroup.isDefault) {
      return false;
    }

    const wasActive = userWorkGroups.value.activeWorkGroupId === id;
    userWorkGroups.value.workGroups = userWorkGroups.value.workGroups.filter(
      candidate => candidate.id !== id,
    );

    if (alignedBaselines.value[id]) {
      const { [id]: _removed, ...remainingBaselines } = alignedBaselines.value;
      alignedBaselines.value = remainingBaselines;
    }

    if (wasActive) {
      const defaultGroup = userWorkGroups.value.workGroups.find(candidate => candidate.isDefault)
        ?? userWorkGroups.value.workGroups[0];

      if (defaultGroup) {
        userWorkGroups.value.activeWorkGroupId = defaultGroup.id;
        const workspacesStore = useWorkspacesStore();
        await workspacesStore.applyOpenStateSnapshot(defaultGroup.openState);
        await applyPendingSessionAlign(defaultGroup);
      }
    }

    await saveWorkGroups();
    recomputeSessionAlignPending();
    return true;
  }

  async function setNavigatorDefaults(
    id: string,
    navigatorDefaults: NavigatorFolderSettings | null,
  ) {
    const workGroup = getWorkGroupById(id);

    if (!workGroup) {
      return;
    }

    replaceWorkGroup(id, {
      ...workGroup,
      navigatorDefaults: navigatorDefaults ? clone(navigatorDefaults) : null,
    });
    await saveWorkGroups();
    noteDefinitionChanged(id);
  }

  async function addMemberPath(workGroupId: string, path: string) {
    const workGroup = getWorkGroupById(workGroupId);
    const comparisonPath = normalizePathForComparison(path);

    if (!workGroup || !comparisonPath) {
      return;
    }

    if (isExactMemberPath(path, workGroup.memberPaths)) {
      return;
    }

    replaceWorkGroup(workGroupId, {
      ...workGroup,
      memberPaths: [...workGroup.memberPaths, path],
    });
    await saveWorkGroups();
    noteDefinitionChanged(workGroupId);
  }

  async function removeMemberPath(workGroupId: string, path: string) {
    const workGroup = getWorkGroupById(workGroupId);

    if (!workGroup) {
      return;
    }

    const nextMembers = workGroup.memberPaths.filter(
      memberPath => !isExactMemberPath(path, [memberPath]),
    );

    if (nextMembers.length === workGroup.memberPaths.length) {
      return;
    }

    replaceWorkGroup(workGroupId, {
      ...workGroup,
      memberPaths: nextMembers,
    });
    await saveWorkGroups();
    noteDefinitionChanged(workGroupId);
  }

  async function toggleMemberPath(workGroupId: string, path: string) {
    const workGroup = getWorkGroupById(workGroupId);

    if (!workGroup) {
      return;
    }

    if (isExactMemberPath(path, workGroup.memberPaths)) {
      await removeMemberPath(workGroupId, path);
      return;
    }

    await addMemberPath(workGroupId, path);
  }

  async function setMemberPathsForPath(path: string, workGroupIds: string[]) {
    const selectedIds = new Set(workGroupIds);
    const changedWorkGroupIds = new Set<string>();

    userWorkGroups.value.workGroups = userWorkGroups.value.workGroups.map((workGroup) => {
      const isMember = isExactMemberPath(path, workGroup.memberPaths);
      const shouldBeMember = selectedIds.has(workGroup.id);

      if (shouldBeMember && !isMember) {
        changedWorkGroupIds.add(workGroup.id);
        return {
          ...workGroup,
          memberPaths: [...workGroup.memberPaths, path],
        };
      }

      if (!shouldBeMember && isMember) {
        changedWorkGroupIds.add(workGroup.id);
        return {
          ...workGroup,
          memberPaths: workGroup.memberPaths.filter(
            memberPath => !isExactMemberPath(path, [memberPath]),
          ),
        };
      }

      return workGroup;
    });

    if (changedWorkGroupIds.size > 0) {
      await saveWorkGroups();
      for (const workGroupId of changedWorkGroupIds) {
        noteDefinitionChanged(workGroupId);
      }
    }
  }

  async function activateWorkGroup(targetId: string, saveMode?: ActivateWorkGroupSaveMode) {
    const target = getWorkGroupById(targetId);

    if (!target) {
      return false;
    }

    if (target.id === userWorkGroups.value.activeWorkGroupId) {
      return true;
    }

    const workspacesStore = useWorkspacesStore();
    const previousActiveId = userWorkGroups.value.activeWorkGroupId;
    const shouldOpenUnopenedNewMembers = (
      (saveMode?.type === 'current' || saveMode?.type === 'create')
      && saveMode.openUnopenedNewMembers === true
    );

    if (shouldOpenUnopenedNewMembers) {
      const pendingAdded = sessionAlignPending.value?.workGroupId === previousActiveId
        ? sessionAlignPending.value.addedMemberPaths
        : undefined;
      await openUnopenedMemberTabs(pendingAdded);
    }

    // Capture after optional member-tab opens so saved Open State can include them.
    const liveOpenState = workspacesStore.captureOpenStateSnapshot();

    if (saveMode?.type === 'current') {
      await writeOpenStateToWorkGroup(previousActiveId, liveOpenState);
    }
    else if (saveMode?.type === 'create') {
      await createWorkGroup({
        name: saveMode.name,
        copyFromActive: true,
        openState: liveOpenState,
      });
    }

    // Re-read target after optional create (array may have changed).
    const resolvedTarget = getWorkGroupById(targetId);

    if (!resolvedTarget) {
      return false;
    }

    userWorkGroups.value.activeWorkGroupId = resolvedTarget.id;
    await saveWorkGroups();
    await workspacesStore.applyOpenStateSnapshot(resolvedTarget.openState);
    // Apply membership/defaults that changed while this group was inactive.
    await applyPendingSessionAlign(resolvedTarget);
    recomputeSessionAlignPending();
    return true;
  }

  async function openAllMembers() {
    const active = activeWorkGroup.value;

    if (!active) {
      return;
    }

    const workspacesStore = useWorkspacesStore();

    for (const memberPath of active.memberPaths) {
      await workspacesStore.openOrFocusTabGroup(memberPath);
    }
  }

  async function closeMemberTabs() {
    const active = activeWorkGroup.value;
    const workspacesStore = useWorkspacesStore();
    const workspace = workspacesStore.currentWorkspace;

    if (!active || !workspace) {
      return;
    }

    const indicesToClose: number[] = [];

    workspace.tabGroups.forEach((tabGroup, index) => {
      const hasExactMemberTab = tabGroup.some(tab => isExactMemberPath(tab.path, active.memberPaths));

      if (hasExactMemberTab) {
        indicesToClose.push(index);
      }
    });

    for (const index of indicesToClose.reverse()) {
      const tabGroup = workspace.tabGroups[index];

      if (tabGroup) {
        await workspacesStore.closeTabGroup(tabGroup);
      }
    }
  }

  function replacePathPrefix(path: string, oldPrefix: string, newPrefix: string): string | null {
    const comparablePath = normalizePathForComparison(path);
    const comparableOldPrefix = normalizePathForComparison(oldPrefix);
    const comparableNewPrefix = normalizePathForComparison(newPrefix);

    if (!comparablePath || !comparableOldPrefix || !comparableNewPrefix) {
      return null;
    }

    if (comparablePath === comparableOldPrefix) {
      return newPrefix;
    }

    if (comparablePath.startsWith(`${comparableOldPrefix}/`)) {
      return newPrefix + path.slice(oldPrefix.length);
    }

    return null;
  }

  async function handlePathRenamed(oldPath: string, newPath: string) {
    let hasChanges = false;

    userWorkGroups.value.workGroups = userWorkGroups.value.workGroups.map((workGroup) => {
      let workGroupChanged = false;
      const nextMembers = workGroup.memberPaths.map((memberPath) => {
        const updated = replacePathPrefix(memberPath, oldPath, newPath);

        if (updated !== null) {
          workGroupChanged = true;
          return updated;
        }

        return memberPath;
      });

      if (!workGroupChanged) {
        return workGroup;
      }

      hasChanges = true;
      return {
        ...workGroup,
        memberPaths: nextMembers,
      };
    });

    if (hasChanges) {
      await saveWorkGroups();
      // Renames update membership paths; refresh every baseline without prompting.
      const nextBaselines: Record<string, WorkGroupAlignedBaseline> = {};

      for (const [workGroupId, baseline] of Object.entries(alignedBaselines.value)) {
        nextBaselines[workGroupId] = {
          ...baseline,
          memberPaths: baseline.memberPaths.map(memberPath => (
            replacePathPrefix(memberPath, oldPath, newPath) ?? memberPath
          )),
        };
      }

      alignedBaselines.value = nextBaselines;
      recomputeSessionAlignPending();
    }
  }

  // Missing Member Folders stay listed for the management page to flag.
  // Do not auto-prune membership when paths disappear on disk.
  async function handlePathsDeleted(_paths: string[]) {
    return;
  }

  async function init(bootstrapFile?: StartupStorageFileBootstrap) {
    const resolvedBootstrapFile = bootstrapFile ?? await getStartupStorageFile('userWorkGroups');
    await initStorage();
    const loadedFromBootstrap = await loadWorkGroupsFromBootstrap(resolvedBootstrapFile);

    if (!loadedFromBootstrap) {
      await loadWorkGroups();
    }

    captureAlignedBaselinesForAll();
    isInitialized.value = true;
  }

  return {
    userWorkGroups,
    workGroups,
    activeWorkGroup,
    isInitialized,
    sessionAlignPending,
    init,
    getWorkGroupById,
    isOpenStateDirty,
    flushActiveOpenState,
    createWorkGroup,
    renameWorkGroup,
    deleteWorkGroup,
    setNavigatorDefaults,
    addMemberPath,
    removeMemberPath,
    toggleMemberPath,
    setMemberPathsForPath,
    activateWorkGroup,
    openAllMembers,
    closeMemberTabs,
    openUnopenedMemberTabs,
    listUnopenedMemberPaths,
    applySessionAlign,
    clearSessionAlignPending,
    captureAlignedBaseline,
    getSwitchOpenStateChurn,
    handlePathRenamed,
    handlePathsDeleted,
  };
});
