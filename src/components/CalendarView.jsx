import { useEffect, useReducer, useRef, useState } from 'react';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { toLocalDateString, formatDayLabel, TASK_COLORS, DEFAULT_TASK_COLOR } from '../constants';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { CalendarPopover } from './CalendarPopover';
import { SortableTask } from './SortableTask';
import { DropSlot } from './DropSlot';
import { getContainerId } from '../lib/dnd';
import plusIcon from '../assets/plus.svg';
import plusNavIcon from '../assets/plus-nav.svg';
import './CalendarView.css';

const BASE_HOUR_HEIGHT = 48; // px per hour at 1x
const SNAP = 15; // minutes
const MIN_DURATION = 15;

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

function CalendarDayColumn({
  date, tasks, startHour, endHour, hourHeight, now,
  onUpdateTiming, onOpenModal, onAddTaskAt, taskHandlers,
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

  const noTimeTasks = tasks
    .filter((t) => !t.parent_id && !t.completed_at && t.scheduled_date === dateStr && (t.list_type || 'inbox') === 'inbox' && !t.scheduled_time)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

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
    e.preventDefault();
    const startMin = clientYToMinute(e.clientY);
    dragRef.current = { type: 'create', start: startMin, end: startMin, moved: false };
    setDragging(true);
    forceTick();
  };

  const beginMove = (e, ev) => {
    e.stopPropagation();
    dragRef.current = { type: 'move', id: ev.id, anchor: clientYToMinute(e.clientY), origStart: ev.start_minute, origEnd: ev.end_minute, start: ev.start_minute, end: ev.end_minute, moved: false };
    setDragging(true);
    forceTick();
  };

  const beginResize = (e, ev, edge) => {
    e.stopPropagation();
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

  return (
    <section className="calendar-day">
      <div className="calendar-day__header">
        <span className="calendar-day__title">{formatDayLabel(dateStr)}</span>
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

      <ul className="calendar-day__notime">
        <SortableContext items={noTimeTasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {noTimeTasks.map((task, i) => (
            <li key={task.id}>
              <DropSlot id={containerId} index={i} />
              <SortableTask
                task={task}
                containerId={containerId}
                subtasks={taskHandlers.getSubtasks(task.id)}
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
            </li>
          ))}
          <li><DropSlot id={containerId} index={noTimeTasks.length} /></li>
        </SortableContext>
      </ul>

      <div className="calendar-day__timeline" ref={timelineRef} style={{ height: timelineHeight }} onPointerDown={beginTimelineCreate}>
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
          const top = (s - dayStartMin) * pxPerMin;
          const height = Math.max(MIN_DURATION * pxPerMin, (e2 - s) * pxPerMin);
          return (
            <div
              key={ev.id}
              className={`calendar-event${ev.completed ? ' calendar-event--done' : ''}`}
              style={{ top, height, '--ev-color': ev.color }}
              onPointerDown={(e) => beginMove(e, ev)}
            >
              <div className="calendar-event__resize calendar-event__resize--top" onPointerDown={(e) => beginResize(e, ev, 'top')} />
              <div className="calendar-event__body">
                <span className="calendar-event__label">
                  <span className="calendar-event__time">{fmtMinutes(s)}–{fmtMinutes(e2)}</span>
                  {ev.title ? <> • {ev.title}</> : null}
                </span>
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
      </div>
    </section>
  );
}

export function CalendarView({
  days, tasks, startHour, endHour, scale = 1,
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
        {days.map((date) => (
          <CalendarDayColumn
            key={toLocalDateString(date)}
            date={date}
            tasks={tasks}
            startHour={startHour}
            endHour={endHour}
            hourHeight={hourHeight}
            now={now}
            onUpdateTiming={updateTiming}
            onOpenModal={setEditingEvent}
            onAddTaskAt={onAddTaskAt}
            taskHandlers={taskHandlers}
          />
        ))}
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
