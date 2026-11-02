// SPDX-License-Identifier: GPL-3.0-or-later
// License: GNU GPLv3 or later. See the license file in the project root for more information.
// Copyright © 2021 - present Aleksey Hoffman. All rights reserved.

import { ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  useUserWorkGroupsStore,
  type ActivateWorkGroupSaveMode,
} from '@/stores/storage/user-work-groups';

export function useWorkGroupActivation() {
  const router = useRouter();
  const userWorkGroupsStore = useUserWorkGroupsStore();

  const switchPromptOpen = ref(false);
  const pendingTargetWorkGroupId = ref<string | null>(null);

  async function activateWorkGroup(
    targetId: string,
    options?: { navigateToNavigator?: boolean },
  ) {
    if (targetId === userWorkGroupsStore.activeWorkGroup?.id) {
      if (options?.navigateToNavigator) {
        await router.push({ name: 'navigator' });
      }

      return;
    }

    if (userWorkGroupsStore.isOpenStateDirty()) {
      pendingTargetWorkGroupId.value = targetId;
      switchPromptOpen.value = true;
      return;
    }

    await userWorkGroupsStore.activateWorkGroup(targetId);
    if (options?.navigateToNavigator) {
      await router.push({ name: 'navigator' });
    }
  }

  async function confirmSwitch(saveMode: ActivateWorkGroupSaveMode) {
    const targetId = pendingTargetWorkGroupId.value;

    if (!targetId) {
      return;
    }

    pendingTargetWorkGroupId.value = null;
    await userWorkGroupsStore.activateWorkGroup(targetId, saveMode);
    await router.push({ name: 'navigator' });
  }

  function cancelSwitch() {
    pendingTargetWorkGroupId.value = null;
  }

  return {
    switchPromptOpen,
    pendingTargetWorkGroupId,
    activateWorkGroup,
    confirmSwitch,
    cancelSwitch,
  };
}
