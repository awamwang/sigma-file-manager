<!-- SPDX-License-Identifier: GPL-3.0-or-later
License: GNU GPLv3 or later. See the license file in the project root for more information.
Copyright © 2021 - present Aleksey Hoffman. All rights reserved.
-->

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { FolderPlusIcon } from '@lucide/vue';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/components/ui/toaster';
import { SettingsItem } from '@/modules/settings';
import { useI18n } from 'vue-i18n';
import { usePlatformStore } from '@/stores/runtime/platform';
import {
  isExplorerAddProjectEnabled,
  setExplorerAddProjectEnabled,
} from '@/utils/explorer-add-project';

const { t } = useI18n();
const platformStore = usePlatformStore();

const isEnabled = ref(false);
const isLoading = ref(true);
const isApplying = ref(false);

async function refreshExplorerAddProjectState(showError = true) {
  isLoading.value = true;

  try {
    isEnabled.value = await isExplorerAddProjectEnabled();
  }
  catch (error) {
    console.error('Failed to read Explorer add-project state:', error);

    if (showError) {
      toast.error(error instanceof Error ? error.message : String(error));
    }

    isEnabled.value = false;
  }
  finally {
    isLoading.value = false;
  }
}

async function onExplorerAddProjectChange(enabled: boolean) {
  isApplying.value = true;

  try {
    isEnabled.value = await setExplorerAddProjectEnabled(enabled);
  }
  catch (error) {
    console.error('Failed to update Explorer add-project state:', error);
    toast.error(error instanceof Error ? error.message : String(error));
    await refreshExplorerAddProjectState(false);
  }
  finally {
    isApplying.value = false;
  }
}

onMounted(async () => {
  if (!platformStore.supportsDefaultFileManager) {
    isLoading.value = false;
    return;
  }

  await refreshExplorerAddProjectState();
});
</script>

<template>
  <SettingsItem
    v-if="platformStore.isWindows"
    :title="t('settings.experimental.explorerAddProject.title')"
    :description="t('settings.experimental.explorerAddProject.description')"
    :icon="FolderPlusIcon"
  >
    <template #title-suffix>
      <span
        v-if="platformStore.isMicrosoftStoreInstallation"
        class="explorer-add-project__availability-badge"
      >
        {{ t('settings.experimental.explorerAddProject.unavailableInMicrosoftStore') }}
      </span>
    </template>
    <Switch
      id="explorer-add-project"
      :disabled="!platformStore.supportsDefaultFileManager || isLoading || isApplying"
      :model-value="isEnabled"
      @update:model-value="onExplorerAddProjectChange"
    />
  </SettingsItem>
</template>

<style scoped>
.explorer-add-project__availability-badge {
  display: inline-flex;
  align-items: center;
  padding: 0.125rem 0.5rem;
  border-radius: var(--radius-full);
  background-color: hsl(var(--warning) / 12%);
  color: hsl(var(--warning));
  font-size: 0.75rem;
  font-weight: 600;
  line-height: 1.4;
}
</style>
