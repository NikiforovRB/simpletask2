import { useState, useMemo } from 'react';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { SortableTask } from './SortableTask';
import { DropSlot } from './DropSlot';
import { getContainerId } from '../lib/dnd';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { DEFAULT_TASK_COLOR } from '../constants';
import plusIcon from '../assets/plus.svg';
import plusNavIcon from '../assets/plus-nav.svg';
import eyeoffIcon from '../assets/eyeoff.svg';
import './NoDateList.css';

const NO_DATE_COMPLETED_KEY = 'completed_no_date';

/** `collapseKey` makes the title fold the list; the state is kept under that key. */
export function NoDateList({ tasks, onToggle, onUpdate, onDelete, onAddSubtask, onAddAtStart, onTaskContextMenu, editingTaskId, onEditingTaskConsumed, onCreateSiblingTask, onCreateSiblingSubtask, onCreateSubtaskAndEdit, visible, completedVisible, getListCollapsed, setListCollapsed, className = '', collapseKey = null }) {
  const completedOpen = getListCollapsed ? !getListCollapsed(NO_DATE_COMPLETED_KEY) : true;
  const collapsible = !!collapseKey && !!getListCollapsed;
  const listOpen = collapsible ? !getListCollapsed(collapseKey) : true;
  const [plusHover, setPlusHover] = useState(false);
  const hasHover = useMediaQuery('(hover: hover)');

  const toggleCompleted = () => setListCollapsed?.(NO_DATE_COMPLETED_KEY, !getListCollapsed(NO_DATE_COMPLETED_KEY));
  const toggleList = () => setListCollapsed?.(collapseKey, listOpen);

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
    () => tasks.filter((t) => !t.parent_id && !t.completed_at && !t.scheduled_date && (t.list_type || 'inbox') === 'inbox').sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
    [tasks]
  );
  const completedTasks = useMemo(
    () => tasks.filter((t) => !t.parent_id && t.completed_at && !t.scheduled_date && (t.list_type || 'inbox') === 'inbox').sort((a, b) => {
      const ca = a.completed_at || '';
      const cb = b.completed_at || '';
      return ca === cb ? (a.position ?? 0) - (b.position ?? 0) : (ca < cb ? -1 : 1);
    }),
    [tasks]
  );

  const getSubtasks = (parentId) => (byParent.get(parentId) || []).sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

  const handleAddAtStart = () => {
    // The new task opens for editing, so a folded list has to show it.
    if (!listOpen) toggleList();
    onAddAtStart?.({ scheduled_date: null, text_color: DEFAULT_TASK_COLOR });
  };

  if (!visible) return null;

  return (
    <section className={`no-date-list ${className}`}>
      <div className="no-date-list__header">
        {collapsible ? (
          <button
            type="button"
            className="no-date-list__title-btn"
            onClick={toggleList}
            aria-expanded={listOpen}
            title={listOpen ? 'Свернуть список' : 'Развернуть список'}
          >
            <span className="no-date-list__title-inner">
              Задачи без даты
              {!listOpen && <img src={eyeoffIcon} alt="" className="no-date-list__collapsed-icon" />}
            </span>
          </button>
        ) : (
          <span className="no-date-list__title">Задачи без даты</span>
        )}
        <button type="button" className="no-date-list__icon-btn no-date-list__icon-btn--plus" onMouseEnter={() => hasHover && setPlusHover(true)} onMouseLeave={() => hasHover && setPlusHover(false)} onClick={handleAddAtStart} aria-label="Добавить задачу">
          <img src={hasHover && plusHover ? plusNavIcon : plusIcon} alt="" />
        </button>
      </div>
      <div className="no-date-list__header-line" />
      {listOpen && (
      <div className="no-date-list__body">
          <ul className="no-date-list__list">
            <SortableContext items={mainTasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
              {mainTasks.map((task, i) => (
                <li key={task.id}>
                  <DropSlot id={getContainerId(null, null, false)} index={i} />
                  <SortableTask
                    task={task}
                    containerId={getContainerId(null, null, false)}
                    subtasks={getSubtasks(task.id)}
                    getSubtasks={getSubtasks}
                    onToggle={onToggle}
                    onUpdate={onUpdate}
                    onDelete={onDelete}
                  onAddSubtask={onAddSubtask}
                  onTaskContextMenu={onTaskContextMenu}
                  editingTaskId={editingTaskId}
                  onEditingTaskConsumed={onEditingTaskConsumed}
                  onCreateSiblingTask={onCreateSiblingTask}
                  onCreateSiblingSubtask={onCreateSiblingSubtask}
                  onCreateSubtaskAndEdit={onCreateSubtaskAndEdit}
                />
              </li>
            ))}
            </SortableContext>
            <li><DropSlot id={getContainerId(null, null, false)} index={mainTasks.length} /></li>
          </ul>
          {completedVisible && completedTasks.length > 0 && (
            <>
              <button type="button" className="no-date-list__completed-toggle" onClick={toggleCompleted}>Выполненные задачи</button>
              {completedOpen && (
              <ul className="no-date-list__list no-date-list__list--completed">
                <SortableContext items={completedTasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                  {completedTasks.map((task, i) => (
                    <li key={task.id}>
                      <DropSlot id={getContainerId(null, null, true)} index={i} />
                      <SortableTask
                        task={task}
                        containerId={getContainerId(null, null, true)}
                        subtasks={getSubtasks(task.id)}
                        getSubtasks={getSubtasks}
                        isCompleted
                        onToggle={onToggle}
                        onUpdate={onUpdate}
                        onDelete={onDelete}
                        onAddSubtask={onAddSubtask}
                        onTaskContextMenu={onTaskContextMenu}
                        editingTaskId={editingTaskId}
                        onEditingTaskConsumed={onEditingTaskConsumed}
                        onCreateSiblingTask={onCreateSiblingTask}
                        onCreateSiblingSubtask={onCreateSiblingSubtask}
                        onCreateSubtaskAndEdit={onCreateSubtaskAndEdit}
                      />
                    </li>
                  ))}
                </SortableContext>
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
