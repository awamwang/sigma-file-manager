# Group Navigator Defaults apply only under member paths

While a Work Group is Active, its Group Navigator Defaults apply only when the current path is a Member Folder or a descendant of one; outside that scope the UI falls back to global Navigator defaults (still overridden by per-path folder settings). Applying defaults to every path whenever the group is Active would surprise users who temporarily browse outside the group; limiting defaults to exact member roots would break normal drilling into subfolders.
