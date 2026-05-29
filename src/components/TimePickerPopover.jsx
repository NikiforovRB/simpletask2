import { useEffect, useState } from 'react';
import { REMINDER_OPTIONS, formatTimeHHMM, requestNotificationPermission, notificationPermission } from '../lib/reminders';
import './TimePickerPopover.css';

/**
 * Popover for picking a task's time-of-day and a reminder offset. Mirrors the
 * calendar popover's visual language. Calls `onChange({ time, reminder })` on
 * apply and `onClear()` to remove the time entirely.
 */
export function TimePickerPopover({ value, reminder, onChange, onClear, onClose }) {
  const [time, setTime] = useState(formatTimeHHMM(value) || '09:00');
  const [rem, setRem] = useState(reminder ?? null);
  const [permDenied, setPermDenied] = useState(false);

  useEffect(() => {
    setTime(formatTimeHHMM(value) || '09:00');
    setRem(reminder ?? null);
  }, [value, reminder]);

  const apply = async () => {
    // Only ask for notification permission when an actual reminder is chosen.
    if (rem != null) {
      if (notificationPermission() === 'default') {
        const result = await requestNotificationPermission();
        if (result === 'denied') setPermDenied(true);
      } else if (notificationPermission() === 'denied') {
        setPermDenied(true);
      }
    }
    onChange({ time, reminder: rem });
    onClose?.();
  };

  return (
    <div className="time-popover" onMouseDown={(e) => e.stopPropagation()}>
      <div className="time-popover__section-label">Время</div>
      <div className="time-popover__time-row">
        <input
          type="time"
          className="time-popover__time-input"
          value={time}
          step="300"
          onChange={(e) => setTime(e.target.value)}
          autoFocus
        />
        {(value || reminder != null) && (
          <button
            type="button"
            className="time-popover__time-clear"
            onClick={() => { onClear?.(); onClose?.(); }}
            aria-label="Убрать время"
            title="Убрать время"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
              <path d="M3.5 3.5l7 7M10.5 3.5l-7 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>

      <div className="time-popover__section-label">Напоминание</div>
      <div className="time-popover__reminders">
        {REMINDER_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={`time-popover__rem-chip ${rem === opt.value ? 'time-popover__rem-chip--active' : ''}`}
            onClick={() => setRem(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {permDenied && (
        <div className="time-popover__hint">
          Уведомления заблокированы в браузере — напоминание не сработает, пока вы их не разрешите.
        </div>
      )}

      <div className="time-popover__actions">
        <button type="button" className="time-popover__apply" onClick={apply}>
          Готово
        </button>
      </div>
    </div>
  );
}
