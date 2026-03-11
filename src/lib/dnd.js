/**
 * Container ID formats:
 * - main-{date}|completed-{date} — inbox by date (date can be "null" for no-date)
 * - sub-{parent_id} — subtasks
 * - bucket-someday-main | bucket-someday-completed — someday list
 * - bucket-project-{uuid}-main | bucket-project-{uuid}-completed — project list
 */
export function parseContainerId(containerId) {
  if (!containerId || typeof containerId !== 'string') return null;
  if (containerId.startsWith('bucket-')) {
    const value = containerId.slice(7);
    const completed = value.endsWith('-completed');
    const suffix = completed ? '-completed' : '-main';
    const prefix = value.slice(0, value.length - suffix.length);
    if (prefix === 'someday') {
      return { list_type: 'someday', project_id: null, completed };
    }
    if (prefix.startsWith('project-')) {
      return { list_type: 'project', project_id: prefix.slice(8), completed };
    }
    return null;
  }
  const dash = containerId.indexOf('-');
  if (dash < 0) return null;
  const type = containerId.slice(0, dash);
  const value = containerId.slice(dash + 1);
  if (type === 'main' || type === 'completed') {
    const scheduled_date = value === 'null' ? null : value;
    return { scheduled_date, parent_id: null, list_type: 'inbox', project_id: null, completed: type === 'completed' };
  }
  if (type === 'sub') {
    return { scheduled_date: undefined, parent_id: value, list_type: undefined, project_id: undefined, completed: false };
  }
  return null;
}

/** For date-based inbox lists and subtasks. */
export function getContainerId(scheduled_date, parent_id, completed) {
  if (parent_id) return `sub-${parent_id}`;
  const datePart = scheduled_date == null ? 'null' : scheduled_date;
  return completed ? `completed-${datePart}` : `main-${datePart}`;
}

/** For bucket lists: someday and project. */
export function getContainerIdForBucket(list_type, project_id, completed) {
  if (list_type === 'someday') {
    return completed ? 'bucket-someday-completed' : 'bucket-someday-main';
  }
  if (list_type === 'project' && project_id) {
    return completed ? `bucket-project-${project_id}-completed` : `bucket-project-${project_id}-main`;
  }
  return null;
}

/** Get container id for a task (used as source in drag end). */
export function getContainerIdFromTask(task) {
  if (!task) return null;
  if (task.parent_id) return `sub-${task.parent_id}`;
  const list_type = task.list_type || 'inbox';
  const completed = !!task.completed_at;
  if (list_type === 'someday') return getContainerIdForBucket('someday', null, completed);
  if (list_type === 'project' && task.project_id) return getContainerIdForBucket('project', task.project_id, completed);
  return getContainerId(task.scheduled_date ?? null, null, completed);
}
