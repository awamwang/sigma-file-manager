// SPDX-License-Identifier: GPL-3.0-or-later
// License: GNU GPLv3 or later. See the license file in the project root for more information.
// Copyright © 2021 - present Aleksey Hoffman. All rights reserved.

// Runs shell-extension queries inside a throwaway copy of the application
// process. A deadlocking shell extension keeps the process-wide module loader
// lock for as long as its thread lives, so even a worker thread that timed out
// would eventually stall the host's main thread on its next LoadLibrary call.
// Only a separate process can be abandoned and killed safely.

use std::io::{Read, Write};

pub const SHELL_HELPER_FLAG: &str = "--sfm-shell-menu-helper";
pub const OPERATION_LEGACY_CONTEXT_MENU: &str = "legacy-context-menu";
pub const OPERATION_MODERN_CONTEXT_MENU: &str = "modern-context-menu";
pub const OPERATION_ASSOCIATED_PROGRAMS: &str = "associated-programs";

pub fn run_if_requested() -> bool {
    let mut args = std::env::args().skip(1);
    if args.next().as_deref() != Some(SHELL_HELPER_FLAG) {
        return false;
    }

    let operation = args.next().unwrap_or_default();
    let mut input = String::new();

    if let Err(error) = std::io::stdin().read_to_string(&mut input) {
        eprintln!("Failed to read shell helper request: {error}");
        std::process::exit(1);
    }

    let paths: Vec<String> = match serde_json::from_str(&input) {
        Ok(paths) => paths,
        Err(error) => {
            eprintln!("Failed to parse shell helper request: {error}");
            std::process::exit(2);
        }
    };

    let encoded_result = match operation.as_str() {
        OPERATION_LEGACY_CONTEXT_MENU => paths.first().map(|path| {
            serde_json::to_string(&super::windows::get_shell_context_menu_impl(path))
        }),
        OPERATION_MODERN_CONTEXT_MENU => Some(serde_json::to_string(
            &super::windows::get_modern_context_menu_impl(&paths),
        )),
        OPERATION_ASSOCIATED_PROGRAMS => paths.first().map(|path| {
            serde_json::to_string(&super::windows::get_associated_programs_impl(path))
        }),
        _ => {
            eprintln!("Unknown shell helper operation: {operation}");
            std::process::exit(3);
        }
    };

    match encoded_result {
        Some(Ok(json)) => {
            let mut stdout = std::io::stdout();
            let _ = writeln!(stdout, "{json}");
            let _ = stdout.flush();
        }
        Some(Err(error)) => {
            eprintln!("Failed to encode shell helper result: {error}");
            std::process::exit(4);
        }
        None => {
            eprintln!("Shell helper request contained no paths");
            std::process::exit(5);
        }
    }

    true
}
