// SPDX-License-Identifier: GPL-3.0-or-later
// License: GNU GPLv3 or later. See the license file in the project root for more information.
// Copyright © 2021 - present Aleksey Hoffman. All rights reserved.

import { computed, ref, watch, type Ref } from 'vue';
import { useRoute } from 'vue-router';
import { useUserWorkGroupsStore } from '@/stores/storage/user-work-groups';
import type { WorkGroupSessionAlignPending } from '@/types/user-work-groups';

function pendingFingerprint(pending: WorkGroupSessionAlignPending | null): string | null {
  if (!pending) {
    return null;
  }

  return JSON.stringify({
    workGroupId: pending.workGroupId,
    addedMemberPaths: pending.addedMemberPaths,
    removedMemberPaths: pending.removedMemberPaths,
    defaultsChanged: pending.defaultsChanged,
  });
}

type WorkGroupSessionAlignApi = {
  promptOpen: Ref<boolean>;
  pending: Ref<WorkGroupSessionAlignPending | null>;
  confirmAlign: () => Promise<void>;
  deferAlign: () => void;
  setSwitchPromptBlocking: (blocking: boolean) => void;
};

let sharedApi: WorkGroupSessionAlignApi | null = null;

export function useWorkGroupSessionAlign(): WorkGroupSessionAlignApi {
  if (sharedApi) {
    return sharedApi;
  }

  const route = useRoute();
  const userWorkGroupsStore = useUserWorkGroupsStore();
  const promptOpen = ref(false);
  const suppressedFingerprint = ref<string | null>(null);
  const switchPromptBlocksAlign = ref(false);

  const isOnNavigator = computed(() => route.name === 'navigator');
  const pending = computed(() => userWorkGroupsStore.sessionAlignPending);

  function syncPromptVisibility() {
    const fingerprint = pendingFingerprint(pending.value);

    if (
      !fingerprint
      || !isOnNavigator.value
      || switchPromptBlocksAlign.value
      || fingerprint === suppressedFingerprint.value
    ) {
      promptOpen.value = false;
      return;
    }

    promptOpen.value = true;
  }

  watch(
    [pending, isOnNavigator, switchPromptBlocksAlign],
    () => {
      if (!isOnNavigator.value) {
        suppressedFingerprint.value = null;
      }

      syncPromptVisibility();
    },
    { deep: true, immediate: true },
  );

  async function confirmAlign() {
    await userWorkGroupsStore.applySessionAlign();
    suppressedFingerprint.value = null;
    promptOpen.value = false;
  }

  function deferAlign() {
    suppressedFingerprint.value = pendingFingerprint(pending.value);
    promptOpen.value = false;
  }

  function setSwitchPromptBlocking(blocking: boolean) {
    switchPromptBlocksAlign.value = blocking;
    if (blocking) {
      promptOpen.value = false;
    }
    else {
      syncPromptVisibility();
    }
  }

  sharedApi = {
    promptOpen,
    pending,
    confirmAlign,
    deferAlign,
    setSwitchPromptBlocking,
  };

  return sharedApi;
}
