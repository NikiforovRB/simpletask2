import { closestCenter } from '@dnd-kit/core';

/**
 * Container ID formats:
 * - main-{date}|completed-{date} — inbox by date (date can be "null" for no-date)
 * - sub-{parent_id} — subtasks
 * - bucket-someday-main | bucket-someday-completed — someday list
 * - bucket-project-{uuid}-main | bucket-project-{uuid}-completed — project list
 * - kcard-{uuid} | kcarddone-{uuid} — the task list of a kanban card
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
  // The board of a card is not in the id: the caller looks it up from the card,
  // which it has to have at hand anyway to show the list.
  if (type === 'kcard' || type === 'kcarddone') {
    return {
      scheduled_date: null,
      parent_id: null,
      list_type: 'kanban',
      card_id: value,
      completed: type === 'kcarddone',
    };
  }
  return null;
}

const TIMELINE_PREFIX = 'timeline::';

/** The timeline of a calendar day as a drop target: a task dropped on it gets a slot there. */
export function getTimelineDropId(date) {
  return `${TIMELINE_PREFIX}${date}`;
}

/** The date of a timeline drop target, or null for any other target. */
export function parseTimelineDropId(id) {
  if (typeof id !== 'string' || !id.startsWith(TIMELINE_PREFIX)) return null;
  return id.slice(TIMELINE_PREFIX.length);
}

/**
 * A day's timeline is too tall a target for the closest-center rule: it takes
 * whatever is dropped with the pointer on it, the lists take the rest.
 */
export function timelineAwareCollision(args) {
  const p = args.pointerCoordinates;
  const listTargets = [];
  for (const container of args.droppableContainers) {
    if (parseTimelineDropId(container.id) == null) {
      listTargets.push(container);
      continue;
    }
    const r = p && container.node.current?.getBoundingClientRect();
    if (r && p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom) {
      return [{ id: container.id, data: { droppableContainer: container, value: 0 } }];
    }
  }
  return closestCenter({ ...args, droppableContainers: listTargets });
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

/** For the task list of a kanban card. */
export function getContainerIdForCard(card_id, completed) {
  if (!card_id) return null;
  return completed ? `kcarddone-${card_id}` : `kcard-${card_id}`;
}

/** Get container id for a task (used as source in drag end). */
export function getContainerIdFromTask(task) {
  if (!task) return null;
  if (task.parent_id) return `sub-${task.parent_id}`;
  const list_type = task.list_type || 'inbox';
  const completed = !!task.completed_at;
  if (list_type === 'kanban' && task.card_id) return getContainerIdForCard(task.card_id, completed);
  if (list_type === 'someday') return getContainerIdForBucket('someday', null, completed);
  if (list_type === 'project' && task.project_id) return getContainerIdForBucket('project', task.project_id, completed);
  return getContainerId(task.scheduled_date ?? null, null, completed);
}
