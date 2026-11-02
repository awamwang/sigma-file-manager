// SPDX-License-Identifier: GPL-3.0-or-later
// License: GNU GPLv3 or later. See the license file in the project root for more information.
// Copyright © 2021 - present Aleksey Hoffman. All rights reserved.

import { computed, nextTick, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useRoute } from 'vue-router';
import { useUserWorkGroupsStore } from '@/stores/storage/user-work-groups';

export function useWorkGroupSessionAlign() {
  const route = useRoute();
  const userWorkGroupsStore = useUserWorkGroupsStore();
  const {
    sessionAlignPending,
    sessionAlignAutoApplyOnNavigator,
  } = storeToRefs(userWorkGroupsStore);

  const promptOpen = ref(false);
  const suppressedFingerprint = ref<string | null>(null);

  const isOnNavigator = computed(() => route.name === 'navigator');

  function pendingFingerprint(): string | null {
    const pending = sessionAlignPending.value;
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

  function shouldShowPrompt(): boolean {
    const fingerprint = pendingFingerprint();
    return Boolean(
      fingerprint
      && isOnNavigator.value
      && !sessionAlignAutoApplyOnNavigator.value
      && fingerprint !== suppressedFingerprint.value,
    );
  }

  function syncPromptVisibility() {
    promptOpen.value = shouldShowPrompt();
  }

  async function resumePendingOnNavigator() {
    if (!isOnNavigator.value) {
      syncPromptVisibility();
      return;
    }

    if (!sessionAlignPending.value) {
      promptOpen.value = false;
      return;
    }

    if (sessionAlignAutoApplyOnNavigator.value) {
      await userWorkGroupsStore.applySessionAlign();
      suppressedFingerprint.value = null;
      promptOpen.value = false;
      return;
    }

    syncPromptVisibility();
  }

  watch(
    sessionAlignPending,
    (pending) => {
      if (!pending) {
        suppressedFingerprint.value = null;
        promptOpen.value = false;
        return;
      }

      if (isOnNavigator.value) {
        // Mutation happened while already on Navigator → ask, don't auto-apply.
        sessionAlignAutoApplyOnNavigator.value = false;
        syncPromptVisibility();
        return;
      }

      // Away from Navigator: keep auto-apply so returning resumes opens.
      promptOpen.value = false;
    },
    { deep: true },
  );

  watch(
    isOnNavigator,
    async (onNavigator, wasOnNavigator) => {
      if (!onNavigator) {
        suppressedFingerprint.value = null;
        promptOpen.value = false;
        return;
      }

      // Entering Navigator (including first paint) should resume pending sync.
      if (wasOnNavigator === false || wasOnNavigator === undefined) {
        await nextTick();
        await resumePendingOnNavigator();
        return;
      }

      syncPromptVisibility();
    },
    { immediate: true },
  );

  async function confirmAlign() {
    await userWorkGroupsStore.applySessionAlign();
    suppressedFingerprint.value = null;
    promptOpen.value = false;
  }

  function deferAlign() {
    suppressedFingerprint.value = pendingFingerprint();
    sessionAlignAutoApplyOnNavigator.value = false;
    promptOpen.value = false;
  }

  return {
    promptOpen,
    pending: sessionAlignPending,
    confirmAlign,
    deferAlign,
  };
}
