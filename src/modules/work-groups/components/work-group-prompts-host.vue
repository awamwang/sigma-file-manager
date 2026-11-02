<!-- SPDX-License-Identifier: GPL-3.0-or-later
License: GNU GPLv3 or later. See the license file in the project root for more information.
Copyright © 2021 - present Aleksey Hoffman. All rights reserved.
-->

<script setup lang="ts">
import { useWorkGroupSessionAlign } from '@/modules/work-groups/composables/use-work-group-session-align';
import WorkGroupSessionAlignDialog from '@/modules/work-groups/components/work-group-session-align-dialog.vue';

const {
  promptOpen,
  confirmAlign,
  deferAlign,
} = useWorkGroupSessionAlign();
</script>

<template>
  <WorkGroupSessionAlignDialog
    v-model:open="promptOpen"
    @confirmed="confirmAlign"
    @deferred="deferAlign"
  />
</template>
