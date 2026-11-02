<!-- SPDX-License-Identifier: GPL-3.0-or-later
License: GNU GPLv3 or later. See the license file in the project root for more information.
Copyright © 2021 - present Aleksey Hoffman. All rights reserved.
-->

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { ChevronDownIcon, LayersIcon } from '@lucide/vue';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { useUserWorkGroupsStore } from '@/stores/storage/user-work-groups';
import { useWorkGroupActivation } from '@/modules/work-groups/composables/use-work-group-activation';
import WorkGroupSwitchSaveDialog from '@/modules/work-groups/components/work-group-switch-save-dialog.vue';
import WorkGroupSaveMembersDialog from '@/modules/work-groups/components/work-group-save-members-dialog.vue';

const { t } = useI18n();
const router = useRouter();
const userWorkGroupsStore = useUserWorkGroupsStore();
const {
  switchPromptOpen,
  pendingTargetWorkGroupId,
  activateWorkGroup,
  confirmSwitch,
  cancelSwitch,
} = useWorkGroupActivation();

const activeName = computed(() => userWorkGroupsStore.activeWorkGroup?.name ?? t('workGroups.title'));
const saveMembersDialogOpen = ref(false);
const saveMembersWorkGroupId = ref<string | null>(null);

function requestSaveMembers(workGroupId: string) {
  saveMembersWorkGroupId.value = workGroupId;
  saveMembersDialogOpen.value = true;
}
</script>

<template>
  <div class="work-group-tab-bar-switcher">
    <DropdownMenu>
      <DropdownMenuTrigger as-child>
        <Button
          class="work-group-tab-bar-switcher__trigger"
          variant="ghost"
          size="xs"
        >
          <LayersIcon :size="14" />
          <span class="work-group-tab-bar-switcher__label">{{ activeName }}</span>
          <ChevronDownIcon :size="12" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        class="work-group-tab-bar-switcher__menu"
      >
        <DropdownMenuLabel>{{ t('workGroups.title') }}</DropdownMenuLabel>
        <DropdownMenuSub
          v-for="workGroup in userWorkGroupsStore.workGroups"
          :key="workGroup.id"
        >
          <DropdownMenuSubTrigger
            class="work-group-tab-bar-switcher__sub-trigger"
            :class="{
              'work-group-tab-bar-switcher__sub-trigger--active':
                userWorkGroupsStore.activeWorkGroup?.id === workGroup.id,
            }"
          >
            <span class="work-group-tab-bar-switcher__item-name">{{ workGroup.name }}</span>
            <span
              v-if="workGroup.isDefault"
              class="work-group-tab-bar-switcher__badge"
            >
              {{ t('workGroups.defaultBadge') }}
            </span>
            <span
              v-if="userWorkGroupsStore.activeWorkGroup?.id === workGroup.id"
              class="work-group-tab-bar-switcher__badge work-group-tab-bar-switcher__badge--active"
            >
              {{ t('workGroups.active') }}
            </span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent class="work-group-tab-bar-switcher__sub-menu">
            <DropdownMenuItem @select="activateWorkGroup(workGroup.id)">
              {{ t('workGroups.open') }}
            </DropdownMenuItem>
            <DropdownMenuItem @select="requestSaveMembers(workGroup.id)">
              {{ t('workGroups.saveAsMembersConfig', { name: workGroup.name }) }}
            </DropdownMenuItem>
            <DropdownMenuItem @select="userWorkGroupsStore.openAllMembers(workGroup.id)">
              {{ t('workGroups.openAllMembers') }}
            </DropdownMenuItem>
            <DropdownMenuItem @select="userWorkGroupsStore.closeMemberTabs(workGroup.id)">
              {{ t('workGroups.closeMemberTabs') }}
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem @select="router.push({ name: 'work-groups' })">
          {{ t('pages.work-groups') }}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>

    <WorkGroupSwitchSaveDialog
      v-model:open="switchPromptOpen"
      :target-work-group-id="pendingTargetWorkGroupId"
      @confirmed="confirmSwitch"
      @cancelled="cancelSwitch"
    />

    <WorkGroupSaveMembersDialog
      v-model:open="saveMembersDialogOpen"
      :work-group-id="saveMembersWorkGroupId"
    />
  </div>
</template>

<style>
.work-group-tab-bar-switcher {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  margin-right: 4px;
}

.work-group-tab-bar-switcher__trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 180px;
}

.work-group-tab-bar-switcher__label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.work-group-tab-bar-switcher__menu {
  min-width: 220px;
}

.work-group-tab-bar-switcher__sub-menu {
  min-width: 220px;
}

.work-group-tab-bar-switcher__sub-trigger {
  gap: 6px;
}

.work-group-tab-bar-switcher__sub-trigger--active {
  background-color: hsl(var(--accent));
}

.work-group-tab-bar-switcher__item-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.work-group-tab-bar-switcher__badge {
  flex-shrink: 0;
  padding: 1px 6px;
  border-radius: 999px;
  background: hsl(var(--muted));
  color: hsl(var(--muted-foreground));
  font-size: 11px;
}

.work-group-tab-bar-switcher__badge--active {
  background: hsl(var(--primary) / 0.15);
  color: hsl(var(--primary));
}
</style>
