import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useModalClose } from '../hooks/useModalClose';
import {
  HISTORY_KINDS,
  addDays,
  agoLabel,
  daysBetween,
  formatWhen,
  historyKind,
  historyOf,
  lastContactOf,
  phoneHref,
  relativeDay,
  taskKind,
  telegramLink,
} from '../lib/girls';
import { Avatar, CalendarIcon, CheckIcon, CloseIcon, PhoneIcon, SendIcon, TaskKindIcon, TelegramIcon } from './GirlsIcons';
import { GirlsDatePicker } from './GirlsDatePicker';

const CONTACT_KINDS = ['message', 'call'];
const pickerQuick = (today) => [
  { label: 'Вчера', value: addDays(today, -1) },
  { label: 'Сегодня', value: today },
  { label: 'Завтра', value: addDays(today, 1) },
];
const planQuick = (today) => [
  { label: 'Завтра', value: addDays(today, 1) },
  { label: 'Послезавтра', value: addDays(today, 2) },
  { label: 'Через неделю', value: addDays(today, 7) },
];
// With a keyboard Enter sends and Shift+Enter makes a new line; on a phone Enter is just a new line.
const enterSends = () => window.matchMedia?.('(hover: hover) and (pointer: fine)').matches ?? true;
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
// How long it slides away (see history-out in the CSS).
const CLOSE_MS = 260;
// Entries drawn at first; scrolling up to the oldest of them adds as many more.
const PAGE = 50;

/**
 * The whole story with her as one feed, the oldest on top: the meeting, every
 * message and call, every date; under it — what is planned; at the very
 * bottom — a line to write a new one down (a day ahead makes it a plan).
 * Any entry opens for editing in place.
 *
 * `kinds` — what can be written down; `onAdd({ kind, day, time, note, plan? })`,
 * `onEdit(entry, { kind, day, time, note, done })`, `onDelete(entry)`,
 * `onToggle(entry, done)`.
 */
export function GirlHistory({ girl, tasks, today, url, kinds, onAdd, onEdit, onDelete, onToggle, onOpenGirl, onClose }) {
  const { past, planned } = historyOf(girl, tasks, today);
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState(() => ({ kind: kinds.includes('message') ? 'message' : kinds[0], day: today, time: '', note: '' }));
  const [picker, setPicker] = useState(false);
  const [planPicker, setPlanPicker] = useState(false);
  const [closing, setClosing] = useState(false);
  const [shown, setShown] = useState(PAGE);
  const feedRef = useRef(null);
  const inputRef = useRef(null);
  const moreRef = useRef(null);
  const seen = useRef(null);
  // Set while older entries are being added on top: how far the view was from the bottom.
  const older = useRef(null);
  const hasMore = past.length > shown;
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  const close = () => (reducedMotion() ? onClose() : setClosing(true));
  useModalClose(() => (editing ? setEditing(null) : close()));

  useEffect(() => {
    if (!closing) return;
    const t = setTimeout(() => onCloseRef.current(), CLOSE_MS);
    return () => clearTimeout(t);
  }, [closing]);

  // Opens at the newest; whatever appears later is scrolled to and lit up for a moment,
  // except the older ones added on top: those just keep the view where it was.
  useLayoutEffect(() => {
    const feed = feedRef.current;
    if (!feed) return;
    const nodes = [...feed.querySelectorAll('[data-entry]')];
    if (older.current !== null) {
      feed.scrollTop = feed.scrollHeight - older.current;
      older.current = null;
    } else if (seen.current) {
      const fresh = nodes.filter((n) => !seen.current.has(n.dataset.entry));
      for (const n of fresh) n.classList.add('history-entry--new');
      fresh[fresh.length - 1]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    } else {
      feed.scrollTop = feed.scrollHeight;
    }
    seen.current = new Set(nodes.map((n) => n.dataset.entry));
  });

  // Observed anew after every page, so a page too short to scroll brings the next one at once.
  useEffect(() => {
    const feed = feedRef.current;
    const more = moreRef.current;
    if (!feed || !more) return undefined;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        older.current = feed.scrollHeight - feed.scrollTop;
        setShown((n) => n + PAGE);
      },
      { root: feed, rootMargin: '300px 0px 0px 0px' },
    );
    io.observe(more);
    return () => io.disconnect();
  }, [shown, hasMore]);

  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [draft.note]);

  const days = [];
  for (const e of hasMore ? past.slice(past.length - shown) : past) {
    const last = days[days.length - 1];
    if (last?.day === e.day) last.entries.push(e);
    else days.push({ day: e.day, entries: [e] });
  }

  const last = lastContactOf(girl, tasks, today);
  const sub = `${last.kind === 'met' ? 'знакомство' : 'последняя связь'} ${agoLabel(daysBetween(last.day, today))}`;
  const tg = telegramLink(girl.telegram);
  const tel = phoneHref(girl.phone);
  const future = draft.day > today;
  const kind = historyKind(draft.kind);

  const submit = () => {
    onAdd({ kind: draft.kind, day: draft.day, time: draft.time || null, note: draft.note.trim() });
    setDraft((d) => ({ ...d, day: today, time: '', note: '' }));
    inputRef.current?.focus();
  };

  const openEntry = (entry) => {
    if (entry.source === 'met') onOpenGirl();
    else setEditing(entry.key);
  };

  const renderEntry = (entry, isPlan) =>
    editing === entry.key ? (
      <EntryEditor
        key={entry.key}
        entry={entry}
        today={today}
        onSave={(fields) => {
          setEditing(null);
          onEdit(entry, fields);
        }}
        onDelete={() => {
          setEditing(null);
          onDelete(entry);
        }}
        onCancel={() => setEditing(null)}
      />
    ) : (
      <Entry key={entry.key} entry={entry} today={today} isPlan={isPlan} onOpen={() => openEntry(entry)} onDone={() => onToggle(entry, true)} />
    );

  return (
    <div
      className={`girl-editor__overlay girl-editor__overlay--history ${closing ? 'girl-editor__overlay--closing' : ''}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="girl-editor history" role="dialog" aria-modal="true" aria-label={`История — ${girl.name}`}>
        <header className="girl-editor__head history__head">
          <button type="button" className="history__who" onClick={onOpenGirl} title="Открыть карточку">
            <Avatar name={girl.name} url={url} className="history__avatar" />
            <span className="history__who-text">
              <span className="history__name">{girl.name}</span>
              <span className="history__sub">{sub}</span>
            </span>
          </button>
          <div className="history__actions">
            {tg && (
              <a className="girl-icon-btn" href={tg.url} target="_blank" rel="noreferrer" aria-label="Написать в Telegram" title="Написать в Telegram">
                <TelegramIcon />
              </a>
            )}
            {tel && (
              <a className="girl-icon-btn" href={tel} aria-label="Позвонить" title="Позвонить">
                <PhoneIcon />
              </a>
            )}
            <button type="button" className="girl-editor__close" onClick={close} aria-label="Закрыть">
              <CloseIcon />
            </button>
          </div>
        </header>

        <div className="history__feed" ref={feedRef}>
          {hasMore && <div className="history__more" ref={moreRef} aria-hidden="true" />}
          {days.map(({ day, entries }) => (
            <section key={day} className="history__day">
              <div className="history__day-title">{relativeDay(day, today)}</div>
              {entries.map((e) => renderEntry(e, false))}
            </section>
          ))}

          <section className="history__day history__day--plan">
            <div className="history__day-title">Запланировано</div>
            {planned.map((e) => renderEntry(e, true))}
            {planned.length === 0 && (
              <div className="history__nothing">
                <span>Ничего не запланировано.</span>
                {kinds.includes('message') && (
                  <span className="history__nothing-chips">
                    Написать:
                    {planQuick(today)
                      .slice(0, 2)
                      .map((q) => (
                        <button
                          key={q.label}
                          type="button"
                          className="girls__chip"
                          onClick={() => onAdd({ kind: 'message', day: q.value, time: null, note: '', plan: true })}
                        >
                          {q.label}
                        </button>
                      ))}
                    <button type="button" className="girls__chip" onClick={() => setPlanPicker(true)}>
                      Выбрать дату
                    </button>
                  </span>
                )}
              </div>
            )}
          </section>
        </div>

        <form
          className="history__composer"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="history__composer-top">
            <div className="history__kinds" role="radiogroup" aria-label="Что записать">
              {HISTORY_KINDS.filter((k) => kinds.includes(k.key)).map((k) => (
                <button
                  key={k.key}
                  type="button"
                  role="radio"
                  aria-checked={draft.kind === k.key}
                  className={`history__kind history__kind--${k.key} ${draft.kind === k.key ? 'history__kind--on' : ''}`}
                  onClick={() => {
                    setDraft((d) => ({ ...d, kind: k.key }));
                    inputRef.current?.focus();
                  }}
                >
                  <TaskKindIcon kind={k.key} />
                  <span>{k.label}</span>
                </button>
              ))}
            </div>
            <button
              type="button"
              className={`history__when ${future ? 'history__when--plan' : ''}`}
              onClick={() => setPicker(true)}
              title={future ? 'Это попадёт в план' : 'Когда это было'}
            >
              <CalendarIcon />
              <span>{future ? `В план: ${formatWhen(draft.day, draft.time, today).toLowerCase()}` : formatWhen(draft.day, draft.time, today)}</span>
            </button>
          </div>
          <div className="history__line">
            <textarea
              ref={inputRef}
              className="history__input"
              rows={1}
              value={draft.note}
              onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing || !enterSends()) return;
                e.preventDefault();
                if (draft.note.trim()) submit();
              }}
              placeholder={`${future ? kind.plan : kind.past}…`}
              maxLength={1000}
              aria-label="Новая запись"
            />
            <button type="submit" className="history__send" aria-label={future ? 'Запланировать' : 'Записать'} title={future ? 'Запланировать' : 'Записать'}>
              <SendIcon />
            </button>
          </div>
        </form>
      </div>

      {picker && (
        <GirlsDatePicker
          title={future ? 'Когда' : 'Когда это было'}
          withTime
          value={draft.day}
          time={draft.time}
          quick={pickerQuick(today)}
          onApply={({ date, time }) => {
            setDraft((d) => ({ ...d, day: date, time: time || '' }));
            setPicker(false);
            inputRef.current?.focus();
          }}
          onClose={() => setPicker(false)}
        />
      )}

      {planPicker && (
        <GirlsDatePicker
          title="Когда написать"
          withTime
          value={addDays(today, 1)}
          quick={planQuick(today)}
          onApply={({ date, time }) => {
            setPlanPicker(false);
            onAdd({ kind: 'message', day: date, time: time || null, note: '', plan: true });
          }}
          onClose={() => setPlanPicker(false)}
        />
      )}
    </div>
  );
}

function Entry({ entry, today, isPlan, onOpen, onDone }) {
  const info = historyKind(entry.kind);
  const late = isPlan && entry.day < today;
  let text = entry.note;
  if (!text) text = entry.source === 'met' ? 'Познакомились' : isPlan ? taskKind(entry.kind).label : info.label;
  const label = entry.note ? info.label : null;
  const meta = [isPlan ? formatWhen(entry.day, entry.time, today) : label, isPlan ? label : entry.clock].filter(Boolean).join(' · ');
  return (
    <div className={`history-entry ${late ? 'history-entry--late' : ''} ${isPlan ? 'history-entry--plan' : ''}`} data-entry={entry.key}>
      <button
        type="button"
        className="history-entry__main"
        onClick={onOpen}
        title={entry.source === 'met' ? 'Открыть карточку' : 'Изменить'}
      >
        <span className={`plan-card__kind plan-card__kind--${entry.kind} history-entry__icon`}>
          <TaskKindIcon kind={entry.kind} />
        </span>
        <span className="history-entry__body">
          <span className={`history-entry__note ${entry.note ? '' : 'history-entry__note--empty'}`}>{text}</span>
          {meta && <span className="history-entry__meta">{meta}</span>}
        </span>
      </button>
      {isPlan && entry.source === 'task' && (
        <button type="button" className="plan-card__check history-entry__check" onClick={onDone} aria-label="Выполнено" title="Выполнено">
          <CheckIcon />
        </button>
      )}
    </div>
  );
}

function EntryEditor({ entry, today, onSave, onDelete, onCancel }) {
  const [draft, setDraft] = useState({ kind: entry.kind, day: entry.day, time: entry.time || '', note: entry.note, done: entry.done });
  const [picker, setPicker] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const task = entry.source === 'task';
  const kind = historyKind(draft.kind);
  const ahead = task ? !draft.done : draft.day >= today;

  const save = () => onSave({ kind: draft.kind, day: draft.day, time: draft.time || null, note: draft.note.trim(), done: draft.done });

  return (
    <>
      <form
        className="history-edit"
        data-entry={entry.key}
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        {task && (
          <div className="girls-stats__modes approach-editor__seg" role="radiogroup" aria-label="Что это">
            {CONTACT_KINDS.map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={draft.kind === k}
                className={`girls-stats__mode ${draft.kind === k ? 'girls-stats__mode--on' : ''}`}
                onClick={() => setDraft((d) => ({ ...d, kind: k }))}
              >
                {historyKind(k).label}
              </button>
            ))}
          </div>
        )}
        <div className="history-edit__row">
          <button type="button" className="girl-input girl-input--button" onClick={() => setPicker(true)}>
            <span>{formatWhen(draft.day, draft.time, today)}</span>
            <CalendarIcon />
          </button>
          {task && (
            <button
              type="button"
              className={`girls__chip history-edit__done ${draft.done ? 'girls__chip--on' : ''}`}
              aria-pressed={draft.done}
              onClick={() => setDraft((d) => ({ ...d, done: !d.done }))}
            >
              <CheckIcon />
              Выполнено
            </button>
          )}
        </div>
        <textarea
          className="girl-input girl-input--area history-edit__note"
          value={draft.note}
          onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              save();
            }
          }}
          placeholder={`${ahead ? kind.plan : kind.past}…`}
          rows={2}
          maxLength={1000}
          autoFocus
        />
        <div className="history-edit__foot">
          {confirm ? (
            <>
              <span className="girl-editor__ask">{entry.source === 'date' ? 'Удалить это свидание?' : 'Удалить запись?'}</span>
              <button type="button" className="girl-btn girl-btn--ghost" onClick={() => setConfirm(false)}>Нет</button>
              <button type="button" className="girl-btn girl-btn--danger" onClick={onDelete}>Удалить</button>
            </>
          ) : (
            <>
              <button type="button" className="girl-btn girl-btn--ghost girl-btn--danger-text" onClick={() => setConfirm(true)}>
                Удалить
              </button>
              <span className="girl-editor__spacer" />
              <button type="button" className="girl-btn girl-btn--ghost" onClick={onCancel}>Отмена</button>
              <button type="submit" className="girl-btn girl-btn--primary">Сохранить</button>
            </>
          )}
        </div>
      </form>
      {picker && (
        <GirlsDatePicker
          title={kind.label}
          withTime
          value={draft.day}
          time={draft.time}
          quick={pickerQuick(today)}
          onApply={({ date, time }) => {
            setDraft((d) => ({ ...d, day: date, time: time || '' }));
            setPicker(false);
          }}
          onClose={() => setPicker(false)}
        />
      )}
    </>
  );
}
