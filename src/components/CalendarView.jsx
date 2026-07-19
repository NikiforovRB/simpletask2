import { useEffect, useReducer, useRef, useState } from 'react';
import { toLocalDateString, formatDayLabel, TASK_COLORS } from '../constants';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { CalendarPopover } from './CalendarPopover';
import plusIcon from '../assets/plus.svg';
import plusNavIcon from '../assets/plus-nav.svg';
import editIcon from '../assets/edit.svg';
import editNavIcon from '../assets/edit-nav.svg';
import deleteIcon from '../assets/delete.svg';
import deleteNavIcon from '../assets/delete-nav.svg';
import './CalendarView.css';

const BASE_HOUR_HEIGHT = 48; // px per hour at 1x
const SNAP = 15; // minutes
const MIN_DURATION = 15;
const DEFAULT_EVENT_COLOR = '#5a86ee';

const snap15 = (m) => Math.round(m / SNAP) * SNAP;
const pad = (n) => String(n).padStart(2, '0');
const fmtMinutes = (min) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
const hhmmToMinutes = (s) => {
  const [h, m] = String(s || '').split(':').map(Number);
  if (Number.isNaN(h)) return null;
  return h * 60 + (m || 0);
};
const formatEventDate = (dateStr) => {
  const d = new Date(`${dateStr}T12:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  const dm = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
  const wd = d.toLocaleDateString('ru-RU', { weekday: 'short' });
  return `${dm}, ${wd}`;
};

function EventModal({ event, onClose, onSave, onDelete }) {
  const isNew = !event.id;
  const initialHasTime = !event.all_day && event.start_minute != null;
  const [title, setTitle] = useState(event.title || '');
  const [date, setDate] = useState(event.event_date);
  const [hasTime, setHasTime] = useState(initialHasTime);
  const [start, setStart] = useState(event.start_minute ?? 9 * 60);
  const [end, setEnd] = useState(event.end_minute ?? 10 * 60);
  const [color, setColor] = useState(event.color || DEFAULT_EVENT_COLOR);
  const [dateOpen, setDateOpen] = useState(false);

  const save = () => {
    const patch = {
      title: title.trim(),
      event_date: date,
      color,
      all_day: !hasTime,
      start_minute: hasTime ? start : null,
      end_minute: hasTime ? Math.max(start + MIN_DURATION, end) : null,
    };
    onSave(patch);
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

function AllDayItem({ event, onUpdate, onDelete, onOpenModal }) {
  const [title, setTitle] = useState(event.title || '');
  const [hover, setHover] = useState(false);
  const [editHover, setEditHover] = useState(false);
  const [delHover, setDelHover] = useState(false);
  const hasHover = useMediaQuery('(hover: hover)');

  useEffect(() => {
    setTitle(event.title || '');
  }, [event.title]);

  const commit = () => {
    const t = title.trim();
    if (t !== (event.title || '')) onUpdate(event.id, { title: t });
  };

  const done = !!event.completed;

  return (
    <div
      className="calendar-allday__item"
      style={{ '--ev-color': event.color || DEFAULT_EVENT_COLOR }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <button
        type="button"
        className={`calendar-allday__check${done ? ' calendar-allday__check--done' : ''}`}
        onClick={() => onUpdate(event.id, { completed: !done })}
        aria-label={done ? 'Снять отметку' : 'Выполнено'}
      >
        {done && (
          <svg width="10" height="10" viewBox="0 0 16 16" aria-hidden>
            <path d="M3 8.5l3 3 7-7" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
      <input
        className={`calendar-allday__input${done ? ' calendar-allday__input--done' : ''}`}
        style={{ color: event.color || DEFAULT_EVENT_COLOR }}
        value={title}
        placeholder="Задача без времени"
        onChange={(e) => setTitle(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.currentTarget.blur(); } }}
      />
      {hover && (
        <>
          <button
            type="button"
            className="calendar-allday__iconbtn"
            onMouseEnter={() => hasHover && setEditHover(true)}
            onMouseLeave={() => hasHover && setEditHover(false)}
            onClick={() => onOpenModal(event)}
            aria-label="Редактировать"
          >
            <img src={hasHover && editHover ? editNavIcon : editIcon} alt="" />
          </button>
          <button
            type="button"
            className="calendar-allday__iconbtn"
            onMouseEnter={() => hasHover && setDelHover(true)}
            onMouseLeave={() => hasHover && setDelHover(false)}
            onClick={() => onDelete(event.id)}
            aria-label="Удалить"
          >
            <img src={hasHover && delHover ? deleteNavIcon : deleteIcon} alt="" />
          </button>
        </>
      )}
    </div>
  );
}

function CalendarDayColumn({ date, events, startHour, endHour, hourHeight, now, onUpdateEvent, onDeleteEvent, onOpenModal }) {
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

  const allDayEvents = events.filter((e) => e.event_date === dateStr && e.all_day);
  const timedEvents = events.filter(
    (e) => e.event_date === dateStr && !e.all_day && e.start_minute != null && e.end_minute != null,
  );

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
        onOpenModal({ event_date: dateStr, all_day: false, start_minute: s, end_minute: e2, title: '', color: DEFAULT_EVENT_COLOR });
      } else if (d.type === 'move') {
        if (!d.moved) {
          const ev = timedEvents.find((x) => x.id === d.id);
          if (ev) onOpenModal(ev);
        } else {
          onUpdateEvent(d.id, { start_minute: d.start, end_minute: d.end });
        }
      } else if (d.type === 'resize-top') {
        onUpdateEvent(d.id, { start_minute: d.start });
      } else if (d.type === 'resize-bottom') {
        onUpdateEvent(d.id, { end_minute: d.end });
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

  const handleAdd = () => {
    onOpenModal({ event_date: dateStr, all_day: true, title: '', color: DEFAULT_EVENT_COLOR });
  };

  return (
    <section className="calendar-day">
      <div className="calendar-day__header">
        <span className="calendar-day__title">{formatDayLabel(dateStr)}</span>
        <button
          type="button"
          className="calendar-day__add"
          onMouseEnter={() => hasHover && setPlusHover(true)}
          onMouseLeave={() => hasHover && setPlusHover(false)}
          onClick={handleAdd}
          aria-label="Добавить задачу"
        >
          <img src={hasHover && plusHover ? plusNavIcon : plusIcon} alt="" />
        </button>
      </div>

      {allDayEvents.length > 0 && (
        <div className="calendar-day__allday">
          {allDayEvents.map((ev) => (
            <AllDayItem key={ev.id} event={ev} onUpdate={onUpdateEvent} onDelete={onDeleteEvent} onOpenModal={onOpenModal} />
          ))}
        </div>
      )}

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
              className="calendar-event"
              style={{ top, height, '--ev-color': ev.color || DEFAULT_EVENT_COLOR }}
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

export function CalendarView({ days, events, startHour, endHour, scale = 1, addEvent, updateEvent, deleteEvent }) {
  const [editingEvent, setEditingEvent] = useState(null);
  const [now, setNow] = useState(() => new Date());
  const hourHeight = BASE_HOUR_HEIGHT * (scale || 1);

  // Refresh the "now" indicator every 5 minutes while this view is mounted.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 5 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const handleSave = (patch) => {
    if (editingEvent?.id) updateEvent(editingEvent.id, patch);
    else addEvent(patch);
  };

  return (
    <div className="calendar-view">
      <div className="calendar-view__days">
        {days.map((date) => (
          <CalendarDayColumn
            key={toLocalDateString(date)}
            date={date}
            events={events}
            startHour={startHour}
            endHour={endHour}
            hourHeight={hourHeight}
            now={now}
            onUpdateEvent={updateEvent}
            onDeleteEvent={deleteEvent}
            onOpenModal={setEditingEvent}
          />
        ))}
      </div>

      {editingEvent && (
        <EventModal
          event={editingEvent}
          onClose={() => setEditingEvent(null)}
          onSave={handleSave}
          onDelete={() => { if (editingEvent.id) deleteEvent(editingEvent.id); }}
        />
      )}
    </div>
  );
}
