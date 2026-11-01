# Project Manager (P0 MVP extension)

Implements the P0 milestone of the project manager plan
([docs/project-manager/plan.md](../../docs/project-manager/plan.md)) as a pure
local extension — zero app code changes.

## Features

- Directory context menu: **Add to Projects** / **Remove from Projects**
  (single directory selection)
- Command palette:
  - **Projects: Open project...** — searchable list-detail picker; open the
    selected project in the file browser (like opening a folder) or launch the
    configured IDE with the project path
  - **Projects: Add current folder** — saves the folder open in the active tab
- Settings (`contributes.configuration`):
  - `ideCommand` — command resolved from PATH, default `code`.
    Flags allowed (`code --new-window`); the project path is appended as the
    last argument.

## Install (local folder)

1. Open **Settings → Extensions** (or the Extensions page)
2. Choose "Install extension from folder"
3. Select `extensions/project-manager` from this repository

Requires Sigma File Manager >= 2.2.0.

## Data

Projects are stored in the extension's own settings
(`sigma.storage`, key `projects`):
`{ id, path, name, addedAt, lastOpenedAt, openCount }`.

## Known P0 limitations (by design, see plan.md)

- No dedicated sidebar page — the picker is a modal
- IDE launching is limited to PATH-resolvable commands
  (extension shell sandbox)
- No git status / running process tracking / workspaces integration
