// SPDX-License-Identifier: GPL-3.0-or-later
// License: GNU GPLv3 or later. See the license file in the project root for more information.
// Copyright © 2021 - present Aleksey Hoffman. All rights reserved.

import { nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { useUserWorkGroupsStore } from '@/stores/storage/user-work-groups';

export function useWorkGroupActivation() {
  const router = useRouter();
  const userWorkGroupsStore = useUserWorkGroupsStore();

  async function activateWorkGroup(
    targetId: string,
    options?: { navigateToNavigator?: boolean },
  ) {
    const navigateToNavigator = options?.navigateToNavigator === true;

    if (targetId === userWorkGroupsStore.activeWorkGroup?.id) {
      if (navigateToNavigator) {
        await router.push({ name: 'navigator' });
        // Same Active group: resume pending member opens after landing on Navigator.
        await nextTick();
        if (userWorkGroupsStore.sessionAlignPending) {
          userWorkGroupsStore.sessionAlignAutoApplyOnNavigator = true;
          await userWorkGroupsStore.applySessionAlign();
        }
      }

      return;
    }

    await userWorkGroupsStore.activateWorkGroup(targetId);
    if (navigateToNavigator) {
      await router.push({ name: 'navigator' });
    }
  }

  return {
    activateWorkGroup,
  };
}
