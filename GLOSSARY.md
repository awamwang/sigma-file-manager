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
When leaving the Active Work Group to activate another, if the Active Open State’s tab paths differ from that group’s saved Open State, the user chooses where to persist it: the current Work Group, or a newly named Work Group. Creating a new Work Group here copies the current Open State, Member Folders, and Group Navigator Defaults. Other existing Work Groups are not valid save targets. The user may discard changes and switch, or cancel. After save or discard, the originally chosen target becomes Active. A Work Group created from the management page starts empty instead. The prompt appears only for Active save churn (opened/closed tab paths vs saved); replacing with the target’s Open State is not a reason to prompt. Closed counts are emphasized. If new Member Folders exist but still lack exact-path tabs, the prompt may offer to open those tabs before saving so the written Open State can include them. A pending Session Align Prompt is superseded by this flow.
_Avoid_: autosave, silent save

**Session Align Prompt** (会话对齐提示):
When the Active Work Group’s definition is written (Member Folders or Group Navigator Defaults) while the user is on Navigator, a coalesced pending delta drives a prompt to align the live session: re-apply Group Navigator Defaults, and open tabs for members added in that delta that still lack an exact-path tab. Removed members never auto-close tabs. Declining defers alignment only; the definition is already committed. There is no per-group historical baseline—the goal is Active↔definition sync. Edits made while not on Navigator stay silent until return to Navigator with that group still Active. Activating another Work Group clears the pending delta, restores Open State, then opens members the target has that the previous Active Work Group does not. Renaming alone does not raise this prompt.
_Avoid_: sync dialog, reload work group, refresh members, baseline

**Missing Member Folder** (失效成员):
A Member Folder whose directory path no longer exists on disk. The management page keeps it listed with a clear error state so the user can remove it deliberately. Navigator session alignment does not silently delete it from the definition or prompt solely because the path vanished.
_Avoid_: orphan path, broken shortcut, auto-prune

**Open All Members**:
An action that ensures each Member Folder of a chosen Work Group has a Navigator tab (focus existing, otherwise open). Available as a per-group submenu item in the tab-bar Work Group switcher; operates on the live Navigator session, not saved Open State.
_Avoid_: open Work Group, restore Open State

**Close Member Tabs**:
An action that closes Navigator tabs whose path exactly equals a Member Folder of a chosen Work Group (descendant paths are left alone). Available as a per-group submenu item in the tab-bar Work Group switcher; operates on the live Navigator session, not saved Open State.
_Avoid_: close Work Group, clear Open State

**Save Members From Tabs**:
An action that replaces a chosen Work Group’s Member Folders with the unique exact paths of the current Navigator tabs (full replace, not merge). A confirmation dialog shows added and removed member paths before writing. Writes the definition only; does not change Open State or auto-close tabs. When the target is Active, no Session Align Prompt is raised for that write.
_Avoid_: save Open State, sync tabs, export members

**Workspace**:
The runtime Navigator session shell for a window (tabs, split panes, current indices). Not a user-facing Work Group.
_Avoid_: Work Group, working set

**Project**:
A single-folder bookmark with optional IDE/terminal metadata and open statistics. Independent of Work Group membership.
_Avoid_: Work Group, workspace, repository

**Tab Group**:
One Navigator tab strip entry, holding one or two panes (optional split view).
_Avoid_: Work Group, Workspace
