import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { SortableTask } from './SortableTask';
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
import editIcon from '../assets/edit.svg';
import editNavIcon from '../assets/edit-nav.svg';
import upIcon from '../assets/up.svg';
import upNavIcon from '../assets/up-nav.svg';
import downIcon from '../assets/down.svg';
import downNavIcon from '../assets/down-nav.svg';
import molniaredIcon from '../assets/molniared.svg';
import molnianavIcon from '../assets/molnianav.svg';
import molniacompleteIcon from '../assets/molniacomplete.svg';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { useMobileTaskEditViewportScroll } from '../hooks/useMobileTaskEditViewportScroll';
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
  onTaskContextMenu,
  editingTaskId,
  onEditingTaskConsumed,
  onCreateSiblingTask,
  onCreateSiblingSubtask,
  onCreateSubtaskAndEdit,
  isRecentlyCompleted,
  getSubtasks,
  dragHandleProps,
}) {
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(task.title);
  const color = task.text_color || DEFAULT_TASK_COLOR;
  const displayTitle = editing ? editTitle : task.title;
  const hasHover = useMediaQuery('(hover: hover)');
  const isNarrowActions = useMediaQuery('(max-width: 499px)');

  const commitEditing = () => {
    setEditing(false);
    if (editTitle.trim() && editTitle !== task.title) {
      onUpdate(task.id, { title: editTitle.trim() });
    }
  };

  const suppressBlurCommitRef = useRef(false);

  const handleBlur = () => {
    if (suppressBlurCommitRef.current) return;
    commitEditing();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      suppressBlurCommitRef.current = true;
      void (async () => {
        try {
          const trimmed = editTitle.trim();
          if (trimmed && trimmed !== task.title) {
            onUpdate(task.id, { title: trimmed });
          }
          if (task.parent_id) await onCreateSiblingSubtask?.(task);
          else await onCreateSiblingTask?.(task);
        } finally {
          suppressBlurCommitRef.current = false;
          setEditing(false);
        }
      })();
      return;
    }
    if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault();
      suppressBlurCommitRef.current = true;
      void (async () => {
        try {
          const trimmed = editTitle.trim();
          if (trimmed && trimmed !== task.title) {
            onUpdate(task.id, { title: trimmed });
          }
          await onCreateSubtaskAndEdit?.(task);
        } finally {
          suppressBlurCommitRef.current = false;
          setEditing(false);
        }
      })();
    }
  };

  const inputRef = useRef(null);
  const taskRootRef = useRef(null);
  const pendingCaretOffsetRef = useRef(null);
  const colorPickerRef = useRef(null);
  const colorButtonRef = useRef(null);

  const resizeInput = () => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const lineHeight = parseFloat(window.getComputedStyle(el).lineHeight) || 24;
    el.style.height = `${Math.max(el.scrollHeight, lineHeight)}px`;
  };

  useMobileTaskEditViewportScroll(editing && isNarrowActions, inputRef, taskRootRef);

  useLayoutEffect(() => {
    if (editingTaskId !== task.id) return;
    pendingCaretOffsetRef.current = 0;
    setEditTitle('');
    setEditing(true);
    onEditingTaskConsumed?.();
  }, [editingTaskId, task.id, onEditingTaskConsumed]);

  useLayoutEffect(() => {
    if (!editing) return;
    resizeInput();
    const el = inputRef.current;
    const pending = pendingCaretOffsetRef.current;
    if (el && pending != null) {
      const len = el.value.length;
      const safe = Math.max(0, Math.min(pending, len));
      el.focus();
      el.setSelectionRange(safe, safe);
    }
    pendingCaretOffsetRef.current = null;
  }, [editing]);

  useEffect(() => {
    if (!showColorPicker) return;
    const handleOutside = (event) => {
      if (colorPickerRef.current?.contains(event.target)) return;
      if (colorButtonRef.current?.contains(event.target)) return;
      setShowColorPicker(false);
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [showColorPicker]);

  const handleInputResize = (e) => {
    const el = e.target;
    el.style.height = 'auto';
    const lineHeight = parseFloat(window.getComputedStyle(el).lineHeight) || 24;
    el.style.height = `${Math.max(el.scrollHeight, lineHeight)}px`;
  };

  const handleComplete = () => {
    onToggle(task);
  };

  const getCaretOffsetFromPoint = (event) => {
    const x = event.clientX;
    const y = event.clientY;
    try {
      if (document.caretPositionFromPoint) {
        const pos = document.caretPositionFromPoint(x, y);
        if (pos && typeof pos.offset === 'number') return pos.offset;
      }
      if (document.caretRangeFromPoint) {
        const range = document.caretRangeFromPoint(x, y);
        if (range && typeof range.startOffset === 'number') return range.startOffset;
      }
    } catch {
      return null;
    }
    return null;
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

  const [ctxHover, setCtxHover] = useState(false);
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
    ? (isParent ? (hasHover && checkHover ? chpCompNavIcon : chpCompIcon) : (hasHover && checkHover ? kvCompleteNavIcon : kvCompleteIcon))
    : (isParent ? (hasHover && checkHover ? chpNavIcon : chpIcon) : (hasHover && checkHover ? kvNavIcon : kvIcon));

  const handleContextMenu = (e) => {
    if (onTaskContextMenu) {
      e.preventDefault();
      e.stopPropagation();
      onTaskContextMenu(e, task);
    }
  };

  const openContextMenuFromButton = (e) => {
    if (!onTaskContextMenu) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    onTaskContextMenu(
      {
        clientX: rect.left,
        clientY: rect.bottom,
        preventDefault() {},
      },
      task
    );
  };

  return (
    <div
      ref={taskRootRef}
      className={`task-item ${isCompleted ? 'task-item--completed' : ''} ${isRecentlyCompleted ? 'task-item--entering' : ''} task-item--top-${topStyle} ${editing ? 'task-item--editing' : ''}`}
      data-task-id={task.id}
      onContextMenu={handleContextMenu}
    >
      <div className="task-item__row">
        <button
          type="button"
          className="task-item__checkbox"
          onClick={handleComplete}
          onMouseEnter={() => hasHover && setCheckHover(true)}
          onMouseLeave={() => hasHover && setCheckHover(false)}
          aria-label={isCompleted ? 'Вернуть в список' : 'Выполнено'}
        >
          <img src={checkIcon} alt="" />
        </button>
        {showLightning && (
          <button
            type="button"
            className="task-item__lightning-btn"
            onMouseEnter={() => hasHover && setLightningHover(true)}
            onMouseLeave={() => hasHover && setLightningHover(false)}
            onClick={clearRed}
            aria-label="Убрать красный"
          >
            <img src={isCompleted ? molniacompleteIcon : (hasHover && lightningHover ? molnianavIcon : molniaredIcon)} alt="" />
          </button>
        )}
        {editing ? (
          <textarea
            ref={inputRef}
            className="task-item__input task-item__input--multiline"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onInput={handleInputResize}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            autoFocus
            style={{ color: isCompleted ? '#666' : color }}
            rows={1}
          />
        ) : (
          <span
            className={`task-item__title ${isCompleted ? 'task-item__title--completed' : ''}`}
            style={{ color: isCompleted ? '#666' : color }}
            onClick={(e) => {
              const caretOffset = getCaretOffsetFromPoint(e);
              pendingCaretOffsetRef.current = Number.isFinite(caretOffset) ? caretOffset : null;
              setEditTitle(task.title);
              setEditing(true);
            }}
          >
            {displayTitle}
          </span>
        )}
        <div className="task-item__actions">
          {isParent && (
            <button
              type="button"
              className="task-item__action-btn"
              onMouseEnter={() => hasHover && setCollapseSubHover(true)}
              onMouseLeave={() => hasHover && setCollapseSubHover(false)}
              onClick={() => onUpdate(task.id, { subtasks_collapsed: !subtasksCollapsed })}
              aria-label={subtasksCollapsed ? 'Развернуть подзадачи' : 'Свернуть подзадачи'}
            >
              <img src={subtasksCollapsed ? (hasHover && collapseSubHover ? downNavIcon : downIcon) : (hasHover && collapseSubHover ? upNavIcon : upIcon)} alt="" />
            </button>
          )}
          {!isCompleted && (
            <>
              {onAddSubtask && (
                <button
                  type="button"
                  className="task-item__action-btn"
                  onMouseEnter={() => hasHover && setPodHover(true)}
                  onMouseLeave={() => hasHover && setPodHover(false)}
                  onClick={() => onAddSubtask(task.id)}
                  aria-label="Подзадача"
                >
                  <img src={hasHover && podHover ? podNavIcon : podIcon} alt="" />
                </button>
              )}
              {isNarrowActions && (
                <button
                  type="button"
                  className="task-item__action-btn"
                  onMouseEnter={() => hasHover && setCtxHover(true)}
                  onMouseLeave={() => hasHover && setCtxHover(false)}
                  onClick={openContextMenuFromButton}
                  aria-label="Меню"
                >
                  <img src={hasHover && ctxHover ? editNavIcon : editIcon} alt="" />
                </button>
              )}
              <span className="task-item__color-btn-wrap">
                <button
                  type="button"
                  className="task-item__color-btn"
                  ref={colorButtonRef}
                  style={{ background: color }}
                  onClick={() => setShowColorPicker((v) => !v)}
                  aria-label="Цвет текста"
                />
              </span>
              <button
                type="button"
                className="task-item__action-btn"
                onMouseEnter={() => hasHover && setLineHover(true)}
                onMouseLeave={() => hasHover && setLineHover(false)}
                onClick={cycleTopStyle}
                aria-label="Отступ сверху"
              >
                <img src={hasHover && lineHover ? lineNavIcon : lineIcon} alt="" />
              </button>
            </>
          )}
          {isCompleted && isNarrowActions && (
            <button
              type="button"
              className="task-item__action-btn"
              onMouseEnter={() => hasHover && setCtxHover(true)}
              onMouseLeave={() => hasHover && setCtxHover(false)}
              onClick={openContextMenuFromButton}
              aria-label="Меню"
            >
              <img src={hasHover && ctxHover ? editNavIcon : editIcon} alt="" />
            </button>
          )}
          {isParentTask && (
          <div className="task-item__calendar-wrap">
            <button
              type="button"
              className="task-item__action-btn"
              onMouseEnter={() => hasHover && setCalendarHover(true)}
              onMouseLeave={() => hasHover && setCalendarHover(false)}
              onClick={() => setCalendarOpen((v) => !v)}
              aria-label="Дата"
            >
              <img src={hasHover && calendarHover ? calendarNavIcon : calendarIcon} alt="" />
            </button>
            {calendarOpen && (
              <>
                <div className="task-item__calendar-backdrop" onClick={() => setCalendarOpen(false)} />
                <div className="task-item__calendar-popover">
                  <CalendarPopover
                    value={task.scheduled_date}
                    onChange={(dateStr) => {
                      const next = { scheduled_date: dateStr };
                      if ((task.list_type || 'inbox') !== 'inbox' || task.project_id) {
                        next.list_type = 'inbox';
                        next.project_id = null;
                      }
                      onUpdate(task.id, next);
                      setCalendarOpen(false);
                    }}
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
            onMouseEnter={() => hasHover && setDeleteHover(true)}
            onMouseLeave={() => hasHover && setDeleteHover(false)}
            onClick={() => onDelete(task.id)}
            aria-label="Удалить"
          >
            <img src={hasHover && deleteHover ? deleteNavIcon : deleteIcon} alt="" />
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
        <div className="task-item__colors" ref={colorPickerRef}>
          {TASK_COLORS.map((c) => {
            const selected = color.toLowerCase() === c.toLowerCase();
            return (
              <span
                key={c}
                className={`task-item__color-option-wrap${selected ? ' task-item__color-option-wrap--selected' : ''}`}
                style={{ '--swatch-color': c }}
              >
                <button
                  type="button"
                  className="task-item__color-option"
                  style={{ background: c }}
                  onClick={() => {
                    onUpdate(task.id, { text_color: c });
                    setShowColorPicker(false);
                  }}
                />
              </span>
            );
          })}
        </div>
      )}
      {(isParent && subtasks.length > 0) && (
        <ul className={`task-item__subtasks ${subtasksCollapsed ? 'task-item__subtasks--collapsed' : ''}`}>
          <SortableContext items={subtasks.map((st) => st.id)} strategy={verticalListSortingStrategy}>
            {subtasks.map((st, i) => (
              <li key={st.id}>
                <DropSlot id={`sub-${task.id}`} index={i} />
                <SortableTask
                  task={st}
                  containerId={`sub-${task.id}`}
                  subtasks={getSubtasks ? getSubtasks(st.id) : []}
                  isCompleted={!!st.completed_at}
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
                  getSubtasks={getSubtasks}
                />
              </li>
            ))}
            <li><DropSlot id={`sub-${task.id}`} index={subtasks.length} /></li>
          </SortableContext>
        </ul>
      )}
    </div>
  );
}
