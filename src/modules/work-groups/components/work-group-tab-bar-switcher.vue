<!-- SPDX-License-Identifier: GPL-3.0-or-later
License: GNU GPLv3 or later. See the license file in the project root for more information.
Copyright © 2021 - present Aleksey Hoffman. All rights reserved.
-->

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { ChevronDownIcon, LayersIcon } from '@lucide/vue';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { useUserWorkGroupsStore } from '@/stores/storage/user-work-groups';
import { useWorkGroupActivation } from '@/modules/work-groups/composables/use-work-group-activation';
import WorkGroupSwitchSaveDialog from '@/modules/work-groups/components/work-group-switch-save-dialog.vue';

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
        <DropdownMenuItem
          v-for="workGroup in userWorkGroupsStore.workGroups"
          :key="workGroup.id"
          @select="activateWorkGroup(workGroup.id)"
        >
          <span class="work-group-tab-bar-switcher__item-name">{{ workGroup.name }}</span>
          <span
            v-if="userWorkGroupsStore.activeWorkGroup?.id === workGroup.id"
            class="work-group-tab-bar-switcher__badge work-group-tab-bar-switcher__badge--active"
          >
            {{ t('workGroups.active') }}
          </span>
          <span
            v-else-if="workGroup.isDefault"
            class="work-group-tab-bar-switcher__badge"
          >
            {{ t('workGroups.defaultBadge') }}
          </span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem @select="userWorkGroupsStore.openAllMembers()">
          {{ t('workGroups.openAllMembers') }}
        </DropdownMenuItem>
        <DropdownMenuItem @select="userWorkGroupsStore.closeMemberTabs()">
          {{ t('workGroups.closeMemberTabs') }}
        </DropdownMenuItem>
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

.work-group-tab-bar-switcher__item-name {
  flex: 1;
}

.work-group-tab-bar-switcher__badge {
  margin-left: 8px;
  color: hsl(var(--muted-foreground));
  font-size: 11px;
}

.work-group-tab-bar-switcher__badge--active {
  color: hsl(var(--primary));
}
</style>
