import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { promiseState } from '../hooks/useReputation';
import { repDndId } from '../lib/dayItems';
import { TASK_COLORS, DEFAULT_TASK_COLOR } from '../constants';
import { useMediaQuery } from '../hooks/useMediaQuery';
import deleteIcon from '../assets/delete.svg';
import deleteNavIcon from '../assets/delete-nav.svg';
import lineIcon from '../assets/line.svg';
import lineNavIcon from '../assets/line-nav.svg';
import dragIcon from '../assets/drag.svg';
import './ReputationTaskRow.css';

const fmtMinutes = (min) => {
  if (min == null) return '—';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h && m) return `${h} ч ${m} мин`;
  if (h) return `${h} ч`;
  return `${m} мин`;
};

function metricsText(promise) {
  if (promise.kind === 'time') {
    return `${fmtMinutes(promise.fact_value)} из ${fmtMinutes(promise.plan_value)}`;
  }
  if (promise.kind === 'count') {
    return `${promise.fact_value ?? '—'} из ${promise.plan_value ?? '—'}`;
  }
  return null;
}

function Mark({ state }) {
  if (state === 'done') {
    return (
      <svg width="10" height="10" viewBox="0 0 16 16" aria-hidden>
        <path d="M3 8.5l3.5 3.5L13 5" stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (state === 'failed') {
    return (
      <svg width="10" height="10" viewBox="0 0 16 16" aria-hidden>
        <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round" />
      </svg>
    );
  }
  return null;
}

/** Spacing above the row, cycled like a task's: none → wide → divider. */
const promiseTopStyle = (promise) => promise?.top_style ?? 0;

/** The spacing lives on the wrapper, so the tint keeps the shape of the row. */
const promiseWrapClass = (promise) => `rep-task-wrap rep-task-wrap--top-${promiseTopStyle(promise)}`;

/**
 * A reputation promise shown among the tasks of its day. The title is edited
 * right here, and the row carries the same colour and spacing controls as a
 * task. Yes/no promises can also be ticked off from here; measured ones only
 * report their numbers, which are entered in the reputation section itself.
 */
export function ReputationTaskRow({
  promise, onUpdate, onDelete, dragHandleProps, overlay = false, isCompleted = false,
}) {
  const [deleteHover, setDeleteHover] = useState(false);
  const [lineHover, setLineHover] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(promise.title || '');
  const hasHover = useMediaQuery('(hover: hover)');
  const state = promiseState(promise);
  const metrics = metricsText(promise);
  const color = promise.text_color || DEFAULT_TASK_COLOR;

  const inputRef = useRef(null);
  const colorPickerRef = useRef(null);
  const colorButtonRef = useRef(null);
  const cancelEditRef = useRef(false);

  // Without hover the buttons start out hidden, like a task's: tapping the row
  // reveals them, and they go away again after 5 seconds.
  const [touchActionsVisible, setTouchActionsVisible] = useState(false);
  const hideTimerRef = useRef(null);

  const clearHideTimer = () => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  };

  const scheduleHide = () => {
    clearHideTimer();
    hideTimerRef.current = setTimeout(() => {
      setTouchActionsVisible(false);
      hideTimerRef.current = null;
    }, 5000);
  };

  const revealTouchActions = () => {
    if (hasHover) return;
    setTouchActionsVisible(true);
    scheduleHide();
  };

  useEffect(() => () => clearHideTimer(), []);

  // The buttons stay put while the colour picker is open, and the countdown
  // starts over once it closes.
  const setColorPickerOpen = (open) => {
    setShowColorPicker(open);
    if (hasHover) return;
    setTouchActionsVisible(true);
    if (open) clearHideTimer();
    else scheduleHide();
  };

  const resizeInput = () => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };

  useLayoutEffect(() => {
    if (!editing) return;
    const el = inputRef.current;
    if (!el) return;
    resizeInput();
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, [editing]);

  // The picker is a popover: any click outside it puts it away.
  useEffect(() => {
    if (!showColorPicker) return undefined;
    const onDown = (e) => {
      if (colorPickerRef.current?.contains(e.target)) return;
      if (colorButtonRef.current?.contains(e.target)) return;
      setColorPickerOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [showColorPicker]);

  const beginEdit = () => {
    setDraft(promise.title || '');
    setEditing(true);
  };

  const commitEdit = () => {
    setEditing(false);
    if (cancelEditRef.current) {
      cancelEditRef.current = false;
      return;
    }
    const trimmed = draft.trim();
    if (trimmed && trimmed !== promise.title) onUpdate?.(promise.id, { title: trimmed });
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      inputRef.current?.blur();
      return;
    }
    if (e.key === 'Escape') {
      cancelEditRef.current = true;
      inputRef.current?.blur();
    }
  };

  const cycle = () => {
    const cur = promise.fact_value;
    onUpdate?.(promise.id, { fact_value: cur == null ? 1 : (cur >= 1 ? 0 : null) });
  };

  const cycleTopStyle = () => {
    onUpdate?.(promise.id, { top_style: (promiseTopStyle(promise) + 1) % 3 });
  };

  const titleColor = isCompleted ? '#666' : color;

  return (
    <div
      className={`rep-task rep-task--${state}${overlay ? ' rep-task--overlay' : ''}${isCompleted ? ' rep-task--completed' : ''}${editing ? ' rep-task--editing' : ''}${touchActionsVisible ? ' rep-task--actions-visible' : ''}`}
    >
      <div className="rep-task__row" onClick={revealTouchActions}>
        {promise.kind === 'yesno' ? (
          <button
            type="button"
            className={`rep-task__check rep-task__check--${state}`}
            onClick={cycle}
            aria-label="Изменить статус"
          >
            <Mark state={state} />
          </button>
        ) : (
          <span className={`rep-task__check rep-task__check--${state}`} aria-hidden>
            <Mark state={state} />
          </span>
        )}
        {editing ? (
          <textarea
            ref={inputRef}
            className="rep-task__input"
            value={draft}
            rows={1}
            style={{ color: titleColor }}
            onChange={(e) => setDraft(e.target.value)}
            onInput={resizeInput}
            onBlur={commitEdit}
            onKeyDown={handleKeyDown}
          />
        ) : (
          <span
            className="rep-task__title"
            style={{ color: titleColor }}
            onClick={overlay ? undefined : beginEdit}
          >
            {promise.title || 'Обещание'}
          </span>
        )}
        {metrics && <span className="rep-task__metrics">{metrics}</span>}
        {!overlay && (
          <div className="rep-task__actions">
            <span className="rep-task__color-btn-wrap">
              <button
                type="button"
                className="rep-task__color-btn"
                ref={colorButtonRef}
                style={{ background: color }}
                onClick={() => setColorPickerOpen(!showColorPicker)}
                aria-label="Цвет текста"
              />
            </span>
            <button
              type="button"
              className="rep-task__action-btn"
              onMouseEnter={() => hasHover && setLineHover(true)}
              onMouseLeave={() => hasHover && setLineHover(false)}
              onClick={cycleTopStyle}
              aria-label="Отступ сверху"
            >
              <img src={hasHover && lineHover ? lineNavIcon : lineIcon} alt="" />
            </button>
            <button
              type="button"
              className="rep-task__action-btn"
              onMouseEnter={() => hasHover && setDeleteHover(true)}
              onMouseLeave={() => hasHover && setDeleteHover(false)}
              onClick={() => onDelete?.(promise.id)}
              aria-label="Удалить"
            >
              <img src={hasHover && deleteHover ? deleteNavIcon : deleteIcon} alt="" />
            </button>
            {dragHandleProps && (
              <span
                className="rep-task__drag-handle"
                {...dragHandleProps.attributes}
                {...dragHandleProps.listeners}
                aria-label="Перетащить"
              >
                <img src={dragIcon} alt="" />
              </span>
            )}
          </div>
        )}
      </div>
      {showColorPicker && (
        <div className="rep-task__colors" ref={colorPickerRef}>
          {TASK_COLORS.map((c) => {
            const selected = color.toLowerCase() === c.toLowerCase();
            return (
              <span
                key={c}
                className={`rep-task__color-option-wrap${selected ? ' rep-task__color-option-wrap--selected' : ''}`}
                style={{ '--swatch-color': c }}
              >
                <button
                  type="button"
                  className="rep-task__color-option"
                  style={{ background: c }}
                  onClick={() => {
                    onUpdate?.(promise.id, { text_color: c });
                    setColorPickerOpen(false);
                  }}
                />
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function SortableReputationRow({ promise, containerId, onUpdate, onDelete }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: repDndId(promise.id),
    data: { promise, containerId },
  });

  const slowTransition = transition
    ? transition.replace(/(\d+)ms/g, (_, ms) => `${Math.round(Number(ms) * 2)}ms`)
    : 'transform 420ms cubic-bezier(0.2, 0.8, 0.2, 1)';

  const style = isDragging
    ? { opacity: 0, transition: slowTransition }
    : { ...(transform ? { transform: CSS.Translate.toString(transform) } : {}), transition: slowTransition };

  return (
    <div ref={setNodeRef} style={style} className={promiseWrapClass(promise)}>
      <ReputationTaskRow
        promise={promise}
        onUpdate={onUpdate}
        onDelete={onDelete}
        dragHandleProps={{ attributes, listeners }}
      />
    </div>
  );
}

/** A fulfilled promise sitting in the day's "Выполненные задачи" list. */
export function CompletedReputationRow({ promise, onUpdate, onDelete }) {
  return (
    <div className={promiseWrapClass(promise)}>
      <ReputationTaskRow promise={promise} onUpdate={onUpdate} onDelete={onDelete} isCompleted />
    </div>
  );
}
