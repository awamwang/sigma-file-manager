# Project mode replaces single-folder bookmark Projects

## Context

Sigma already had a **Project** entity: a single-folder bookmark with optional IDE/terminal metadata (`user-projects.json`). Separately, **Work Groups** associate member folders with Navigator open-state. Cursor-like “Project mode” needs a durable multi-folder domain container plus an outcome board — without inventing a parallel product name (“Goal Space”) or binding to Work Groups.

## Decision

1. Keep the product name **Project**. Evolve `user-projects.json` / `useUserProjectsStore` in place (schema version 2).
2. Migrate each legacy Project so its `path` becomes the first `workspaceLink`; preserve id, name, open stats, and IDE/terminal fields when present.
3. Workspace links are **independent** of Work Groups. “Open all links” uses Navigator `openOrFocusTabGroup` only — never create/activate a Work Group.
4. Tasks use a Cursor-like **list view + fixed four columns** (`backlog` / `doing` / `review` / `done`) with DnD on the board.
5. Context is a single `contextNotes` text blob on the Project.

## Consequences

- Dashboard / “Add to projects” continue to speak “Project”, but opening a Project prefers the Projects page (board/links) over treating it as only a path bookmark.
- Navigator gains “Attach to Project…” for adding a folder as a workspace link (toggle removes the link).
- Work Groups remain the session/membership model; Projects remain the durable outcome/coordination model. Do not merge their stores.
