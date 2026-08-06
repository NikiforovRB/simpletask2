import { promiseState } from '../hooks/useReputation';

/**
 * Plans and Calendar can list the reputation promises of a day among its tasks.
 * A promise's anchor (`list_position`) lives in "task index" space: 2.5 sits
 * between the third and the fourth task of the day, so the promise keeps its
 * place while the tasks around it are added, completed or reordered.
 *
 * The Calendar renders only the untimed tasks of a day, but anchors always
 * count every task of it, so a promise lands in the same relative spot in
 * both sections.
 */

const REP_PREFIX = 'rep::';

export const repDndId = (promiseId) => `${REP_PREFIX}${promiseId}`;

export function parseRepDndId(dndId) {
  if (typeof dndId !== 'string' || !dndId.startsWith(REP_PREFIX)) return null;
  return dndId.slice(REP_PREFIX.length);
}

/** Promises that have never been moved stay after the tasks, in their own order. */
function promiseAnchor(promise, taskCount, order) {
  if (promise.list_position == null) return taskCount - 0.5 + (order + 1) * 1e-4;
  return Number(promise.list_position);
}

/**
 * The tasks and promises of one day in display order. `taskAnchor(task, i)`
 * gives a rendered task its index in the day's full task list; without it the
 * rendered order is used. Task items carry that anchor, which doubles as the
 * drop-slot index.
 */
export function mergeDayItems(renderedTasks, promises, taskAnchor, taskCount) {
  const items = (renderedTasks || []).map((task, i) => ({
    kind: 'task',
    dndId: task.id,
    anchor: taskAnchor ? taskAnchor(task, i) : i,
    task,
  }));
  const count = taskCount ?? items.length;
  (promises || []).forEach((promise, i) => {
    items.push({
      kind: 'promise',
      dndId: repDndId(promise.id),
      anchor: promiseAnchor(promise, count, i),
      promise,
    });
  });
  items.sort((a, b) => a.anchor - b.anchor || (a.kind === b.kind ? 0 : a.kind === 'task' ? -1 : 1));
  return items;
}

/**
 * Splits the day's promises into the ones that belong in the list and the kept
 * ones that go to "Выполненные задачи". With the setting off nothing moves: a
 * kept promise stays where it is, like it always did.
 */
export function splitDonePromises(promises, moveDoneToCompleted) {
  if (!moveDoneToCompleted) return { open: promises || [], done: [] };
  const open = [];
  const done = [];
  for (const promise of promises || []) {
    (promiseState(promise) === 'done' ? done : open).push(promise);
  }
  return { open, done };
}

/** The anchor of an item inserted at `index`, midway between its neighbours. */
export function anchorForIndex(items, index) {
  const before = items[index - 1];
  const after = items[index];
  const lo = before ? before.anchor : (after ? after.anchor - 1 : -0.5);
  const hi = after ? after.anchor : (before ? before.anchor + 1 : 0.5);
  return (lo + hi) / 2;
}
