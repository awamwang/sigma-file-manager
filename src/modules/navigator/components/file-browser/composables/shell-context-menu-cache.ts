// SPDX-License-Identifier: GPL-3.0-or-later
// License: GNU GPLv3 or later. See the license file in the project root for more information.
// Copyright © 2021 - present Aleksey Hoffman. All rights reserved.

import { invoke } from '@tauri-apps/api/core';
import type { DirEntry } from '@/types/dir-entry';

export type MenuItemSource = 'legacy' | 'modern';

export interface ShellContextMenuItem {
  id: number;
  name: string;
  verb: string | null;
  icon: string | null;
  children: ShellContextMenuItem[] | null;
  source?: MenuItemSource;
  isSeparator?: false;
}

export interface GetShellContextMenuResult {
  success: boolean;
  items: ShellContextMenuItem[];
  error: string | null;
}

export interface ShellContextMenuQueryResult {
  legacyResult: GetShellContextMenuResult;
  modernResult: GetShellContextMenuResult;
}

// Shell-extension queries spawn disposable helper processes, so their results
// are cached in-memory and reused while the selection stays the same. The TTL
// keeps the submenu in sync with handlers that get installed or updated.
const CACHE_TTL_MS = 30_000;
const MAX_CACHE_ENTRIES = 32;

interface CacheEntry {
  queryResult: ShellContextMenuQueryResult;
  storedAt: number;
}

const resultCache = new Map<string, CacheEntry>();
const inFlightQueries = new Map<string, Promise<ShellContextMenuQueryResult>>();

function buildCacheKey(selectedEntries: DirEntry[]): string {
  return selectedEntries.map(entry => entry.path).join('|');
}

function toFailedResult(invokeError: unknown): GetShellContextMenuResult {
  return {
    success: false,
    items: [],
    error: String(invokeError),
  };
}

export function getCachedShellContextMenu(
  selectedEntries: DirEntry[],
): ShellContextMenuQueryResult | null {
  if (selectedEntries.length === 0) return null;

  const cacheKey = buildCacheKey(selectedEntries);
  const cached = resultCache.get(cacheKey);
  if (!cached) return null;

  if (Date.now() - cached.storedAt > CACHE_TTL_MS) {
    resultCache.delete(cacheKey);
    return null;
  }

  // Refresh the insertion order so the oldest entries get evicted first.
  resultCache.delete(cacheKey);
  resultCache.set(cacheKey, cached);

  return cached.queryResult;
}

export function loadShellContextMenu(
  selectedEntries: DirEntry[],
): Promise<ShellContextMenuQueryResult | null> {
  if (selectedEntries.length === 0) return Promise.resolve(null);

  const cached = getCachedShellContextMenu(selectedEntries);
  if (cached) return Promise.resolve(cached);

  const cacheKey = buildCacheKey(selectedEntries);
  const inFlightQuery = inFlightQueries.get(cacheKey);
  if (inFlightQuery) return inFlightQuery;

  const query = (async () => {
    const [legacyResult, modernResult] = await Promise.all([
      invoke<GetShellContextMenuResult>('get_shell_context_menu', {
        filePath: selectedEntries[0].path,
      }).catch(toFailedResult),
      invoke<GetShellContextMenuResult>('get_modern_context_menu', {
        filePaths: selectedEntries.map(entry => entry.path),
      }).catch(toFailedResult),
    ]);

    return {
      legacyResult,
      modernResult,
    };
  })();

  inFlightQueries.set(cacheKey, query);

  // Only successful queries are cached; failures are retried on the next open.
  void query.then(
    queryResult => cacheQueryResult(cacheKey, queryResult),
    () => discardInFlightQuery(cacheKey),
  );

  return query;
}

function discardInFlightQuery(cacheKey: string) {
  inFlightQueries.delete(cacheKey);
}

function cacheQueryResult(cacheKey: string, queryResult: ShellContextMenuQueryResult) {
  discardInFlightQuery(cacheKey);

  if (!queryResult.legacyResult.success && !queryResult.modernResult.success) {
    return;
  }

  resultCache.set(cacheKey, {
    queryResult,
    storedAt: Date.now(),
  });

  while (resultCache.size > MAX_CACHE_ENTRIES) {
    const oldestKey = resultCache.keys().next().value;
    if (oldestKey === undefined) break;
    resultCache.delete(oldestKey);
  }
}
