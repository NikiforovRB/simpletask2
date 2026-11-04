import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Popover } from './KanbanView';
import { CheckGlyph, TouchWhenPicker } from './KanbanCrm';
import { useAutoGrow } from '../hooks/useAutoGrow';
import { clockOf, dayHeading, enterSends, touchDay } from '../lib/crm';

/** "Вчера • 18:05". */
const whenLabel = (iso) => `${dayHeading(touchDay({ touched_at: iso }))} • ${clockOf(iso)}`;

let ruler = null;
/** Whether `text` goes into `width` pixels on one line, in the font of `el`. */
function fitsOnALine(el, text, width) {
  if (text.includes('\n')) return false;
  ruler ??= document.createElement('canvas').getContext('2d');
  const s = getComputedStyle(el);
  ruler.font = `${s.fontStyle} ${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;
  return ruler.measureText(text).width <= width;
}

const ClockGlyph = () => (
  <svg viewBox="0 0 16 16" aria-hidden>
    <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.5" />
    <path d="M8 4.8V8l2.2 1.4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const SendGlyph = () => (
  <svg viewBox="0 0 24 24" aria-hidden>
    <path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/**
 * Every touch with a client, the oldest on top, grouped by day. A touch that
 * closed a reminder carries a tick. Any of them opens for editing in place.
 */
export function TouchHistory({ touches, onUpdate, onDelete }) {
  const [editing, setEditing] = useState(null);
  const days = [];
  for (const t of touches) {
    const day = touchDay(t);
    const last = days[days.length - 1];
    if (last?.day === day) last.list.push(t);
    else days.push({ day, list: [t] });
  }

  return (
    <div className="crm-history">
      {days.map(({ day, list }) => (
        <section key={day} className="crm-history__day">
          <div className="crm-history__day-title">{dayHeading(day)}</div>
          {list.map((t) => (editing === t.id ? (
            <TouchEditor
              key={t.id}
              touch={t}
              onSave={(patch) => {
                setEditing(null);
                if (patch.body !== t.body || patch.touched_at !== t.touched_at) onUpdate(t.id, patch);
              }}
              onDelete={() => {
                setEditing(null);
                onDelete(t.id);
              }}
              onCancel={() => setEditing(null)}
            />
          ) : (
            <button
              key={t.id}
              type="button"
              className={`crm-touch ${t.closed_reminder ? 'crm-touch--done' : ''}`}
              onClick={() => setEditing(t.id)}
              title="Изменить"
            >
              <span className="crm-touch__time">{clockOf(t.touched_at)}</span>
              <span className="crm-touch__body">
                {t.closed_reminder && <span className="crm-touch__tick"><CheckGlyph /></span>}
                {t.body || <span className="crm-touch__empty">{t.closed_reminder ? 'Задача выполнена' : 'Касание'}</span>}
              </span>
            </button>
          )))}
        </section>
      ))}
    </div>
  );
}

function TouchEditor({ touch, onSave, onDelete, onCancel }) {
  const [body, setBody] = useState(touch.body || '');
  const [when, setWhen] = useState(touch.touched_at);
  const [whenOpen, setWhenOpen] = useState(false);
  const [asking, setAsking] = useState(false);
  const whenRef = useRef(null);
  const inputRef = useAutoGrow(body);
  const save = () => onSave({ body: body.trim(), touched_at: when });

  return (
    <div className="crm-touch-edit">
      <textarea
        ref={inputRef}
        className="crm-touch-edit__input"
        rows={1}
        autoFocus
        value={body}
        maxLength={2000}
        placeholder={touch.closed_reminder ? 'Итог касания' : 'Что было'}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            onCancel();
          } else if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && enterSends()) {
            e.preventDefault();
            save();
          }
        }}
      />
      <div className="crm-touch-edit__bar">
        <button type="button" ref={whenRef} className="crm-when" onClick={() => setWhenOpen((v) => !v)}>
          <ClockGlyph />
          {whenLabel(when)}
        </button>
        {whenOpen && (
          <Popover anchor={whenRef} align="left" onClose={() => setWhenOpen(false)} className="kanban-remind-pop">
            <TouchWhenPicker
              value={when}
              onApply={(iso) => {
                setWhen(iso);
                setWhenOpen(false);
              }}
            />
          </Popover>
        )}
        <span className="crm-touch-edit__gap" />
        {asking ? (
          <>
            <span className="crm-touch-edit__ask">Удалить касание?</span>
            <button type="button" className="crm-btn" onClick={() => setAsking(false)}>Нет</button>
            <button type="button" className="crm-btn crm-btn--danger" onClick={onDelete}>Удалить</button>
          </>
        ) : (
          <>
            <button type="button" className="crm-btn crm-btn--quiet" onClick={() => setAsking(true)}>Удалить</button>
            <button type="button" className="crm-btn" onClick={onCancel}>Отмена</button>
            <button type="button" className="crm-btn crm-btn--primary" onClick={save}>Сохранить</button>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * The line a new touch is written into. It happened just now unless the clock
 * says otherwise — a call from yesterday can still be written down today.
 * `text` is held by the panel, so ticking a reminder off can take it along.
 */
export function TouchComposer({ text, onText, onSubmit }) {
  const [when, setWhen] = useState(null);
  const [whenOpen, setWhenOpen] = useState(false);
  const [long, setLong] = useState(false);
  const formRef = useRef(null);
  const whenRef = useRef(null);
  const sendRef = useRef(null);
  const inputRef = useAutoGrow(text);
  // Text that would not fit beside the buttons puts them under the field.
  // Whether it fits is measured against the narrow field, not the one on
  // screen, so the line never flips back and forth at the edge.
  const stacked = long && text !== '';

  const tooLong = (value) => {
    const form = formRef.current;
    const input = inputRef.current;
    if (!value || !form || !input || !whenRef.current || !sendRef.current) return false;
    const s = getComputedStyle(input);
    const gap = parseFloat(getComputedStyle(form).columnGap) || 0;
    const room = form.clientWidth - whenRef.current.offsetWidth - sendRef.current.offsetWidth - 2 * gap
      - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight)
      - parseFloat(s.borderLeftWidth) - parseFloat(s.borderRightWidth) - 2;
    return !fitsOnALine(input, value, room);
  };

  useEffect(() => {
    const form = formRef.current;
    if (!form || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => setLong(tooLong(inputRef.current?.value)));
    ro.observe(form);
    if (whenRef.current) ro.observe(whenRef.current);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The field changes width with the layout, so its height is worked out again.
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [stacked, inputRef]);

  const submit = () => {
    const body = text.trim();
    if (!body) return;
    onSubmit({ body, touched_at: when || new Date().toISOString() });
    onText('');
    setLong(false);
    setWhen(null);
    inputRef.current?.focus();
  };

  return (
    <form
      ref={formRef}
      className={`crm-composer ${stacked ? 'crm-composer--stacked' : ''}`}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <button
        type="button"
        ref={whenRef}
        className={`crm-when ${when ? 'crm-when--set' : ''}`}
        onClick={() => setWhenOpen((v) => !v)}
        title="Когда было касание"
      >
        <ClockGlyph />
        {when ? whenLabel(when) : 'Сейчас'}
      </button>
      {whenOpen && (
        <Popover anchor={whenRef} align="left" onClose={() => setWhenOpen(false)} className="kanban-remind-pop">
          <TouchWhenPicker
            value={when}
            onApply={(iso) => {
              setWhen(iso);
              setWhenOpen(false);
              inputRef.current?.focus();
            }}
            onNow={() => {
              setWhen(null);
              setWhenOpen(false);
              inputRef.current?.focus();
            }}
          />
        </Popover>
      )}
      <textarea
        ref={inputRef}
        className="crm-composer__input"
        rows={1}
        value={text}
        maxLength={2000}
        placeholder="Новое касание…"
        aria-label="Новое касание"
        onChange={(e) => {
          onText(e.target.value);
          setLong(tooLong(e.target.value));
        }}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing || !enterSends()) return;
          e.preventDefault();
          submit();
        }}
      />
      <button
        ref={sendRef}
        type="submit"
        className="crm-composer__send"
        disabled={!text.trim()}
        aria-label="Записать касание"
        title="Записать касание"
      >
        <SendGlyph />
      </button>
    </form>
  );
}
