<!-- SPDX-License-Identifier: GPL-3.0-or-later
License: GNU GPLv3 or later. See the license file in the project root for more information.
Copyright © 2021 - present Aleksey Hoffman. All rights reserved.
-->

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import {
  FolderPlusIcon,
  LayersIcon,
  PencilIcon,
  Trash2Icon,
  TriangleAlertIcon,
} from '@lucide/vue';
import { PageDefaultLayout } from '@/layouts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useUserWorkGroupsStore } from '@/stores/storage/user-work-groups';
import { useUserSettingsStore } from '@/stores/storage/user-settings';
import { createNavigatorFolderSettingsSnapshot } from '@/modules/navigator/utils/resolve-navigator-folder-settings';
import { useWorkGroupActivation } from '@/modules/work-groups/composables/use-work-group-activation';
import WorkGroupSwitchSaveDialog from '@/modules/work-groups/components/work-group-switch-save-dialog.vue';
import type { WorkGroup } from '@/types/user-work-groups';
import normalizePath from '@/utils/normalize-path';

const { t } = useI18n();
const userWorkGroupsStore = useUserWorkGroupsStore();
const userSettingsStore = useUserSettingsStore();
const {
  switchPromptOpen,
  pendingTargetWorkGroupId,
  activateWorkGroup,
  confirmSwitch,
  cancelSwitch,
} = useWorkGroupActivation();

const selectedWorkGroupId = ref<string | null>(null);
const renameDraft = ref('');
const deleteDialogOpen = ref(false);
const pendingDeleteId = ref<string | null>(null);
const missingMemberPaths = ref<Set<string>>(new Set());
let missingMembersRequestId = 0;

const workGroups = computed(() => userWorkGroupsStore.workGroups);
const selectedWorkGroup = computed(() => (
  workGroups.value.find(workGroup => workGroup.id === selectedWorkGroupId.value)
  ?? workGroups.value[0]
  ?? null
));
const missingMemberCount = computed(() => missingMemberPaths.value.size);

function selectWorkGroup(workGroup: WorkGroup) {
  selectedWorkGroupId.value = workGroup.id;
  renameDraft.value = workGroup.name;
}

function isMissingMember(path: string): boolean {
  return missingMemberPaths.value.has(path);
}

async function refreshMissingMembers(memberPaths: string[]) {
  const requestId = ++missingMembersRequestId;

  if (memberPaths.length === 0) {
    missingMemberPaths.value = new Set();
    return;
  }

  const results = await Promise.all(memberPaths.map(async (path) => {
    try {
      const exists = await invoke<boolean>('path_exists', { path });
      return exists ? null : path;
    }
    catch {
      return path;
    }
  }));

  if (requestId !== missingMembersRequestId) {
    return;
  }

  missingMemberPaths.value = new Set(results.filter((path): path is string => Boolean(path)));
}

watch(
  () => selectedWorkGroup.value?.memberPaths ?? [],
  (memberPaths) => {
    void refreshMissingMembers(memberPaths);
  },
  { immediate: true, deep: true },
);

async function createEmptyWorkGroup() {
  const workGroup = await userWorkGroupsStore.createWorkGroup();
  selectWorkGroup(workGroup);
}

async function saveRename() {
  if (!selectedWorkGroup.value) {
    return;
  }

  await userWorkGroupsStore.renameWorkGroup(selectedWorkGroup.value.id, renameDraft.value);
}

async function requestDelete(workGroup: WorkGroup) {
  if (workGroup.isDefault) {
    return;
  }

  pendingDeleteId.value = workGroup.id;
  deleteDialogOpen.value = true;
}

async function confirmDelete() {
  const id = pendingDeleteId.value;

  if (!id) {
    return;
  }

  await userWorkGroupsStore.deleteWorkGroup(id);
  pendingDeleteId.value = null;
  deleteDialogOpen.value = false;
  selectedWorkGroupId.value = userWorkGroupsStore.activeWorkGroup?.id ?? null;
}

async function addMemberFolder() {
  if (!selectedWorkGroup.value) {
    return;
  }

  const selected = await open({
    directory: true,
    multiple: false,
  });

  if (typeof selected !== 'string' || !selected) {
    return;
  }

  await userWorkGroupsStore.addMemberPath(selectedWorkGroup.value.id, normalizePath(selected));
}

async function removeMember(path: string) {
  if (!selectedWorkGroup.value) {
    return;
  }

  await userWorkGroupsStore.removeMemberPath(selectedWorkGroup.value.id, path);
}

async function saveDefaultsFromCurrent() {
  if (!selectedWorkGroup.value) {
    return;
  }

  const snapshot = createNavigatorFolderSettingsSnapshot(userSettingsStore.userSettings.navigator);
  await userWorkGroupsStore.setNavigatorDefaults(selectedWorkGroup.value.id, snapshot);
}

async function clearDefaults() {
  if (!selectedWorkGroup.value) {
    return;
  }

  await userWorkGroupsStore.setNavigatorDefaults(selectedWorkGroup.value.id, null);
}

async function openWorkGroup(workGroup: WorkGroup) {
  await activateWorkGroup(workGroup.id, { navigateToNavigator: true });
}

if (workGroups.value[0]) {
  selectWorkGroup(workGroups.value[0]);
}
</script>

<template>
  <PageDefaultLayout
    :title="t('workGroups.title')"
    :subtitle="t('workGroups.subtitle')"
  >
    <div class="work-groups-page">
      <aside class="work-groups-page__list">
        <div class="work-groups-page__list-header">
          <Button
            size="sm"
            @click="createEmptyWorkGroup"
          >
            <FolderPlusIcon :size="14" />
            {{ t('workGroups.create') }}
          </Button>
        </div>

        <button
          v-for="workGroup in workGroups"
          :key="workGroup.id"
          type="button"
          class="work-groups-page__list-item"
          :class="{
            'work-groups-page__list-item--selected': selectedWorkGroup?.id === workGroup.id,
            'work-groups-page__list-item--active': userWorkGroupsStore.activeWorkGroup?.id === workGroup.id,
          }"
          @click="selectWorkGroup(workGroup)"
        >
          <LayersIcon :size="16" />
          <span class="work-groups-page__list-item-name">{{ workGroup.name }}</span>
          <span
            v-if="workGroup.isDefault"
            class="work-groups-page__badge"
          >
            {{ t('workGroups.defaultBadge') }}
          </span>
          <span
            v-if="userWorkGroupsStore.activeWorkGroup?.id === workGroup.id"
            class="work-groups-page__badge work-groups-page__badge--active"
          >
            {{ t('workGroups.active') }}
          </span>
        </button>
      </aside>

      <section
        v-if="selectedWorkGroup"
        class="work-groups-page__detail"
      >
        <div class="work-groups-page__detail-header">
          <Input
            v-model="renameDraft"
            class="work-groups-page__rename-input"
            @keydown.enter.prevent="saveRename"
            @blur="saveRename"
          />
          <Button
            size="sm"
            variant="outline"
            @click="openWorkGroup(selectedWorkGroup)"
          >
            {{ t('workGroups.open') }}
          </Button>
          <Button
            v-if="!selectedWorkGroup.isDefault"
            size="sm"
            variant="destructive"
            @click="requestDelete(selectedWorkGroup)"
          >
            <Trash2Icon :size="14" />
            {{ t('workGroups.delete') }}
          </Button>
        </div>

        <div class="work-groups-page__section">
          <div class="work-groups-page__section-header">
            <h2>{{ t('workGroups.members') }}</h2>
            <Button
              size="xs"
              variant="outline"
              @click="addMemberFolder"
            >
              {{ t('workGroups.addMember') }}
            </Button>
          </div>

          <p
            v-if="missingMemberCount > 0"
            class="work-groups-page__missing-banner"
          >
            <TriangleAlertIcon :size="14" />
            {{ t('workGroups.missingMembersBanner', { count: missingMemberCount }) }}
          </p>

          <p
            v-if="selectedWorkGroup.memberPaths.length === 0"
            class="work-groups-page__empty"
          >
            {{ t('workGroups.noMembers') }}
          </p>
          <ul
            v-else
            class="work-groups-page__members"
          >
            <li
              v-for="memberPath in selectedWorkGroup.memberPaths"
              :key="memberPath"
              class="work-groups-page__member"
              :class="{ 'work-groups-page__member--missing': isMissingMember(memberPath) }"
            >
              <div class="work-groups-page__member-main">
                <span>{{ memberPath }}</span>
                <span
                  v-if="isMissingMember(memberPath)"
                  class="work-groups-page__member-error"
                >
                  {{ t('workGroups.missingMemberBadge') }}
                </span>
              </div>
              <Button
                size="xs"
                variant="ghost"
                @click="removeMember(memberPath)"
              >
                {{ t('workGroups.removeMember') }}
              </Button>
            </li>
          </ul>
        </div>

        <div class="work-groups-page__section">
          <div class="work-groups-page__section-header">
            <h2>{{ t('workGroups.navigatorDefaults') }}</h2>
          </div>
          <div class="work-groups-page__defaults-actions">
            <Button
              size="sm"
              variant="outline"
              @click="saveDefaultsFromCurrent"
            >
              <PencilIcon :size="14" />
              {{ t('workGroups.saveDefaultsFromCurrent') }}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              :disabled="!selectedWorkGroup.navigatorDefaults"
              @click="clearDefaults"
            >
              {{ t('workGroups.useGlobalDefaults') }}
            </Button>
          </div>
          <p class="work-groups-page__defaults-status">
            {{
              selectedWorkGroup.navigatorDefaults
                ? `${selectedWorkGroup.navigatorDefaults.layout} · hidden=${selectedWorkGroup.navigatorDefaults.showHiddenFiles}`
                : t('workGroups.useGlobalDefaults')
            }}
          </p>
        </div>
      </section>
    </div>

    <WorkGroupSwitchSaveDialog
      v-model:open="switchPromptOpen"
      :target-work-group-id="pendingTargetWorkGroupId"
      @confirmed="confirmSwitch"
      @cancelled="cancelSwitch"
    />

    <Dialog v-model:open="deleteDialogOpen">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{{ t('workGroups.deleteConfirmTitle') }}</DialogTitle>
          <DialogDescription>
            {{ t('workGroups.deleteConfirmDescription') }}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="ghost"
            @click="deleteDialogOpen = false"
          >
            {{ t('workGroups.cancel') }}
          </Button>
          <Button
            variant="destructive"
            @click="confirmDelete"
          >
            {{ t('workGroups.deleteDiscardAndDelete') }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </PageDefaultLayout>
</template>

<style>
.work-groups-page {
  display: grid;
  grid-template-columns: minmax(220px, 280px) minmax(0, 1fr);
  gap: 20px;
  min-height: 480px;
}

.work-groups-page__list,
.work-groups-page__detail {
  border: 1px solid hsl(var(--border));
  border-radius: 12px;
  background: hsl(var(--card) / 0.35);
}

.work-groups-page__list {
  display: flex;
  flex-direction: column;
  padding: 12px;
  gap: 8px;
}

.work-groups-page__list-header {
  margin-bottom: 4px;
}

.work-groups-page__list-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 10px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.work-groups-page__list-item--selected,
.work-groups-page__list-item:hover {
  background: hsl(var(--accent));
}

.work-groups-page__list-item-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.work-groups-page__badge {
  flex-shrink: 0;
  padding: 1px 6px;
  border-radius: 999px;
  background: hsl(var(--muted));
  color: hsl(var(--muted-foreground));
  font-size: 11px;
}

.work-groups-page__badge--active {
  background: hsl(var(--primary) / 0.15);
  color: hsl(var(--primary));
}

.work-groups-page__detail {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 16px;
}

.work-groups-page__detail-header {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.work-groups-page__rename-input {
  min-width: 200px;
  flex: 1;
}

.work-groups-page__section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.work-groups-page__section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.work-groups-page__section-header h2 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
}

.work-groups-page__empty {
  margin: 0;
  color: hsl(var(--muted-foreground));
  font-size: 13px;
}

.work-groups-page__missing-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  padding: 8px 10px;
  border: 1px solid hsl(var(--destructive) / 0.35);
  border-radius: 8px;
  background: hsl(var(--destructive) / 0.08);
  color: hsl(var(--destructive));
  font-size: 13px;
}

.work-groups-page__members {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.work-groups-page__member {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 10px;
  border-radius: 8px;
  background: hsl(var(--background) / 0.5);
  font-size: 13px;
  word-break: break-all;
}

.work-groups-page__member--missing {
  border: 1px solid hsl(var(--destructive) / 0.35);
}

.work-groups-page__member-main {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.work-groups-page__member-error {
  color: hsl(var(--destructive));
  font-size: 12px;
  font-weight: 600;
}

.work-groups-page__defaults-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.work-groups-page__defaults-status {
  margin: 0;
  color: hsl(var(--muted-foreground));
  font-size: 12px;
}

@media (max-width: 900px) {
  .work-groups-page {
    grid-template-columns: 1fr;
  }
}
</style>
