import { useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { toLocalDateString, formatDayLabel, TASK_COLORS, DEFAULT_TASK_COLOR } from '../constants';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { useFocus } from '../contexts/FocusContext';
import { CalendarPopover } from './CalendarPopover';
import { NoDateList } from './NoDateList';
import { SortableTask } from './SortableTask';
import { DropSlot } from './DropSlot';
import { CompletedReputationRow, SortableReputationRow } from './ReputationTaskRow';
import { mergeDayItems, splitDonePromises } from '../lib/dayItems';
import { getContainerId } from '../lib/dnd';
import plusIcon from '../assets/plus.svg';
import plusNavIcon from '../assets/plus-nav.svg';
import clockIcon from '../assets/times.svg';
import clockNavIcon from '../assets/times-nav.svg';
import deleteIcon from '../assets/delete.svg';
import deleteNavIcon from '../assets/delete-nav2.svg';
import deleteDangerIcon from '../assets/delete-danger.svg';
import editIcon from '../assets/edit.svg';
import checkIcon from '../assets/check.svg';
import refreshIcon from '../assets/refresh.svg';
import focusIcon from '../assets/focus.svg';
import playIcon from '../assets/play.svg';
import zavtraIcon from '../assets/zavtra.svg';
import calendarIcon from '../assets/calendar.svg';
import closeIcon from '../assets/close.svg';
import layersIcon from '../assets/layers.svg';
import copyIcon from '../assets/copy2.svg';
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
// The colours offered straight from the menu of a block, as for any task.
const MENU_COLORS = ['#ffffff', '#f33737', '#666666', '#5a86ee', '#15c466'];
const MENU_DURATIONS = [15, 30, 60, 90, 120];
const MENU_SHIFTS = [-60, -15, 15, 60];

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
/** "15 мин", "1 ч", "1,5 ч" — a stretch of time as the menu labels it. */
const fmtSpan = (min) => {
  const a = Math.abs(min);
  return a < 60 ? `${a} мин` : `${String(a / 60).replace('.', ',')} ч`;
};
const addDays = (dateStr, n) => {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + n);
  return toLocalDateString(d);
};

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

/**
 * Right-click menu of a block on the timeline: what is done to a planned slot
 * often enough not to open the task for it — its colour, how long it lasts,
 * nudging it along the day, sending it to another day or off the timeline, a
 * copy of it straight after, and getting rid of it. The colour, the length and
 * the nudges leave the menu open, so a block can be walked into place.
 */
function EventContextMenu({ menu, task, actions, onClose }) {
  const { x, y, windowStart, windowEnd } = menu;
  const ref = useRef(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  // Read here rather than by the calendar, which would otherwise re-render
  // every tick of a running session; the menu is only there for a moment.
  const { openFocus } = useFocus();

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { offsetWidth: w, offsetHeight: h } = el;
    el.style.left = `${Math.max(8, Math.min(x, window.innerWidth - w - 8))}px`;
    el.style.top = `${Math.max(8, Math.min(y, window.innerHeight - h - 8))}px`;
    el.style.visibility = 'visible';
  }, [x, y, pickerOpen]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const start = timeStrToMin(task.scheduled_time);
  const end = task.scheduled_end_time ? timeStrToMin(task.scheduled_end_time) : start + 60;
  const length = end - start;
  const done = !!task.completed_at;
  const color = (task.text_color || DEFAULT_TASK_COLOR).toLowerCase();
  const isToday = task.scheduled_date === toLocalDateString(new Date());
  const nowSlot = actions.nowSlot(length);

  const item = (icon, label, onClick, extra = '') => (
    <button type="button" className={`dashboard__context-menu-item ${extra}`} onClick={onClick}>
      <img src={icon} alt="" className="dashboard__context-menu-item-icon" />
      <span>{label}</span>
    </button>
  );
  const then = (fn) => () => {
    fn();
    onClose();
  };

  return createPortal(
    <>
      <div
        className="dashboard__context-menu-backdrop"
        aria-hidden
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />
      <div
        ref={ref}
        className="dashboard__context-menu calendar-menu"
        onClick={(e) => e.stopPropagation()}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div className="calendar-menu__head">
          <span className="calendar-menu__time">{fmtMinutes(start)}–{fmtMinutes(end)}</span>
          {task.title && <span className="calendar-menu__title">{task.title}</span>}
        </div>
        <div className="dashboard__context-menu-colors">
          {MENU_COLORS.map((c) => (
            <span
              key={c}
              className={`dashboard__context-menu-color-wrap${color === c ? ' dashboard__context-menu-color-wrap--selected' : ''}`}
              style={{ '--swatch-color': c }}
            >
              <button
                type="button"
                className="dashboard__context-menu-color"
                style={{ background: c }}
                onClick={() => actions.color(task, c)}
                aria-label={`Цвет ${c}`}
              />
            </span>
          ))}
        </div>
        {item(editIcon, 'Открыть', then(() => actions.open(task)))}
        {item(done ? refreshIcon : checkIcon, done ? 'Вернуть в работу' : 'Выполнено', then(() => actions.toggle(task)))}
        {item(focusIcon, 'Сфокусироваться', then(() => openFocus({ ref: task.id, title: task.title, source: 'task' }, 'stopwatch')))}
        <div className="dashboard__context-menu-separator" aria-hidden />

        <div className="calendar-menu__group">
          <span className="calendar-menu__group-title">Длительность</span>
          <span className="calendar-menu__chips">
            {MENU_DURATIONS.map((d) => (
              <button
                key={d}
                type="button"
                className={`calendar-menu__chip${d === length ? ' calendar-menu__chip--on' : ''}`}
                disabled={start + d > windowEnd}
                onClick={() => actions.setTiming(task, start, start + d)}
              >
                {fmtSpan(d)}
              </button>
            ))}
          </span>
        </div>
        <div className="calendar-menu__group">
          <span className="calendar-menu__group-title">Сдвинуть</span>
          <span className="calendar-menu__chips">
            {MENU_SHIFTS.map((m) => (
              <button
                key={m}
                type="button"
                className="calendar-menu__chip"
                disabled={start + m < windowStart || end + m > windowEnd}
                onClick={() => actions.setTiming(task, start + m, end + m)}
              >
                {`${m < 0 ? '−' : '+'}${fmtSpan(m)}`}
              </button>
            ))}
          </span>
        </div>
        {nowSlot && item(playIcon, `Начать сейчас · ${fmtMinutes(nowSlot.start)}`, then(() => actions.startAt(task, nowSlot)))}
        <div className="dashboard__context-menu-separator" aria-hidden />

        {item(zavtraIcon, isToday ? 'На завтра' : 'На следующий день', then(() => actions.moveToDate(task, addDays(task.scheduled_date, 1))))}
        {item(calendarIcon, 'Перенести на дату…', () => setPickerOpen((v) => !v), pickerOpen ? 'dashboard__context-menu-item--open' : '')}
        {pickerOpen && (
          <div className="calendar-menu__picker">
            <CalendarPopover
              value={task.scheduled_date}
              onChange={(d) => actions.moveToDate(task, d)}
              onClose={onClose}
            />
          </div>
        )}
        {item(closeIcon, 'Убрать время', then(() => actions.clearTime(task)))}
        {item(layersIcon, 'В задачи без даты', then(() => actions.toNoDate(task)))}
        <div className="dashboard__context-menu-separator" aria-hidden />

        {item(copyIcon, 'Дублировать следом', then(() => actions.duplicate(task, windowEnd)))}
        {item(deleteDangerIcon, 'Удалить', then(() => actions.remove(task)), 'dashboard__context-menu-item--danger')}
      </div>
    </>,
    document.body,
  );
}

// Vertical focus-session scale drawn beside the timeline. It reads the focus
// context on its own so a ticking session re-renders only this strip.
function FocusStrip({ dateStr, dayStartMin, dayEndMin, pxPerMin, color = FOCUS_SEG_COLOR }) {
  const { sessions, active, workSeconds, sessionStartedAt } = useFocus();
  // Round to whole minutes: the live block only needs to grow once a minute.
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
    if (active && sessionStartedAt && liveMinutes >= 1) {
      add(sessionStartedAt, liveMinutes * 60, true);
    }
    return out.sort((a, b) => a.startMin - b.startMin);
  }, [sessions, dateStr, active, liveMinutes, sessionStartedAt]);

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
  reputationPromises, reputationInCompleted, onUpdateReputation, onDeleteReputation,
  onUpdateTiming, onOpenModal, onAddTaskAt, onSetHours, onResetHours, taskHandlers,
  onEventMenu, noDateList = null, noDateDone = false,
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
  // A long press on a block moves it, and some phones follow it up with a
  // context menu of their own; the menu of a block is only for the mouse.
  const lastPointerRef = useRef('mouse');

  // Drop slots and promise anchors are indexed against every open task of the
  // day, timed ones included, so they mean the same thing here as in Plans.
  const dayTasks = tasks
    .filter((t) => !t.parent_id && !t.completed_at && t.scheduled_date === dateStr && (t.list_type || 'inbox') === 'inbox')
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

  const noTimeTasks = dayTasks.filter((t) => !t.scheduled_time);

  const { open: openPromises, done: donePromises } = splitDonePromises(
    reputationPromises,
    reputationInCompleted,
  );

  const dayItems = mergeDayItems(
    noTimeTasks,
    openPromises,
    (task) => dayTasks.indexOf(task),
    dayTasks.length,
  );

  const byCompletion = (a, b) => {
    const ca = a.completed_at || '';
    const cb = b.completed_at || '';
    return ca === cb ? (a.position ?? 0) - (b.position ?? 0) : (ca < cb ? -1 : 1);
  };

  // Every completed task of the day, timed ones included: they keep their slot
  // on the timeline and are listed here as well, just like in Plans.
  const completedTasks = tasks
    .filter((t) => !t.parent_id && t.completed_at && t.scheduled_date === dateStr && (t.list_type || 'inbox') === 'inbox')
    .sort(byCompletion);

  // The tasks without a date done on this day can be listed among them too.
  // They stay without a date: their rows and drop slots keep the container of
  // the no-date completed list, indexed the way that list is.
  const noDateDoneAll = noDateDone
    ? tasks
      .filter((t) => !t.parent_id && t.completed_at && !t.scheduled_date && (t.list_type || 'inbox') === 'inbox')
      .sort(byCompletion)
    : [];
  const completedItems = noDateDoneAll.length
    ? [...completedTasks, ...noDateDoneAll.filter((t) => toLocalDateString(new Date(t.completed_at)) === dateStr)].sort(byCompletion)
    : completedTasks;

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
    if (e.button !== 0) return; // the right button is for menus, not for new blocks
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
    lastPointerRef.current = e.pointerType;
    // A right click opens the menu of the block instead of picking it up.
    if (e.button !== 0) return;
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
    lastPointerRef.current = e.pointerType;
    if (e.button !== 0) return;
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
  const noDateCompletedContainerId = getContainerId(null, null, true);

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

          {completedVisible && (completedItems.length > 0 || donePromises.length > 0) && (
            <div className="calendar-day__completed">
              <button type="button" className="calendar-day__completed-toggle" onClick={toggleCompleted}>
                Выполненные задачи
              </button>
              {completedOpen && (
                <ul className="calendar-day__notime calendar-day__notime--completed">
                  {donePromises.map((promise) => (
                    <li key={promise.id}>
                      <CompletedReputationRow
                        promise={promise}
                        onUpdate={onUpdateReputation}
                        onDelete={onDeleteReputation}
                      />
                    </li>
                  ))}
                  <SortableContext items={completedItems.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                    {completedItems.map((task) => {
                      const noDate = !task.scheduled_date;
                      const itemContainerId = noDate ? noDateCompletedContainerId : completedContainerId;
                      return (
                      <li key={task.id}>
                        <DropSlot
                          id={itemContainerId}
                          index={noDate ? noDateDoneAll.indexOf(task) : completedTasks.indexOf(task)}
                        />
                        <SortableTask
                          task={task}
                          containerId={itemContainerId}
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
                      );
                    })}
                    <li><DropSlot id={completedContainerId} index={completedTasks.length} /></li>
                  </SortableContext>
                </ul>
              )}
            </div>
          )}

          {noDateList}
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
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (lastPointerRef.current === 'touch' || !onEventMenu) return;
                  onEventMenu(e, ev.task, dayStartMin, dayEndMin);
                }}
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
  focusScale = false, focusColor = FOCUS_SEG_COLOR, showNoDate = true, noDateInCompleted = false,
  dayHours = {}, setDayHours, resetDayHours,
  completedVisible = true, recentCompletedIds, getListCollapsed, setListCollapsed,
  reputationByDate, reputationInCompleted = false, onUpdateReputation, onDeleteReputation,
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

  // { taskId, x, y, windowStart, windowEnd } while a block's menu is open.
  const [eventMenu, setEventMenu] = useState(null);
  const menuTask = eventMenu ? tasks.find((t) => t.id === eventMenu.taskId && t.scheduled_time) : null;

  /** The end of a list of the day: `dateStr` null for the tasks without a date. */
  const nextPositionIn = (dateStr, completed) => {
    const list = tasks.filter((t) => !t.parent_id
      && (t.list_type || 'inbox') === 'inbox'
      && (t.scheduled_date ?? null) === dateStr
      && !!t.completed_at === completed);
    return list.length ? Math.max(...list.map((t) => t.position ?? 0)) + 1 : 0;
  };

  const windowOf = (dateStr) => {
    const custom = dayHours[dateStr];
    return {
      start: (custom?.start ?? DEFAULT_DAY_START_HOUR) * 60,
      end: (custom?.end ?? DEFAULT_DAY_END_HOUR) * 60,
    };
  };

  const menuActions = {
    open: (task) => setEditingEvent(taskToEvent(task)),
    toggle: (task) => onToggle(task),
    color: (task, c) => updateTask(task.id, { text_color: c }),
    setTiming: (task, s, e) => updateTiming(task.id, s, e),
    /** Today's slot starting at the present quarter hour, if today's timeline has room for it. */
    nowSlot: (length) => {
      const now = new Date();
      const date = toLocalDateString(now);
      const win = windowOf(date);
      const start = snap15(now.getHours() * 60 + now.getMinutes());
      if (start < win.start || start + MIN_DURATION > win.end) return null;
      return { date, start, end: Math.min(win.end, start + length) };
    },
    startAt: (task, slot) => updateTask(task.id, {
      scheduled_time: minToTimeStr(slot.start),
      scheduled_end_time: minToTimeStr(slot.end),
      ...(slot.date !== task.scheduled_date
        ? { scheduled_date: slot.date, position: nextPositionIn(slot.date, !!task.completed_at) }
        : null),
    }),
    // A day of its own keeps the time of day the block had.
    moveToDate: (task, dateStr) => {
      if (!dateStr || dateStr === task.scheduled_date) return;
      updateTask(task.id, { scheduled_date: dateStr, position: nextPositionIn(dateStr, !!task.completed_at) });
    },
    clearTime: (task) => updateTask(task.id, { scheduled_time: null, scheduled_end_time: null }),
    toNoDate: (task) => updateTask(task.id, {
      scheduled_date: null,
      scheduled_time: null,
      scheduled_end_time: null,
      position: nextPositionIn(null, !!task.completed_at),
    }),
    // The copy takes the next slot of the same length, subtasks and all, or
    // the same one when the day ends first. It starts out not done.
    duplicate: async (task, windowEnd) => {
      const s = timeStrToMin(task.scheduled_time);
      const e = task.scheduled_end_time ? timeStrToMin(task.scheduled_end_time) : s + 60;
      const fits = e + (e - s) <= windowEnd;
      const copy = await addTask({
        title: task.title,
        text_color: task.text_color,
        top_style: task.top_style ?? 0,
        list_type: 'inbox',
        scheduled_date: task.scheduled_date,
        scheduled_time: minToTimeStr(fits ? e : s),
        scheduled_end_time: minToTimeStr(fits ? e + (e - s) : e),
        position: nextPositionIn(task.scheduled_date, false),
      });
      const copyChildren = async (fromId, toId) => {
        for (const st of getSubtasks(fromId)) {
          const made = await addTask({
            title: st.title,
            text_color: st.text_color,
            top_style: st.top_style ?? 0,
            list_type: 'inbox',
            scheduled_date: task.scheduled_date,
            parent_id: toId,
            position: st.position ?? 0,
          });
          if (made?.id) await copyChildren(st.id, made.id);
        }
      };
      if (copy?.id) await copyChildren(task.id, copy.id);
    },
    remove: (task) => deleteTask(task.id),
  };

  const openEventMenu = (e, task, windowStart, windowEnd) => {
    setEventMenu({ taskId: task.id, x: e.clientX, y: e.clientY, windowStart, windowEnd });
  };

  // One day on screen leaves room under its list for the tasks that still
  // wait for a date, so they can be dragged into it. Those done on the day can
  // go to the day's completed list instead of one of their own.
  const noDateShown = days.length === 1 && showNoDate;
  const noDateDone = noDateShown && noDateInCompleted;
  const noDateList = noDateShown ? (
    <NoDateList
      tasks={tasks}
      className="no-date-list--calendar"
      collapseKey="no_date_calendar"
      visible
      onToggle={onToggle}
      onUpdate={updateTask}
      onDelete={deleteTask}
      onAddSubtask={onAddSubtask}
      onAddAtStart={onAddTaskAt}
      onTaskContextMenu={onTaskContextMenu}
      editingTaskId={editingTaskId}
      onEditingTaskConsumed={onEditingTaskConsumed}
      onCreateSiblingTask={onCreateSiblingTask}
      onCreateSiblingSubtask={onCreateSiblingSubtask}
      onCreateSubtaskAndEdit={onCreateSubtaskAndEdit}
      completedVisible={completedVisible && !noDateDone}
      getListCollapsed={getListCollapsed}
      setListCollapsed={setListCollapsed}
    />
  ) : null;

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
              reputationInCompleted={reputationInCompleted}
              onUpdateReputation={onUpdateReputation}
              onDeleteReputation={onDeleteReputation}
              onUpdateTiming={updateTiming}
              onOpenModal={setEditingEvent}
              onAddTaskAt={onAddTaskAt}
              onSetHours={setDayHours}
              onResetHours={resetDayHours}
              taskHandlers={taskHandlers}
              onEventMenu={openEventMenu}
              noDateList={noDateList}
              noDateDone={noDateDone}
            />
          );
        })}
      </div>

      {menuTask && (
        <EventContextMenu
          menu={eventMenu}
          task={menuTask}
          actions={menuActions}
          onClose={() => setEventMenu(null)}
        />
      )}

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
