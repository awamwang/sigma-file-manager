// SPDX-License-Identifier: GPL-3.0-or-later
// License: GNU GPLv3 or later. See the license file in the project root for more information.
// Copyright © 2021 - present Aleksey Hoffman. All rights reserved.

import { ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import {
  useUserWorkGroupsStore,
  type ActivateWorkGroupSaveMode,
} from '@/stores/storage/user-work-groups';
import { useWorkGroupSessionAlign } from '@/modules/work-groups/composables/use-work-group-session-align';

export function useWorkGroupActivation() {
  const router = useRouter();
  const userWorkGroupsStore = useUserWorkGroupsStore();
  const { setSwitchPromptBlocking } = useWorkGroupSessionAlign();

  const switchPromptOpen = ref(false);
  const pendingTargetWorkGroupId = ref<string | null>(null);
  const pendingNavigateToNavigator = ref(false);

  watch(switchPromptOpen, (open) => {
    setSwitchPromptBlocking(open);
  });

  async function activateWorkGroup(
    targetId: string,
    options?: { navigateToNavigator?: boolean },
  ) {
    const navigateToNavigator = options?.navigateToNavigator === true;

    if (targetId === userWorkGroupsStore.activeWorkGroup?.id) {
      if (navigateToNavigator) {
        await router.push({ name: 'navigator' });
      }

      return;
    }

    if (userWorkGroupsStore.isOpenStateDirty()) {
      pendingTargetWorkGroupId.value = targetId;
      pendingNavigateToNavigator.value = navigateToNavigator;
      switchPromptOpen.value = true;
      return;
    }

    await userWorkGroupsStore.activateWorkGroup(targetId);
    if (navigateToNavigator) {
      await router.push({ name: 'navigator' });
    }
  }

  async function confirmSwitch(saveMode: ActivateWorkGroupSaveMode) {
    const targetId = pendingTargetWorkGroupId.value;
    const navigateToNavigator = pendingNavigateToNavigator.value;

    pendingTargetWorkGroupId.value = null;
    pendingNavigateToNavigator.value = false;
    switchPromptOpen.value = false;

    if (!targetId) {
      return;
    }

    await userWorkGroupsStore.activateWorkGroup(targetId, saveMode);

    if (navigateToNavigator) {
      await router.push({ name: 'navigator' });
    }
  }

  function cancelSwitch() {
    pendingTargetWorkGroupId.value = null;
    pendingNavigateToNavigator.value = false;
    switchPromptOpen.value = false;
  }

  return {
    switchPromptOpen,
    pendingTargetWorkGroupId,
    activateWorkGroup,
    confirmSwitch,
    cancelSwitch,
  };
}
