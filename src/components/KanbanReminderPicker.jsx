import { useState } from 'react';
import { CalendarPopover } from './CalendarPopover';
import { dueInDays, formatReminder, shortTime } from '../lib/kanbanCards';
import { notificationPermission, requestNotificationPermission } from '../lib/reminders';
import leftIcon from '../assets/left.svg';
import calendarIcon from '../assets/calendar.svg';
import './TaskTimePanel.css';

const DAYS = [
  { offset: 0, label: 'Сегодня' },
  { offset: 1, label: 'Завтра' },
  { offset: 2, label: 'Послезавтра' },
];
const TIMES = ['09:00', '12:00', '15:00', '18:00', '21:00'];

const shortDate = (dateStr) => new Date(`${dateStr}T12:00:00`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });

/**
 * The reminder of a card: a day and, if it matters, a time. With a time the
 * app also sends a notification, so that is when it asks for the permission.
 * `onBack` is given inside the context menu, which the picker stands in for.
 */
export function KanbanReminderPicker({ date, time, onApply, onClear, onBack }) {
  const [day, setDay] = useState(date || dueInDays(0));
  const [at, setAt] = useState(shortTime(time));
  const [pickerOpen, setPickerOpen] = useState(false);

  const dayChips = DAYS.map((d) => ({ date: dueInDays(d.offset), label: d.label }));
  if (!dayChips.some((c) => c.date === day)) dayChips.push({ date: day, label: shortDate(day) });

  const apply = () => {
    if (at && notificationPermission() === 'default') requestNotificationPermission();
    onApply({ date: day, time: at || null });
  };

  return (
    <div
      className="task-time"
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); apply(); }
      }}
    >
      <div className="task-time__head">
        {onBack && (
          <button type="button" className="task-time__back" onClick={onBack} aria-label="Назад" title="Назад">
            <img src={leftIcon} alt="" />
          </button>
        )}
        <span className="task-time__title">Напоминание</span>
      </div>

      <div className="task-time__label">День</div>
      <div className="task-time__chips">
        {dayChips.map((c) => (
          <button
            key={c.date}
            type="button"
            className={`task-time__chip${c.date === day ? ' task-time__chip--on' : ''}`}
            onClick={() => { setDay(c.date); setPickerOpen(false); }}
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
          <CalendarPopover value={day} onChange={setDay} onClose={() => setPickerOpen(false)} />
        </div>
      )}

      <div className="task-time__label">Время</div>
      <div className="task-time__times">
        <input
          type="time"
          step={300}
          className="task-time__input"
          value={at}
          onChange={(e) => setAt(e.target.value)}
          aria-label="Время"
        />
      </div>
      <div className="task-time__chips">
        <button
          type="button"
          className={`task-time__chip${!at ? ' task-time__chip--on' : ''}`}
          onClick={() => setAt('')}
        >
          Без времени
        </button>
        {TIMES.map((t) => (
          <button
            key={t}
            type="button"
            className={`task-time__chip${at === t ? ' task-time__chip--on' : ''}`}
            onClick={() => setAt(t)}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="task-time__actions">
        <button type="button" className="task-time__apply" onClick={apply} title={formatReminder(day, at)}>
          Напомнить
        </button>
        {onClear && (
          <button type="button" className="task-time__clear" onClick={onClear}>
            Убрать напоминание
          </button>
        )}
      </div>
    </div>
  );
}
