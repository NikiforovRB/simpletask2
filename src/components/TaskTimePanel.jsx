import { useState } from 'react';
import { CalendarPopover } from './CalendarPopover';
import { toLocalDateString } from '../constants';
import leftIcon from '../assets/left.svg';
import calendarIcon from '../assets/calendar.svg';
import './TaskTimePanel.css';

const STEP = 15;
const DAY_END = 24 * 60;
const DURATIONS = [15, 30, 60, 90, 120];
const DAY_NAMES = ['Сегодня', 'Завтра', 'Послезавтра'];

const pad = (n) => String(n).padStart(2, '0');
const fmt = (min) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
// Accepts both "HH:MM" from the inputs and Postgres "HH:MM:SS".
const parse = (s) => {
  const [h, m] = String(s || '').split(':').map(Number);
  return Number.isNaN(h) ? null : h * 60 + (m || 0);
};
const fmtSpan = (min) => (min < 60 ? `${min} мин` : `${String(min / 60).replace('.', ',')} ч`);
const dayFromToday = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return toLocalDateString(d);
};
const shortDate = (dateStr) => new Date(`${dateStr}T12:00:00`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });

/** The task's own slot, or an hour from the next quarter today (from 9:00 on another day). */
function initialSlot(task, fallbackDate) {
  const date = task.scheduled_date || fallbackDate || dayFromToday(0);
  const ownStart = parse(task.scheduled_time);
  if (ownStart != null) {
    const ownEnd = parse(task.scheduled_end_time);
    return { date, start: ownStart, end: ownEnd != null && ownEnd > ownStart ? ownEnd : Math.min(DAY_END, ownStart + 60) };
  }
  let start = 9 * 60;
  if (date === dayFromToday(0)) {
    const now = new Date();
    start = Math.ceil((now.getHours() * 60 + now.getMinutes()) / STEP) * STEP;
  }
  start = Math.min(start, DAY_END - 60);
  return { date, start, end: start + 60 };
}

/**
 * The time of a task picked from its context menu: the day, the start and the
 * end. Moving the start keeps the length; the chips set the length from it.
 */
export function TaskTimePanel({ task, defaultDate, onApply, onClearTime, onBack }) {
  const [initial] = useState(() => initialSlot(task, defaultDate));
  const [date, setDate] = useState(initial.date);
  const [start, setStart] = useState(initial.start);
  const [end, setEnd] = useState(initial.end);
  const [pickerOpen, setPickerOpen] = useState(false);

  const dayChips = DAY_NAMES.map((label, i) => ({ date: dayFromToday(i), label }));
  if (!dayChips.some((c) => c.date === date)) dayChips.push({ date, label: shortDate(date) });

  // "00:00" as the end reads as midnight, the end of the day.
  const finalEnd = end > start ? end : (end === 0 ? DAY_END : Math.min(DAY_END, start + 60));
  const span = finalEnd - start;

  const changeStart = (value) => {
    const m = parse(value);
    if (m == null) return;
    const s = Math.min(m, DAY_END - STEP);
    setStart(s);
    setEnd(Math.min(DAY_END, s + Math.max(STEP, span)));
  };

  const changeEnd = (value) => {
    const m = parse(value);
    if (m != null) setEnd(m);
  };

  const apply = () => onApply({ date, start, end: Math.max(start + STEP, finalEnd) });

  return (
    <div
      className="task-time"
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); apply(); }
      }}
    >
      <div className="task-time__head">
        <button type="button" className="task-time__back" onClick={onBack} aria-label="Назад" title="Назад">
          <img src={leftIcon} alt="" />
        </button>
        <span className="task-time__title">Назначить время</span>
      </div>

      <div className="task-time__label">День</div>
      <div className="task-time__chips">
        {dayChips.map((c) => (
          <button
            key={c.date}
            type="button"
            className={`task-time__chip${c.date === date ? ' task-time__chip--on' : ''}`}
            onClick={() => { setDate(c.date); setPickerOpen(false); }}
          >
            {c.label}
          </button>
        ))}
        <button
          type="button"
          className={`task-time__chip task-time__chip--icon${pickerOpen ? ' task-time__chip--on' : ''}`}
          onClick={() => setPickerOpen((v) => !v)}
          aria-label="Другая дата"
          title="Другая дата"
        >
          <img src={calendarIcon} alt="" />
        </button>
      </div>
      {pickerOpen && (
        <div className="task-time__picker">
          <CalendarPopover value={date} onChange={setDate} onClose={() => setPickerOpen(false)} />
        </div>
      )}

      <div className="task-time__label">Время</div>
      <div className="task-time__times">
        <input
          type="time"
          step={STEP * 60}
          className="task-time__input"
          value={fmt(start)}
          onChange={(e) => changeStart(e.target.value)}
          aria-label="Начало"
          autoFocus
        />
        <span className="task-time__dash">–</span>
        <input
          type="time"
          step={STEP * 60}
          className="task-time__input"
          value={fmt(end % DAY_END)}
          onChange={(e) => changeEnd(e.target.value)}
          aria-label="Конец"
        />
      </div>
      <div className="task-time__chips">
        {DURATIONS.map((d) => (
          <button
            key={d}
            type="button"
            className={`task-time__chip${span === d ? ' task-time__chip--on' : ''}`}
            disabled={start + d > DAY_END}
            onClick={() => setEnd(start + d)}
          >
            {fmtSpan(d)}
          </button>
        ))}
      </div>

      <div className="task-time__actions">
        <button type="button" className="task-time__apply" onClick={apply}>
          Назначить · {fmt(start)}–{fmt(Math.max(start + STEP, finalEnd))}
        </button>
        {onClearTime && (
          <button type="button" className="task-time__clear" onClick={onClearTime}>
            Убрать время
          </button>
        )}
      </div>
    </div>
  );
}
