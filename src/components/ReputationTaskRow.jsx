import { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { promiseState } from '../hooks/useReputation';
import { repDndId } from '../lib/dayItems';
import { useMediaQuery } from '../hooks/useMediaQuery';
import deleteIcon from '../assets/delete.svg';
import deleteNavIcon from '../assets/delete-nav.svg';
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

/**
 * A reputation promise shown among the tasks of its day. Yes/no promises can be
 * cycled straight from here; measured ones only report their numbers, which are
 * edited in the reputation section itself.
 */
export function ReputationTaskRow({ promise, onUpdate, onDelete, dragHandleProps, overlay = false }) {
  const [deleteHover, setDeleteHover] = useState(false);
  const hasHover = useMediaQuery('(hover: hover)');
  const state = promiseState(promise);
  const metrics = metricsText(promise);

  const cycle = () => {
    const cur = promise.fact_value;
    onUpdate?.(promise.id, { fact_value: cur == null ? 1 : (cur >= 1 ? 0 : null) });
  };

  return (
    <div className={`rep-task rep-task--${state}${overlay ? ' rep-task--overlay' : ''}`}>
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
      <span className="rep-task__title">{promise.title || 'Обещание'}</span>
      {metrics && <span className="rep-task__metrics">{metrics}</span>}
      {!overlay && (
        <div className="rep-task__actions">
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
    <div ref={setNodeRef} style={style} className="rep-task-wrap">
      <ReputationTaskRow
        promise={promise}
        onUpdate={onUpdate}
        onDelete={onDelete}
        dragHandleProps={{ attributes, listeners }}
      />
    </div>
  );
}
