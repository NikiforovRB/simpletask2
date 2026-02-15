import { useState, useMemo } from 'react';
import { DraggableTask } from './DraggableTask';
import { DropSlot } from './DropSlot';
import { getContainerId } from '../lib/dnd';
import { DEFAULT_TASK_COLOR, formatDayLabel } from '../constants';
import plusIcon from '../assets/plus.svg';
import plusNavIcon from '../assets/plus-nav.svg';
import './DayCard.css';

export function DayCard({
  date,
  tasks,
  onToggle,
  onUpdate,
  onDelete,
  onAddTask,
  onAddSubtask,
  recentCompletedIds,
  onAddAtStart,
  completedVisible,
  getListCollapsed,
  setListCollapsed,
}) {
  const dateStr = date.toISOString().slice(0, 10);
  const dayKey = `day_${dateStr}`;
  const completedKey = `completed_${dateStr}`;
  const cardOpen = getListCollapsed ? !getListCollapsed(dayKey) : true;
  const completedOpen = getListCollapsed ? !getListCollapsed(completedKey) : true;

  const toggleCard = () => setListCollapsed?.(dayKey, getListCollapsed(dayKey) ? false : true);
  const toggleCompleted = () => setListCollapsed?.(completedKey, getListCollapsed(completedKey) ? false : true);
  const byParent = useMemo(() => {
    const map = new Map();
    tasks.forEach((t) => {
      if (!t.parent_id) return;
      if (!map.has(t.parent_id)) map.set(t.parent_id, []);
      map.get(t.parent_id).push(t);
    });
    return map;
  }, [tasks]);

  const mainTasks = useMemo(
    () => tasks.filter((t) => !t.parent_id && !t.completed_at && t.scheduled_date === dateStr).sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
    [tasks, dateStr]
  );
  const completedTasks = useMemo(
    () => tasks.filter((t) => !t.parent_id && t.completed_at && t.scheduled_date === dateStr).sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
    [tasks, dateStr]
  );

  const getSubtasks = (parentId) => (byParent.get(parentId) || []).sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

  const [plusHover, setPlusHover] = useState(false);

  const handleAddAtStart = () => {
    onAddAtStart?.({ scheduled_date: dateStr, text_color: DEFAULT_TASK_COLOR });
  };

  return (
    <section className="day-card">
      <div className="day-card__header">
        <button type="button" className="day-card__title-btn" onClick={toggleCard}>
          {formatDayLabel(dateStr)}
        </button>
        <button type="button" className="day-card__icon-btn day-card__icon-btn--plus" onMouseEnter={() => setPlusHover(true)} onMouseLeave={() => setPlusHover(false)} onClick={handleAddAtStart} aria-label="Добавить задачу">
          <img src={plusHover ? plusNavIcon : plusIcon} alt="" />
        </button>
      </div>
      <div className="day-card__header-line" />

      {cardOpen && (
        <>
      <div className="day-card__section">
            <ul className="day-card__list">
              {mainTasks.map((task, i) => (
                <li key={task.id}>
                  <DropSlot id={getContainerId(dateStr, null, false)} index={i} />
                  <DraggableTask
                    task={task}
                    containerId={getContainerId(dateStr, null, false)}
                    subtasks={getSubtasks(task.id)}
                    getSubtasks={getSubtasks}
                    onToggle={onToggle}
                    onUpdate={onUpdate}
                    onDelete={onDelete}
                    onAddSubtask={onAddSubtask}
                  />
                </li>
              ))}
              <li><DropSlot id={getContainerId(dateStr, null, false)} index={mainTasks.length} /></li>
            </ul>
      </div>

      {completedVisible && completedTasks.length > 0 && (
      <div className="day-card__section day-card__section--completed">
        <button type="button" className="day-card__completed-toggle" onClick={toggleCompleted}>
          Выполненные задачи
        </button>
        {completedOpen && (
          <ul className="day-card__list day-card__list--completed">
            {completedTasks.map((task, i) => (
              <li key={task.id}>
                <DropSlot id={getContainerId(dateStr, null, true)} index={i} />
                <DraggableTask
                  task={task}
                  containerId={getContainerId(dateStr, null, true)}
                  subtasks={getSubtasks(task.id)}
                  getSubtasks={getSubtasks}
                  isCompleted
                  onToggle={onToggle}
                  onUpdate={onUpdate}
                  onDelete={onDelete}
                  onAddSubtask={onAddSubtask}
                  isRecentlyCompleted={recentCompletedIds.has(task.id)}
                />
              </li>
            ))}
            <li><DropSlot id={getContainerId(dateStr, null, true)} index={completedTasks.length} /></li>
          </ul>
        )}
      </div>
      )}
        </>
      )}
    </section>
  );
}
