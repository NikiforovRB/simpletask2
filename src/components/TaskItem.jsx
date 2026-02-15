import { useState } from 'react';
import { DraggableTask } from './DraggableTask';
import { DropSlot } from './DropSlot';
import { TASK_COLORS, DEFAULT_TASK_COLOR } from '../constants';
import kvIcon from '../assets/kv.svg';
import kvNavIcon from '../assets/kv-nav.svg';
import chpIcon from '../assets/chp.svg';
import chpNavIcon from '../assets/chp-nav.svg';
import kvCompleteIcon from '../assets/kvcomplete.svg';
import kvCompleteNavIcon from '../assets/kvcompletenav.svg';
import chpCompIcon from '../assets/chp-comp.svg';
import chpCompNavIcon from '../assets/chp-comp-nav.svg';
import podIcon from '../assets/pod.svg';
import podNavIcon from '../assets/pod-nav.svg';
import deleteIcon from '../assets/delete.svg';
import deleteNavIcon from '../assets/delete-nav.svg';
import calendarIcon from '../assets/calendar.svg';
import calendarNavIcon from '../assets/calendar-nav.svg';
import lineIcon from '../assets/line.svg';
import lineNavIcon from '../assets/line-nav.svg';
import dragIcon from '../assets/drag.svg';
import upIcon from '../assets/up.svg';
import upNavIcon from '../assets/up-nav.svg';
import downIcon from '../assets/down.svg';
import downNavIcon from '../assets/down-nav.svg';
import molniaredIcon from '../assets/molniared.svg';
import molnianavIcon from '../assets/molnianav.svg';
import molniacompleteIcon from '../assets/molniacomplete.svg';
import { CalendarPopover } from './CalendarPopover';
import './TaskItem.css';

const RED_COLOR = '#f33737';

export function TaskItem({
  task,
  subtasks = [],
  isCompleted,
  onToggle,
  onUpdate,
  onDelete,
  onAddSubtask,
  isRecentlyCompleted,
  getSubtasks,
  dragHandleProps,
}) {
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(task.title);
  const color = task.text_color || DEFAULT_TASK_COLOR;
  const displayTitle = editing ? editTitle : task.title;

  const handleBlur = () => {
    setEditing(false);
    if (editTitle.trim() && editTitle !== task.title) {
      onUpdate(task.id, { title: editTitle.trim() });
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.target.blur();
    }
  };

  const handleComplete = () => {
    onToggle(task);
  };

  const isParent = subtasks.length > 0;
  const subtasksCollapsed = task.subtasks_collapsed ?? false;
  const topStyle = task.top_style ?? 0;
  const [checkHover, setCheckHover] = useState(false);
  const [podHover, setPodHover] = useState(false);
  const [deleteHover, setDeleteHover] = useState(false);
  const [calendarHover, setCalendarHover] = useState(false);
  const [lineHover, setLineHover] = useState(false);
  const [collapseSubHover, setCollapseSubHover] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [lightningHover, setLightningHover] = useState(false);

  const showLightning = (isCompleted && color === RED_COLOR) || (!isCompleted && color === RED_COLOR);
  const isParentTask = !task.parent_id;

  const cycleTopStyle = () => {
    const next = (topStyle + 1) % 3;
    onUpdate(task.id, { top_style: next });
  };

  const clearRed = () => {
    onUpdate(task.id, { text_color: '#ffffff' });
  };

  const checkIcon = isCompleted
    ? (isParent ? (checkHover ? chpCompNavIcon : chpCompIcon) : (checkHover ? kvCompleteNavIcon : kvCompleteIcon))
    : (isParent ? (checkHover ? chpNavIcon : chpIcon) : (checkHover ? kvNavIcon : kvIcon));

  return (
    <div
      className={`task-item ${isCompleted ? 'task-item--completed' : ''} ${isRecentlyCompleted ? 'task-item--entering' : ''} task-item--top-${topStyle}`}
      data-task-id={task.id}
    >
      <div className="task-item__row">
        <button
          type="button"
          className="task-item__checkbox"
          onClick={handleComplete}
          onMouseEnter={() => setCheckHover(true)}
          onMouseLeave={() => setCheckHover(false)}
          aria-label={isCompleted ? 'Вернуть в список' : 'Выполнено'}
        >
          <img src={checkIcon} alt="" />
        </button>
        {showLightning && (
          <button
            type="button"
            className="task-item__lightning-btn"
            onMouseEnter={() => setLightningHover(true)}
            onMouseLeave={() => setLightningHover(false)}
            onClick={clearRed}
            aria-label="Убрать красный"
          >
            <img src={isCompleted ? molniacompleteIcon : (lightningHover ? molnianavIcon : molniaredIcon)} alt="" />
          </button>
        )}
        {editing ? (
          <input
            className="task-item__input"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            autoFocus
          />
        ) : (
          <span
            className={`task-item__title ${isCompleted ? 'task-item__title--completed' : ''}`}
            style={{ color: isCompleted ? '#666' : color }}
            onClick={() => { setEditTitle(task.title); setEditing(true); }}
          >
            {displayTitle}
          </span>
        )}
        <div className="task-item__actions">
          {!isCompleted && (
            <>
              {isParent && (
                <button
                  type="button"
                  className="task-item__action-btn"
                  onMouseEnter={() => setCollapseSubHover(true)}
                  onMouseLeave={() => setCollapseSubHover(false)}
                  onClick={() => onUpdate(task.id, { subtasks_collapsed: !subtasksCollapsed })}
                  aria-label={subtasksCollapsed ? 'Развернуть подзадачи' : 'Свернуть подзадачи'}
                >
                  <img src={subtasksCollapsed ? (collapseSubHover ? downNavIcon : downIcon) : (collapseSubHover ? upNavIcon : upIcon)} alt="" />
                </button>
              )}
              {onAddSubtask && (
                <button
                  type="button"
                  className="task-item__action-btn"
                  onMouseEnter={() => setPodHover(true)}
                  onMouseLeave={() => setPodHover(false)}
                  onClick={() => onAddSubtask(task.id)}
                  aria-label="Подзадача"
                >
                  <img src={podHover ? podNavIcon : podIcon} alt="" />
                </button>
              )}
              <button
                type="button"
                className="task-item__color-btn"
                style={{ background: color }}
                onClick={() => setShowColorPicker((v) => !v)}
                aria-label="Цвет текста"
              />
              <button
                type="button"
                className="task-item__action-btn"
                onMouseEnter={() => setLineHover(true)}
                onMouseLeave={() => setLineHover(false)}
                onClick={cycleTopStyle}
                aria-label="Отступ сверху"
              >
                <img src={lineHover ? lineNavIcon : lineIcon} alt="" />
              </button>
            </>
          )}
          {isParentTask && (
          <div className="task-item__calendar-wrap">
            <button
              type="button"
              className="task-item__action-btn"
              onMouseEnter={() => setCalendarHover(true)}
              onMouseLeave={() => setCalendarHover(false)}
              onClick={() => setCalendarOpen((v) => !v)}
              aria-label="Дата"
            >
              <img src={calendarHover ? calendarNavIcon : calendarIcon} alt="" />
            </button>
            {calendarOpen && (
              <>
                <div className="task-item__calendar-backdrop" onClick={() => setCalendarOpen(false)} />
                <div className="task-item__calendar-popover">
                  <CalendarPopover
                    value={task.scheduled_date}
                    onChange={(dateStr) => { onUpdate(task.id, { scheduled_date: dateStr }); setCalendarOpen(false); }}
                    onClose={() => setCalendarOpen(false)}
                  />
                </div>
              </>
            )}
          </div>
          )}
          <button
            type="button"
            className="task-item__action-btn"
            onMouseEnter={() => setDeleteHover(true)}
            onMouseLeave={() => setDeleteHover(false)}
            onClick={() => onDelete(task.id)}
            aria-label="Удалить"
          >
            <img src={deleteHover ? deleteNavIcon : deleteIcon} alt="" />
          </button>
          {dragHandleProps ? (
            <span
              className="task-item__drag-handle"
              {...dragHandleProps.attributes}
              {...dragHandleProps.listeners}
              aria-label="Перетащить"
            >
              <img src={dragIcon} alt="" />
            </span>
          ) : null}
        </div>
      </div>
      {showColorPicker && (
        <div className="task-item__colors">
          {TASK_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className="task-item__color-option"
              style={{ background: c }}
              onClick={() => {
                onUpdate(task.id, { text_color: c });
                setShowColorPicker(false);
              }}
            />
          ))}
        </div>
      )}
      {!isCompleted && (
        <ul className={`task-item__subtasks ${isParent && subtasksCollapsed ? 'task-item__subtasks--collapsed' : ''}`}>
          {subtasks.map((st, i) => (
            <li key={st.id}>
              <DropSlot id={`sub-${task.id}`} index={i} />
              <DraggableTask
                task={st}
                containerId={`sub-${task.id}`}
                subtasks={getSubtasks ? getSubtasks(st.id) : []}
                isCompleted={!!st.completed_at}
                onToggle={onToggle}
                onUpdate={onUpdate}
                onDelete={onDelete}
                onAddSubtask={onAddSubtask}
                getSubtasks={getSubtasks}
              />
            </li>
          ))}
          {subtasks.length > 0 && <li><DropSlot id={`sub-${task.id}`} index={subtasks.length} /></li>}
        </ul>
      )}
    </div>
  );
}
