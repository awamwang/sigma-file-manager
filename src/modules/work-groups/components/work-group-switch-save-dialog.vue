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

const activeWorkGroup = computed(() => userWorkGroupsStore.activeWorkGroup);
const canConfirm = computed(() => {
  if (mode.value === 'create') {
    return newName.value.trim().length > 0;
  }

  return Boolean(activeWorkGroup.value);
});

watch(isOpen, (open) => {
  if (!open) {
    return;
  }

  mode.value = 'current';
  newName.value = '';
});

function confirm() {
  if (!canConfirm.value) {
    return;
  }

  if (mode.value === 'create') {
    emit('confirmed', { type: 'create', name: newName.value.trim() });
  }
  else {
    emit('confirmed', { type: 'current' });
  }

  isOpen.value = false;
}

function discardAndSwitch() {
  emit('confirmed', { type: 'discard' });
  isOpen.value = false;
}

function cancel() {
  emit('cancelled');
  isOpen.value = false;
}
</script>

<template>
  <Dialog
    v-model:open="isOpen"
    @update:open="(open) => { if (!open) cancel(); }"
  >
    <DialogContent class="work-group-switch-save-dialog">
      <DialogHeader>
        <DialogTitle>{{ t('workGroups.switchPromptTitle') }}</DialogTitle>
        <DialogDescription>
          {{ t('workGroups.switchPromptDescription') }}
        </DialogDescription>
      </DialogHeader>

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
  max-width: 480px;
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

.work-group-switch-save-dialog__footer {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
</style>
