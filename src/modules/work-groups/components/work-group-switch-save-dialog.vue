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
import { Input } from '@/components/ui/input';
import { useUserWorkGroupsStore, type ActivateWorkGroupSaveMode } from '@/stores/storage/user-work-groups';

const props = defineProps<{
  targetWorkGroupId: string | null;
}>();

const emit = defineEmits<{
  confirmed: [saveMode: ActivateWorkGroupSaveMode];
  cancelled: [];
}>();

const isOpen = defineModel<boolean>('open', { required: true });

const { t } = useI18n();
const userWorkGroupsStore = useUserWorkGroupsStore();

const mode = ref<'current' | 'create'>('current');
const newName = ref('');
const openUnopenedNewMembers = ref(true);
const closeReason = ref<'confirm' | 'cancel' | null>(null);

const activeWorkGroup = computed(() => userWorkGroupsStore.activeWorkGroup);
const churn = computed(() => (
  isOpen.value
    ? userWorkGroupsStore.getSwitchOpenStateChurn(props.targetWorkGroupId)
    : null
));
const canConfirm = computed(() => {
  if (mode.value === 'create') {
    return newName.value.trim().length > 0;
  }

  return Boolean(activeWorkGroup.value);
});
const showOpenUnopenedOption = computed(() => (
  (mode.value === 'current' || mode.value === 'create')
  && (churn.value?.unopenedNewMemberPaths.length ?? 0) > 0
));

watch(isOpen, (open) => {
  if (!open) {
    return;
  }

  mode.value = 'current';
  newName.value = '';
  openUnopenedNewMembers.value = true;
  closeReason.value = null;
});

function buildSaveMode(): ActivateWorkGroupSaveMode | null {
  const includeOpenUnopened = showOpenUnopenedOption.value && openUnopenedNewMembers.value;

  if (mode.value === 'create') {
    const name = newName.value.trim();
    if (!name) {
      return null;
    }

    return {
      type: 'create',
      name,
      openUnopenedNewMembers: includeOpenUnopened,
    };
  }

  return {
    type: 'current',
    openUnopenedNewMembers: includeOpenUnopened,
  };
}

function closeWithConfirm(saveMode: ActivateWorkGroupSaveMode) {
  closeReason.value = 'confirm';
  emit('confirmed', saveMode);
  isOpen.value = false;
}

function confirm() {
  if (!canConfirm.value) {
    return;
  }

  const saveMode = buildSaveMode();
  if (!saveMode) {
    return;
  }

  closeWithConfirm(saveMode);
}

function discardAndSwitch() {
  closeWithConfirm({ type: 'discard' });
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

  if (closeReason.value === 'confirm') {
    closeReason.value = null;
    return;
  }

  if (closeReason.value === 'cancel') {
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
    <DialogContent class="work-group-switch-save-dialog">
      <DialogHeader>
        <DialogTitle>{{ t('workGroups.switchPromptTitle') }}</DialogTitle>
        <DialogDescription>
          {{ t('workGroups.switchPromptDescription') }}
        </DialogDescription>
      </DialogHeader>

      <div
        v-if="churn"
        class="work-group-switch-save-dialog__churn"
      >
        <p>
          {{ t('workGroups.switchChurnRelativeToSaved', {
            added: churn.relativeToSaved.addedCount,
            closed: churn.relativeToSaved.closedCount,
          }) }}
          <span
            v-if="churn.relativeToSaved.closedCount > 0"
            class="work-group-switch-save-dialog__closed"
          >
            {{ t('workGroups.switchChurnClosedEmphasis', {
              closed: churn.relativeToSaved.closedCount,
            }) }}
          </span>
        </p>
        <p>
          {{ t('workGroups.switchChurnRelativeToTarget', {
            opened: churn.relativeToTarget.addedCount,
            closed: churn.relativeToTarget.closedCount,
          }) }}
          <span
            v-if="churn.relativeToTarget.closedCount > 0"
            class="work-group-switch-save-dialog__closed"
          >
            {{ t('workGroups.switchChurnClosedEmphasis', {
              closed: churn.relativeToTarget.closedCount,
            }) }}
          </span>
        </p>
      </div>

      <div class="work-group-switch-save-dialog__options">
        <button
          type="button"
          class="work-group-switch-save-dialog__option"
          :class="{ 'work-group-switch-save-dialog__option--selected': mode === 'current' }"
          @click="mode = 'current'"
        >
          <span class="work-group-switch-save-dialog__option-title">
            {{ t('workGroups.saveToCurrent') }}
          </span>
          <span
            v-if="activeWorkGroup"
            class="work-group-switch-save-dialog__option-meta"
          >
            {{ activeWorkGroup.name }}
          </span>
        </button>

        <button
          type="button"
          class="work-group-switch-save-dialog__option"
          :class="{ 'work-group-switch-save-dialog__option--selected': mode === 'create' }"
          @click="mode = 'create'"
        >
          <span class="work-group-switch-save-dialog__option-title">
            {{ t('workGroups.createNew') }}
          </span>
        </button>

        <Input
          v-if="mode === 'create'"
          v-model="newName"
          class="work-group-switch-save-dialog__name-input"
          :placeholder="t('workGroups.newNamePlaceholder')"
          @keydown.enter.prevent="confirm"
        />

        <label
          v-if="showOpenUnopenedOption"
          class="work-group-switch-save-dialog__checkbox"
        >
          <input
            v-model="openUnopenedNewMembers"
            type="checkbox"
          >
          <span>
            {{ t('workGroups.switchOpenUnopenedMembers', {
              count: churn?.unopenedNewMemberPaths.length ?? 0,
            }) }}
          </span>
        </label>
      </div>

      <DialogFooter class="work-group-switch-save-dialog__footer">
        <Button
          variant="ghost"
          @click="cancel"
        >
          {{ t('workGroups.cancel') }}
        </Button>
        <Button
          variant="outline"
          @click="discardAndSwitch"
        >
          {{ t('workGroups.discardAndSwitch') }}
        </Button>
        <Button
          :disabled="!canConfirm || !targetWorkGroupId"
          @click="confirm"
        >
          {{ t('workGroups.confirmSwitch') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<style>
.work-group-switch-save-dialog {
  max-width: 520px;
}

.work-group-switch-save-dialog__churn {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 10px 0 0;
  font-size: 13px;
  color: hsl(var(--muted-foreground));
}

.work-group-switch-save-dialog__churn p {
  margin: 0;
}

.work-group-switch-save-dialog__closed {
  color: hsl(var(--destructive));
  font-weight: 600;
}

.work-group-switch-save-dialog__options {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 12px 0 4px;
}

.work-group-switch-save-dialog__option {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  width: 100%;
  padding: 10px 12px;
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.work-group-switch-save-dialog__option--selected {
  border-color: hsl(var(--primary));
  background: hsl(var(--accent));
}

.work-group-switch-save-dialog__option-title {
  font-size: 14px;
  font-weight: 500;
}

.work-group-switch-save-dialog__option-meta {
  color: hsl(var(--muted-foreground));
  font-size: 12px;
}

.work-group-switch-save-dialog__name-input {
  margin-top: 4px;
}

.work-group-switch-save-dialog__checkbox {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-top: 4px;
  font-size: 13px;
  cursor: pointer;
}

.work-group-switch-save-dialog__footer {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
</style>
