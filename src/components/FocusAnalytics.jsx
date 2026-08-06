import { useEffect, useMemo, useState } from 'react';
import { useFocus } from '../contexts/FocusContext';
import { toLocalDateString, formatDayLabel } from '../constants';
import editIcon from '../assets/edit.svg';
import editNavIcon from '../assets/edit-nav.svg';
import deleteIcon from '../assets/delete.svg';
import deleteNav2Icon from '../assets/delete-nav2.svg';
import plusIcon from '../assets/plus.svg';
import plusNavIcon from '../assets/plus-nav.svg';
import leftIcon from '../assets/left.svg';
import rightIcon from '../assets/right.svg';
import './FocusAnalytics.css';

const TL_KEYS = { days: 'focus_tl_days', start: 'focus_tl_start', end: 'focus_tl_end' };

function readStored(key, fallback, min, max) {
  try {
    const v = Number(localStorage.getItem(key));
    if (!Number.isFinite(v)) return fallback;
    return Math.max(min, Math.min(max, Math.round(v)));
  } catch {
    return fallback;
  }
}

function store(key, value) {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    /* storage unavailable — the preference just won't persist */
  }
}

const pad2 = (n) => String(n).padStart(2, '0');

function SessionIconButton({ icon, hoverIcon, onClick, label }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      className="focus-analytics__session-icon"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onClick}
      aria-label={label}
      title={label}
    >
      <img src={hover ? hoverIcon : icon} alt="" />
    </button>
  );
}

function fmtDuration(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  if (h > 0) return `${h} ч ${m} мин`;
  if (m > 0) return `${m} мин`;
  return `${s} сек`;
}

function localDayOf(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return toLocalDateString(d);
}

function hhmmOf(date) {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

function localTimeOf(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return hhmmOf(d);
}

/** End of a session: its stored end, or start + duration for older rows. */
function sessionEnd(s) {
  if (s.ended_at) {
    const d = new Date(s.ended_at);
    if (!Number.isNaN(d.getTime())) return d;
  }
  const st = new Date(s.started_at);
  if (Number.isNaN(st.getTime())) return null;
  return new Date(st.getTime() + (s.duration_seconds || 0) * 1000);
}

function timeToMinutes(str) {
  const [h, m] = String(str || '').split(':').map(Number);
  if (!Number.isFinite(h)) return null;
  return h * 60 + (Number.isFinite(m) ? m : 0);
}

/** Seconds between two "HH:MM" marks; an earlier end means it ran past midnight. */
function spanSeconds(startStr, endStr) {
  const s = timeToMinutes(startStr);
  const e = timeToMinutes(endStr);
  if (s == null || e == null) return 0;
  return ((e >= s ? e - s : e + 24 * 60 - s)) * 60;
}

const TASK_BAR_COLOR = '#15c466';
const LIVE_ID = '__live__';

export function FocusAnalytics() {
  const { sessions, sessionsLoading, logSession, deleteSession, updateSession, active, workSeconds, target } = useFocus();
  const [mounted, setMounted] = useState(false);
  const [selectedDay, setSelectedDay] = useState(toLocalDateString(new Date()));
  const [editingId, setEditingId] = useState(null);
  const [editStart, setEditStart] = useState('12:00');
  const [editEnd, setEditEnd] = useState('12:25');
  const [editTitle, setEditTitle] = useState('');
  const [adding, setAdding] = useState(false);
  const [addTitle, setAddTitle] = useState('');
  const [addStart, setAddStart] = useState('12:00');
  const [addEnd, setAddEnd] = useState('12:25');
  // Day timeline: how many days, which hour window, and how far back we paged.
  const [tlDays, setTlDays] = useState(() => readStored(TL_KEYS.days, 7, 1, 7));
  const [tlStart, setTlStart] = useState(() => readStored(TL_KEYS.start, 6, 0, 23));
  const [tlEnd, setTlEnd] = useState(() => readStored(TL_KEYS.end, 24, 1, 24));
  const [tlOffset, setTlOffset] = useState(0);
  const [nowTick, setNowTick] = useState(() => new Date());

  const applyTlDays = (n) => { setTlDays(n); store(TL_KEYS.days, n); };
  const applyTlHours = (start, end) => {
    const s = Math.max(0, Math.min(23, start));
    const e = end <= s ? Math.min(24, s + 1) : Math.max(1, Math.min(24, end));
    setTlStart(s);
    setTlEnd(e);
    store(TL_KEYS.start, s);
    store(TL_KEYS.end, e);
  };

  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // Moves the "now" marker on today's timeline row.
  useEffect(() => {
    const id = setInterval(() => setNowTick(new Date()), 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const todayDs = toLocalDateString(new Date());

  // All sessions plus a synthetic, live, in-progress one (attributed to today)
  // so totals update in real time while a focus timer is running.
  const allSessions = useMemo(() => {
    const base = sessions || [];
    if (active && workSeconds >= 1) {
      return [
        {
          id: LIVE_ID,
          task_title: target?.title || 'Фокус без задачи',
          duration_seconds: workSeconds,
          // Back-dated so the session sits where it actually started.
          started_at: new Date(Date.now() - workSeconds * 1000).toISOString(),
          live: true,
        },
        ...base,
      ];
    }
    return base;
  }, [sessions, active, workSeconds, target]);

  // Aggregate seconds per local day.
  const { byDay, totals } = useMemo(() => {
    const dayMap = new Map(); // ds -> { total, count, sessions: [] }
    let allTotal = 0;
    let count = 0;
    for (const s of allSessions) {
      const ds = localDayOf(s.started_at);
      if (!ds) continue;
      const secs = s.duration_seconds || 0;
      allTotal += secs;
      if (!s.live) count += 1;
      if (!dayMap.has(ds)) dayMap.set(ds, { total: 0, count: 0, sessions: [] });
      const entry = dayMap.get(ds);
      entry.total += secs;
      if (!s.live) entry.count += 1;
      entry.sessions.push(s);
    }
    let weekTotal = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      weekTotal += dayMap.get(toLocalDateString(d))?.total || 0;
    }
    const todayTotal = dayMap.get(todayDs)?.total || 0;
    return { byDay: dayMap, totals: { allTotal, count, todayTotal, weekTotal } };
  }, [allSessions, todayDs]);

  // Rows of the day timeline: oldest first, ending with the paged-to day.
  const timelineDays = useMemo(() => {
    const rows = [];
    for (let i = tlDays - 1; i >= 0; i--) {
      const d = new Date();
      d.setHours(12, 0, 0, 0);
      d.setDate(d.getDate() + tlOffset - i);
      const ds = toLocalDateString(d);
      const entry = byDay.get(ds);
      const segments = (entry?.sessions || [])
        .map((s) => {
          const st = new Date(s.started_at);
          if (Number.isNaN(st.getTime())) return null;
          const startMin = st.getHours() * 60 + st.getMinutes();
          const minutes = Math.max(1, (s.duration_seconds || 0) / 60);
          return {
            id: s.id,
            live: !!s.live,
            title: s.task_title || 'Без названия',
            startMin,
            endMin: startMin + minutes,
          };
        })
        .filter(Boolean)
        .sort((a, b) => a.startMin - b.startMin);
      rows.push({
        ds,
        total: entry?.total || 0,
        segments,
        isToday: ds === todayDs,
        label: `${d.getDate()} ${['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'][d.getMonth()]}, ${['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'][d.getDay()]}`,
      });
    }
    return rows;
  }, [byDay, tlDays, tlOffset, todayDs]);

  // Hour labels / grid lines: thinned out so a wide window stays readable.
  const axisHours = useMemo(() => {
    const span = tlEnd - tlStart;
    const step = span <= 8 ? 1 : span <= 14 ? 2 : 3;
    const hours = [];
    for (let h = tlStart; h < tlEnd; h += step) hours.push(h);
    if (hours[hours.length - 1] !== tlEnd) hours.push(tlEnd);
    return hours;
  }, [tlStart, tlEnd]);

  // Dividers on every hour boundary inside the window (the edges are the track's own borders).
  const hourLines = useMemo(() => {
    const hours = [];
    for (let h = tlStart + 1; h < tlEnd; h += 1) hours.push(h);
    return hours;
  }, [tlStart, tlEnd]);

  const tlRangeStart = tlStart * 60;
  const tlSpan = (tlEnd - tlStart) * 60;
  const toPct = (minute) => ((minute - tlRangeStart) / tlSpan) * 100;
  const nowMinute = nowTick.getHours() * 60 + nowTick.getMinutes();

  const selectedDetail = useMemo(() => {
    const entry = byDay.get(selectedDay);
    if (!entry) return { total: 0, tasks: [], sessions: [] };
    const taskMap = new Map();
    for (const s of entry.sessions) {
      const title = s.task_title || 'Без названия';
      taskMap.set(title, (taskMap.get(title) || 0) + (s.duration_seconds || 0));
    }
    const tasks = Array.from(taskMap.entries())
      .map(([title, secs]) => ({ title, secs }))
      .sort((a, b) => b.secs - a.secs);
    const orderedSessions = [...entry.sessions].sort(
      (a, b) => new Date(b.started_at) - new Date(a.started_at)
    );
    return { total: entry.total, tasks, sessions: orderedSessions };
  }, [byDay, selectedDay]);

  // Both forms edit a start and an end mark; the duration follows from them.
  const dayStartDate = (dayStr, timeStr) => {
    const d = new Date(`${dayStr}T00:00:00`);
    const mins = timeToMinutes(timeStr) ?? 12 * 60;
    d.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
    return d;
  };

  const startEdit = (s) => {
    setEditingId(s.id);
    const st = new Date(s.started_at);
    const en = sessionEnd(s);
    setEditStart(Number.isNaN(st.getTime()) ? '12:00' : hhmmOf(st));
    setEditEnd(en ? hhmmOf(en) : '12:25');
    setEditTitle(s.task_title || '');
  };

  const saveEdit = (id) => {
    const totalSec = spanSeconds(editStart, editEnd);
    const start = dayStartDate(selectedDay, editStart);
    const end = new Date(start.getTime() + totalSec * 1000);
    updateSession(id, {
      duration_seconds: totalSec,
      task_title: editTitle,
      started_at: start.toISOString(),
      ended_at: end.toISOString(),
    });
    setEditingId(null);
  };

  const openAdd = () => {
    const now = new Date();
    setAddTitle('');
    setAddStart(hhmmOf(now));
    setAddEnd(hhmmOf(new Date(now.getTime() + 25 * 60 * 1000)));
    setEditingId(null);
    setAdding(true);
  };

  const saveAdd = () => {
    const totalSec = spanSeconds(addStart, addEnd);
    if (totalSec < 1) {
      setAdding(false);
      return;
    }
    const start = dayStartDate(selectedDay, addStart);
    const end = new Date(start.getTime() + totalSec * 1000);
    logSession({
      taskTitle: addTitle.trim() || 'Фокус',
      source: 'custom',
      mode: 'stopwatch',
      durationSeconds: totalSec,
      startedAt: start.toISOString(),
      endedAt: end.toISOString(),
    });
    setAdding(false);
  };

  return (
    <div className="focus-analytics">
      <div className="focus-analytics__inner">
        <h1 className="focus-analytics__title">Аналитика фокус-сессий</h1>

        <div className="focus-analytics__cards">
          {[
            { label: 'Сегодня', value: fmtDuration(totals.todayTotal) },
            { label: 'За неделю', value: fmtDuration(totals.weekTotal) },
            { label: 'Всего', value: fmtDuration(totals.allTotal) },
            { label: 'Сессий', value: String(totals.count) },
          ].map((c, i) => (
            <div
              className={`focus-analytics__card ${mounted ? 'is-in' : ''}`}
              key={c.label}
              style={{ transitionDelay: `${i * 60}ms` }}
            >
              <div className="focus-analytics__card-value">{c.value}</div>
              <div className="focus-analytics__card-label">{c.label}</div>
            </div>
          ))}
        </div>

        <div className="focus-analytics__tl-head">
          <span className="focus-analytics__section-title focus-analytics__section-title--inline">
            Шкала дня
          </span>
          <div className="focus-analytics__tl-controls">
            <select
              className="dashboard__select"
              value={tlDays}
              onChange={(e) => applyTlDays(Number(e.target.value))}
              aria-label="Количество дней"
              title="Количество дней"
            >
              {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            <button
              type="button"
              className="dashboard__shift-btn"
              onClick={() => setTlOffset((o) => o - 1)}
              aria-label="Назад"
            >
              <img src={leftIcon} alt="" />
            </button>
            <button
              type="button"
              className="dashboard__shift-btn dashboard__shift-btn--today"
              onClick={() => setTlOffset(0)}
              aria-label="Сегодня"
            >
              <span className="dashboard__shift-today-dot" aria-hidden />
            </button>
            <button
              type="button"
              className="dashboard__shift-btn"
              onClick={() => setTlOffset((o) => Math.min(0, o + 1))}
              aria-label="Вперёд"
              disabled={tlOffset >= 0}
            >
              <img src={rightIcon} alt="" />
            </button>
            <span className="focus-analytics__tl-hours">
              <select
                className="dashboard__select"
                value={tlStart}
                onChange={(e) => applyTlHours(Number(e.target.value), tlEnd)}
                aria-label="Начало шкалы"
              >
                {Array.from({ length: 24 }, (_, h) => h).map((h) => (
                  <option key={h} value={h}>{pad2(h)}:00</option>
                ))}
              </select>
              <span className="focus-analytics__tl-sep">–</span>
              <select
                className="dashboard__select"
                value={tlEnd}
                onChange={(e) => applyTlHours(tlStart, Number(e.target.value))}
                aria-label="Конец шкалы"
              >
                {Array.from({ length: 24 }, (_, i) => i + 1).map((h) => (
                  <option key={h} value={h}>{pad2(h)}:00</option>
                ))}
              </select>
            </span>
          </div>
        </div>

        <div className="focus-analytics__tl">
          <div className="focus-analytics__tl-axis">
            <span />
            <span className="focus-analytics__tl-axis-track">
              {axisHours.map((h, i) => (
                <span
                  key={h}
                  className="focus-analytics__tl-axis-label"
                  style={{
                    left: `${toPct(h * 60)}%`,
                    transform: i === 0
                      ? 'translateX(0)'
                      : i === axisHours.length - 1 ? 'translateX(-100%)' : 'translateX(-50%)',
                  }}
                >
                  {pad2(h)}:00
                </span>
              ))}
            </span>
            <span className="focus-analytics__tl-total" />
          </div>

          {timelineDays.map((row) => (
            <button
              type="button"
              key={row.ds}
              className={`focus-analytics__tl-row${row.ds === selectedDay ? ' is-selected' : ''}`}
              onClick={() => setSelectedDay(row.ds)}
              title={`${row.label} · ${fmtDuration(row.total)}`}
            >
              <span className="focus-analytics__tl-daylabel">
                {row.isToday ? 'Сегодня' : row.label}
              </span>
              <span className="focus-analytics__tl-track">
                {row.segments.map((seg, i) => {
                  const s = Math.max(seg.startMin, tlRangeStart);
                  const e = Math.min(seg.endMin, tlRangeStart + tlSpan);
                  if (e <= s) return null;
                  return (
                    <span
                      key={`${seg.id}-${i}`}
                      className={`focus-analytics__tl-seg${seg.live ? ' is-live' : ''}`}
                      style={{ left: `${toPct(s)}%`, width: `${((e - s) / tlSpan) * 100}%` }}
                      title={`${pad2(Math.floor(seg.startMin / 60))}:${pad2(Math.round(seg.startMin % 60))} · ${seg.title}`}
                    />
                  );
                })}
                {hourLines.map((h) => (
                  <span
                    key={h}
                    className="focus-analytics__tl-grid"
                    style={{ left: `${toPct(h * 60)}%` }}
                    aria-hidden
                  />
                ))}
                {row.isToday && nowMinute >= tlRangeStart && nowMinute <= tlRangeStart + tlSpan && (
                  <span className="focus-analytics__tl-now" style={{ left: `${toPct(nowMinute)}%` }} aria-hidden />
                )}
              </span>
              <span className="focus-analytics__tl-total">
                {row.total > 0 ? fmtDuration(row.total) : ''}
              </span>
            </button>
          ))}
        </div>

        <div className="focus-analytics__section-title">
          {formatDayLabel(selectedDay)} · {fmtDuration(selectedDetail.total)}
        </div>

        {sessionsLoading ? (
          <div className="focus-analytics__empty">Загрузка…</div>
        ) : (
          <>
            {selectedDetail.tasks.length > 0 && (
              <div className="focus-analytics__tasks">
                {selectedDetail.tasks.map((t, i) => {
                  const pct = selectedDetail.total ? (t.secs / selectedDetail.total) * 100 : 0;
                  const color = TASK_BAR_COLOR;
                  return (
                    <div className="focus-analytics__task-row" key={t.title + i}>
                      <div className="focus-analytics__task-head">
                        <span className="focus-analytics__task-dot" style={{ background: color }} />
                        <span className="focus-analytics__task-title">{t.title}</span>
                        <span className="focus-analytics__task-time">{fmtDuration(t.secs)}</span>
                      </div>
                      <div className="focus-analytics__task-track">
                        <div
                          className="focus-analytics__task-fill"
                          style={{ width: mounted ? `${pct}%` : '0%', background: color, transitionDelay: `${i * 50}ms` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="focus-analytics__sessions-title-row">
              <span className="focus-analytics__sessions-title">Сессии</span>
              <button
                type="button"
                className="focus-analytics__add-btn"
                onClick={openAdd}
                aria-label="Добавить фокус-сессию"
                title="Добавить фокус-сессию"
              >
                <img src={plusIcon} alt="" className="focus-analytics__add-icon focus-analytics__add-icon--default" />
                <img src={plusNavIcon} alt="" className="focus-analytics__add-icon focus-analytics__add-icon--hover" />
              </button>
            </div>

            {adding && (
              <div className="focus-analytics__session focus-analytics__session--adding">
                <div className="focus-analytics__session-edit">
                  <input
                    className="focus-analytics__session-input focus-analytics__session-input--time"
                    type="time"
                    step="300"
                    value={addStart}
                    onChange={(e) => setAddStart(e.target.value)}
                    aria-label="Время начала"
                  />
                  <span className="focus-analytics__session-unit">–</span>
                  <input
                    className="focus-analytics__session-input focus-analytics__session-input--time"
                    type="time"
                    step="300"
                    value={addEnd}
                    onChange={(e) => setAddEnd(e.target.value)}
                    aria-label="Время завершения"
                  />
                  <span className="focus-analytics__session-unit">{fmtDuration(spanSeconds(addStart, addEnd))}</span>
                  <input
                    className="focus-analytics__session-input focus-analytics__session-input--title"
                    value={addTitle}
                    onChange={(e) => setAddTitle(e.target.value)}
                    placeholder="Название"
                  />
                  <button type="button" className="focus-analytics__session-btn focus-analytics__session-btn--save" onClick={saveAdd}>
                    Добавить
                  </button>
                  <button type="button" className="focus-analytics__session-btn" onClick={() => setAdding(false)}>
                    Отмена
                  </button>
                </div>
              </div>
            )}

            <div className="focus-analytics__sessions">
              {selectedDetail.sessions.length === 0 && !adding && (
                <div className="focus-analytics__empty">В этот день фокус-сессий не было.</div>
              )}
              {selectedDetail.sessions.map((s) => (
                <div className="focus-analytics__session" key={s.id}>
                  {editingId === s.id ? (
                    <div className="focus-analytics__session-edit">
                      <input
                        className="focus-analytics__session-input focus-analytics__session-input--time"
                        type="time"
                        step="300"
                        value={editStart}
                        onChange={(e) => setEditStart(e.target.value)}
                        aria-label="Время начала"
                      />
                      <span className="focus-analytics__session-unit">–</span>
                      <input
                        className="focus-analytics__session-input focus-analytics__session-input--time"
                        type="time"
                        step="300"
                        value={editEnd}
                        onChange={(e) => setEditEnd(e.target.value)}
                        aria-label="Время завершения"
                      />
                      <span className="focus-analytics__session-unit">{fmtDuration(spanSeconds(editStart, editEnd))}</span>
                      <input
                        className="focus-analytics__session-input focus-analytics__session-input--title"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        placeholder="Название"
                      />
                      <button type="button" className="focus-analytics__session-btn focus-analytics__session-btn--save" onClick={() => saveEdit(s.id)}>
                        Сохранить
                      </button>
                      <button type="button" className="focus-analytics__session-btn" onClick={() => setEditingId(null)}>
                        Отмена
                      </button>
                    </div>
                  ) : (
                    <>
                      <span className="focus-analytics__session-time">
                        {localTimeOf(s.started_at)}–{s.live ? hhmmOf(nowTick) : localTimeOf(sessionEnd(s)?.toISOString())}
                      </span>
                      <span className="focus-analytics__session-name">{s.task_title || 'Без названия'}</span>
                      {s.live ? (
                        <span className="focus-analytics__session-live">идёт · {fmtDuration(s.duration_seconds)}</span>
                      ) : (
                        <>
                          <span className="focus-analytics__session-dur">{fmtDuration(s.duration_seconds)}</span>
                          <SessionIconButton icon={editIcon} hoverIcon={editNavIcon} onClick={() => startEdit(s)} label="Редактировать" />
                          <SessionIconButton icon={deleteIcon} hoverIcon={deleteNav2Icon} onClick={() => deleteSession(s.id)} label="Удалить" />
                        </>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
