export function parseContainerId(containerId) {
  if (!containerId) return null;
  const dash = containerId.indexOf('-');
  if (dash < 0) return null;
  const type = containerId.slice(0, dash);
  const value = containerId.slice(dash + 1);
  if (type === 'main' || type === 'completed') {
    const scheduled_date = value === 'null' ? null : value;
    return { scheduled_date, parent_id: null, completed: type === 'completed' };
  }
  if (type === 'sub') {
    return { scheduled_date: undefined, parent_id: value, completed: false };
  }
  return null;
}

export function getContainerId(scheduled_date, parent_id, completed) {
  if (parent_id) return `sub-${parent_id}`;
  const datePart = scheduled_date == null ? 'null' : scheduled_date;
  return completed ? `completed-${datePart}` : `main-${datePart}`;
}
