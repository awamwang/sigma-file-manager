<!-- SPDX-License-Identifier: GPL-3.0-or-later
License: GNU GPLv3 or later. See the license file in the project root for more information.
Copyright © 2021 - present Aleksey Hoffman. All rights reserved.
-->

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { CheckIcon, LayersIcon } from '@lucide/vue';
import { ContextMenuSub } from 'reka-ui';
import {
  ContextMenuItem,
  ContextMenuSubTrigger,
  ContextMenuSubContent,
} from '@/components/ui/context-menu';
import type { DirEntry } from '@/types/dir-entry';
import { useUserWorkGroupsStore } from '@/stores/storage/user-work-groups';
import { getDirectoryPathFromEntry } from '@/utils/virtual-location-action-target';
import { isVirtualLocationPath } from '@/utils/virtual-path-constants';
import { isExactMemberPath } from '@/utils/work-group-paths';

const props = defineProps<{
  selectedEntries: DirEntry[];
}>();

const { t } = useI18n();
const userWorkGroupsStore = useUserWorkGroupsStore();

const directoryPath = computed(() => {
  const firstEntry = props.selectedEntries[0];

  if (!firstEntry?.is_dir) {
    return null;
  }

  const path = getDirectoryPathFromEntry(firstEntry);

  if (!path || isVirtualLocationPath(path)) {
    return null;
  }

  return path;
});

const workGroups = computed(() => userWorkGroupsStore.workGroups);

async function toggleWorkGroup(workGroupId: string, event?: Event) {
  event?.preventDefault();

  if (!directoryPath.value) {
    return;
  }

  await userWorkGroupsStore.toggleMemberPath(workGroupId, directoryPath.value);
}

function isMember(workGroupId: string): boolean {
  if (!directoryPath.value) {
    return false;
  }

  const workGroup = userWorkGroupsStore.getWorkGroupById(workGroupId);
  return Boolean(workGroup && isExactMemberPath(directoryPath.value, workGroup.memberPaths));
}
</script>

<template>
  <ContextMenuSub v-if="directoryPath">
    <ContextMenuSubTrigger class="add-to-work-group-submenu__trigger">
      <LayersIcon :size="16" />
      <span>{{ t('fileBrowser.actions.addToWorkGroup') }}</span>
    </ContextMenuSubTrigger>
    <ContextMenuSubContent class="add-to-work-group-submenu">
      <ContextMenuItem
        v-for="workGroup in workGroups"
        :key="workGroup.id"
        class="add-to-work-group-submenu__item"
        @select="toggleWorkGroup(workGroup.id, $event)"
      >
        <CheckIcon
          v-if="isMember(workGroup.id)"
          :size="16"
        />
        <span
          v-else
          class="add-to-work-group-submenu__check-spacer"
        />
        <span>{{ workGroup.name }}</span>
        <span
          v-if="workGroup.isDefault"
          class="add-to-work-group-submenu__badge"
        >
          {{ t('workGroups.defaultBadge') }}
        </span>
      </ContextMenuItem>
    </ContextMenuSubContent>
  </ContextMenuSub>
</template>

<style>
.add-to-work-group-submenu {
  min-width: 220px;
  max-width: 320px;
}

.add-to-work-group-submenu__trigger,
.add-to-work-group-submenu__item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.add-to-work-group-submenu__check-spacer {
  width: 16px;
  height: 16px;
}

.add-to-work-group-submenu__badge {
  margin-left: auto;
  color: hsl(var(--muted-foreground));
  font-size: 11px;
}
</style>
