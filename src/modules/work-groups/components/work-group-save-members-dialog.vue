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
import type { MemberPathDiff } from '@/utils/work-group-paths';

const props = defineProps<{
  workGroupId: string | null;
}>();

const emit = defineEmits<{
  confirmed: [];
  cancelled: [];
}>();

const isOpen = defineModel<boolean>('open', { required: true });

const { t } = useI18n();
const userWorkGroupsStore = useUserWorkGroupsStore();
const closeReason = ref<'confirm' | 'cancel' | null>(null);
const diff = ref<MemberPathDiff | null>(null);

const workGroup = computed(() => (
  props.workGroupId
    ? userWorkGroupsStore.getWorkGroupById(props.workGroupId)
    : null
));

const canConfirm = computed(() => Boolean(diff.value?.hasChanges && props.workGroupId));

watch(isOpen, (open) => {
  if (!open) {
    return;
  }

  closeReason.value = null;
  diff.value = props.workGroupId
    ? userWorkGroupsStore.getReplaceMembersFromTabsDiff(props.workGroupId)
    : null;
});

async function confirm() {
  if (!canConfirm.value || !props.workGroupId) {
    return;
  }

  const saved = await userWorkGroupsStore.replaceMemberPathsFromCurrentTabs(props.workGroupId);

  if (!saved) {
    return;
  }

  closeReason.value = 'confirm';
  emit('confirmed');
  isOpen.value = false;
}

function cancel() {
  closeReason.value = 'cancel';
  emit('cancelled');
  isOpen.value = false;
}

function handleOpenChange(open: boolean) {
  if (open) {
    return;
  }

  if (closeReason.value === 'confirm' || closeReason.value === 'cancel') {
    closeReason.value = null;
    return;
  }

  emit('cancelled');
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
    <DialogContent class="work-group-save-members-dialog">
      <DialogHeader>
        <DialogTitle>
          {{ t('workGroups.saveMembersTitle', { name: workGroup?.name ?? '' }) }}
        </DialogTitle>
        <DialogDescription>
          {{ t('workGroups.saveMembersDescription', { name: workGroup?.name ?? '' }) }}
        </DialogDescription>
      </DialogHeader>

      <div
        v-if="diff && !diff.hasChanges"
        class="work-group-save-members-dialog__empty"
      >
        {{ t('workGroups.saveMembersNoChanges') }}
      </div>

      <div
        v-else-if="diff"
        class="work-group-save-members-dialog__diff"
      >
        <section v-if="diff.addedPaths.length > 0">
          <h3>
            {{ t('workGroups.saveMembersAdded', { count: diff.addedPaths.length }) }}
          </h3>
          <ul>
            <li
              v-for="path in diff.addedPaths"
              :key="`add-${path}`"
            >
              {{ path }}
            </li>
          </ul>
        </section>

        <section
          v-if="diff.removedPaths.length > 0"
          class="work-group-save-members-dialog__removed"
        >
          <h3>
            {{ t('workGroups.saveMembersRemoved', { count: diff.removedPaths.length }) }}
          </h3>
          <ul>
            <li
              v-for="path in diff.removedPaths"
              :key="`remove-${path}`"
            >
              {{ path }}
            </li>
          </ul>
        </section>
      </div>

      <DialogFooter class="work-group-save-members-dialog__footer">
        <Button
          variant="ghost"
          @click="cancel"
        >
          {{ t('workGroups.cancel') }}
        </Button>
        <Button
          :disabled="!canConfirm"
          @click="confirm"
        >
          {{ t('workGroups.saveMembersConfirm') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<style>
.work-group-save-members-dialog {
  max-width: 560px;
}

.work-group-save-members-dialog__empty {
  margin: 12px 0 4px;
  font-size: 13px;
  color: hsl(var(--muted-foreground));
}

.work-group-save-members-dialog__diff {
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-height: 360px;
  margin: 12px 0 4px;
  overflow: auto;
}

.work-group-save-members-dialog__diff h3 {
  margin: 0 0 6px;
  font-size: 13px;
  font-weight: 600;
}

.work-group-save-members-dialog__diff ul {
  margin: 0;
  padding-left: 18px;
  font-size: 12px;
  line-height: 1.5;
  word-break: break-all;
}

.work-group-save-members-dialog__removed h3,
.work-group-save-members-dialog__removed li {
  color: hsl(var(--destructive));
}

.work-group-save-members-dialog__footer {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
</style>
