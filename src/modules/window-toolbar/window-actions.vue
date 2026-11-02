<!-- SPDX-License-Identifier: GPL-3.0-or-later
License: GNU GPLv3 or later. See the license file in the project root for more information.
Copyright © 2021 - present Aleksey Hoffman. All rights reserved.
-->

<script setup lang="ts">
import { getCurrentWindow } from '@tauri-apps/api/window';
import { MinusIcon, SquareIcon, XIcon } from '@lucide/vue';
import { useI18n } from 'vue-i18n';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui/tooltip';
import { toggleMainWindowMaximized } from '@/utils/window-fullscreen';
import { useUserWorkGroupsStore } from '@/stores/storage/user-work-groups';

const { t } = useI18n();
const appWindow = getCurrentWindow();
const userWorkGroupsStore = useUserWorkGroupsStore();

function minimizeWindow() {
  appWindow.minimize();
}

function maximizeWindow() {
  toggleMainWindowMaximized().catch((error: unknown) => {
    console.error('Failed to toggle window maximize:', error);
  });
}

async function closeWindow() {
  try {
    await userWorkGroupsStore.flushActiveOpenState();
  }
  catch (error) {
    console.error('Failed to flush active work group open state:', error);
  }

  await appWindow.hide();
}
</script>

<template>
  <div class="window-actions">
    <Tooltip>
      <TooltipTrigger as-child>
        <div
          class="window-toolbar-button"
          @click="minimizeWindow"
        >
          <MinusIcon
            class="window-toolbar-button-icon"
            :size="16"
          />
        </div>
      </TooltipTrigger>
      <TooltipContent>
        {{ t('window.minimizeWindow') }}
      </TooltipContent>
    </Tooltip>
    <Tooltip>
      <TooltipTrigger as-child>
        <div
          class="window-toolbar-button"
          @click="maximizeWindow"
        >
          <SquareIcon
            class="window-toolbar-button-icon"
            :size="14"
          />
        </div>
      </TooltipTrigger>
      <TooltipContent>
        {{ t('window.toggleWindowSize') }}
      </TooltipContent>
    </Tooltip>
    <Tooltip>
      <TooltipTrigger as-child>
        <div
          class="window-toolbar-button window-toolbar-button--red"
          @click="closeWindow"
        >
          <XIcon
            class="window-toolbar-button-icon"
            :size="18"
          />
        </div>
      </TooltipTrigger>
      <TooltipContent>
        {{ t('window.closeWindow') }}
      </TooltipContent>
    </Tooltip>
  </div>
</template>

<style scoped>
.window-actions {
  z-index: 2;
  display: flex;
}

.window-toolbar-button {
  display: inline-flex;
  width: 46px;
  height: var(--window-toolbar-height);
  align-items: center;
  justify-content: center;
  cursor: pointer;
  user-select: none;
}

.window-toolbar-button:hover {
  background: hsl(var(--foreground) / 10%);
}

.window-toolbar-button-icon {
  stroke: hsl(var(--foreground) / 50%);
}

.window-toolbar-button--red:hover {
  background: hsl(var(--destructive) / 50%);
}
</style>
