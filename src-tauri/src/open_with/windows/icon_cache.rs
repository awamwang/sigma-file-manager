// SPDX-License-Identifier: GPL-3.0-or-later
// License: GNU GPLv3 or later. See the license file in the project root for more information.
// Copyright © 2021 - present Aleksey Hoffman. All rights reserved.

//! Persistent cache for shell-extension icon data URIs.
//!
//! Shell-extension queries run in disposable helper processes, so in-memory
//! caches cannot survive between queries. Icons resolved from a stable source
//! identifier (an icon location string such as `C:\...\7z.dll,-5` or an image
//! file path) are stored on disk and reused across queries until they expire.
//! Legacy `IContextMenu` items only expose raw `HBITMAP`s without any stable
//! source identifier, so their icons are re-encoded on every query.

use once_cell::sync::Lazy;
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

const ICON_CACHE_TTL: Duration = Duration::from_secs(60 * 60 * 24 * 30);
const MAX_ICON_CACHE_FILES: usize = 512;

static ICON_CACHE_DIR: Lazy<Option<PathBuf>> = Lazy::new(|| {
    crate::app_dirs::cache_dir_without_app("com.sigma-file-manager.app")
        .map(|dir| dir.join("shell-icons"))
});

/// Returns the cached data URI for `key`, producing and persisting it on a
/// miss. Failures of the cache itself never affect the produced value.
pub fn cached_icon_data_uri<F>(key: &str, produce: F) -> Option<String>
where
    F: FnOnce() -> Option<String>,
{
    let Some(cache_dir) = ICON_CACHE_DIR.as_ref() else {
        return produce();
    };

    let cache_path = icon_cache_path(cache_dir, key);

    if let Some(cached) = read_cached_icon(&cache_path) {
        return Some(cached);
    }

    let produced = produce()?;

    store_icon(cache_dir, &cache_path, produced.as_str());
    Some(produced)
}

fn icon_cache_path(cache_dir: &Path, key: &str) -> PathBuf {
    // `DefaultHasher::new()` is seeded with fixed keys, so the hash is stable
    // across processes and runs. The key prefix keeps future cache namespaces
    // from colliding with icon locations.
    let mut hasher = DefaultHasher::new();
    format!("icon:{key}").hash(&mut hasher);

    cache_dir.join(format!("{:016x}.txt", hasher.finish()))
}

fn read_cached_icon(path: &Path) -> Option<String> {
    let modified = std::fs::metadata(path).ok()?.modified().ok()?;
    let age = SystemTime::now().duration_since(modified).ok()?;
    if age > ICON_CACHE_TTL {
        return None;
    }

    let contents = std::fs::read_to_string(path).ok()?;
    (!contents.is_empty()).then_some(contents)
}

fn store_icon(cache_dir: &Path, cache_path: &Path, data_uri: &str) {
    if std::fs::create_dir_all(cache_dir).is_err() {
        return;
    }

    // A PID-suffixed temporary name keeps concurrent helper processes from
    // racing on the same file; the rename atomically replaces any entry that
    // is already present.
    let temp_path = cache_path.with_extension(format!("tmp{}", std::process::id()));
    if std::fs::write(&temp_path, data_uri).is_ok() {
        let _ = std::fs::rename(&temp_path, cache_path);
    }

    prune_icon_cache(cache_dir);
}

fn prune_icon_cache(cache_dir: &Path) {
    let Ok(entries) = std::fs::read_dir(cache_dir) else {
        return;
    };

    let mut icon_files: Vec<(PathBuf, SystemTime)> = entries
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let modified = entry.metadata().ok()?.modified().ok()?;
            Some((entry.path(), modified))
        })
        .collect();

    if icon_files.len() <= MAX_ICON_CACHE_FILES {
        return;
    }

    icon_files.sort_by_key(|(_, modified)| *modified);

    let excess = icon_files.len() - MAX_ICON_CACHE_FILES;
    for (path, _) in icon_files.into_iter().take(excess) {
        let _ = std::fs::remove_file(path);
    }
}
