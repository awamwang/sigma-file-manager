<!-- SPDX-License-Identifier: GPL-3.0-or-later
License: GNU GPLv3 or later. See the license file in the project root for more information.
Copyright © 2021 - present Aleksey Hoffman. All rights reserved.
-->

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useUserWorkGroupsStore } from '@/stores/storage/user-work-groups';

const emit = defineEmits<{
  confirmed: [];
  deferred: [];
}>();

const isOpen = defineModel<boolean>('open', { required: true });

const { t } = useI18n();
const userWorkGroupsStore = useUserWorkGroupsStore();
const closeReason = ref<'confirm' | 'defer' | null>(null);

const pending = computed(() => userWorkGroupsStore.sessionAlignPending);

watch(isOpen, (open) => {
  if (open) {
    closeReason.value = null;
  }
});

function confirm() {
  closeReason.value = 'confirm';
  emit('confirmed');
  isOpen.value = false;
}

function deferAlign() {
  closeReason.value = 'defer';
  emit('deferred');
  isOpen.value = false;
}

function handleOpenChange(open: boolean) {
  if (open) {
    return;
  }

  if (closeReason.value === 'confirm' || closeReason.value === 'defer') {
    closeReason.value = null;
    return;
  }

  emit('deferred');
}
</script>

<template>
  <Dialog
    :open="isOpen"
    @update:open="(open) => {
      isOpen = open;
      handleOpenChange(open);
    }"
  >
    <DialogContent class="work-group-session-align-dialog">
      <DialogHeader>
        <DialogTitle>{{ t('workGroups.sessionAlignTitle') }}</DialogTitle>
        <DialogDescription>
          {{ t('workGroups.sessionAlignDescription') }}
        </DialogDescription>
      </DialogHeader>

      <ul
        v-if="pending"
        class="work-group-session-align-dialog__summary"
      >
        <li v-if="pending.addedMemberPaths.length > 0">
          {{ t('workGroups.sessionAlignAdded', { count: pending.addedMemberPaths.length }) }}
        </li>
        <li
          v-if="pending.removedMemberPaths.length > 0"
          class="work-group-session-align-dialog__closed"
        >
          {{ t('workGroups.sessionAlignRemoved', { count: pending.removedMemberPaths.length }) }}
        </li>
        <li v-if="pending.defaultsChanged">
          {{ t('workGroups.sessionAlignDefaultsChanged') }}
        </li>
      </ul>

      <DialogFooter class="work-group-session-align-dialog__footer">
        <Button
          variant="ghost"
          @click="deferAlign"
        >
          {{ t('workGroups.sessionAlignLater') }}
        </Button>
        <Button @click="confirm">
          {{ t('workGroups.sessionAlignApply') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<style>
.work-group-session-align-dialog {
  max-width: 480px;
}

.work-group-session-align-dialog__summary {
  margin: 12px 0 4px;
  padding-left: 18px;
  font-size: 13px;
  line-height: 1.5;
}

.work-group-session-align-dialog__closed {
  color: hsl(var(--destructive));
  font-weight: 600;
}

.work-group-session-align-dialog__footer {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
</style>
