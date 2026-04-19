import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
} from '@dnd-kit/core';
import { useSortable, SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { toLocalDateString } from '../constants';
import {
  weekdayShortMon,
  monthShortRu,
  isRequiredDay,
  getEntryColor,
  computeStreak,
  normalizeHabitTimeString,
  isInfoHabitType,
  parseTimeToMinutes,
  formatMinutesToHabitTime,
} from '../lib/habitsLogic';

const INFO_HABIT_COLOR = '#666666';

const MONTH_FULL_RU = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
];

const WEEKDAY_SHORT_MON = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];

function getMonthGridCells(year, month) {
  const first = new Date(year, month, 1);
  const firstDay = first.getDay();
  const padStart = firstDay === 0 ? 6 : firstDay - 1;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < padStart; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function computeMonthAverageLabel(habit, habitEntries, year, month) {
  const type = habit.type;
  if (type !== 'not_more' && type !== 'not_later' && type !== 'just_time') return null;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const nums = [];
  const mins = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = toLocalDateString(new Date(year, month, d));
    const e = habitEntries[ds];
    if (!e) continue;
    if (type === 'not_more') {
      const n = Number(e.num);
      if (Number.isFinite(n)) nums.push(n);
    } else {
      const m = parseTimeToMinutes(e.time);
      if (m != null) mins.push(m);
    }
  }
  if (type === 'not_more') {
    if (!nums.length) return null;
    const avg = nums.reduce((a, b) => a + b, 0) / nums.length;
    const r = Math.round(avg * 100) / 100;
    return Number.isInteger(r) ? String(r) : r.toFixed(2).replace(/\.?0+$/, '');
  }
  if (!mins.length) return null;
  const avg = mins.reduce((a, b) => a + b, 0) / mins.length;
  return formatMinutesToHabitTime(avg);
}
import checkIcon from '../assets/check.svg';
import netIcon from '../assets/net.svg';
import dragIcon from '../assets/drag.svg';
import editIcon from '../assets/edit.svg';
import editNavIcon from '../assets/edit-nav.svg';
import plusIcon from '../assets/plus.svg';
import plusNavIcon from '../assets/plus-nav.svg';
import leftIcon from '../assets/left.svg';
import leftNavIcon from '../assets/left-nav.svg';
import rightIcon from '../assets/right.svg';
import rightNavIcon from '../assets/right-nav.svg';
import spacingIcon from '../assets/spacing.svg';
import spacingNavIcon from '../assets/spacing-nav.svg';
import calendarIcon from '../assets/calendar.svg';
import calendarNavIcon from '../assets/calendar-nav.svg';
import './HabitsView.css';

function clampHabitsSidebarWidthPx(n) {
  const v = Number(n);
  if (Number.isFinite(v)) return Math.max(100, Math.min(400, Math.round(v)));
  return 220;
}

const HABITS_OFFSET_KEY = 'habits_date_offset';
const HABITS_COUNT_KEY = 'habits_days_count';

function loadInt(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    if (v === null || v === '') return fallback;
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : fallback;
  } catch {
    return fallback;
  }
}

function getDays(baseDate, count) {
  const days = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(baseDate);
    d.setDate(d.getDate() + i);
    days.push(d);
  }
  return days;
}

function HabitNameRow({ habit, isSelected, streak, onSelect, onEdit, isFirst }) {
  const isInfo = isInfoHabitType(habit.type);
  return (
    <div
      className={`habits-view__name-row ${isFirst ? 'habits-view__name-row--first' : ''}`}
    >
      <button
        type="button"
        className={`habits-view__name-btn ${isSelected ? 'habits-view__name-btn--active' : ''}`}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(habit.id);
        }}
        onDoubleClick={(e) => {
          e.preventDefault();
          onEdit(habit.id);
        }}
      >
        <span
          className="habits-view__name-text"
          style={isInfo && !isSelected ? { color: INFO_HABIT_COLOR } : undefined}
        >
          {habit.title}
        </span>
        {!isInfo && habit.streak_enabled && streak > 0 && (
          <span className="habits-view__streak" title="Дней подряд">
            {streak}
          </span>
        )}
      </button>
    </div>
  );
}

function SortableReorderRow({ habit }) {
  const { setNodeRef, transform, transition, isDragging, attributes, listeners } = useSortable({ id: habit.id });
  const style = isDragging
    ? { opacity: 0.5, transition: 'transform 280ms ease' }
    : {
        transform: CSS.Transform.toString(transform),
        transition,
      };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`habits-view__reorder-row ${isDragging ? 'habits-view__reorder-row--dragging' : ''}`}
    >
      <span className="habits-view__reorder-title">{habit.title}</span>
      <span className="habits-view__reorder-handle" {...attributes} {...listeners} aria-label="Переместить">
        <img src={dragIcon} alt="" />
      </span>
    </div>
  );
}

function YesNoCell({ entry, onCycle }) {
  const yn = entry?.yes_no;
  const cycle = () => {
    if (yn == null) onCycle({ yes_no: 'yes' });
    else if (yn === 'yes') onCycle({ yes_no: 'no' });
    else onCycle(null);
  };
  return (
    <button type="button" className="habits-view__cell habits-view__cell--yesno" onClick={cycle}>
      {yn === 'yes' && <img src={checkIcon} alt="" className="habits-view__yesno-icon" />}
      {yn === 'no' && <img src={netIcon} alt="" className="habits-view__yesno-icon" />}
    </button>
  );
}

function NumberCell({ habit, entry, onCommit }) {
  const saved = entry?.num != null && entry?.num !== '' ? String(entry.num) : '';
  const [local, setLocal] = useState(saved);
  useEffect(() => {
    setLocal(saved);
  }, [saved]);
  const parsed = local.trim() === '' ? null : Number(local.replace(',', '.'));
  const color = getEntryColor(habit, {
    ...entry,
    num: parsed != null && Number.isFinite(parsed) ? parsed : entry?.num,
  });
  return (
    <input
      type="text"
      inputMode="decimal"
      className="habits-view__cell habits-view__cell--input"
      style={color ? { color } : undefined}
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => {
        const raw = local.trim();
        if (raw === '') {
          onCommit(null);
          return;
        }
        const n = Number(raw.replace(',', '.'));
        if (Number.isFinite(n)) onCommit({ num: n });
      }}
    />
  );
}

function TimePickCell({ habit, entry, dateStr, onOpen }) {
  const t = entry?.time;
  const color = getEntryColor(habit, entry);
  return (
    <button
      type="button"
      className="habits-view__cell habits-view__time-pick"
      onClick={(e) => {
        e.stopPropagation();
        onOpen({ habitId: habit.id, dateStr, initial: t || '' });
      }}
    >
      {t ? <span style={color ? { color } : undefined}>{t.length >= 5 ? t.slice(0, 5) : t}</span> : null}
    </button>
  );
}

function JustTimeCell({ habit, entry, dateStr, onOpen }) {
  const t = entry?.time;
  return (
    <button
      type="button"
      className="habits-view__cell habits-view__time-pick"
      onClick={(e) => {
        e.stopPropagation();
        onOpen({ habitId: habit.id, dateStr, initial: t || '' });
      }}
    >
      {t ? <span style={{ color: INFO_HABIT_COLOR }}>{t.length >= 5 ? t.slice(0, 5) : t}</span> : null}
    </button>
  );
}

function JustTextCell({ entry, onCommit }) {
  const saved = typeof entry?.text === 'string' ? entry.text : '';
  const [local, setLocal] = useState(saved);
  useEffect(() => {
    setLocal(saved);
  }, [saved]);
  return (
    <input
      type="text"
      className="habits-view__cell habits-view__cell--input habits-view__cell--text"
      style={{ color: INFO_HABIT_COLOR }}
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => {
        const raw = local;
        if ((raw || '').trim() === '') {
          onCommit(null);
          return;
        }
        onCommit({ text: raw });
      }}
    />
  );
}

export function HabitsView({
  habits,
  entries,
  addHabit,
  updateHabit,
  deleteHabit,
  reorderHabits,
  setEntry,
  hasHover,
  habitsSidebarWidthPx,
  setHabitsSidebarWidthPx,
}) {
  const [offset, setOffset] = useState(() => loadInt(HABITS_OFFSET_KEY, 0));
  const [daysCount, setDaysCount] = useState(() => {
    const n = loadInt(HABITS_COUNT_KEY, 21);
    return n >= 1 && n <= 60 ? n : 21;
  });
  const [selectedId, setSelectedId] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formTitle, setFormTitle] = useState('');
  const [formType, setFormType] = useState('yes_no');
  const [formLimitNumber, setFormLimitNumber] = useState('');
  const [formLimitTime, setFormLimitTime] = useState('06:00');
  const [formSkip, setFormSkip] = useState('none');
  const [formStreak, setFormStreak] = useState(true);
  const [leftHover, setLeftHover] = useState(false);
  const [rightHover, setRightHover] = useState(false);
  const [fabHover, setFabHover] = useState(false);
  const [addBtnHover, setAddBtnHover] = useState(false);
  const [editBtnHover, setEditBtnHover] = useState(false);
  const [reorderBtnHover, setReorderBtnHover] = useState(false);
  const [widthBtnHover, setWidthBtnHover] = useState(false);
  const [statsBtnHover, setStatsBtnHover] = useState(false);
  const [statsPrevHover, setStatsPrevHover] = useState(false);
  const [statsNextHover, setStatsNextHover] = useState(false);
  const [todayHover, setTodayHover] = useState(false);
  const [timeModal, setTimeModal] = useState(null);
  const timeInputRef = useRef(null);
  const headerStackRef = useRef(null);
  const [stackH, setStackH] = useState(72);
  const [reorderOpen, setReorderOpen] = useState(false);
  const [activeReorderId, setActiveReorderId] = useState(null);
  const [widthModalOpen, setWidthModalOpen] = useState(false);
  const [widthDraft, setWidthDraft] = useState(220);
  const [statsModal, setStatsModal] = useState(null);

  const effectiveSidebarWidth = clampHabitsSidebarWidthPx(habitsSidebarWidthPx ?? 220);
  const liveSidebarWidth = widthModalOpen ? clampHabitsSidebarWidthPx(widthDraft) : effectiveSidebarWidth;

  const openWidthModal = useCallback(() => {
    setWidthDraft(effectiveSidebarWidth);
    setWidthModalOpen(true);
  }, [effectiveSidebarWidth]);

  const applyWidthStep = useCallback((delta) => {
    setWidthDraft((w) => clampHabitsSidebarWidthPx(w + delta));
  }, []);

  const saveWidthModal = useCallback(async () => {
    if (typeof setHabitsSidebarWidthPx === 'function') {
      await setHabitsSidebarWidthPx(clampHabitsSidebarWidthPx(widthDraft));
    }
    setWidthModalOpen(false);
  }, [widthDraft, setHabitsSidebarWidthPx]);

  const openStatsModal = useCallback((habitId) => {
    const now = new Date();
    setStatsModal({ habitId, year: now.getFullYear(), month: now.getMonth() });
  }, []);

  const shiftStatsMonth = useCallback((delta) => {
    setStatsModal((m) => {
      if (!m) return m;
      const d = new Date(m.year, m.month + delta, 1);
      return { habitId: m.habitId, year: d.getFullYear(), month: d.getMonth() };
    });
  }, []);

  const closeStatsModal = useCallback(() => setStatsModal(null), []);

  useEffect(() => {
    try {
      localStorage.setItem(HABITS_OFFSET_KEY, String(offset));
    } catch {}
  }, [offset]);

  useEffect(() => {
    try {
      localStorage.setItem(HABITS_COUNT_KEY, String(daysCount));
    } catch {}
  }, [daysCount]);

  useEffect(() => {
    if (habits.length && selectedId && !habits.some((h) => h.id === selectedId)) {
      setSelectedId(null);
    }
  }, [habits, selectedId]);

  const today = useMemo(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  }, []);

  const baseDate = useMemo(() => {
    const b = new Date(today);
    b.setDate(b.getDate() - (daysCount - 1) + offset);
    return b;
  }, [today, offset, daysCount]);

  const dateColumns = useMemo(() => getDays(baseDate, daysCount), [baseDate, daysCount]);

  useLayoutEffect(() => {
    const el = headerStackRef.current;
    if (!el) return;
    const sync = () => setStackH(el.offsetHeight);
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, [dateColumns.length, daysCount, offset]);

  const todayStr = useMemo(() => toLocalDateString(today), [today]);

  const todayColIdx = useMemo(
    () => dateColumns.findIndex((d) => toLocalDateString(d) === todayStr),
    [dateColumns, todayStr]
  );
  const todayIsFirstCol = todayColIdx === 0;

  const gridTemplateColumns = useMemo(
    () => `repeat(${dateColumns.length}, minmax(44px, 1fr))`,
    [dateColumns.length]
  );

  const openNewModal = useCallback(() => {
    setEditingId(null);
    setFormTitle('');
    setFormType('yes_no');
    setFormLimitNumber('');
    setFormLimitTime('06:00');
    setFormSkip('none');
    setFormStreak(true);
    setModalOpen(true);
  }, []);

  const openEditModal = useCallback(
    (id) => {
      const h = habits.find((x) => x.id === id);
      if (!h) return;
      setEditingId(id);
      setFormTitle(h.title);
      setFormType(h.type);
      setFormLimitNumber(h.limit_number != null ? String(h.limit_number) : '');
      setFormLimitTime(h.limit_time || '06:00');
      setFormSkip(h.skip_mode || 'none');
      setFormStreak(h.streak_enabled !== false);
      setModalOpen(true);
    },
    [habits]
  );

  const saveModal = useCallback(async () => {
    const lim = parseFloat(String(formLimitNumber).replace(',', '.'));
    const payload = {
      title: formTitle.trim() || 'Привычка',
      type: formType,
      limit_number:
        formType === 'not_more' || formType === 'not_less' ? (Number.isFinite(lim) ? lim : null) : null,
      limit_time: formType === 'not_later' ? formLimitTime : null,
      skip_mode: formSkip,
      streak_enabled: formStreak,
    };
    if (editingId) {
      await updateHabit(editingId, payload);
    } else {
      await addHabit(payload);
    }
    setModalOpen(false);
  }, [formTitle, formType, formLimitNumber, formLimitTime, formSkip, formStreak, editingId, addHabit, updateHabit]);

  const handleDelete = useCallback(async () => {
    if (!editingId) return;
    await deleteHabit(editingId);
    setModalOpen(false);
    setEditingId(null);
  }, [editingId, deleteHabit]);

  const openTimePicker = useCallback((p) => {
    setTimeModal({ habitId: p.habitId, dateStr: p.dateStr, initial: p.initial || '' });
  }, []);

  const commitTimeModal = useCallback(() => {
    const m = timeModal;
    if (!m) return;
    const raw = (timeInputRef.current?.value || '').trim();
    const norm = normalizeHabitTimeString(raw);
    setTimeModal(null);
    (async () => {
      try {
        if (!norm) await setEntry(m.habitId, m.dateStr, null);
        else await setEntry(m.habitId, m.dateStr, { time: norm });
      } catch (err) {
        console.error('Ошибка сохранения времени:', err);
      }
    })();
  }, [timeModal, setEntry]);

  const closeTimeModal = useCallback(() => {
    setTimeModal(null);
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    const handler = (e) => {
      const t = e.target;
      if (!t || typeof t.closest !== 'function') return;
      if (t.closest('.habits-view__name-btn')) return;
      if (t.closest('.habits-view__toolbar')) return;
      if (t.closest('.dashboard__settings-overlay')) return;
      setSelectedId(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [selectedId]);

  const reorderSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const handleReorderDragStart = useCallback((event) => {
    setActiveReorderId(event.active?.id ?? null);
  }, []);

  const handleReorderDragEnd = useCallback(
    async (event) => {
      setActiveReorderId(null);
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const ids = habits.map((h) => h.id);
      const oldIndex = ids.indexOf(active.id);
      const newIndex = ids.indexOf(over.id);
      if (oldIndex < 0 || newIndex < 0) return;
      const nextOrder = arrayMove(ids, oldIndex, newIndex);
      await reorderHabits(nextOrder);
    },
    [habits, reorderHabits]
  );

  const activeReorderHabit = activeReorderId ? habits.find((h) => h.id === activeReorderId) : null;

  return (
    <div className="habits-view">
      <div className="habits-view__toolbar">
        <select
          className="dashboard__select habits-view__days-select"
          value={daysCount}
          onChange={(e) => setDaysCount(Number(e.target.value))}
          aria-label="Число дней в сетке"
        >
          {[3, 4, 5, 6, 7, 14, 21, 28, 30, 60].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="dashboard__shift-btn"
          onMouseEnter={() => hasHover && setLeftHover(true)}
          onMouseLeave={() => hasHover && setLeftHover(false)}
          onClick={() => setOffset((o) => o - 1)}
          aria-label="Раньше"
        >
          <img src={hasHover && leftHover ? leftNavIcon : leftIcon} alt="" />
        </button>
        <button
          type="button"
          className="dashboard__shift-btn dashboard__shift-btn--today"
          onMouseEnter={() => hasHover && setTodayHover(true)}
          onMouseLeave={() => hasHover && setTodayHover(false)}
          onClick={() => setOffset(0)}
          aria-label="Сегодня"
        >
          <span
            className={`dashboard__shift-today-dot ${hasHover && todayHover ? 'dashboard__shift-today-dot--hover' : ''}`}
            aria-hidden
          />
        </button>
        <button
          type="button"
          className="dashboard__shift-btn"
          onMouseEnter={() => hasHover && setRightHover(true)}
          onMouseLeave={() => hasHover && setRightHover(false)}
          onClick={() => setOffset((o) => o + 1)}
          aria-label="Позже"
        >
          <img src={hasHover && rightHover ? rightNavIcon : rightIcon} alt="" />
        </button>
        <div className="habits-view__toolbar-actions">
          <button
            type="button"
            className="habits-view__action-btn habits-view__action-btn--icon"
            onMouseEnter={() => hasHover && setWidthBtnHover(true)}
            onMouseLeave={() => hasHover && setWidthBtnHover(false)}
            onClick={openWidthModal}
            aria-label="Изменить ширину столбца привычек"
          >
            <img src={hasHover && widthBtnHover ? spacingNavIcon : spacingIcon} alt="" />
          </button>
          {habits.length > 0 && (
            <button
              type="button"
              className="habits-view__action-btn habits-view__action-btn--icon"
              onMouseEnter={() => hasHover && setReorderBtnHover(true)}
              onMouseLeave={() => hasHover && setReorderBtnHover(false)}
              onClick={() => setReorderOpen(true)}
              aria-label="Изменить порядок привычек"
              style={hasHover && reorderBtnHover ? { opacity: 0.85 } : undefined}
            >
              <img src={dragIcon} alt="" />
            </button>
          )}
          <button
            type="button"
            className="habits-view__action-btn habits-view__action-btn--icon"
            onMouseEnter={() => hasHover && setAddBtnHover(true)}
            onMouseLeave={() => hasHover && setAddBtnHover(false)}
            onClick={openNewModal}
            aria-label="Добавить привычку"
          >
            <img src={hasHover && addBtnHover ? plusNavIcon : plusIcon} alt="" />
          </button>
          {selectedId && (
            <button
              type="button"
              className="habits-view__action-btn habits-view__action-btn--icon"
              onMouseEnter={() => hasHover && setStatsBtnHover(true)}
              onMouseLeave={() => hasHover && setStatsBtnHover(false)}
              onClick={() => openStatsModal(selectedId)}
              aria-label="Данные за месяц"
            >
              <img src={hasHover && statsBtnHover ? calendarNavIcon : calendarIcon} alt="" />
            </button>
          )}
          {selectedId && (
            <button
              type="button"
              className="habits-view__action-btn habits-view__action-btn--icon"
              onMouseEnter={() => hasHover && setEditBtnHover(true)}
              onMouseLeave={() => hasHover && setEditBtnHover(false)}
              onClick={() => openEditModal(selectedId)}
              aria-label="Редактировать привычку"
            >
              <img src={hasHover && editBtnHover ? editNavIcon : editIcon} alt="" />
            </button>
          )}
        </div>
      </div>

      <div className="habits-view__main">
        <div
          className="habits-view__sidebar-col"
          style={{ flexBasis: `${liveSidebarWidth}px`, width: `${liveSidebarWidth}px`, maxWidth: `${liveSidebarWidth}px` }}
        >
          <div className="habits-view__sidebar-spacer" style={{ height: stackH, minHeight: stackH }} aria-hidden />
          {habits.map((habit, index) => {
            const streak = computeStreak(habit, entries[habit.id] || {}, todayStr);
            return (
              <HabitNameRow
                key={habit.id}
                habit={habit}
                isFirst={index === 0}
                isSelected={selectedId === habit.id}
                streak={streak}
                onSelect={setSelectedId}
                onEdit={openEditModal}
              />
            );
          })}
          {habits.length === 0 && (
            <div className="habits-view__empty">Нет привычек — добавьте через «+» в панели или кнопку с карандашом внизу слева</div>
          )}
        </div>
        <div className="habits-view__grid-wrap">
          <div className="habits-view__grid-right">
            <div ref={headerStackRef} className="habits-view__header-stack">
              <div className="habits-view__month-row" style={{ gridTemplateColumns }}>
                {dateColumns.map((d, i) => {
                  const ds = toLocalDateString(d);
                  const prev = i > 0 ? dateColumns[i - 1] : null;
                  const showMonth =
                    !prev || prev.getFullYear() !== d.getFullYear() || prev.getMonth() !== d.getMonth();
                  return (
                    <div key={`m-${ds}`} className="habits-view__month-cell">
                      {showMonth ? <span className="habits-view__month-label">{monthShortRu(d)}</span> : null}
                    </div>
                  );
                })}
              </div>
              <div
                className={`habits-view__head-row ${todayIsFirstCol ? 'habits-view__head-row--today-first' : ''}`}
                style={{ gridTemplateColumns }}
              >
                {dateColumns.map((d, i) => {
                  const ds = toLocalDateString(d);
                  const isToday = ds === todayStr;
                  const isTodayPrev = todayColIdx > 0 && i === todayColIdx - 1;
                  return (
                    <div
                      key={`h-${ds}`}
                      className={`habits-view__head-cell ${isToday ? 'habits-view__head-cell--today' : ''} ${isTodayPrev ? 'habits-view__head-cell--today-prev' : ''}`}
                    >
                      <div className="habits-view__head-wd">{weekdayShortMon(d)}</div>
                      <div className="habits-view__head-day">{d.getDate()}</div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div
              className="habits-view__data-grid"
              style={{ gridTemplateColumns }}
            >
              {habits.flatMap((habit) =>
                dateColumns.map((d) => {
                  const ds = toLocalDateString(d);
                  const entry = (entries[habit.id] || {})[ds];
                  const required = isRequiredDay(habit, ds);
                  const setVal = (patch) => {
                    if (patch == null) setEntry(habit.id, ds, null);
                    else setEntry(habit.id, ds, patch);
                  };
                  return (
                    <div
                      key={`${habit.id}-${ds}`}
                      className={`habits-view__matrix-cell-wrap ${!required ? 'habits-view__matrix-cell-wrap--skip' : ''}`}
                    >
                      {habit.type === 'yes_no' && <YesNoCell entry={entry} onCycle={setVal} />}
                      {habit.type === 'not_more' && <NumberCell habit={habit} entry={entry} onCommit={setVal} />}
                      {habit.type === 'not_less' && <NumberCell habit={habit} entry={entry} onCommit={setVal} />}
                      {habit.type === 'not_later' && (
                        <TimePickCell habit={habit} entry={entry} dateStr={ds} onOpen={openTimePicker} />
                      )}
                      {habit.type === 'just_time' && (
                        <JustTimeCell habit={habit} entry={entry} dateStr={ds} onOpen={openTimePicker} />
                      )}
                      {habit.type === 'just_text' && <JustTextCell entry={entry} onCommit={setVal} />}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      <button
        type="button"
        className="dashboard__habits-fab"
        onMouseEnter={() => hasHover && setFabHover(true)}
        onMouseLeave={() => hasHover && setFabHover(false)}
        onClick={openNewModal}
        aria-label="Добавить привычку"
      >
        <img src={hasHover && fabHover ? editNavIcon : editIcon} alt="" />
      </button>

      {timeModal && (
        <div
          className="dashboard__settings-overlay"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeTimeModal();
          }}
        >
          <div
            className="dashboard__settings-popup habits-view__modal habits-view__time-modal-popup"
            role="dialog"
            aria-modal="true"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="dashboard__settings-title">Время</div>
            <input
              key={`${timeModal.habitId}|${timeModal.dateStr}`}
              ref={timeInputRef}
              type="time"
              lang="ru"
              step={60}
              className="dashboard__settings-input habits-view__time-24"
              defaultValue={timeModal.initial}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commitTimeModal();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  closeTimeModal();
                }
              }}
              autoFocus
            />
            <div className="dashboard__settings-edit-actions">
              <button
                type="button"
                className="dashboard__settings-submit"
                onClick={closeTimeModal}
              >
                Отмена
              </button>
              <button
                type="button"
                className="dashboard__settings-submit"
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  commitTimeModal();
                }}
              >
                Сохранить
              </button>
            </div>
          </div>
        </div>
      )}

      {widthModalOpen && (
        <div className="dashboard__settings-overlay" onClick={() => setWidthModalOpen(false)}>
          <div className="dashboard__settings-popup dashboard__menu-width-popup" onClick={(e) => e.stopPropagation()}>
            <div className="dashboard__settings-title">Ширина столбца привычек</div>
            <div className="dashboard__menu-width-controls">
              <button
                type="button"
                className="dashboard__menu-width-step"
                onClick={() => applyWidthStep(-10)}
                aria-label="Уменьшить на 10 пикселей"
              >
                <span className="dashboard__menu-width-step-inner">−</span>
              </button>
              <span className="dashboard__menu-width-value">{liveSidebarWidth}px</span>
              <button
                type="button"
                className="dashboard__menu-width-step"
                onClick={() => applyWidthStep(10)}
                aria-label="Увеличить на 10 пикселей"
              >
                <span className="dashboard__menu-width-step-inner">+</span>
              </button>
            </div>
            <div className="dashboard__settings-edit-actions">
              <button type="button" className="dashboard__settings-submit" onClick={() => setWidthModalOpen(false)}>
                Отмена
              </button>
              <button type="button" className="dashboard__settings-submit" onClick={saveWidthModal}>
                Сохранить
              </button>
            </div>
          </div>
        </div>
      )}

      {statsModal && (() => {
        const habit = habits.find((h) => h.id === statsModal.habitId);
        if (!habit) return null;
        const habitEntries = entries[habit.id] || {};
        const cells = getMonthGridCells(statsModal.year, statsModal.month);
        const avg = computeMonthAverageLabel(habit, habitEntries, statsModal.year, statsModal.month);
        const todayDs = toLocalDateString(today);
        const renderCellValue = (ds, entry) => {
          if (!entry) return null;
          if (habit.type === 'yes_no') {
            if (entry.yes_no === 'yes') {
              return <img src={checkIcon} alt="" className="habits-view__stats-yesno" />;
            }
            if (entry.yes_no === 'no') {
              return <img src={netIcon} alt="" className="habits-view__stats-yesno" />;
            }
            return null;
          }
          if (habit.type === 'not_more' || habit.type === 'not_less') {
            if (entry.num == null || entry.num === '') return null;
            const color = getEntryColor(habit, entry);
            return (
              <span style={color ? { color } : undefined}>
                {String(entry.num)}
              </span>
            );
          }
          if (habit.type === 'not_later') {
            if (!entry.time) return null;
            const color = getEntryColor(habit, entry);
            return (
              <span style={color ? { color } : undefined}>
                {entry.time.length >= 5 ? entry.time.slice(0, 5) : entry.time}
              </span>
            );
          }
          if (habit.type === 'just_time') {
            if (!entry.time) return null;
            return (
              <span style={{ color: INFO_HABIT_COLOR }}>
                {entry.time.length >= 5 ? entry.time.slice(0, 5) : entry.time}
              </span>
            );
          }
          if (habit.type === 'just_text') {
            if (!entry.text) return null;
            return (
              <span className="habits-view__stats-text" style={{ color: INFO_HABIT_COLOR }} title={entry.text}>
                {entry.text}
              </span>
            );
          }
          return null;
        };
        return (
          <div className="dashboard__settings-overlay" onClick={closeStatsModal}>
            <div
              className="dashboard__settings-popup habits-view__stats-popup"
              role="dialog"
              aria-modal="true"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                className="habits-view__stats-close"
                onClick={closeStatsModal}
                aria-label="Закрыть"
              >
                ×
              </button>
              <div className="habits-view__stats-title">{habit.title}</div>
              <div className="habits-view__stats-monthbar">
                <button
                  type="button"
                  className="dashboard__shift-btn"
                  onMouseEnter={() => hasHover && setStatsPrevHover(true)}
                  onMouseLeave={() => hasHover && setStatsPrevHover(false)}
                  onClick={() => shiftStatsMonth(-1)}
                  aria-label="Предыдущий месяц"
                >
                  <img src={hasHover && statsPrevHover ? leftNavIcon : leftIcon} alt="" />
                </button>
                <span className="habits-view__stats-monthlabel">
                  {MONTH_FULL_RU[statsModal.month]} {statsModal.year}
                </span>
                <button
                  type="button"
                  className="dashboard__shift-btn"
                  onMouseEnter={() => hasHover && setStatsNextHover(true)}
                  onMouseLeave={() => hasHover && setStatsNextHover(false)}
                  onClick={() => shiftStatsMonth(1)}
                  aria-label="Следующий месяц"
                >
                  <img src={hasHover && statsNextHover ? rightNavIcon : rightIcon} alt="" />
                </button>
              </div>
              <div className="habits-view__stats-weekdays">
                {WEEKDAY_SHORT_MON.map((wd) => (
                  <div key={wd} className="habits-view__stats-wd">
                    {wd}
                  </div>
                ))}
              </div>
              <div className="habits-view__stats-grid">
                {cells.map((d, i) => {
                  if (!d) {
                    return <div key={`e-${i}`} className="habits-view__stats-cell habits-view__stats-cell--empty" />;
                  }
                  const ds = toLocalDateString(d);
                  const entry = habitEntries[ds];
                  const isToday = ds === todayDs;
                  return (
                    <div
                      key={ds}
                      className={`habits-view__stats-cell ${isToday ? 'habits-view__stats-cell--today' : ''}`}
                    >
                      <div className="habits-view__stats-day">{d.getDate()}</div>
                      <div className="habits-view__stats-val">{renderCellValue(ds, entry)}</div>
                    </div>
                  );
                })}
              </div>
              {avg != null && (
                <div className="habits-view__stats-avg">
                  Среднее за месяц: <strong>{avg}</strong>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {reorderOpen && (
        <div className="dashboard__settings-overlay" onClick={() => setReorderOpen(false)}>
          <div
            className="dashboard__settings-popup habits-view__modal habits-view__reorder-popup"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="dashboard__settings-title">Порядок привычек</div>
            <DndContext
              sensors={reorderSensors}
              collisionDetection={closestCenter}
              onDragStart={handleReorderDragStart}
              onDragEnd={handleReorderDragEnd}
            >
              <SortableContext items={habits.map((h) => h.id)} strategy={verticalListSortingStrategy}>
                <div className="habits-view__reorder-list">
                  {habits.map((h) => (
                    <SortableReorderRow key={h.id} habit={h} />
                  ))}
                </div>
              </SortableContext>
              <DragOverlay>
                {activeReorderHabit ? (
                  <div className="habits-view__reorder-row habits-view__reorder-row--overlay">
                    <span className="habits-view__reorder-title">{activeReorderHabit.title}</span>
                    <span className="habits-view__reorder-handle">
                      <img src={dragIcon} alt="" />
                    </span>
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
            <div className="dashboard__settings-edit-actions">
              <button type="button" className="dashboard__settings-submit" onClick={() => setReorderOpen(false)}>
                Готово
              </button>
            </div>
          </div>
        </div>
      )}

      {modalOpen && (
        <div className="dashboard__settings-overlay" onClick={() => setModalOpen(false)}>
          <div className="dashboard__settings-popup habits-view__modal" onClick={(e) => e.stopPropagation()}>
            <div className="dashboard__settings-title">{editingId ? 'Редактировать привычку' : 'Новая привычка'}</div>
            <label className="habits-view__label">
              Название
              <input
                type="text"
                className="dashboard__settings-input"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder="Название"
                autoFocus
              />
            </label>
            <div className="dashboard__settings-title">Тип</div>
            <div className="habits-view__type-grid">
              {[
                { id: 'yes_no', label: 'Да / Нет' },
                { id: 'not_more', label: 'Не больше (число)' },
                { id: 'not_less', label: 'Не меньше (число)' },
                { id: 'not_later', label: 'Не позже (время)' },
                { id: 'just_time', label: 'Просто время' },
                { id: 'just_text', label: 'Просто текст' },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`habits-view__type-btn ${formType === t.id ? 'habits-view__type-btn--active' : ''}`}
                  onClick={() => setFormType(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>
            {(formType === 'not_more' || formType === 'not_less') && (
              <label className="habits-view__label">
                Лимит
                <input
                  type="text"
                  inputMode="decimal"
                  className="dashboard__settings-input"
                  value={formLimitNumber}
                  onChange={(e) => setFormLimitNumber(e.target.value)}
                  placeholder="Например, 2000"
                />
              </label>
            )}
            {formType === 'not_later' && (
              <label className="habits-view__label">
                Не позже
                <input
                  type="time"
                  lang="ru"
                  step={60}
                  className="dashboard__settings-input habits-view__time-24"
                  value={formLimitTime}
                  onChange={(e) => setFormLimitTime(e.target.value)}
                />
              </label>
            )}
            <div className="dashboard__settings-title">Пропуски</div>
            <div className="habits-view__type-grid">
              {[
                { id: 'none', label: 'Каждый день' },
                { id: 'every_other', label: 'Через день' },
                { id: 'every_third', label: 'Через два дня' },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`habits-view__type-btn ${formSkip === t.id ? 'habits-view__type-btn--active' : ''}`}
                  onClick={() => setFormSkip(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>
            {!isInfoHabitType(formType) && (
              <label className="habits-view__toggle">
                <input type="checkbox" checked={formStreak} onChange={(e) => setFormStreak(e.target.checked)} />
                <span>Считать дни подряд</span>
              </label>
            )}
            <div className="dashboard__settings-edit-actions">
              {editingId && (
                <button type="button" className="dashboard__settings-delete" onClick={handleDelete}>
                  Удалить
                </button>
              )}
              <button type="button" className="dashboard__settings-submit" onClick={() => setModalOpen(false)}>
                Отмена
              </button>
              <button type="button" className="dashboard__settings-submit" onClick={saveModal}>
                Сохранить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
