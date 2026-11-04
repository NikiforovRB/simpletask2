import { useState } from 'react';
import { CalendarPopover } from './CalendarPopover';
import { REMIND_TIMES, dueInDays, formatReminder, shortDate, shortTime } from '../lib/kanbanCards';
import { notificationPermission, requestNotificationPermission } from '../lib/reminders';
import leftIcon from '../assets/left.svg';
import calendarIcon from '../assets/calendar.svg';
import './TaskTimePanel.css';

const DAYS = [
  { offset: 0, label: 'Сегодня' },
  { offset: 1, label: 'Завтра' },
  { offset: 2, label: 'Послезавтра' },
];

/**
 * The reminder of a card: a day and, if it matters, a time. With a time the
 * app also sends a notification, so that is when it asks for the permission.
 * `onBack` is given inside the context menu, which the picker stands in for.
 */
export function KanbanReminderPicker({ date, time, onApply, onClear, onBack }) {
  const [day, setDay] = useState(date || dueInDays(0));
  const [at, setAt] = useState(shortTime(time));
  const [pickerOpen, setPickerOpen] = useState(false);
  // A reminder that already has a time shows it; otherwise the time waits behind a button.
  const [timeOpen, setTimeOpen] = useState(!!time);

  const dayChips = DAYS.map((d) => ({ date: dueInDays(d.offset), label: d.label }));
  if (!dayChips.some((c) => c.date === day)) dayChips.push({ date: day, label: shortDate(day) });

  const apply = () => {
    if (at && notificationPermission() === 'default') requestNotificationPermission();
    onApply({ date: day, time: at || null });
  };

  return (
    <div
      className="task-time task-time--remind"
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

      {!timeOpen && (
        <button type="button" className="task-time__add" onClick={() => setTimeOpen(true)}>
          <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden>
            <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
          Добавить время
        </button>
      )}
      <div className={`task-time__reveal${timeOpen ? ' task-time__reveal--open' : ''}`} inert={!timeOpen}>
        <div className="task-time__reveal-inner">
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
            {REMIND_TIMES.map((t) => (
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
        </div>
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
