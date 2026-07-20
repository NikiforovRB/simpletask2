import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { toLocalDateString } from '../constants';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { useReputation, isPromiseFulfilled, dayStatus, promiseState } from '../hooks/useReputation';
import plusIcon from '../assets/plus.svg';
import plusNavIcon from '../assets/plus-nav.svg';
import deleteIcon from '../assets/delete.svg';
import deleteNavIcon from '../assets/delete-nav.svg';
import dragIcon from '../assets/drag.svg';
import leftIcon from '../assets/left.svg';
import leftNavIcon from '../assets/left-nav.svg';
import rightIcon from '../assets/right.svg';
import rightNavIcon from '../assets/right-nav.svg';
import yesIcon from '../assets/yes.svg';
import noIcon from '../assets/not.svg';
import './ReputationView.css';

const StateMark = ({ state }) => {
  if (state === 'done') return <img className="rep-row__mark" src={yesIcon} alt="" />;
  if (state === 'failed') return <img className="rep-row__mark" src={noIcon} alt="" />;
  return null;
};

const pluralDays = (n) => {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return 'день';
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return 'дня';
  return 'дней';
};

const KINDS = [
  { key: 'yesno', label: 'Да / Нет' },
  { key: 'time', label: 'Время' },
  { key: 'count', label: 'Количество' },
];

const PERIODS = [
  { key: '7d', label: '7 дней' },
  { key: 'week', label: 'Неделя' },
  { key: 'month', label: 'Месяц' },
  { key: '3m', label: '3 месяца' },
  { key: '4m', label: '4 месяца' },
];

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MONTHS_NOM = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const MONTHS_ABBR = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];
const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const addMonths = (d, n) => { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; };
const weekdayIndex = (d) => (d.getDay() + 6) % 7; // Mon=0..Sun=6
const startOfWeek = (d) => addDays(startOfDay(d), -weekdayIndex(d));

function computeRange(periodType, offset, today) {
  if (periodType === '7d') {
    const end = addDays(today, offset * 7);
    return { start: addDays(end, -6), end };
  }
  if (periodType === 'week') {
    const start = addDays(startOfWeek(today), offset * 7);
    return { start, end: addDays(start, 6) };
  }
  if (periodType === 'month') {
    const base = addMonths(today, offset);
    const start = new Date(base.getFullYear(), base.getMonth(), 1);
    const end = new Date(base.getFullYear(), base.getMonth() + 1, 0);
    return { start: startOfDay(start), end: startOfDay(end) };
  }
  // 3m / 4m: N calendar months ending at the anchor month; paging is per-month.
  const monthsBack = periodType === '4m' ? 4 : 3;
  const anchor = addMonths(today, offset);
  const start = new Date(anchor.getFullYear(), anchor.getMonth() - (monthsBack - 1), 1);
  const end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  return { start: startOfDay(start), end: startOfDay(end) };
}

function rangeLabel(periodType, start, end) {
  if (periodType === 'month') return `${MONTHS_NOM[start.getMonth()]} ${start.getFullYear()}`;
  if (periodType === '3m' || periodType === '4m') return `${MONTHS_NOM[start.getMonth()]} – ${MONTHS_NOM[end.getMonth()].toLowerCase()} ${end.getFullYear()}`;
  const s = `${start.getDate()} ${MONTHS[start.getMonth()]}`;
  const e = `${end.getDate()} ${MONTHS[end.getMonth()]}`;
  return `${s} – ${e}`;
}

function eachDay(start, end) {
  const days = [];
  let d = startOfDay(start);
  const last = startOfDay(end);
  while (d <= last) { days.push(d); d = addDays(d, 1); }
  return days;
}

function dayHeading(dateStr) {
  const d = new Date(`${dateStr}T12:00:00`);
  const today = toLocalDateString(new Date());
  const yest = toLocalDateString(addDays(new Date(), -1));
  const tomorrow = toLocalDateString(addDays(new Date(), 1));
  const base = `${d.getDate()} ${MONTHS[d.getMonth()]}, ${WEEKDAYS[weekdayIndex(d)].toLowerCase()}`;
  if (dateStr === today) return `Сегодня · ${base}`;
  if (dateStr === tomorrow) return `Завтра · ${base}`;
  if (dateStr === yest) return `Вчера · ${base}`;
  return base;
}

const fmtHM = (min) => {
  if (min == null) return '—';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h && m) return `${h} ч ${m} мин`;
  if (h) return `${h} ч`;
  return `${m} мин`;
};

function NumInput({ value, onChange, placeholder, max }) {
  return (
    <input
      type="number"
      className="rep__num"
      value={value ?? ''}
      min={0}
      max={max}
      placeholder={placeholder}
      onChange={(e) => {
        const v = e.target.value;
        onChange(v === '' ? null : Math.max(0, Number(v)));
      }}
    />
  );
}

function PromiseRow({ promise, onUpdate, onDelete, dragHandleProps }) {
  const state = promiseState(promise); // 'done' | 'failed' | 'neutral'
  const fulfilled = state === 'done';
  const hasMetrics = promise.kind === 'time' || promise.kind === 'count';
  const [hover, setHover] = useState(false);
  const [stacked, setStacked] = useState(false);

  const titleRef = useRef(null);
  const mainRef = useRef(null);
  const metricsRef = useRef(null);
  const measureRef = useRef(null);

  const resizeTitle = () => {
    const el = titleRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };

  // Decide whether the title fits on one line next to the metrics; if not,
  // metrics move to a second line. Measured with an off-layout span so the
  // decision does not depend on the current (stacked/inline) layout.
  const evaluateLayout = () => {
    const main = mainRef.current;
    const measure = measureRef.current;
    if (!main || !measure) return;
    const metricsW = metricsRef.current ? metricsRef.current.offsetWidth : 0;
    const gap = 8;
    const avail = main.clientWidth - (metricsW ? metricsW + gap : 0);
    setStacked(measure.scrollWidth > avail + 1);
  };

  useLayoutEffect(() => {
    resizeTitle();
    const el = titleRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => resizeTitle());
    ro.observe(el);
    return () => ro.disconnect();
  }, [promise.title, stacked]);

  useLayoutEffect(() => {
    if (!hasMetrics) return undefined;
    evaluateLayout();
    const el = mainRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => evaluateLayout());
    ro.observe(el);
    return () => ro.disconnect();
  }, [promise.title, hasMetrics]);

  // yesno cycle: neutral -> done -> failed -> neutral
  const cycleYesNo = () => {
    const cur = promise.fact_value;
    let next;
    if (cur == null) next = 1;
    else if (cur >= 1) next = 0;
    else next = null;
    onUpdate(promise.id, { fact_value: next });
  };

  const planH = promise.plan_value != null ? Math.floor(promise.plan_value / 60) : null;
  const planM = promise.plan_value != null ? promise.plan_value % 60 : null;
  const factH = promise.fact_value != null ? Math.floor(promise.fact_value / 60) : null;
  const factM = promise.fact_value != null ? promise.fact_value % 60 : null;

  const setTime = (field, h, m) => {
    const hh = h == null ? 0 : h;
    const mm = m == null ? 0 : m;
    const total = h == null && m == null ? null : hh * 60 + mm;
    onUpdate(promise.id, { [field]: total });
  };

  return (
    <div
      className={`rep-row rep-row--${promise.kind} ${fulfilled ? 'rep-row--done' : ''}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {promise.kind === 'yesno' ? (
        <button
          type="button"
          className={`rep-row__check rep-row__check--${state}`}
          onClick={cycleYesNo}
          aria-label="Изменить статус"
        >
          <StateMark state={state} />
        </button>
      ) : (
        <span className={`rep-row__badge rep-row__badge--${state}`} aria-hidden>
          <StateMark state={state} />
        </span>
      )}

      <div className="rep-row__main" ref={mainRef}>
        <textarea
          ref={titleRef}
          className="rep-row__title"
          value={promise.title}
          placeholder="Обещание"
          rows={1}
          onChange={(e) => onUpdate(promise.id, { title: e.target.value })}
          onInput={resizeTitle}
        />

        {hasMetrics && stacked && <span className="rep-row__break" aria-hidden />}

        {promise.kind === 'time' && (
          <span className="rep-row__metrics" ref={metricsRef}>
            <span className="rep-row__metric">
              <span className="rep-row__metric-label">план</span>
              <NumInput value={planH} onChange={(v) => setTime('plan_value', v, planM)} placeholder="ч" />
              <NumInput value={planM} onChange={(v) => setTime('plan_value', planH, v)} placeholder="м" max={59} />
            </span>
            <span className="rep-row__arrow">→</span>
            <span className="rep-row__metric">
              <span className="rep-row__metric-label">факт</span>
              <NumInput value={factH} onChange={(v) => setTime('fact_value', v, factM)} placeholder="ч" />
              <NumInput value={factM} onChange={(v) => setTime('fact_value', factH, v)} placeholder="м" max={59} />
            </span>
          </span>
        )}

        {promise.kind === 'count' && (
          <span className="rep-row__metrics" ref={metricsRef}>
            <span className="rep-row__metric">
              <span className="rep-row__metric-label">план</span>
              <NumInput value={promise.plan_value} onChange={(v) => onUpdate(promise.id, { plan_value: v })} placeholder="0" />
            </span>
            <span className="rep-row__arrow">→</span>
            <span className="rep-row__metric">
              <span className="rep-row__metric-label">факт</span>
              <NumInput value={promise.fact_value} onChange={(v) => onUpdate(promise.id, { fact_value: v })} placeholder="0" />
            </span>
          </span>
        )}
      </div>

      {hasMetrics && (
        <span className="rep-row__measure" ref={measureRef} aria-hidden>
          {promise.title || 'Обещание'}
        </span>
      )}

      <button
        type="button"
        className={`rep-row__del ${hover ? 'rep-row__del--visible' : ''}`}
        onClick={() => onDelete(promise.id)}
        aria-label="Удалить"
      >
        <img src={hover ? deleteNavIcon : deleteIcon} alt="" />
      </button>
      {dragHandleProps && (
        <span className="rep-row__drag" {...dragHandleProps} aria-label="Перетащить">
          <img src={dragIcon} alt="" />
        </span>
      )}
    </div>
  );
}

function SortablePromiseRow({ promise, onUpdate, onDelete }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: promise.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };
  return (
    <div ref={setNodeRef} style={style}>
      <PromiseRow
        promise={promise}
        onUpdate={onUpdate}
        onDelete={onDelete}
        dragHandleProps={{ ...attributes, ...listeners }}
      />
    </div>
  );
}

function AddPromiseForm({ onAdd, onClose }) {
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState('yesno');
  const [planH, setPlanH] = useState('');
  const [planM, setPlanM] = useState('');
  const [planCount, setPlanCount] = useState('');

  const submit = () => {
    if (!title.trim()) return;
    let plan_value = null;
    if (kind === 'time') plan_value = (Number(planH) || 0) * 60 + (Number(planM) || 0);
    if (kind === 'count') plan_value = Number(planCount) || 0;
    onAdd({ title: title.trim(), kind, plan_value, fact_value: null, done: false });
    onClose();
  };

  return (
    <div className="rep-add">
      <input
        className="rep-add__title"
        value={title}
        placeholder="Что обещаю себе?"
        autoFocus
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onClose(); }}
      />
      <div className="rep-add__kinds">
        {KINDS.map((k) => (
          <button
            key={k.key}
            type="button"
            className={`rep-add__kind ${kind === k.key ? 'rep-add__kind--active' : ''}`}
            onClick={() => setKind(k.key)}
          >
            {k.label}
          </button>
        ))}
      </div>
      {kind === 'time' && (
        <div className="rep-add__plan">
          <span className="rep-add__plan-label">План:</span>
          <input type="number" min="0" className="rep__num" value={planH} placeholder="ч" onChange={(e) => setPlanH(e.target.value)} />
          <input type="number" min="0" max="59" className="rep__num" value={planM} placeholder="мин" onChange={(e) => setPlanM(e.target.value)} />
        </div>
      )}
      {kind === 'count' && (
        <div className="rep-add__plan">
          <span className="rep-add__plan-label">План:</span>
          <input type="number" min="0" className="rep__num" value={planCount} placeholder="кол-во" onChange={(e) => setPlanCount(e.target.value)} />
        </div>
      )}
      <div className="rep-add__actions">
        <button type="button" className="rep-add__submit" onClick={submit}>Добавить</button>
        <button type="button" className="rep-add__cancel" onClick={onClose}>Отмена</button>
      </div>
    </div>
  );
}

function DayCard({ dateStr, promises, onAdd, onUpdate, onDelete }) {
  const status = dayStatus(promises);
  const [adding, setAdding] = useState(false);
  const hasHover = useMediaQuery('(hover: hover)');
  const [plusHover, setPlusHover] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const items = useMemo(
    () => [...promises].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
    [promises],
  );

  const handleDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return;
    const ids = items.map((p) => p.id);
    const oldIndex = ids.indexOf(active.id);
    const newIndex = ids.indexOf(over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const reordered = arrayMove(items, oldIndex, newIndex);
    reordered.forEach((p, idx) => {
      if ((p.position ?? 0) !== idx) onUpdate(p.id, { position: idx });
    });
  };

  return (
    <section className="rep-day rep-anim-in">
      <div className="rep-day__header">
        {status !== 'empty' && status !== 'neutral' && (
          <span className={`rep-day__dot rep-day__dot--${status}`} aria-hidden />
        )}
        <span className="rep-day__title">{dayHeading(dateStr)}</span>
        <button
          type="button"
          className="rep-day__add"
          onMouseEnter={() => hasHover && setPlusHover(true)}
          onMouseLeave={() => hasHover && setPlusHover(false)}
          onClick={() => setAdding(true)}
          aria-label="Добавить обещание"
        >
          <img src={hasHover && plusHover ? plusNavIcon : plusIcon} alt="" />
        </button>
        {promises.length > 0 && (
          <span className="rep-day__count">{promises.filter(isPromiseFulfilled).length}/{promises.length}</span>
        )}
      </div>
      <div className="rep-day__line" />
      <div className="rep-day__rows">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={items.map((p) => p.id)} strategy={verticalListSortingStrategy}>
            {items.map((p) => (
              <SortablePromiseRow key={p.id} promise={p} onUpdate={onUpdate} onDelete={onDelete} />
            ))}
          </SortableContext>
        </DndContext>
      </div>
      {adding && (
        <AddPromiseForm
          onAdd={(payload) => onAdd({ ...payload, promise_date: dateStr })}
          onClose={() => setAdding(false)}
        />
      )}
    </section>
  );
}

// Column-major cells (each week is a top-to-bottom column).
function buildCells({ days, leadingPad, byDate, onSelect, selected, todayStr }) {
  const columns = Math.ceil((leadingPad + days.length) / 7);
  const cells = [];
  for (let col = 0; col < columns; col++) {
    for (let row = 0; row < 7; row++) {
      const idx = col * 7 + row - leadingPad;
      if (idx < 0 || idx >= days.length) {
        cells.push(<span key={`p${col}-${row}`} className="rep-hm__cell rep-hm__cell--pad" aria-hidden />);
        continue;
      }
      const d = days[idx];
      const ds = toLocalDateString(d);
      const status = dayStatus(byDate.get(ds) || []);
      cells.push(
        <button
          key={ds}
          type="button"
          className={`rep-hm__cell rep-hm__cell--${status} ${ds === todayStr ? 'rep-hm__cell--today' : ''} ${ds === selected ? 'rep-hm__cell--selected' : ''}`}
          title={`${d.getDate()} ${MONTHS[d.getMonth()]}`}
          onClick={() => onSelect(ds)}
        >
          <span className="rep-hm__num">{d.getDate()}</span>
        </button>,
      );
    }
  }
  return { cells, columns };
}

function MonthBlock({ year, month, byDate, onSelect, selected, todayStr }) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days = [];
  for (let d = 1; d <= daysInMonth; d++) days.push(new Date(year, month, d));
  const leadingPad = weekdayIndex(new Date(year, month, 1));
  const { cells } = buildCells({ days, leadingPad, byDate, onSelect, selected, todayStr });
  return (
    <div className="rep-hm__month-block">
      <div className="rep-hm__month-title">{MONTHS_NOM[month]}</div>
      <div className="rep-hm__grid">{cells}</div>
    </div>
  );
}

const HeatLegend = () => (
  <div className="rep-heatmap__legend">
    <span><i className="rep-hm__legend-sw rep-hm__cell--green" /> всё выполнено</span>
    <span><i className="rep-hm__legend-sw rep-hm__cell--yellow" /> частично</span>
    <span><i className="rep-hm__legend-sw rep-hm__cell--red" /> не выполнено</span>
  </div>
);

function Heatmap({ start, end, byDate, onSelect, selected, periodType }) {
  const todayStr = toLocalDateString(new Date());
  const splitByMonth = periodType === 'month' || periodType === '3m' || periodType === '4m';

  if (splitByMonth) {
    const monthsList = [];
    let cur = new Date(start.getFullYear(), start.getMonth(), 1);
    const last = new Date(end.getFullYear(), end.getMonth(), 1);
    while (cur <= last) {
      monthsList.push({ y: cur.getFullYear(), m: cur.getMonth() });
      cur = addMonths(cur, 1);
    }
    return (
      <div className="rep-heatmap rep-anim-in">
        <div className="rep-hm">
          <div className="rep-hm__months-row">
            {monthsList.map(({ y, m }) => (
              <MonthBlock key={`${y}-${m}`} year={y} month={m} byDate={byDate} onSelect={onSelect} selected={selected} todayStr={todayStr} />
            ))}
          </div>
        </div>
        <HeatLegend />
      </div>
    );
  }

  const days = eachDay(start, end);
  const leadingPad = weekdayIndex(days[0]);
  const { cells, columns } = buildCells({ days, leadingPad, byDate, onSelect, selected, todayStr });
  const monthLabels = new Array(columns).fill('');
  days.forEach((d, i) => {
    if (d.getDate() === 1) monthLabels[Math.floor((leadingPad + i) / 7)] = MONTHS_ABBR[d.getMonth()];
  });
  if (!monthLabels[0]) monthLabels[0] = MONTHS_ABBR[days[0].getMonth()];
  const colsTemplate = `repeat(${columns}, 24px)`;

  return (
    <div className="rep-heatmap rep-anim-in">
      <div className="rep-hm">
        <div className="rep-hm__scroll">
          <div className="rep-hm__months" style={{ gridTemplateColumns: colsTemplate }}>
            {monthLabels.map((m, i) => <span key={i} className="rep-hm__month">{m}</span>)}
          </div>
          <div className="rep-hm__grid">{cells}</div>
        </div>
      </div>
      <HeatLegend />
    </div>
  );
}

export function ReputationView({ headerSlot, daysCount = 3, setDaysCount }) {
  const { promises, addPromise, updatePromise, deletePromise } = useReputation();
  const [mode, setMode] = useState('list'); // 'list' | 'heatmap'
  const [periodType, setPeriodType] = useState('7d');
  const [offset, setOffset] = useState(0);
  const [listOffset, setListOffset] = useState(0);
  const [listLeftHover, setListLeftHover] = useState(false);
  const [listRightHover, setListRightHover] = useState(false);
  const [selectedDay, setSelectedDay] = useState(null);

  const today = useMemo(() => startOfDay(new Date()), []);
  const todayStr = toLocalDateString(today);

  const byDate = useMemo(() => {
    const m = new Map();
    for (const p of promises) {
      if (!m.has(p.promise_date)) m.set(p.promise_date, []);
      m.get(p.promise_date).push(p);
    }
    return m;
  }, [promises]);

  const { start, end } = useMemo(() => computeRange(periodType, offset, today), [periodType, offset, today]);

  // Streaks (computed over the full history, up to today).
  const { promiseStreak, dayStreak } = useMemo(() => {
    const past = promises.filter((p) => p.promise_date <= todayStr);
    // promise streak: trailing consecutive fulfilled promises by (date, position)
    const ordered = [...past].sort((a, b) =>
      a.promise_date === b.promise_date ? (a.position ?? 0) - (b.position ?? 0) : (a.promise_date < b.promise_date ? -1 : 1),
    );
    let pStreak = 0;
    for (let i = ordered.length - 1; i >= 0; i--) {
      const s = promiseState(ordered[i]);
      if (s === 'done') pStreak++;
      else if (s === 'failed') break;
      // neutral (pending) does not break or count
    }
    // day streak: trailing consecutive fully-green days (a failed day breaks it)
    const dates = Array.from(new Set(past.map((p) => p.promise_date))).sort();
    let dStreak = 0;
    for (let i = dates.length - 1; i >= 0; i--) {
      const st = dayStatus(byDate.get(dates[i]) || []);
      if (st === 'green') dStreak++;
      else if (st === 'yellow' || st === 'red') break;
      // green50 / neutral (pending, no fails) does not break or count
    }
    return { promiseStreak: pStreak, dayStreak: dStreak };
  }, [promises, byDate, todayStr]);

  // List mode: N consecutive days from the (offset-shifted) base, top to bottom.
  const listDays = useMemo(() => {
    const n = Math.max(1, Math.min(7, daysCount || 1));
    const base = addDays(today, listOffset);
    const arr = [];
    for (let i = 0; i < n; i++) arr.push(toLocalDateString(addDays(base, i)));
    return arr;
  }, [daysCount, today, listOffset]);

  const detailDay = selectedDay && selectedDay >= toLocalDateString(start) && selectedDay <= toLocalDateString(end)
    ? selectedDay
    : null;

  const controls = (
    <div className="rep-ctl">
      <select className="dashboard__select" value={mode} onChange={(e) => setMode(e.target.value)} aria-label="Режим статистики">
        <option value="list">Статистика</option>
        <option value="heatmap">Тепловая карта</option>
      </select>
      {mode === 'list' && (
        <>
          <button
            type="button"
            className="dashboard__shift-btn"
            onMouseEnter={() => setListLeftHover(true)}
            onMouseLeave={() => setListLeftHover(false)}
            onClick={() => setListOffset((o) => o - 1)}
            aria-label="Назад"
          >
            <img src={listLeftHover ? leftNavIcon : leftIcon} alt="" />
          </button>
          <select className="dashboard__select" value={daysCount} onChange={(e) => setDaysCount?.(Number(e.target.value))} aria-label="Количество дней">
            {[1, 2, 3, 4, 5, 6, 7].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <button
            type="button"
            className="dashboard__shift-btn"
            onMouseEnter={() => setListRightHover(true)}
            onMouseLeave={() => setListRightHover(false)}
            onClick={() => setListOffset((o) => o + 1)}
            aria-label="Вперёд"
          >
            <img src={listRightHover ? rightNavIcon : rightIcon} alt="" />
          </button>
        </>
      )}
      {mode === 'heatmap' && (
        <>
          <select className="dashboard__select" value={periodType} onChange={(e) => { setPeriodType(e.target.value); setOffset(0); }} aria-label="Период">
            {PERIODS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
          <button type="button" className="rep-ctl__nav" onClick={() => setOffset((o) => o - 1)} aria-label="Раньше">‹</button>
          <span className="rep-ctl__label">{rangeLabel(periodType, start, end)}</span>
          <button type="button" className="rep-ctl__nav" onClick={() => setOffset((o) => Math.min(0, o + 1))} aria-label="Позже" disabled={offset >= 0}>›</button>
        </>
      )}
    </div>
  );

  return (
    <div className="rep">
      {headerSlot && createPortal(controls, headerSlot)}
      <div className="rep__streak">
        <div className="rep__streak-flame" aria-hidden>🔥</div>
        <div className="rep__streak-main">
          <span className="rep__streak-num" key={promiseStreak}>{promiseStreak}</span>
          <span className="rep__streak-label">{promiseStreak === 1 ? 'обещание подряд' : 'обещаний подряд'}</span>
        </div>
        <div className="rep__streak-days">
          <span className="rep__streak-days-label">Успешная серия</span>
          <span className="rep__streak-days-value">{dayStreak} {pluralDays(dayStreak)} подряд</span>
        </div>
      </div>

      {mode === 'list' ? (
        <div className="rep__list">
          {listDays.map((ds) => (
            <DayCard
              key={ds}
              dateStr={ds}
              promises={(byDate.get(ds) || [])}
              onAdd={addPromise}
              onUpdate={updatePromise}
              onDelete={deletePromise}
            />
          ))}
        </div>
      ) : (
        <div className="rep__heatmap-wrap">
          <Heatmap start={start} end={end} byDate={byDate} onSelect={setSelectedDay} selected={detailDay} periodType={periodType} />
          {detailDay && (
            <DayCard
              key={detailDay}
              dateStr={detailDay}
              promises={(byDate.get(detailDay) || [])}
              onAdd={addPromise}
              onUpdate={updatePromise}
              onDelete={deletePromise}
            />
          )}
        </div>
      )}
    </div>
  );
}
