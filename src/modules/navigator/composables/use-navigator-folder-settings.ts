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
import type {
  NavigatorFolderSettings,
  UserSettingsNavigator,
} from '@/types/user-settings';

export function resolveActiveWorkGroupNavigatorDefaults(
  path: string,
): NavigatorFolderSettings | null {
  const userWorkGroupsStore = useUserWorkGroupsStore();
  const activeWorkGroup = userWorkGroupsStore.activeWorkGroup;

  if (!activeWorkGroup?.navigatorDefaults) {
    return null;
  }

  if (!isPathUnderMemberFolders(path, activeWorkGroup.memberPaths)) {
    return null;
  }

  return activeWorkGroup.navigatorDefaults;
}

export function resolveNavigatorFolderSettingsForPath(
  navigator: UserSettingsNavigator,
  path: string,
): NavigatorFolderSettings {
  return resolveNavigatorFolderSettings(
    navigator,
    path,
    resolveActiveWorkGroupNavigatorDefaults(path),
  );
}

export function useNavigatorFolderSettings(
  getActivePath: () => string | undefined,
  getCanUseFolderSettings: () => boolean = () => true,
) {
  const userSettingsStore = useUserSettingsStore();

  const activePath = computed(() => getActivePath() ?? '');
  const canUseFolderSettings = computed(() => (
    Boolean(getCanUseFolderSettings() && activePath.value)
  ));

  const applied = computed(() => resolveNavigatorFolderSettingsForPath(
    userSettingsStore.userSettings.navigator,
    activePath.value,
  ));
  const globalSnapshot = computed(() => (
    createNavigatorFolderSettingsSnapshot(userSettingsStore.userSettings.navigator)
  ));
  const hasFolderSettings = computed(() => (
    canUseFolderSettings.value
    && hasNavigatorFolderSettings(userSettingsStore.userSettings.navigator, activePath.value)
  ));

  function resolveForPath(path: string | undefined) {
    return resolveNavigatorFolderSettingsForPath(
      userSettingsStore.userSettings.navigator,
      path ?? '',
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
