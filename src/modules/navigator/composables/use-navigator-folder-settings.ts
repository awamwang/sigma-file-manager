// SPDX-License-Identifier: GPL-3.0-or-later
// License: GNU GPLv3 or later. See the license file in the project root for more information.
// Copyright © 2021 - present Aleksey Hoffman. All rights reserved.

import { computed } from 'vue';
import { useUserSettingsStore } from '@/stores/storage/user-settings';
import { useUserWorkGroupsStore } from '@/stores/storage/user-work-groups';
import { canonicalizePath } from '@/utils/normalize-path';
import { isPathUnderMemberFolders } from '@/utils/work-group-paths';
import {
  clearNavigatorFolderSettings,
  persistNavigatorOptions,
} from '@/modules/navigator/utils/persist-navigator-folder-settings';
import {
  createNavigatorFolderSettingsSnapshot,
  hasNavigatorFolderSettings,
  resolveNavigatorFolderSettings,
  type NavigatorFolderSettingsPatch,
  type NavigatorOptionsScope,
} from '@/modules/navigator/utils/resolve-navigator-folder-settings';
import type { NavigatorFolderSettings } from '@/types/user-settings';

export function useNavigatorFolderSettings(
  getActivePath: () => string | undefined,
  getCanUseFolderSettings: () => boolean = () => true,
) {
  const userSettingsStore = useUserSettingsStore();
  const userWorkGroupsStore = useUserWorkGroupsStore();

  const activePath = computed(() => getActivePath() ?? '');
  const canUseFolderSettings = computed(() => (
    Boolean(getCanUseFolderSettings() && activePath.value)
  ));

  function resolveGroupDefaultsForPath(path: string): NavigatorFolderSettings | null {
    const activeWorkGroup = userWorkGroupsStore.activeWorkGroup;

    if (!activeWorkGroup?.navigatorDefaults) {
      return null;
    }

    if (!isPathUnderMemberFolders(path, activeWorkGroup.memberPaths)) {
      return null;
    }

    return activeWorkGroup.navigatorDefaults;
  }

  const applied = computed(() => resolveNavigatorFolderSettings(
    userSettingsStore.userSettings.navigator,
    activePath.value,
    resolveGroupDefaultsForPath(activePath.value),
  ));
  const globalSnapshot = computed(() => (
    createNavigatorFolderSettingsSnapshot(userSettingsStore.userSettings.navigator)
  ));
  const hasFolderSettings = computed(() => (
    canUseFolderSettings.value
    && hasNavigatorFolderSettings(userSettingsStore.userSettings.navigator, activePath.value)
  ));

  function resolveForPath(path: string | undefined) {
    const resolvedPath = path ?? '';
    return resolveNavigatorFolderSettings(
      userSettingsStore.userSettings.navigator,
      resolvedPath,
      resolveGroupDefaultsForPath(resolvedPath),
    );
  }

  function persistForScope(
    scope: NavigatorOptionsScope,
    patch: NavigatorFolderSettingsPatch,
  ) {
    const target = scope === 'folder' && canonicalizePath(activePath.value)
      ? { folder: activePath.value }
      : 'global';

    return persistNavigatorOptions(target, patch);
  }

  function clearFolderSettings() {
    return clearNavigatorFolderSettings(activePath.value);
  }

  return {
    activePath,
    applied,
    canUseFolderSettings,
    clearFolderSettings,
    globalSnapshot,
    hasFolderSettings,
    persistForScope,
    resolveForPath,
  };
}
