import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { toLocalDateString, formatDayLabel, TASK_COLORS, DEFAULT_TASK_COLOR } from '../constants';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { useFocus } from '../contexts/FocusContext';
import { CalendarPopover } from './CalendarPopover';
import { SortableTask } from './SortableTask';
import { DropSlot } from './DropSlot';
import { SortableReputationRow } from './ReputationTaskRow';
import { mergeDayItems } from '../lib/dayItems';
import { getContainerId } from '../lib/dnd';
import plusIcon from '../assets/plus.svg';
import plusNavIcon from '../assets/plus-nav.svg';
import clockIcon from '../assets/times.svg';
import clockNavIcon from '../assets/times-nav.svg';
import deleteIcon from '../assets/delete.svg';
import deleteNavIcon from '../assets/delete-nav2.svg';
import { DEFAULT_DAY_START_HOUR, DEFAULT_DAY_END_HOUR } from '../hooks/useCalendarDayHours';
import './CalendarView.css';

const BASE_HOUR_HEIGHT = 48; // px per hour at 1x
const SNAP = 15; // minutes
const MIN_DURATION = 15;
const GUTTER = 44; // px reserved on the left for hour labels
const RIGHT_PAD = 4;
const FOCUS_STRIP_W = 15; // px, vertical focus-session scale
const FOCUS_STRIP_GAP = 4;
// Space the timeline gives up on the right when the focus scale is shown.
const FOCUS_RIGHT_PAD = RIGHT_PAD + FOCUS_STRIP_W + FOCUS_STRIP_GAP;
const FOCUS_SEG_COLOR = '#15c466';

const snap15 = (m) => Math.round(m / SNAP) * SNAP;
const pad = (n) => String(n).padStart(2, '0');
const fmtMinutes = (min) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
const hhmmToMinutes = (s) => {
  const [h, m] = String(s || '').split(':').map(Number);
  if (Number.isNaN(h)) return null;
  return h * 60 + (m || 0);
};
// Postgres `time` values arrive as "HH:MM:SS".
const timeStrToMin = (t) => {
  if (!t) return null;
  const [h, m] = String(t).split(':').map(Number);
  if (Number.isNaN(h)) return null;
  return h * 60 + (m || 0);
};
const minToTimeStr = (min) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}:00`;

const formatEventDate = (dateStr) => {
  const d = new Date(`${dateStr}T12:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  const dm = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
  const wd = d.toLocaleDateString('ru-RU', { weekday: 'short' });
  return `${dm}, ${wd}`;
};

// Map a task row into the modal's event shape and back.
function taskToEvent(task) {
  const start = task.scheduled_time ? timeStrToMin(task.scheduled_time) : null;
  const end = task.scheduled_end_time
    ? timeStrToMin(task.scheduled_end_time)
    : (start != null ? start + 60 : null);
  return {
    id: task.id,
    title: task.title,
    event_date: task.scheduled_date,
    all_day: start == null,
    start_minute: start,
    end_minute: end,
    color: task.text_color || DEFAULT_TASK_COLOR,
  };
}

/**
 * Split events into side-by-side columns so overlapping blocks stay readable.
 * Events are grouped into clusters of transitively overlapping blocks; inside a
 * cluster each event takes the first column that is already free at its start.
 * Returns a Map id -> { lane, lanes } where `lanes` is the cluster's width.
 */
function layoutLanes(events) {
  const sorted = [...events].sort(
    (a, b) => a.start_minute - b.start_minute || a.end_minute - b.end_minute,
  );
  const result = new Map();
  let cluster = [];
  let clusterEnd = -Infinity;

  const flush = () => {
    if (!cluster.length) return;
    const laneEnds = [];
    const placed = [];
    for (const ev of cluster) {
      let lane = laneEnds.findIndex((end) => end <= ev.start_minute);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(ev.end_minute);
      } else {
        laneEnds[lane] = ev.end_minute;
      }
      placed.push([ev.id, lane]);
    }
    for (const [id, lane] of placed) result.set(id, { lane, lanes: laneEnds.length });
    cluster = [];
    clusterEnd = -Infinity;
  };

  for (const ev of sorted) {
    if (ev.start_minute >= clusterEnd) flush();
    cluster.push(ev);
    clusterEnd = Math.max(clusterEnd, ev.end_minute);
  }
  flush();
  return result;
}

function DayHoursButton({ startHour, endHour, custom, onApply, onReset }) {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(false);
  const hasHover = useMediaQuery('(hover: hover)');

  return (
    <span className={`calendar-day__hours${open ? ' calendar-day__hours--open' : ''}`}>
      <button
        type="button"
        className="calendar-day__hours-btn"
        onMouseEnter={() => hasHover && setHover(true)}
        onMouseLeave={() => hasHover && setHover(false)}
        onClick={() => setOpen((v) => !v)}
        aria-label="Интервал шкалы времени"
        title={`Шкала времени: ${pad(startHour)}:00 – ${pad(endHour)}:00`}
      >
        <img src={hasHover && (hover || open) ? clockNavIcon : clockIcon} alt="" />
      </button>
      {open && (
        <>
          <div className="calendar-day__hours-backdrop" onClick={() => setOpen(false)} />
          <div className="calendar-day__hours-pop">
            <div className="calendar-day__hours-title">Шкала времени</div>
            <div className="calendar-day__hours-row">
              <select
                className="dashboard__select"
                value={startHour}
                onChange={(e) => onApply(Number(e.target.value), endHour)}
                aria-label="Начало"
              >
                {Array.from({ length: 24 }, (_, h) => h).map((h) => (
                  <option key={h} value={h}>{pad(h)}:00</option>
                ))}
              </select>
              <span className="calendar-day__hours-sep">–</span>
              <select
                className="dashboard__select"
                value={endHour}
                onChange={(e) => onApply(startHour, Number(e.target.value))}
                aria-label="Конец"
              >
                {Array.from({ length: 24 }, (_, i) => i + 1).map((h) => (
                  <option key={h} value={h}>{pad(h)}:00</option>
                ))}
              </select>
            </div>
            <button
              type="button"
              className="calendar-day__hours-reset"
              onClick={() => { onReset(); setOpen(false); }}
              disabled={!custom}
            >
              По умолчанию · {pad(DEFAULT_DAY_START_HOUR)}:00 – {pad(DEFAULT_DAY_END_HOUR)}:00
            </button>
          </div>
        </>
      )}
    </span>
  );
}

function EventDeleteButton({ onDelete }) {
  const [hover, setHover] = useState(false);
  const hasHover = useMediaQuery('(hover: hover)');
  return (
    <button
      type="button"
      className="calendar-event__del"
      onMouseEnter={() => hasHover && setHover(true)}
      onMouseLeave={() => hasHover && setHover(false)}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => { e.stopPropagation(); onDelete(); }}
      aria-label="Удалить задачу"
      title="Удалить"
    >
      <img src={hasHover && hover ? deleteNavIcon : deleteIcon} alt="" />
    </button>
  );
}

function eventPatchToTask(patch) {
  return {
    title: patch.title,
    scheduled_date: patch.event_date,
    text_color: patch.color,
    scheduled_time: patch.all_day ? null : minToTimeStr(patch.start_minute),
    scheduled_end_time: patch.all_day ? null : minToTimeStr(patch.end_minute),
  };
}

function EventModal({ event, onClose, onSave, onDelete }) {
  const isNew = !event.id;
  const [title, setTitle] = useState(event.title || '');
  const [date, setDate] = useState(event.event_date);
  const [hasTime, setHasTime] = useState(!event.all_day && event.start_minute != null);
  const [start, setStart] = useState(event.start_minute ?? 9 * 60);
  const [end, setEnd] = useState(event.end_minute ?? 10 * 60);
  const [color, setColor] = useState(event.color || DEFAULT_TASK_COLOR);
  const [dateOpen, setDateOpen] = useState(false);

  const save = () => {
    onSave({
      title: title.trim(),
      event_date: date,
      color,
      all_day: !hasTime,
      start_minute: hasTime ? start : null,
      end_minute: hasTime ? Math.max(start + MIN_DURATION, end) : null,
    });
    onClose();
  };

  return (
    <div className="dashboard__settings-overlay" onClick={onClose}>
      <div className="dashboard__settings-popup calendar-modal" onClick={(e) => e.stopPropagation()}>
        <div className="dashboard__settings-title">{isNew ? 'Новая задача' : 'Задача'}</div>
        <input
          type="text"
          className="dashboard__settings-input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Название"
          autoFocus
          onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
        />

        <div className="calendar-modal__field-group">
          <span className="calendar-modal__label">Дата</span>
          <div className="calendar-modal__date">
            <button type="button" className="calendar-modal__date-btn" onClick={() => setDateOpen((v) => !v)}>
              {formatEventDate(date)}
            </button>
            {dateOpen && (
              <>
                <div className="calendar-modal__date-backdrop" onClick={() => setDateOpen(false)} />
                <div className="calendar-modal__date-pop">
                  <CalendarPopover
                    value={date}
                    onChange={(d) => { setDate(d); setDateOpen(false); }}
                    onClose={() => setDateOpen(false)}
                  />
                </div>
              </>
            )}
          </div>
        </div>

        {hasTime ? (
          <div className="calendar-modal__times">
            <div className="calendar-modal__field-group">
              <span className="calendar-modal__label">Начало</span>
              <span className="calendar-modal__time-wrap">
                <input
                  type="time"
                  step="900"
                  className="dashboard__settings-input calendar-modal__field"
                  value={fmtMinutes(start)}
                  onChange={(e) => { const m = hhmmToMinutes(e.target.value); if (m != null) setStart(m); }}
                />
                <button type="button" className="calendar-modal__clear" onClick={() => setHasTime(false)} aria-label="Убрать время" title="Убрать время">×</button>
              </span>
            </div>
            <div className="calendar-modal__field-group">
              <span className="calendar-modal__label">Конец</span>
              <span className="calendar-modal__time-wrap">
                <input
                  type="time"
                  step="900"
                  className="dashboard__settings-input calendar-modal__field"
                  value={fmtMinutes(end)}
                  onChange={(e) => { const m = hhmmToMinutes(e.target.value); if (m != null) setEnd(m); }}
                />
                <button type="button" className="calendar-modal__clear" onClick={() => setHasTime(false)} aria-label="Убрать время" title="Убрать время">×</button>
              </span>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="calendar-modal__add-time"
            onClick={() => { setHasTime(true); setStart((s) => s ?? 9 * 60); setEnd((e) => e ?? 10 * 60); }}
          >
            + Добавить время
          </button>
        )}

        <div className="calendar-modal__colors">
          {TASK_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className={`calendar-modal__color${color.toLowerCase() === c.toLowerCase() ? ' calendar-modal__color--active' : ''}`}
              style={{ background: c }}
              onClick={() => setColor(c)}
              aria-label={c}
            />
          ))}
        </div>

        <div className="dashboard__settings-edit-actions">
          <button type="button" className="dashboard__settings-submit" onClick={save}>Сохранить</button>
          {!isNew && (
            <button type="button" className="dashboard__settings-delete" onClick={() => { onDelete(); onClose(); }}>Удалить</button>
          )}
        </div>
      </div>
    </div>
  );
}

// Vertical focus-session scale drawn beside the timeline. It reads the focus
// context on its own so a ticking session re-renders only this strip.
function FocusStrip({ dateStr, dayStartMin, dayEndMin, pxPerMin, color = FOCUS_SEG_COLOR }) {
  const { sessions, active, workSeconds } = useFocus();
  // Round to whole minutes: the live block only needs to move once a minute.
  const liveMinutes = active ? Math.floor(workSeconds / 60) : 0;

  const segments = useMemo(() => {
    const out = [];
    const add = (startedAt, seconds, live) => {
      const st = new Date(startedAt);
      if (Number.isNaN(st.getTime())) return;
      if (toLocalDateString(st) !== dateStr) return;
      const startMin = st.getHours() * 60 + st.getMinutes();
      out.push({ startMin, endMin: startMin + Math.max(1, seconds / 60), live });
    };
    for (const s of sessions || []) add(s.started_at, s.duration_seconds || 0, false);
    if (active && liveMinutes >= 1) {
      add(new Date(Date.now() - liveMinutes * 60 * 1000), liveMinutes * 60, true);
    }
    return out.sort((a, b) => a.startMin - b.startMin);
  }, [sessions, dateStr, active, liveMinutes]);

  return (
    <div className="calendar-day__focus" style={{ width: FOCUS_STRIP_W }}>
      {segments.map((seg, i) => {
        const s = Math.max(seg.startMin, dayStartMin);
        const e = Math.min(seg.endMin, dayEndMin);
        if (e <= s) return null;
        return (
          <div
            key={i}
            className={`calendar-day__focus-seg${seg.live ? ' calendar-day__focus-seg--live' : ''}`}
            style={{
              top: (s - dayStartMin) * pxPerMin,
              height: Math.max(2, (e - s) * pxPerMin),
              background: color,
            }}
            title={`${fmtMinutes(Math.round(seg.startMin))}–${fmtMinutes(Math.round(Math.min(seg.endMin, 24 * 60)))} · фокус`}
          />
        );
      })}
    </div>
  );
}

function CalendarDayColumn({
  date, tasks, startHour, endHour, customHours, hourHeight, now, showCheckboxes, twoColumns, focusScale, focusColor,
  completedVisible, recentCompletedIds, getListCollapsed, setListCollapsed,
  reputationPromises, onUpdateReputation, onDeleteReputation,
  onUpdateTiming, onOpenModal, onAddTaskAt, onSetHours, onResetHours, taskHandlers,
}) {
  const dateStr = toLocalDateString(date);
  const pxPerMin = hourHeight / 60;
  const dayStartMin = startHour * 60;
  const dayEndMin = endHour * 60;
  const timelineHeight = (dayEndMin - dayStartMin) * pxPerMin;

  const timelineRef = useRef(null);
  const dragRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [, forceTick] = useReducer((x) => x + 1, 0);
  const hasHover = useMediaQuery('(hover: hover)');
  const [plusHover, setPlusHover] = useState(false);

  // Drop slots and promise anchors are indexed against every open task of the
  // day, timed ones included, so they mean the same thing here as in Plans.
  const dayTasks = tasks
    .filter((t) => !t.parent_id && !t.completed_at && t.scheduled_date === dateStr && (t.list_type || 'inbox') === 'inbox')
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

  const noTimeTasks = dayTasks.filter((t) => !t.scheduled_time);

  const dayItems = mergeDayItems(
    noTimeTasks,
    reputationPromises,
    (task) => dayTasks.indexOf(task),
    dayTasks.length,
  );

  // Every completed task of the day, timed ones included: they keep their slot
  // on the timeline and are listed here as well, just like in Plans.
  const completedTasks = tasks
    .filter((t) => !t.parent_id && t.completed_at && t.scheduled_date === dateStr && (t.list_type || 'inbox') === 'inbox')
    .sort((a, b) => {
      const ca = a.completed_at || '';
      const cb = b.completed_at || '';
      return ca === cb ? (a.position ?? 0) - (b.position ?? 0) : (ca < cb ? -1 : 1);
    });

  const completedKey = `completed_${dateStr}`;
  const completedOpen = getListCollapsed ? !getListCollapsed(completedKey) : true;
  const toggleCompleted = () => setListCollapsed?.(completedKey, !getListCollapsed?.(completedKey));

  const timedEvents = tasks
    .filter((t) => !t.parent_id && t.scheduled_date === dateStr && (t.list_type || 'inbox') === 'inbox' && t.scheduled_time)
    .map((t) => {
      const start = timeStrToMin(t.scheduled_time);
      const end = t.scheduled_end_time ? timeStrToMin(t.scheduled_end_time) : start + 60;
      return { id: t.id, title: t.title, color: t.text_color || DEFAULT_TASK_COLOR, completed: !!t.completed_at, start_minute: start, end_minute: end, task: t };
    });

  const clientYToMinute = (clientY) => {
    const el = timelineRef.current;
    if (!el) return dayStartMin;
    const rect = el.getBoundingClientRect();
    let y = clientY - rect.top;
    y = Math.max(0, Math.min(timelineHeight, y));
    const m = snap15(dayStartMin + y / pxPerMin);
    return Math.max(dayStartMin, Math.min(dayEndMin, m));
  };

  useEffect(() => {
    if (!dragging) return undefined;
    const onMove = (e) => {
      const d = dragRef.current;
      if (!d) return;
      const m = clientYToMinute(e.clientY);
      if (d.type === 'create') {
        d.end = m;
        d.moved = d.moved || Math.abs(m - d.start) >= SNAP;
      } else if (d.type === 'resize-top') {
        d.start = Math.max(dayStartMin, Math.min(m, d.origEnd - MIN_DURATION));
        d.moved = true;
      } else if (d.type === 'resize-bottom') {
        d.end = Math.min(dayEndMin, Math.max(m, d.origStart + MIN_DURATION));
        d.moved = true;
      } else if (d.type === 'move') {
        const delta = m - d.anchor;
        let ns = snap15(d.origStart + delta);
        let ne = snap15(d.origEnd + delta);
        if (ns < dayStartMin) { ne += dayStartMin - ns; ns = dayStartMin; }
        if (ne > dayEndMin) { ns -= ne - dayEndMin; ne = dayEndMin; }
        d.start = ns;
        d.end = ne;
        if (Math.abs(delta) >= SNAP) d.moved = true;
      }
      forceTick();
    };
    const onUp = () => {
      const d = dragRef.current;
      dragRef.current = null;
      setDragging(false);
      if (timelineRef.current) timelineRef.current.style.touchAction = ''; // restore scrolling
      if (!d) return;
      if (d.type === 'create') {
        let s = Math.min(d.start, d.end);
        let e2 = Math.max(d.start, d.end);
        if (e2 - s < MIN_DURATION) e2 = Math.min(dayEndMin, s + 60);
        if (e2 - s < MIN_DURATION) s = Math.max(dayStartMin, e2 - 60);
        onOpenModal({ event_date: dateStr, all_day: false, start_minute: s, end_minute: e2, title: '', color: DEFAULT_TASK_COLOR });
      } else if (d.type === 'move') {
        if (!d.moved) {
          const ev = timedEvents.find((x) => x.id === d.id);
          if (ev) onOpenModal(taskToEvent(ev.task));
        } else {
          onUpdateTiming(d.id, d.start, d.end);
        }
      } else if (d.type === 'resize-top') {
        onUpdateTiming(d.id, d.start, d.origEnd);
      } else if (d.type === 'resize-bottom') {
        onUpdateTiming(d.id, d.origStart, d.end);
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging]);

  const beginTimelineCreate = (e) => {
    if (e.target !== timelineRef.current) return; // only empty area
    // Touch: let the page scroll on a drag; create only on a clean tap.
    if (e.pointerType === 'touch') {
      const sx = e.clientX;
      const sy = e.clientY;
      let moved = false;
      const onWaitMove = (me) => {
        if (Math.abs(me.clientX - sx) > 10 || Math.abs(me.clientY - sy) > 10) moved = true;
      };
      const finish = (ue) => {
        window.removeEventListener('pointermove', onWaitMove);
        window.removeEventListener('pointerup', finish);
        window.removeEventListener('pointercancel', finish);
        if (!moved && ue.type === 'pointerup') {
          const m = clientYToMinute(sy);
          onOpenModal({ event_date: dateStr, all_day: false, start_minute: m, end_minute: Math.min(dayEndMin, m + 60), title: '', color: DEFAULT_TASK_COLOR });
        }
      };
      window.addEventListener('pointermove', onWaitMove);
      window.addEventListener('pointerup', finish);
      window.addEventListener('pointercancel', finish);
      return;
    }
    e.preventDefault();
    const startMin = clientYToMinute(e.clientY);
    dragRef.current = { type: 'create', start: startMin, end: startMin, moved: false };
    setDragging(true);
    forceTick();
  };

  const startMove = (clientY, ev) => {
    dragRef.current = { type: 'move', id: ev.id, anchor: clientYToMinute(clientY), origStart: ev.start_minute, origEnd: ev.end_minute, start: ev.start_minute, end: ev.end_minute, moved: false };
    setDragging(true);
    forceTick();
  };

  const beginMove = (e, ev) => {
    e.stopPropagation();
    // Desktop / mouse: start dragging immediately.
    if (e.pointerType !== 'touch') {
      startMove(e.clientY, ev);
      return;
    }
    // Touch: require a long press (hold ~400ms) before moving, so a simple
    // tap doesn't shift the task. A tap opens the edit modal instead.
    const startX = e.clientX;
    const startY = e.clientY;
    let timer = null;
    const cleanup = () => {
      clearTimeout(timer);
      window.removeEventListener('pointermove', onWaitMove);
      window.removeEventListener('pointerup', onWaitUp);
      window.removeEventListener('pointercancel', onWaitCancel);
    };
    const onWaitMove = (me) => {
      if (Math.abs(me.clientX - startX) > 10 || Math.abs(me.clientY - startY) > 10) {
        cleanup(); // moved before the long press engaged -> treat as scroll, no move
      }
    };
    const onWaitUp = () => {
      cleanup();
      onOpenModal(taskToEvent(ev.task)); // short tap -> open editor
    };
    const onWaitCancel = () => cleanup();
    timer = setTimeout(() => {
      cleanup();
      // Finger has been held still, so no scroll is in progress: take over the
      // gesture for moving (disable scrolling for its duration).
      if (timelineRef.current) timelineRef.current.style.touchAction = 'none';
      startMove(startY, ev);
    }, 400);
    window.addEventListener('pointermove', onWaitMove);
    window.addEventListener('pointerup', onWaitUp);
    window.addEventListener('pointercancel', onWaitCancel);
  };

  const beginResize = (e, ev, edge) => {
    e.stopPropagation();
    if (e.pointerType === 'touch' && timelineRef.current) timelineRef.current.style.touchAction = 'none';
    dragRef.current = {
      type: edge === 'top' ? 'resize-top' : 'resize-bottom',
      id: ev.id,
      origStart: ev.start_minute,
      origEnd: ev.end_minute,
      start: ev.start_minute,
      end: ev.end_minute,
      moved: false,
    };
    setDragging(true);
    forceTick();
  };

  const hourLines = [];
  for (let h = startHour; h <= endHour; h++) hourLines.push(h);

  const drag = dragRef.current;

  const isToday = toLocalDateString(now) === dateStr;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const showNow = isToday && nowMin >= dayStartMin && nowMin <= dayEndMin;

  const containerId = getContainerId(dateStr, null, false);
  const completedContainerId = getContainerId(dateStr, null, true);

  const laneLayout = layoutLanes(timedEvents);

  return (
    <section className={`calendar-day${twoColumns ? ' calendar-day--split' : ''}`}>
      <div className="calendar-day__header">
        <span className="calendar-day__title">{formatDayLabel(dateStr)}</span>
        <DayHoursButton
          startHour={startHour}
          endHour={endHour}
          custom={customHours}
          onApply={(s, e) => onSetHours(dateStr, s, e)}
          onReset={() => onResetHours(dateStr)}
        />
        <button
          type="button"
          className="calendar-day__add"
          onMouseEnter={() => hasHover && setPlusHover(true)}
          onMouseLeave={() => hasHover && setPlusHover(false)}
          onClick={() => onAddTaskAt({ scheduled_date: dateStr, text_color: DEFAULT_TASK_COLOR })}
          aria-label="Добавить задачу"
        >
          <img src={hasHover && plusHover ? plusNavIcon : plusIcon} alt="" />
        </button>
      </div>

      <div className="calendar-day__body">
        <div className="calendar-day__lists">
          <ul className="calendar-day__notime">
            <SortableContext items={dayItems.map((it) => it.dndId)} strategy={verticalListSortingStrategy}>
              {dayItems.map((item) => (
                <li key={item.dndId}>
                  {item.kind === 'promise' ? (
                    <SortableReputationRow
                      promise={item.promise}
                      containerId={containerId}
                      onUpdate={onUpdateReputation}
                      onDelete={onDeleteReputation}
                    />
                  ) : (
                    <>
                      <DropSlot id={containerId} index={item.anchor} />
                      <SortableTask
                        task={item.task}
                        containerId={containerId}
                        subtasks={taskHandlers.getSubtasks(item.task.id)}
                        getSubtasks={taskHandlers.getSubtasks}
                        onToggle={taskHandlers.onToggle}
                        onUpdate={taskHandlers.onUpdate}
                        onDelete={taskHandlers.onDelete}
                        onAddSubtask={taskHandlers.onAddSubtask}
                        onTaskContextMenu={taskHandlers.onTaskContextMenu}
                        editingTaskId={taskHandlers.editingTaskId}
                        onEditingTaskConsumed={taskHandlers.onEditingTaskConsumed}
                        onCreateSiblingTask={taskHandlers.onCreateSiblingTask}
                        onCreateSiblingSubtask={taskHandlers.onCreateSiblingSubtask}
                        onCreateSubtaskAndEdit={taskHandlers.onCreateSubtaskAndEdit}
                      />
                    </>
                  )}
                </li>
              ))}
              <li><DropSlot id={containerId} index={dayTasks.length} /></li>
            </SortableContext>
          </ul>

          {completedVisible && completedTasks.length > 0 && (
            <div className="calendar-day__completed">
              <button type="button" className="calendar-day__completed-toggle" onClick={toggleCompleted}>
                Выполненные задачи
              </button>
              {completedOpen && (
                <ul className="calendar-day__notime calendar-day__notime--completed">
                  <SortableContext items={completedTasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                    {completedTasks.map((task, i) => (
                      <li key={task.id}>
                        <DropSlot id={completedContainerId} index={i} />
                        <SortableTask
                          task={task}
                          containerId={completedContainerId}
                          subtasks={taskHandlers.getSubtasks(task.id)}
                          getSubtasks={taskHandlers.getSubtasks}
                          isCompleted
                          onToggle={taskHandlers.onToggle}
                          onUpdate={taskHandlers.onUpdate}
                          onDelete={taskHandlers.onDelete}
                          onAddSubtask={taskHandlers.onAddSubtask}
                          onTaskContextMenu={taskHandlers.onTaskContextMenu}
                          editingTaskId={taskHandlers.editingTaskId}
                          onEditingTaskConsumed={taskHandlers.onEditingTaskConsumed}
                          onCreateSiblingTask={taskHandlers.onCreateSiblingTask}
                          onCreateSiblingSubtask={taskHandlers.onCreateSiblingSubtask}
                          onCreateSubtaskAndEdit={taskHandlers.onCreateSubtaskAndEdit}
                          isRecentlyCompleted={recentCompletedIds?.has(task.id)}
                        />
                      </li>
                    ))}
                    <li><DropSlot id={completedContainerId} index={completedTasks.length} /></li>
                  </SortableContext>
                </ul>
              )}
            </div>
          )}
        </div>

        <div
          className={`calendar-day__timeline${focusScale ? ' calendar-day__timeline--focus' : ''}`}
          ref={timelineRef}
          style={{ height: timelineHeight }}
          onPointerDown={beginTimelineCreate}
        >
          {hourLines.map((h) => (
            <div key={h} className="calendar-hour" style={{ top: (h * 60 - dayStartMin) * pxPerMin }}>
              <span className="calendar-hour__label">{pad(h)}:00</span>
              <span className="calendar-hour__line" aria-hidden />
            </div>
          ))}

          {showNow && (
            <div className="calendar-now" style={{ top: (nowMin - dayStartMin) * pxPerMin }} aria-hidden />
          )}

          {timedEvents.map((ev) => {
            const isDragged = drag && drag.id === ev.id;
            const s = isDragged ? drag.start : ev.start_minute;
            const e2 = isDragged ? drag.end : ev.end_minute;
            // Skip events entirely outside the configured timeline window.
            if (e2 <= dayStartMin || s >= dayEndMin) return null;
            // Clip the block to the visible window, but keep the true times in the label.
            const visStart = Math.max(s, dayStartMin);
            const visEnd = Math.min(e2, dayEndMin);
            const top = (visStart - dayStartMin) * pxPerMin;
            const height = Math.max(4, (visEnd - visStart) * pxPerMin);
            // Overlapping blocks share the width in side-by-side columns.
            const { lane = 0, lanes = 1 } = laneLayout.get(ev.id) || {};
            const track = `(100% - ${GUTTER + (focusScale ? FOCUS_RIGHT_PAD : RIGHT_PAD)}px)`;
            const laneStyle = lanes > 1
              ? {
                left: `calc(${GUTTER}px + ${track} * ${lane} / ${lanes})`,
                width: `calc(${track} / ${lanes} - 3px)`,
                right: 'auto',
              }
              : null;
            return (
              <div
                key={ev.id}
                className={`calendar-event${ev.completed ? ' calendar-event--done' : ''}${isDragged ? ' calendar-event--dragging' : ''}`}
                style={{ top, height, '--ev-color': ev.color, ...laneStyle }}
                onPointerDown={(e) => beginMove(e, ev)}
              >
                <div className="calendar-event__resize calendar-event__resize--top" onPointerDown={(e) => beginResize(e, ev, 'top')} />
                <div className="calendar-event__body">
                  {showCheckboxes && (
                    <button
                      type="button"
                      className={`calendar-event__check${ev.completed ? ' calendar-event__check--done' : ''}`}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => { e.stopPropagation(); taskHandlers.onToggle(ev.task); }}
                      aria-label={ev.completed ? 'Вернуть' : 'Выполнено'}
                    >
                      {ev.completed && (
                        <svg width="9" height="9" viewBox="0 0 16 16" aria-hidden>
                          <path d="M3 8.5l3 3 7-7" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </button>
                  )}
                  <span className="calendar-event__label">
                    <span className="calendar-event__time">{fmtMinutes(s)}–{fmtMinutes(e2)}</span>
                    {ev.title ? <> • {ev.title}</> : null}
                  </span>
                  <EventDeleteButton onDelete={() => taskHandlers.onDelete(ev.id)} />
                </div>
                <div className="calendar-event__resize calendar-event__resize--bottom" onPointerDown={(e) => beginResize(e, ev, 'bottom')} />
              </div>
            );
          })}

          {drag && drag.type === 'create' && (() => {
            const s = Math.min(drag.start, drag.end);
            const e2 = Math.max(drag.start, drag.end);
            const top = (s - dayStartMin) * pxPerMin;
            const height = Math.max(4, (e2 - s) * pxPerMin);
            return <div className="calendar-event calendar-event--preview" style={{ top, height }} />;
          })()}

          {focusScale && (
            <FocusStrip
              dateStr={dateStr}
              dayStartMin={dayStartMin}
              dayEndMin={dayEndMin}
              pxPerMin={pxPerMin}
              color={focusColor}
            />
          )}
        </div>
      </div>
    </section>
  );
}

export function CalendarView({
  days, tasks, scale = 1, showCheckboxes = false, twoColumns = false,
  focusScale = false, focusColor = FOCUS_SEG_COLOR,
  dayHours = {}, setDayHours, resetDayHours,
  completedVisible = true, recentCompletedIds, getListCollapsed, setListCollapsed,
  reputationByDate, onUpdateReputation, onDeleteReputation,
  addTask, updateTask, deleteTask,
  onToggle, onAddTaskAt, onAddSubtask, onTaskContextMenu,
  editingTaskId, onEditingTaskConsumed,
  onCreateSiblingTask, onCreateSiblingSubtask, onCreateSubtaskAndEdit,
}) {
  const [editingEvent, setEditingEvent] = useState(null);
  const [now, setNow] = useState(() => new Date());
  const hourHeight = BASE_HOUR_HEIGHT * (scale || 1);

  const getSubtasks = (parentId) =>
    tasks.filter((t) => t.parent_id === parentId).sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

  // Refresh the "now" indicator every 5 minutes while this view is mounted.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 5 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const handleSave = (patch) => {
    const taskPatch = eventPatchToTask(patch);
    if (editingEvent?.id) updateTask(editingEvent.id, taskPatch);
    else addTask({ ...taskPatch, list_type: 'inbox' });
  };

  const taskHandlers = {
    onToggle,
    onUpdate: updateTask,
    onDelete: deleteTask,
    onAddSubtask,
    onTaskContextMenu,
    editingTaskId,
    onEditingTaskConsumed,
    onCreateSiblingTask,
    onCreateSiblingSubtask,
    onCreateSubtaskAndEdit,
    getSubtasks,
  };

  const updateTiming = (id, startMin, endMin) => {
    updateTask(id, { scheduled_time: minToTimeStr(startMin), scheduled_end_time: minToTimeStr(endMin) });
  };

  return (
    <div className="calendar-view">
      <div className="calendar-view__days">
        {days.map((date) => {
          const dateStr = toLocalDateString(date);
          const custom = dayHours[dateStr];
          return (
            <CalendarDayColumn
              key={dateStr}
              date={date}
              tasks={tasks}
              startHour={custom?.start ?? DEFAULT_DAY_START_HOUR}
              endHour={custom?.end ?? DEFAULT_DAY_END_HOUR}
              customHours={!!custom}
              hourHeight={hourHeight}
              now={now}
              showCheckboxes={showCheckboxes}
              twoColumns={twoColumns}
              focusScale={focusScale}
              focusColor={focusColor}
              completedVisible={completedVisible}
              recentCompletedIds={recentCompletedIds}
              getListCollapsed={getListCollapsed}
              setListCollapsed={setListCollapsed}
              reputationPromises={reputationByDate?.get(dateStr)}
              onUpdateReputation={onUpdateReputation}
              onDeleteReputation={onDeleteReputation}
              onUpdateTiming={updateTiming}
              onOpenModal={setEditingEvent}
              onAddTaskAt={onAddTaskAt}
              onSetHours={setDayHours}
              onResetHours={resetDayHours}
              taskHandlers={taskHandlers}
            />
          );
        })}
      </div>

      {editingEvent && (
        <EventModal
          event={editingEvent}
          onClose={() => setEditingEvent(null)}
          onSave={handleSave}
          onDelete={() => { if (editingEvent.id) deleteTask(editingEvent.id); }}
        />
      )}
    </div>
  );
}
