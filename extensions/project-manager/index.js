/* global sigma */
// P0 MVP of the project manager feature (see docs/project-manager/plan.md).
// Runs inside the extension worker sandbox. No app code changes required.

const STORAGE_KEY = 'projects';
const NOTIFICATION_DURATION_MS = 5000;
const DEFAULT_IDE_COMMAND = 'code';

function getErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function notify(options) {
  sigma.ui.showNotification({
    title: 'Project Manager',
    duration: NOTIFICATION_DURATION_MS,
    ...options,
  });
}

async function getProjects() {
  const storedProjects = await sigma.storage.get(STORAGE_KEY);
  return Array.isArray(storedProjects) ? storedProjects : [];
}

async function saveProjects(projects) {
  await sigma.storage.set(STORAGE_KEY, projects);
}

function getBaseName(path) {
  const normalizedPath = String(path).replace(/[\\/]+$/, '');
  const separatorIndex = Math.max(
    normalizedPath.lastIndexOf('\\'),
    normalizedPath.lastIndexOf('/'),
  );

  return separatorIndex === -1
    ? normalizedPath
    : normalizedPath.slice(separatorIndex + 1);
}

async function addProject(path) {
  const projects = await getProjects();
  const existingProject = projects.find(project => project.path === path);

  if (existingProject) {
    notify({
      description: `"${existingProject.name}" is already in your projects`,
      type: 'info',
    });
    return existingProject;
  }

  const project = {
    id: `project-${Date.now()}`,
    path,
    name: getBaseName(path) || path,
    addedAt: Date.now(),
    lastOpenedAt: null,
    openCount: 0,
  };

  await saveProjects([project, ...projects]);

  notify({
    description: `Added "${project.name}" to projects`,
    type: 'success',
  });

  return project;
}

async function removeProject(path) {
  const projects = await getProjects();
  const remainingProjects = projects.filter(project => project.path !== path);
  await saveProjects(remainingProjects);
  return projects.length - remainingProjects.length;
}

async function recordProjectOpened(project) {
  const projects = await getProjects();
  const projectIndex = projects.findIndex(item => item.id === project.id);

  if (projectIndex === -1) {
    return;
  }

  projects[projectIndex] = {
    ...projects[projectIndex],
    lastOpenedAt: Date.now(),
    openCount: (projects[projectIndex].openCount || 0) + 1,
  };

  await saveProjects(projects);
}

async function openProjectInNavigator(project) {
  await sigma.commands.executeCommand('sigma.navigator.openPath', project.path);
  await recordProjectOpened(project);
}

async function openProjectInIde(project) {
  const configuredCommand = await sigma.settings.get('ideCommand');
  const trimmedCommand = typeof configuredCommand === 'string'
    ? configuredCommand.trim()
    : '';
  const commandParts = (trimmedCommand || DEFAULT_IDE_COMMAND).split(/\s+/);

  await sigma.shell.run(
    commandParts[0],
    [...commandParts.slice(1), project.path],
  );

  await recordProjectOpened(project);
}

function formatTimestamp(timestamp) {
  if (typeof timestamp !== 'number' || timestamp <= 0) {
    return 'never';
  }

  return new Date(timestamp).toLocaleString();
}

function getProjectItems(projects, searchQuery) {
  const normalizedQuery = String(searchQuery || '').trim().toLowerCase();
  const filteredProjects = normalizedQuery === ''
    ? projects
    : projects.filter(project =>
        project.name.toLowerCase().includes(normalizedQuery)
        || project.path.toLowerCase().includes(normalizedQuery),
      );

  return filteredProjects.map(project => ({
    id: project.id,
    title: project.name,
    subtitle: project.path,
    icon: 'files',
  }));
}

function getProjectDetailFields(project) {
  return [
    { label: 'Name', value: project.name },
    { label: 'Path', value: project.path },
    { label: 'Added', value: formatTimestamp(project.addedAt) },
    { label: 'Opened', value: String(project.openCount || 0) },
    { label: 'Last opened', value: formatTimestamp(project.lastOpenedAt) },
  ];
}

function getProjectDetail(project) {
  return {
    type: 'text',
    text: project.path,
  };
}

async function showProjectsModal() {
  let projects = await getProjects();

  const initialProject = projects.length > 0 ? projects[0] : null;

  const modal = sigma.ui.createModal({
    title: 'Projects',
    commandTitle: 'Open project',
    layout: 'listDetail',
    width: 760,
    listDetail: {
      items: getProjectItems(projects),
      selectedItemId: initialProject ? initialProject.id : null,
      searchQuery: '',
      filterValue: 'all',
      filterOptions: [],
      searchPlaceholder: 'Search projects...',
      detail: initialProject ? getProjectDetail(initialProject) : null,
      detailFields: initialProject ? getProjectDetailFields(initialProject) : [],
      emptyListTitle: 'No projects yet',
      emptyListDescription: 'Right-click a folder and pick "Add to Projects", or run "Projects: Add current folder" from the command palette.',
      emptyDetailTitle: 'Select a project',
      emptyDetailDescription: 'Choose a project to see its details.',
    },
    buttons: [
      { id: 'open', label: 'Open folder', variant: 'primary' },
      { id: 'open-ide', label: 'Open in IDE' },
      { id: 'remove', label: 'Remove', variant: 'danger' },
    ],
  });

  function getSelectedProject(values) {
    const selectedItemId = values?.selectedItemId ?? null;
    return projects.find(project => project.id === selectedItemId) || null;
  }

  function refreshList(searchQuery, preferredProjectId) {
    const items = getProjectItems(projects, searchQuery);
    const selectedProject = preferredProjectId
      ? projects.find(project => project.id === preferredProjectId) || null
      : null;

    modal.setListDetail({
      items,
      selectedItemId: selectedProject ? selectedProject.id : (items.length > 0 ? items[0].id : null),
      detail: selectedProject ? getProjectDetail(selectedProject) : null,
      detailFields: selectedProject ? getProjectDetailFields(selectedProject) : [],
    });
  }

  modal.onSelectionChange((itemId) => {
    const selectedProject = projects.find(project => project.id === itemId) || null;
    modal.setListDetail({
      detail: selectedProject ? getProjectDetail(selectedProject) : null,
      detailFields: selectedProject ? getProjectDetailFields(selectedProject) : [],
    });
  });

  modal.onSearchChange((searchQuery) => {
    refreshList(searchQuery, null);
  });

  modal.onSubmit(async (values, buttonId) => {
    const selectedProject = getSelectedProject(values);

    if (buttonId === 'remove') {
      if (!selectedProject) {
        return false;
      }

      await removeProject(selectedProject.path);
      projects = await getProjects();
      refreshList('', null);
      notify({
        description: `Removed "${selectedProject.name}" from projects`,
        type: 'success',
      });
      return false;
    }

    if (!selectedProject) {
      return false;
    }

    try {
      if (buttonId === 'open') {
        await openProjectInNavigator(selectedProject);
      }
      else if (buttonId === 'open-ide') {
        await openProjectInIde(selectedProject);
      }
      else {
        return false;
      }

      projects = await getProjects();
      return true;
    }
    catch (error) {
      notify({
        description: `Failed to open "${selectedProject.name}": ${getErrorMessage(error)}`,
        type: 'error',
      });
      return false;
    }
  });
}

function registerContextMenuItems() {
  sigma.contextMenu.registerItem(
    {
      id: 'add-project',
      title: 'Add to Projects',
      icon: 'folder-plus',
      when: { selectionType: 'single', entryType: 'directory' },
      group: 'projects',
      order: 1,
    },
    async (context) => {
      const entry = context.selectedEntries[0];

      if (!entry) {
        return;
      }

      try {
        await addProject(entry.path);
      }
      catch (error) {
        notify({
          description: `Failed to add project: ${getErrorMessage(error)}`,
          type: 'error',
        });
      }
    },
  );

  sigma.contextMenu.registerItem(
    {
      id: 'remove-project',
      title: 'Remove from Projects',
      icon: 'folder-minus',
      when: { selectionType: 'single', entryType: 'directory' },
      group: 'projects',
      order: 2,
    },
    async (context) => {
      const entry = context.selectedEntries[0];

      if (!entry) {
        return;
      }

      try {
        const removedCount = await removeProject(entry.path);
        notify(removedCount > 0
          ? {
              description: `Removed "${entry.name}" from projects`,
              type: 'success',
            }
          : {
              description: `"${entry.name}" is not in your projects`,
              type: 'info',
            });
      }
      catch (error) {
        notify({
          description: `Failed to remove project: ${getErrorMessage(error)}`,
          type: 'error',
        });
      }
    },
  );
}

function registerCommands() {
  sigma.commands.registerCommand(
    { id: 'open-projects', title: 'Projects: Open project...' },
    () => showProjectsModal(),
  );

  sigma.commands.registerCommand(
    { id: 'add-current-folder', title: 'Projects: Add current folder' },
    async () => {
      const currentPath = sigma.context.getCurrentPath();

      if (!currentPath) {
        notify({
          description: 'No folder is open in the active tab',
          type: 'warning',
        });
        return;
      }

      try {
        await addProject(currentPath);
      }
      catch (error) {
        notify({
          description: `Failed to add project: ${getErrorMessage(error)}`,
          type: 'error',
        });
      }
    },
  );
}

export async function activate() {
  registerContextMenuItems();
  registerCommands();
}

export async function deactivate() {}
