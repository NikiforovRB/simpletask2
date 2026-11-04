import { useEffect, useMemo, useState } from 'react';
import { CalendarPopover } from './CalendarPopover';
import { ReminderTime } from './KanbanReminderPicker';
import { MONTH_GENITIVE_RU, WEEKDAY_SHORT_RU, toLocalDateString } from '../constants';
import { useAutoGrow } from '../hooks/useAutoGrow';
import { dateColumnTitle, dueInDays, shortDate } from '../lib/kanbanCards';
import {
  clockOf, contactAction, doneByDay, enterSends, momentOf, shiftWeeks, weekOf,
} from '../lib/crm';
import { notificationPermission, requestNotificationPermission } from '../lib/reminders';
import leftIcon from '../assets/left.svg';
import rightIcon from '../assets/right.svg';
import calendarIcon from '../assets/calendar.svg';
import './TaskTimePanel.css';
import './KanbanCrm.css';

export const CheckGlyph = () => (
  <svg viewBox="0 0 16 16" aria-hidden>
    <path d="M3.5 8.5l3 3 6-6.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const PhoneGlyph = () => (
  <svg viewBox="0 0 24 24" aria-hidden>
    <path
      d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/** The mark of a messenger, or a handset for a plain call — in the colour of the text. */
export function MessengerIcon({ kind }) {
  if (kind === 'telegram') {
    return (
      <svg className="crm-icon" viewBox="1.5 2.5 21 19" aria-hidden>
        <path
          fill="currentColor"
          d="M21.9 4.3 18.7 19.4c-.2 1-.9 1.3-1.7.8l-4.7-3.5-2.3 2.2c-.3.3-.5.5-1 .5l.3-4.8 8.8-8c.4-.3-.1-.5-.6-.2L6.6 13.2 2 11.8c-1-.3-1-1 .2-1.5L20.6 3.2c.8-.3 1.6.2 1.3 1.1z"
        />
      </svg>
    );
  }
  if (kind === 'whatsapp') {
    return (
      <svg className="crm-icon" viewBox="4.8 4.8 14.4 14.4" aria-hidden>
        <path fill="currentColor" d="M12 5.2a6.8 6.8 0 0 0-5.86 10.25L5.2 18.8l3.45-.9A6.8 6.8 0 1 0 12 5.2zm0 12.4a5.6 5.6 0 0 1-2.86-.78l-.2-.12-2.05.54.55-2-.13-.21A5.6 5.6 0 1 1 12 17.6z" />
        <path fill="currentColor" d="M15.07 13.4c-.17-.08-1-.49-1.15-.55-.15-.06-.27-.08-.38.09-.11.17-.44.55-.54.66-.1.11-.2.13-.37.04a4.6 4.6 0 0 1-2.3-2c-.17-.3.17-.28.5-.93.05-.11.03-.2-.02-.29l-.52-1.25c-.14-.33-.28-.28-.38-.29h-.33a.63.63 0 0 0-.46.21 1.93 1.93 0 0 0-.6 1.44 3.36 3.36 0 0 0 .7 1.78 7.7 7.7 0 0 0 2.95 2.6c1.1.47 1.53.51 2.08.43.34-.05 1-.41 1.15-.81.14-.4.14-.74.1-.81-.04-.07-.15-.11-.32-.2z" />
      </svg>
    );
  }
  if (kind === 'max') {
    return (
      <svg className="crm-icon" viewBox="5.2 5.4 13.6 13.6" aria-hidden>
        <path d="M12 6.4a5.6 5.6 0 0 0-4.6 8.8l-.6 2.6 2.7-.7A5.6 5.6 0 1 0 12 6.4z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <span className="crm-icon crm-icon--phone">
      <PhoneGlyph />
    </span>
  );
}

/**
 * One press from the board to the client: the chat in their messenger, or a
 * call. Pressed inside a card it does not open the card or start a drag.
 */
export function ContactButton({ card, className = '' }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return undefined;
    const t = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(t);
  }, [copied]);
  const action = contactAction(card);
  if (!action) return null;
  return (
    <a
      className={`crm-contact-btn ${className}`}
      href={action.url}
      target={action.kind === 'phone' ? undefined : '_blank'}
      rel="noreferrer"
      title={action.title}
      aria-label={action.title}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        if (!action.copy) return;
        navigator.clipboard?.writeText(action.copy).catch(() => {});
        setCopied(true);
      }}
    >
      <MessengerIcon kind={action.kind} />
      {copied && <span className="crm-contact-btn__copied" role="status">Номер скопирован</span>}
    </a>
  );
}

/** The circle a reminder is ticked off by. `onPick` gets the circle, to anchor the form to. */
export function CrmCheck({ onPick, className = '' }) {
  return (
    <button
      type="button"
      className={`crm-check ${className}`}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onPick(e.currentTarget);
      }}
      aria-label="Выполнено"
      title="Выполнено"
    >
      <CheckGlyph />
    </button>
  );
}

const NEXT_DAYS = [
  { offset: 1, label: 'Завтра' },
  { offset: 2, label: 'Послезавтра' },
];

/**
 * Ticking a reminder off: what came of it, which goes into the history, and
 * when to get back to the client — or nothing, if there is no next time.
 */
export function CrmDoneForm({ initialNote = '', onSubmit, onBack }) {
  const [note, setNote] = useState(initialNote);
  const [next, setNext] = useState(null);
  const [at, setAt] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const noteRef = useAutoGrow(note);

  const chips = NEXT_DAYS.map((d) => ({ date: dueInDays(d.offset), label: d.label }));
  if (next && !chips.some((c) => c.date === next)) chips.push({ date: next, label: shortDate(next) });

  const submit = () => {
    if (next && at && notificationPermission() === 'default') requestNotificationPermission();
    onSubmit({ body: note.trim(), next: next ? { date: next, time: at || null } : null });
  };

  return (
    <div
      className="task-time crm-done"
      onKeyDown={(e) => {
        if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return;
        if (e.target.tagName === 'TEXTAREA' && !enterSends()) return;
        e.preventDefault();
        submit();
      }}
    >
      <div className="task-time__head">
        {onBack && (
          <button type="button" className="task-time__back" onClick={onBack} aria-label="Назад" title="Назад">
            <img src={leftIcon} alt="" />
          </button>
        )}
        <span className="task-time__title">Задача выполнена</span>
      </div>

      <textarea
        ref={noteRef}
        className="crm-done__note"
        rows={2}
        autoFocus
        value={note}
        maxLength={2000}
        placeholder="Итог касания — необязательно"
        onChange={(e) => setNote(e.target.value)}
      />

      <div className="task-time__label">Следующая задача</div>
      <div className="task-time__chips">
        <button
          type="button"
          className={`task-time__chip${!next ? ' task-time__chip--on' : ''}`}
          onClick={() => { setNext(null); setPickerOpen(false); }}
        >
          Нет
        </button>
        {chips.map((c) => (
          <button
            key={c.date}
            type="button"
            className={`task-time__chip${c.date === next ? ' task-time__chip--on' : ''}`}
            onClick={() => { setNext(c.date); setPickerOpen(false); }}
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
          <CalendarPopover value={next || dueInDays(1)} onChange={setNext} onClose={() => setPickerOpen(false)} />
        </div>
      )}

      {next && <ReminderTime at={at} onChange={setAt} />}

      <div className="task-time__actions">
        <button type="button" className="task-time__apply" onClick={submit}>
          Готово
        </button>
      </div>
    </div>
  );
}

const PAST_DAYS = [
  { offset: 0, label: 'Сегодня' },
  { offset: -1, label: 'Вчера' },
  { offset: -2, label: 'Позавчера' },
];

/**
 * When a touch happened, for one written down after the fact. `onNow` puts
 * it back to the moment it is written.
 */
export function TouchWhenPicker({ value, onApply, onNow }) {
  const start = value ? new Date(value) : new Date();
  const [day, setDay] = useState(toLocalDateString(start));
  const [at, setAt] = useState(clockOf(start.toISOString()));
  const [pickerOpen, setPickerOpen] = useState(false);

  const chips = PAST_DAYS.map((d) => ({ date: dueInDays(d.offset), label: d.label }));
  if (!chips.some((c) => c.date === day)) chips.push({ date: day, label: shortDate(day) });

  const apply = () => onApply(momentOf(day, at));

  return (
    <div
      className="task-time"
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); apply(); }
      }}
    >
      <div className="task-time__head">
        <span className="task-time__title">Когда было касание</span>
      </div>
      <div className="task-time__chips">
        {chips.map((c) => (
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
      <div className="task-time__times">
        <input
          type="time"
          step={60}
          required
          className="task-time__input"
          value={at}
          onChange={(e) => setAt(e.target.value)}
          aria-label="Время"
        />
      </div>
      <div className="task-time__actions">
        <button type="button" className="task-time__apply" onClick={apply}>
          Готово
        </button>
        {onNow && (
          <button type="button" className="task-time__clear" onClick={onNow}>
            Сейчас
          </button>
        )}
      </div>
    </div>
  );
}

const byTime = (a, b) => Date.parse(a.touched_at) - Date.parse(b.touched_at);

/** "27 окт — 2 ноя". */
function weekLabel(week) {
  const part = (day) => {
    const d = new Date(`${day}T12:00:00`);
    return `${d.getDate()} ${MONTH_GENITIVE_RU[d.getMonth()].slice(0, 3)}`;
  };
  return `${part(week[0])} — ${part(week[6])}`;
}

/**
 * The work of the board, day by day: how many reminders were ticked off, a
 * week at a time, and for the day picked — whom and what came of it.
 */
export function CrmStats({ touches, cards, archived = [], onOpenCard }) {
  const today = dueInDays(0);
  const [day, setDay] = useState(today);
  const byDay = useMemo(() => doneByDay(touches), [touches]);
  const week = weekOf(day);
  const weekTotal = week.reduce((sum, d) => sum + (byDay.get(d)?.length || 0), 0);
  const list = (byDay.get(day) || []).slice().sort(byTime);
  const live = new Map(cards.map((c) => [c.id, c]));
  const gone = new Map(archived.map((c) => [c.id, c]));

  return (
    <div className="crm-stats">
      <div className="crm-stats__head">
        <span className="crm-stats__title">Выполнено задач</span>
        <span className="crm-stats__nav">
          <button
            type="button"
            className="crm-stats__arrow"
            onClick={() => setDay(shiftWeeks(day, -1))}
            aria-label="Неделей раньше"
            title="Неделей раньше"
          >
            <img src={leftIcon} alt="" />
          </button>
          <span className="crm-stats__range">{weekLabel(week)}</span>
          <button
            type="button"
            className="crm-stats__arrow"
            disabled={week[6] >= today}
            onClick={() => {
              const next = shiftWeeks(day, 1);
              setDay(next > today ? today : next);
            }}
            aria-label="Неделей позже"
            title="Неделей позже"
          >
            <img src={rightIcon} alt="" />
          </button>
        </span>
      </div>

      <div className="crm-stats__week">
        {week.map((d) => {
          const n = byDay.get(d)?.length || 0;
          const ahead = d > today;
          return (
            <button
              key={d}
              type="button"
              className={`crm-stats__day ${d === day ? 'crm-stats__day--on' : ''} ${d === today ? 'crm-stats__day--today' : ''}`}
              disabled={ahead}
              onClick={() => setDay(d)}
            >
              <span className="crm-stats__wd">{WEEKDAY_SHORT_RU[new Date(`${d}T12:00:00`).getDay()]}</span>
              <span className={`crm-stats__n ${n === 0 ? 'crm-stats__n--zero' : ''}`}>{ahead ? '' : n}</span>
            </button>
          );
        })}
      </div>
      <div className="crm-stats__total">{`За неделю: ${weekTotal}`}</div>

      <div className="crm-stats__day-head">
        <span>{dateColumnTitle(day)}</span>
        <span className="crm-stats__count">{list.length}</span>
      </div>
      {list.length === 0 ? (
        <p className="crm-stats__empty">В этот день задач не закрыто.</p>
      ) : (
        <ul className="crm-stats__list">
          {list.map((t) => {
            const card = live.get(t.card_id);
            const content = (
              <>
                <span className="crm-stats__time">{clockOf(t.touched_at)}</span>
                <span className="crm-stats__text">
                  <span className="crm-stats__who">{(card || gone.get(t.card_id))?.title || 'Удалённая плашка'}</span>
                  {t.body && <span className="crm-stats__body">{t.body}</span>}
                </span>
              </>
            );
            return (
              <li key={t.id}>
                {card ? (
                  <button type="button" className="crm-stats__row" onClick={() => onOpenCard(card.id)}>
                    {content}
                  </button>
                ) : (
                  <div className="crm-stats__row crm-stats__row--gone">{content}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
