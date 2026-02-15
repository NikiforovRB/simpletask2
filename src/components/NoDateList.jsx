import { useState, useMemo } from 'react';
import { DraggableTask } from './DraggableTask';
import { DropSlot } from './DropSlot';
import { getContainerId } from '../lib/dnd';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { DEFAULT_TASK_COLOR } from '../constants';
import plusIcon from '../assets/plus.svg';
import plusNavIcon from '../assets/plus-nav.svg';
import './NoDateList.css';

const NO_DATE_KEY = 'no_date';
const NO_DATE_COMPLETED_KEY = 'completed_no_date';

export function NoDateList({ tasks, onToggle, onUpdate, onDelete, onAddSubtask, onAddAtStart, visible, completedVisible, getListCollapsed, setListCollapsed }) {
  const open = getListCollapsed ? !getListCollapsed(NO_DATE_KEY) : true;
  const completedOpen = getListCollapsed ? !getListCollapsed(NO_DATE_COMPLETED_KEY) : true;
  const [plusHover, setPlusHover] = useState(false);
  const hasHover = useMediaQuery('(hover: hover)');

  const toggleOpen = () => setListCollapsed?.(NO_DATE_KEY, !getListCollapsed(NO_DATE_KEY));
  const toggleCompleted = () => setListCollapsed?.(NO_DATE_COMPLETED_KEY, !getListCollapsed(NO_DATE_COMPLETED_KEY));

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
    () => tasks.filter((t) => !t.parent_id && !t.completed_at && !t.scheduled_date).sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
    [tasks]
  );
  const completedTasks = useMemo(
    () => tasks.filter((t) => !t.parent_id && t.completed_at && !t.scheduled_date).sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
    [tasks]
  );

  const getSubtasks = (parentId) => (byParent.get(parentId) || []).sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

  const handleAddAtStart = () => {
    onAddAtStart?.({ scheduled_date: null, text_color: DEFAULT_TASK_COLOR });
  };

  if (!visible) return null;

  return (
    <section className="no-date-list">
      <div className="no-date-list__header">
        <button type="button" className="no-date-list__title-btn" onClick={toggleOpen}>
          Задачи без даты
        </button>
        <button type="button" className="no-date-list__icon-btn no-date-list__icon-btn--plus" onMouseEnter={() => hasHover && setPlusHover(true)} onMouseLeave={() => hasHover && setPlusHover(false)} onClick={handleAddAtStart} aria-label="Добавить задачу">
          <img src={hasHover && plusHover ? plusNavIcon : plusIcon} alt="" />
        </button>
      </div>
      {open && (
        <div className="no-date-list__body">
          <ul className="no-date-list__list">
            {mainTasks.map((task, i) => (
              <li key={task.id}>
                <DropSlot id={getContainerId(null, null, false)} index={i} />
                <DraggableTask
                  task={task}
                  containerId={getContainerId(null, null, false)}
                  subtasks={getSubtasks(task.id)}
                  getSubtasks={getSubtasks}
                  onToggle={onToggle}
                  onUpdate={onUpdate}
                  onDelete={onDelete}
                  onAddSubtask={onAddSubtask}
                />
              </li>
            ))}
            <li><DropSlot id={getContainerId(null, null, false)} index={mainTasks.length} /></li>
          </ul>
          {completedVisible && completedTasks.length > 0 && (
            <>
              <button type="button" className="no-date-list__completed-toggle" onClick={toggleCompleted}>Выполненные задачи</button>
              {completedOpen && (
              <ul className="no-date-list__list no-date-list__list--completed">
                {completedTasks.map((task, i) => (
                  <li key={task.id}>
                    <DropSlot id={getContainerId(null, null, true)} index={i} />
                    <DraggableTask
                      task={task}
                      containerId={getContainerId(null, null, true)}
                      subtasks={getSubtasks(task.id)}
                      getSubtasks={getSubtasks}
                      isCompleted
                      onToggle={onToggle}
                      onUpdate={onUpdate}
                      onDelete={onDelete}
                      onAddSubtask={onAddSubtask}
                    />
                  </li>
                ))}
                <li><DropSlot id={getContainerId(null, null, true)} index={completedTasks.length} /></li>
              </ul>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
