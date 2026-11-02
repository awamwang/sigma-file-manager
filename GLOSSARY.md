# Sigma File Manager

Domain language for the file manager product. Implementation details do not belong here.

## Language

**Work Group** (工作组):
A named first-class container that owns member folders, group-level shared settings, and its own saved Navigator open state.
_Avoid_: Workspace, Project, Tab Group, session, collection

**Member Folder**:
A directory path that belongs to a Work Group. Only directories may be members. Membership is many-to-many, and a parent path and its child may both be members. Membership drives listing, batch open/close of member tabs, and the scope of group settings — not a hard limit on where tabs may navigate.
_Avoid_: Project, favorite, root

**Open State**:
The Work Group’s saved Navigator tabs and split layout (which paths are open, how panes are arranged, which tab is current). Distinct from membership.
_Avoid_: session, workspace snapshot, layout

**Active Work Group**:
The Work Group currently applied to the Navigator. The app is always in exactly one Active Work Group, including a built-in Default Work Group. Activating another Work Group from the sidebar or the Navigator tab-bar switcher uses the same leave flow.
_Avoid_: current workspace, focused project

**Default Work Group** (默认工作组):
The built-in Work Group that absorbs the previous single primary Workspace behavior. Always exists and cannot be deleted; it may be renamed. UI must show a clear marker that it is the default. Deleting a non-default Active Work Group activates the Default Work Group afterward. On first migration, the previous single-workspace Open State becomes this group’s Open State, with no members and no group settings.
_Avoid_: ungrouped, no work group, global session

**Group Navigator Defaults**:
Work Group–level defaults for Navigator presentation (layout, list/grid sort, show-hidden). They apply while the group is Active and the current path is a Member Folder or a descendant of one. Precedence: per-path folder settings → Group Navigator Defaults → global Navigator defaults.
_Avoid_: folder settings, theme, workspace settings

**Switch Save Prompt**:
When leaving the Active Work Group to activate another, if Open State is dirty, the user chooses where to persist it: the current Work Group, or a newly named Work Group. Creating a new Work Group here copies the current Open State, Member Folders, and Group Navigator Defaults. Other existing Work Groups are not valid save targets. The user may discard changes and switch, or cancel. After save or discard, the originally chosen target becomes Active. A Work Group created from the management page starts empty instead.
_Avoid_: autosave, silent save

**Open All Members**:
An action that ensures each Member Folder of the Active Work Group has a Navigator tab (focus existing, otherwise open). Available from the Work Group management page and the tab-bar Work Group switcher.
_Avoid_: open Work Group, restore Open State

**Close Member Tabs**:
An action that closes Navigator tabs whose path exactly equals a Member Folder of the Active Work Group (descendant paths are left alone). Available from the management page and the tab-bar switcher.
_Avoid_: close Work Group, clear Open State

**Workspace**:
The runtime Navigator session shell for a window (tabs, split panes, current indices). Not a user-facing Work Group.
_Avoid_: Work Group, working set

**Project**:
A single-folder bookmark with optional IDE/terminal metadata and open statistics. Independent of Work Group membership.
_Avoid_: Work Group, workspace, repository

**Tab Group**:
One Navigator tab strip entry, holding one or two panes (optional split view).
_Avoid_: Work Group, Workspace
