import { useState } from 'react';
import './CalendarPopover.css';

const MONTHS_RU = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const WEEKDAY = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];

export function CalendarPopover({ value, onChange, onClose }) {
  const d = value ? new Date(value + 'T12:00:00') : new Date();
  const [year, setYear] = useState(d.getFullYear());
  const [month, setMonth] = useState(d.getMonth());

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startPad = (firstDay.getDay() + 6) % 7;
  const daysInMonth = lastDay.getDate();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const cells = [];
  for (let i = 0; i < startPad; i++) cells.push(null);
  for (let i = 1; i <= daysInMonth; i++) cells.push(i);

  const pick = (day) => {
    const date = new Date(year, month, day);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    onChange(`${y}-${m}-${d}`);
    onClose();
  };

  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear((y) => y - 1); }
    else setMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setMonth(0); setYear((y) => y + 1); }
    else setMonth((m) => m + 1);
  };

  return (
    <div className="calendar-popover">
      <div className="calendar-popover__nav">
        <button type="button" className="calendar-popover__nav-btn" onClick={prevMonth}>←</button>
        <span className="calendar-popover__title">{MONTHS_RU[month]} {year}</span>
        <button type="button" className="calendar-popover__nav-btn" onClick={nextMonth}>→</button>
      </div>
      <div className="calendar-popover__weekdays">
        {WEEKDAY.map((w) => (
          <span key={w} className="calendar-popover__wd">{w}</span>
        ))}
      </div>
      <div className="calendar-popover__grid">
        {cells.map((day, i) => {
          if (day === null) return <span key={`e-${i}`} className="calendar-popover__cell" />;
          const date = new Date(year, month, day);
          date.setHours(0, 0, 0, 0);
          const isToday = date.getTime() === today.getTime();
          return (
            <button
              key={day}
              type="button"
              className={`calendar-popover__cell ${isToday ? 'calendar-popover__cell--today' : ''}`}
              onClick={() => pick(day)}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}
