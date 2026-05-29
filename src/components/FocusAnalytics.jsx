import { useEffect, useMemo, useState } from 'react';
import { useFocus } from '../contexts/FocusContext';
import { toLocalDateString, formatDayLabel } from '../constants';
import './FocusAnalytics.css';

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

function localTimeOf(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const PALETTE = ['#5a86ee', '#15c466', '#f4ba04', '#613aaf', '#00b5cc', '#f33737', '#c4d636', '#f29300'];
const LIVE_ID = '__live__';

export function FocusAnalytics() {
  const { sessions, sessionsLoading, deleteSession, updateSession, active, workSeconds, target } = useFocus();
  const [mounted, setMounted] = useState(false);
  const [selectedDay, setSelectedDay] = useState(toLocalDateString(new Date()));
  const [editingId, setEditingId] = useState(null);
  const [editMinutes, setEditMinutes] = useState('');
  const [editTitle, setEditTitle] = useState('');

  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
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
          started_at: new Date().toISOString(),
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

  const chartDays = useMemo(() => {
    const arr = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const ds = toLocalDateString(d);
      arr.push({
        ds,
        total: byDay.get(ds)?.total || 0,
        weekday: ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'][d.getDay()],
        dayNum: d.getDate(),
      });
    }
    return arr;
  }, [byDay]);

  const chartMax = Math.max(1, ...chartDays.map((d) => d.total));

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

  const startEdit = (s) => {
    setEditingId(s.id);
    setEditMinutes(String(Math.max(1, Math.round((s.duration_seconds || 0) / 60))));
    setEditTitle(s.task_title || '');
  };

  const saveEdit = (id) => {
    const mins = parseInt(editMinutes, 10);
    updateSession(id, {
      duration_seconds: Number.isFinite(mins) ? Math.max(0, mins) * 60 : undefined,
      task_title: editTitle,
    });
    setEditingId(null);
  };

  return (
    <div className="focus-analytics">
      <div className="focus-analytics__inner">
        <h1 className="focus-analytics__title">Аналитика фокуса</h1>

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

        <div className="focus-analytics__section-title">Последние 14 дней</div>
        <div className="focus-analytics__chart">
          {chartDays.map((d, i) => {
            const heightPct = mounted ? Math.max(d.total > 0 ? 6 : 0, (d.total / chartMax) * 100) : 0;
            const isSelected = d.ds === selectedDay;
            return (
              <button
                type="button"
                key={d.ds}
                className={`focus-analytics__bar-col ${isSelected ? 'is-selected' : ''}`}
                onClick={() => setSelectedDay(d.ds)}
                title={`${d.dayNum} — ${fmtDuration(d.total)}`}
              >
                <div className="focus-analytics__bar-track">
                  <div
                    className="focus-analytics__bar-fill"
                    style={{ height: `${heightPct}%`, transitionDelay: `${i * 35}ms` }}
                  />
                </div>
                <div className="focus-analytics__bar-label">{d.dayNum}</div>
                <div className="focus-analytics__bar-wd">{d.weekday}</div>
              </button>
            );
          })}
        </div>

        <div className="focus-analytics__section-title">
          {formatDayLabel(selectedDay)} · {fmtDuration(selectedDetail.total)}
        </div>

        {sessionsLoading ? (
          <div className="focus-analytics__empty">Загрузка…</div>
        ) : selectedDetail.tasks.length === 0 ? (
          <div className="focus-analytics__empty">В этот день фокус-сессий не было.</div>
        ) : (
          <>
            <div className="focus-analytics__tasks">
              {selectedDetail.tasks.map((t, i) => {
                const pct = selectedDetail.total ? (t.secs / selectedDetail.total) * 100 : 0;
                const color = PALETTE[i % PALETTE.length];
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

            <div className="focus-analytics__sessions-title">Сессии</div>
            <div className="focus-analytics__sessions">
              {selectedDetail.sessions.map((s) => (
                <div className="focus-analytics__session" key={s.id}>
                  {editingId === s.id ? (
                    <div className="focus-analytics__session-edit">
                      <input
                        className="focus-analytics__session-input focus-analytics__session-input--title"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        placeholder="Название"
                      />
                      <input
                        className="focus-analytics__session-input focus-analytics__session-input--mins"
                        type="number"
                        min="0"
                        value={editMinutes}
                        onChange={(e) => setEditMinutes(e.target.value)}
                        aria-label="Минуты"
                      />
                      <span className="focus-analytics__session-unit">мин</span>
                      <button type="button" className="focus-analytics__session-btn focus-analytics__session-btn--save" onClick={() => saveEdit(s.id)}>
                        Сохранить
                      </button>
                      <button type="button" className="focus-analytics__session-btn" onClick={() => setEditingId(null)}>
                        Отмена
                      </button>
                    </div>
                  ) : (
                    <>
                      <span className="focus-analytics__session-time">{localTimeOf(s.started_at)}</span>
                      <span className="focus-analytics__session-name">{s.task_title || 'Без названия'}</span>
                      {s.live ? (
                        <span className="focus-analytics__session-live">идёт · {fmtDuration(s.duration_seconds)}</span>
                      ) : (
                        <>
                          <span className="focus-analytics__session-dur">{fmtDuration(s.duration_seconds)}</span>
                          <button
                            type="button"
                            className="focus-analytics__session-icon"
                            onClick={() => startEdit(s)}
                            aria-label="Редактировать"
                            title="Редактировать"
                          >
                            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
                              <path d="M11 2.5l2.5 2.5L6 12.5l-3 .5.5-3L11 2.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            className="focus-analytics__session-icon focus-analytics__session-icon--danger"
                            onClick={() => deleteSession(s.id)}
                            aria-label="Удалить"
                            title="Удалить"
                          >
                            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
                              <path d="M3.5 4.5h9M6.5 4V3h3v1M5 4.5l.5 8h5l.5-8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </button>
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
