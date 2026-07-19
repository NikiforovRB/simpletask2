import { useEffect, useReducer, useRef, useState } from 'react';
import { toLocalDateString, formatDayLabel, TASK_COLORS } from '../constants';
import './CalendarView.css';

const HOUR_HEIGHT = 48; // px per hour
const SNAP = 15; // minutes
const PX_PER_MIN = HOUR_HEIGHT / 60;
const MIN_DURATION = 15;

const snap15 = (m) => Math.round(m / SNAP) * SNAP;
const pad = (n) => String(n).padStart(2, '0');
const fmtMinutes = (min) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
const hhmmToMinutes = (s) => {
  const [h, m] = String(s || '').split(':').map(Number);
  if (Number.isNaN(h)) return null;
  return h * 60 + (m || 0);
};

function EventModal({ event, onClose, onSave, onDelete }) {
  const [title, setTitle] = useState(event.title || '');
  const [date, setDate] = useState(event.event_date);
  const [allDay, setAllDay] = useState(!!event.all_day);
  const [start, setStart] = useState(event.start_minute ?? 9 * 60);
  const [end, setEnd] = useState(event.end_minute ?? 10 * 60);
  const [color, setColor] = useState(event.color || '#5a86ee');

  const save = () => {
    const patch = {
      title: title.trim(),
      event_date: date,
      all_day: allDay,
      color,
      start_minute: allDay ? null : start,
      end_minute: allDay ? null : Math.max(start + MIN_DURATION, end),
    };
    onSave(patch);
    onClose();
  };

  return (
    <div className="dashboard__settings-overlay" onClick={onClose}>
      <div className="dashboard__settings-popup calendar-modal" onClick={(e) => e.stopPropagation()}>
        <div className="dashboard__settings-title">Задача</div>
        <input
          type="text"
          className="dashboard__settings-input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Название"
          autoFocus
          onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
        />

        <label className="calendar-modal__row calendar-modal__toggle">
          <span>Весь день (без времени)</span>
          <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
        </label>

        <label className="calendar-modal__row">
          <span className="calendar-modal__label">Дата</span>
          <input
            type="date"
            className="dashboard__settings-input calendar-modal__field"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>

        {!allDay && (
          <div className="calendar-modal__times">
            <label className="calendar-modal__row">
              <span className="calendar-modal__label">Начало</span>
              <input
                type="time"
                step="900"
                className="dashboard__settings-input calendar-modal__field"
                value={fmtMinutes(start)}
                onChange={(e) => {
                  const m = hhmmToMinutes(e.target.value);
                  if (m != null) setStart(m);
                }}
              />
            </label>
            <label className="calendar-modal__row">
              <span className="calendar-modal__label">Конец</span>
              <input
                type="time"
                step="900"
                className="dashboard__settings-input calendar-modal__field"
                value={fmtMinutes(end)}
                onChange={(e) => {
                  const m = hhmmToMinutes(e.target.value);
                  if (m != null) setEnd(m);
                }}
              />
            </label>
          </div>
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
          <button type="button" className="dashboard__settings-delete" onClick={() => { onDelete(); onClose(); }}>Удалить</button>
        </div>
      </div>
    </div>
  );
}

function AllDayItem({ event, onUpdate, onDelete }) {
  const [title, setTitle] = useState(event.title || '');
  const [hover, setHover] = useState(false);

  useEffect(() => {
    setTitle(event.title || '');
  }, [event.title]);

  const commit = () => {
    const t = title.trim();
    if (t !== (event.title || '')) onUpdate(event.id, { title: t });
  };

  return (
    <div
      className="calendar-allday__item"
      style={{ '--ev-color': event.color || '#5a86ee' }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <span className="calendar-allday__dot" aria-hidden />
      <input
        className="calendar-allday__input"
        value={title}
        placeholder="Задача без времени"
        onChange={(e) => setTitle(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.currentTarget.blur(); } }}
      />
      {hover && (
        <button type="button" className="calendar-allday__del" onClick={() => onDelete(event.id)} aria-label="Удалить">×</button>
      )}
    </div>
  );
}

function CalendarDayColumn({ date, events, startHour, endHour, onAddEvent, onUpdateEvent, onDeleteEvent, onOpenModal }) {
  const dateStr = toLocalDateString(date);
  const dayStartMin = startHour * 60;
  const dayEndMin = endHour * 60;
  const timelineHeight = (dayEndMin - dayStartMin) * PX_PER_MIN;

  const timelineRef = useRef(null);
  const dragRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [, forceTick] = useReducer((x) => x + 1, 0);

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
    const m = snap15(dayStartMin + y / PX_PER_MIN);
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
        onAddEvent({ event_date: dateStr, all_day: false, start_minute: s, end_minute: e2 })
          .then((created) => { if (created) onOpenModal(created); });
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
  for (let h = startHour; h <= endHour; h++) {
    hourLines.push(h);
  }

  const drag = dragRef.current;

  // "now" indicator for today
  const now = new Date();
  const isToday = toLocalDateString(now) === dateStr;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const showNow = isToday && nowMin >= dayStartMin && nowMin <= dayEndMin;

  const handleAddAllDay = () => {
    onAddEvent({ event_date: dateStr, all_day: true, title: '' });
  };

  return (
    <section className="calendar-day">
      <div className="calendar-day__header">{formatDayLabel(dateStr)}</div>

      <div className="calendar-day__allday">
        {allDayEvents.map((ev) => (
          <AllDayItem key={ev.id} event={ev} onUpdate={onUpdateEvent} onDelete={onDeleteEvent} />
        ))}
        <button type="button" className="calendar-day__allday-add" onClick={handleAddAllDay}>
          + задача без времени
        </button>
      </div>

      <div className="calendar-day__timeline" ref={timelineRef} style={{ height: timelineHeight }} onPointerDown={beginTimelineCreate}>
        {hourLines.map((h) => (
          <div key={h} className="calendar-hour" style={{ top: (h * 60 - dayStartMin) * PX_PER_MIN }}>
            <span className="calendar-hour__label">{pad(h)}:00</span>
            <span className="calendar-hour__line" aria-hidden />
          </div>
        ))}

        {showNow && (
          <div className="calendar-now" style={{ top: (nowMin - dayStartMin) * PX_PER_MIN }} aria-hidden />
        )}

        {timedEvents.map((ev) => {
          const isDragged = drag && drag.id === ev.id;
          const s = isDragged ? drag.start : ev.start_minute;
          const e2 = isDragged ? drag.end : ev.end_minute;
          const top = (s - dayStartMin) * PX_PER_MIN;
          const height = Math.max(MIN_DURATION * PX_PER_MIN, (e2 - s) * PX_PER_MIN);
          return (
            <div
              key={ev.id}
              className="calendar-event"
              style={{ top, height, '--ev-color': ev.color || '#5a86ee' }}
              onPointerDown={(e) => beginMove(e, ev)}
            >
              <div className="calendar-event__resize calendar-event__resize--top" onPointerDown={(e) => beginResize(e, ev, 'top')} />
              <div className="calendar-event__body">
                <span className="calendar-event__time">{fmtMinutes(s)}–{fmtMinutes(e2)}</span>
                <span className="calendar-event__title">{ev.title || 'Без названия'}</span>
              </div>
              <div className="calendar-event__resize calendar-event__resize--bottom" onPointerDown={(e) => beginResize(e, ev, 'bottom')} />
            </div>
          );
        })}

        {drag && drag.type === 'create' && (() => {
          const s = Math.min(drag.start, drag.end);
          const e2 = Math.max(drag.start, drag.end);
          const top = (s - dayStartMin) * PX_PER_MIN;
          const height = Math.max(4, (e2 - s) * PX_PER_MIN);
          return <div className="calendar-event calendar-event--preview" style={{ top, height }} />;
        })()}
      </div>
    </section>
  );
}

export function CalendarView({ days, events, startHour, endHour, addEvent, updateEvent, deleteEvent }) {
  const [editingEvent, setEditingEvent] = useState(null);

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
            onAddEvent={addEvent}
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
          onSave={(patch) => updateEvent(editingEvent.id, patch)}
          onDelete={() => deleteEvent(editingEvent.id)}
        />
      )}
    </div>
  );
}
