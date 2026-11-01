// SPDX-License-Identifier: GPL-3.0-or-later
// License: GNU GPLv3 or later. See the license file in the project root for more information.
// Copyright © 2021 - present Aleksey Hoffman. All rights reserved.

import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';
import type * as VueI18nModule from 'vue-i18n';
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import ExplorerAddProject from '@/modules/settings/ui/categories/experimental/explorer-add-project.vue';
import { usePlatformStore } from '@/stores/runtime/platform';

const { invokeMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

vi.mock('@/modules/settings', () => ({
  SettingsItem: {
    props: ['title', 'description', 'icon'],
    template: `
      <section class="settings-view-item">
        <slot name="title-suffix" />
        <slot />
      </section>
    `,
  },
}));

vi.mock('vue-i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof VueI18nModule>();

  return {
    ...actual,
    useI18n: () => ({
      t: (key: string) => key,
    }),
  };
});

describe('explorer add-project setting', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    invokeMock.mockReset();
    invokeMock.mockResolvedValue(false);
  });

  it('shows an unavailable badge and disabled switch for Microsoft Store installations', () => {
    const platformStore = usePlatformStore();
    platformStore.currentPlatform = 'windows';
    platformStore.appUpdatesManagedExternally = true;
    platformStore.supportsDefaultFileManager = false;

    const wrapper = mount(ExplorerAddProject);

    expect(wrapper.get('.explorer-add-project__availability-badge').text()).toBe(
      'settings.experimental.explorerAddProject.unavailableInMicrosoftStore',
    );
    expect(wrapper.get('[role="switch"]').attributes('disabled')).toBeDefined();
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('reads the Explorer add-project state on direct Windows installations', async () => {
    const platformStore = usePlatformStore();
    platformStore.currentPlatform = 'windows';
    platformStore.appUpdatesManagedExternally = false;
    platformStore.supportsDefaultFileManager = true;

    const wrapper = mount(ExplorerAddProject);
    await flushPromises();

    expect(wrapper.find('.explorer-add-project__availability-badge').exists()).toBe(false);
    expect(wrapper.get('[role="switch"]').attributes('disabled')).toBeUndefined();
    expect(invokeMock).toHaveBeenCalledWith('is_explorer_add_project_enabled');
  });

  it('applies the Explorer add-project state when the switch changes', async () => {
    invokeMock.mockResolvedValue(true);

    const platformStore = usePlatformStore();
    platformStore.currentPlatform = 'windows';
    platformStore.appUpdatesManagedExternally = false;
    platformStore.supportsDefaultFileManager = true;

    const wrapper = mount(ExplorerAddProject);
    await flushPromises();

    await wrapper.get('[role="switch"]').trigger('click');
    await flushPromises();

    expect(invokeMock).toHaveBeenCalledWith('set_explorer_add_project_enabled', {
      enabled: expect.any(Boolean),
    });
  });

  it('does not show the Windows-only setting on other platforms', () => {
    const platformStore = usePlatformStore();
    platformStore.currentPlatform = 'linux';
    platformStore.supportsDefaultFileManager = false;

    const wrapper = mount(ExplorerAddProject);

    expect(wrapper.find('.settings-view-item').exists()).toBe(false);
    expect(invokeMock).not.toHaveBeenCalled();
  });
});
