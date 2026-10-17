import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { CSS as DndCSS } from '@dnd-kit/utilities';
import {
  addDays,
  agoLabel,
  compareInDay,
  compareItems,
  dayTitle,
  daysBetween,
  formatWhen,
  lastContactOf,
  phoneHref,
  plural,
  shortDay,
  taskKind,
  telegramLink,
} from '../lib/girls';
import { Avatar, CheckIcon, ChevronDownIcon, PhoneIcon, PlusIcon, TaskKindIcon, TelegramIcon } from './GirlsIcons';

const DAY_COUNTS = [1, 2, 3, 4, 5, 6, 7];
// Silent this long — the girl is marked in «Без плана».
const STALE_DAYS = 7;
// How far the cards under the drop line move apart, px (see .plan-card--shift).
const SHIFT = 14;
const EASE = 'cubic-bezier(0.2, 0.9, 0.3, 1)';

const LAST_CONTACT = { met: 'Знакомство', date: 'Свидание', message: 'Связь', call: 'Связь' };

const stop = (e) => e.stopPropagation();
const noDrag = { onPointerDown: stop, onMouseDown: stop, onTouchStart: stop };

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

// The column under the pointer; while it is outside every column — the closest one.
const collide = (args) => {
  const hits = pointerWithin(args);
  return hits.length ? hits : rectIntersection(args);
};

function onEnter(fn) {
  return (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fn();
    }
  };
}

/**
 * Where the dragged card would land in the column under it: the index among
 * the column's other cards and the y of the line (from the top of the list).
 * `noop` — right where it already is.
 */
function dropTarget(active, over, byDay) {
  const day = over && String(over.id).startsWith('day:') ? String(over.id).slice(4) : null;
  if (!day) return null;
  const list = over.data.current?.listRef?.current;
  const rect = active.rect.current.translated;
  const item = active.data.current?.item ?? null;
  const all = byDay.get(day) || [];
  const others = all.filter((it) => it.key !== item?.key);
  const open = others.filter((it) => !it.done).length;
  if (!list || !rect) return { day, index: open, top: SHIFT / 2, noop: false };

  const nodes = new Map([...list.children].filter((n) => n.dataset.key).map((n) => [n.dataset.key, n]));
  const listTop = list.getBoundingClientRect().top;
  const y = rect.top + rect.height / 2;
  let index = 0;
  for (const it of others) {
    const n = nodes.get(it.key);
    if (n && listTop + n.offsetTop + n.offsetHeight / 2 < y) index += 1;
  }
  // The done ones stay at the bottom; a girl from «Без плана» gets her plan after the open ones.
  if (!item) index = open;
  else index = item.done ? Math.max(index, open) : Math.min(index, open);

  const gap = parseFloat(getComputedStyle(list).rowGap) || 0;
  const prev = others[index - 1] && nodes.get(others[index - 1].key);
  const next = others[index] && nodes.get(others[index].key);
  let top = SHIFT / 2;
  if (prev && next) top = prev.offsetTop + prev.offsetHeight + (gap + SHIFT) / 2;
  else if (prev) top = prev.offsetTop + prev.offsetHeight + SHIFT / 2;
  const noop = !!item && item.day === day && all.findIndex((it) => it.key === item.key) === index;
  return { day, index, top: Math.round(top), noop };
}

/** How many days the planner shows: the number, and a list of them on a click. */
function DayCount({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const buttonRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector('[aria-selected="true"]')?.focus();
    const onDown = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  const close = () => {
    setOpen(false);
    buttonRef.current?.focus();
  };

  const onListKey = (e) => {
    const options = [...listRef.current.querySelectorAll('[role="option"]')];
    const i = options.indexOf(document.activeElement);
    const to = { ArrowDown: Math.min(i + 1, options.length - 1), ArrowUp: Math.max(i - 1, 0), Home: 0, End: options.length - 1 }[e.key];
    if (to !== undefined) {
      e.preventDefault();
      options[to].focus();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  };

  return (
    <div className="planner__days" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className={`planner__days-btn ${open ? 'planner__days-btn--open' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Дней в планере: ${value}`}
        title="Сколько дней показывать"
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
          e.preventDefault();
          setOpen(true);
        }}
      >
        <span>{value}</span>
        <ChevronDownIcon />
      </button>
      {open && (
        <div className="planner__days-menu" role="listbox" aria-label="Сколько дней показывать" ref={listRef} onKeyDown={onListKey}>
          {DAY_COUNTS.map((n) => (
            <button
              key={n}
              type="button"
              role="option"
              aria-selected={n === value}
              className={`planner__days-option ${n === value ? 'planner__days-option--on' : ''}`}
              onClick={() => {
                onChange(n);
                close();
              }}
            >
              <span className="planner__days-num">{n}</span>
              <span className="planner__days-word">{plural(n, 'день', 'дня', 'дней')}</span>
              {n === value && <CheckIcon />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** The cards of a list glide to their new places when the list changes (not while dragging). */
function useFlip(ref, dragging) {
  const tops = useRef(new Map());
  useLayoutEffect(() => {
    const list = ref.current;
    const prev = tops.current;
    const next = new Map();
    tops.current = next;
    if (!list) return;
    const nodes = [...list.children].filter((n) => n.dataset.key);
    // The parted cards close up through the animation below, not their transition.
    const settling = !dragging && [...prev.values()].some((p) => p.shifted);
    if (settling) for (const n of nodes) n.style.transition = 'none';
    const animate = !dragging && !reducedMotion();
    for (const n of nodes) {
      const shifted = n.classList.contains('plan-card--shift');
      const top = n.offsetTop + (shifted ? SHIFT : 0);
      next.set(n.dataset.key, { top, shifted });
      const was = prev.get(n.dataset.key);
      if (animate && was && was.top !== top) {
        n.animate([{ transform: `translateY(${was.top - top}px)` }, { transform: 'none' }], { duration: 260, easing: EASE });
      }
    }
    if (settling) {
      void list.offsetWidth;
      for (const n of nodes) n.style.transition = '';
    }
  });
}

/**
 * The plan for `dayCount` days from today: what to write, whom to call, which
 * dates. Everything further on is in «Позже». Cards are dragged between and
 * within the days; a girl from «Без плана» dragged onto a day gets something
 * planned for it. A click on a card opens the whole story with her.
 */
export function GirlsPlanner({
  girls,
  tasks,
  items,
  today,
  dayCount,
  onDayCount,
  urlOf,
  loaded,
  tasksReady,
  onCreate,
  onHistory,
  onToggleDone,
  onPlace,
  onMoveAll,
}) {
  const [active, setActive] = useState(null);
  const [drop, setDrop] = useState(null);
  // What the drop animation should do: 'land' — fly into the card's new place,
  // 'fade' — melt where it was let go (a girl from «Без плана»), null — fly back.
  const landing = useRef(null);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  );

  const days = Array.from({ length: dayCount }, (_, i) => addDays(today, i));
  const lastDay = days[days.length - 1];
  const sorted = [...items].sort(compareItems);
  const overdue = sorted.filter((it) => !it.done && it.day < today);
  const later = sorted.filter((it) => !it.done && it.day > lastDay);
  const byDay = new Map(days.map((d) => [d, []]));
  for (const it of sorted) byDay.get(it.day)?.push(it);
  for (const list of byDay.values()) list.sort(compareInDay);
  const planned = new Set(sorted.filter((it) => !it.done).map((it) => it.girl.id));
  const idle = girls
    .filter((g) => !g.archived && !planned.has(g.id))
    .map((girl) => ({ girl, last: lastContactOf(girl, tasks, today) }))
    .sort((a, b) => (a.last.day !== b.last.day ? (a.last.day < b.last.day ? -1 : 1) : a.girl.name.localeCompare(b.girl.name, 'ru')));
  const dueToday = (byDay.get(today) || []).filter((it) => !it.done).length;
  const dragging = !!active;

  const track = ({ active: a, over }) => {
    const next = dropTarget(a, over, byDay);
    setDrop((prev) =>
      prev?.day === next?.day && prev?.index === next?.index && prev?.top === next?.top && prev?.noop === next?.noop ? prev : next,
    );
  };

  const handleDragStart = ({ active: a }) => {
    landing.current = null;
    setActive(a.data.current);
  };

  const handleDragEnd = ({ active: a, over }) => {
    const target = dropTarget(a, over, byDay) ?? drop;
    setActive(null);
    setDrop(null);
    landing.current = null;
    if (!target || !over) return;
    const { item, girl } = a.data.current || {};
    if (girl) {
      landing.current = 'fade';
      onCreate({ girlId: girl.id, day: target.day });
      return;
    }
    if (!item || target.noop) return;
    const ordered = (byDay.get(target.day) || []).filter((it) => it.key !== item.key);
    ordered.splice(target.index, 0, item);
    landing.current = 'land';
    onPlace(item, target.day, ordered);
  };

  const handleDragCancel = () => {
    landing.current = null;
    setActive(null);
    setDrop(null);
  };

  const dropAnimation = {
    duration: reducedMotion() ? 0 : 260,
    easing: EASE,
    keyframes: ({ transform: { initial, final } }) =>
      landing.current === 'fade'
        ? [
            { opacity: 1, transform: DndCSS.Transform.toString(initial) },
            { opacity: 0, transform: `${DndCSS.Transform.toString(initial)} scale(0.92)` },
          ]
        : [{ transform: DndCSS.Transform.toString(initial) }, { transform: DndCSS.Transform.toString(final) }],
    sideEffects: ({ active: a, dragOverlay }) => {
      const how = landing.current;
      const node = a.node;
      // Instantly: the card must not show through the overlay flying to it.
      const setOpacity = (value) => {
        node.style.transition = 'none';
        node.style.opacity = value;
        void node.offsetWidth;
        node.style.transition = '';
      };
      if (how !== 'fade') setOpacity('0');
      dragOverlay.node.classList.add('planner__overlay--drop');
      return () => {
        setOpacity('');
        if (how !== 'land') return;
        node.classList.remove('plan-card--landed');
        void node.offsetWidth;
        node.classList.add('plan-card--landed');
        node.addEventListener('animationend', () => node.classList.remove('plan-card--landed'), { once: true });
      };
    },
  };

  if (!loaded) return <p className="girls__empty">Загрузка…</p>;

  const summary = [
    dueToday ? `на сегодня ${dueToday}` : 'на сегодня ничего',
    overdue.length ? `просрочено ${overdue.length}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const activeKey = active?.item?.key ?? null;

  const renderCards = (list, { late = false, target = null } = {}) => {
    // Cards from the one the line is above and further down move apart.
    let from = -1;
    if (target && !target.noop) {
      const after = list.filter((it) => it.key !== activeKey)[target.index];
      if (after) from = list.findIndex((it) => it.key === after.key);
    }
    return list.map((it, i) => (
      <PlanCard
        key={it.key}
        item={it}
        url={urlOf(it.girl.avatar_path)}
        today={today}
        late={late}
        shifted={from !== -1 && i >= from}
        onOpen={() => onHistory(it.girl.id)}
        onToggle={() => onToggleDone(it)}
      />
    ));
  };

  return (
    <div className="planner">
      <div className="planner__head">
        <div className="planner__heading">
          <span className="planner__title">Планер</span>
          <span className="planner__summary">{summary}</span>
        </div>
        <span className="girl-editor__spacer" />
        <DayCount value={dayCount} onChange={onDayCount} />
        {girls.some((g) => !g.archived) && (
          <button type="button" className="girls__add" onClick={() => onCreate({ day: today })}>
            <PlusIcon />
            <span>Запланировать</span>
          </button>
        )}
      </div>

      {!tasksReady && (
        <p className="planner__warn">
          Сообщения и звонки пока негде хранить: примените миграцию <code>068_girl_tasks.sql</code> в Supabase. Свидания
          планируются уже сейчас.
        </p>
      )}

      {!girls.some((g) => !g.archived) ? (
        <p className="girls__empty">Сначала добавьте знакомство — потом здесь можно планировать сообщения, звонки и свидания.</p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={collide}
          onDragStart={handleDragStart}
          onDragMove={track}
          onDragOver={track}
          onDragCancel={handleDragCancel}
          onDragEnd={handleDragEnd}
        >
          <div className={`planner__board ${dragging ? 'planner__board--dragging' : ''}`}>
            {overdue.length > 0 && (
              <Column
                className="planner__col--late"
                title="Просрочено"
                count={overdue.length}
                dragging={dragging}
                footer={
                  <button type="button" className="planner__col-action" onClick={() => onMoveAll(overdue, today)}>
                    Перенести всё на сегодня
                  </button>
                }
              >
                {renderCards(overdue, { late: true })}
              </Column>
            )}
            {days.map((day) => {
              const list = byDay.get(day);
              const target = drop?.day === day ? drop : null;
              return (
                <Column
                  key={day}
                  dropId={`day:${day}`}
                  className={day === today ? 'planner__col--today' : ''}
                  title={dayTitle(day, today)}
                  sub={shortDay(day)}
                  count={list.filter((it) => !it.done).length}
                  onAdd={() => onCreate({ day })}
                  dragging={dragging}
                  line={target && !target.noop ? target.top : null}
                >
                  {renderCards(list, { target })}
                </Column>
              );
            })}
            {later.length > 0 && (
              <Column title="Позже" count={later.length} dragging={dragging}>
                {renderCards(later, { late: true })}
              </Column>
            )}
          </div>

          <section className="planner__idle">
            <header className="planner__col-head">
              <span className="planner__col-title">Без плана</span>
              {idle.length > 0 && <span className="planner__col-count">{idle.length}</span>}
              {idle.length > 1 && <span className="planner__col-sub">дольше всех без связи — первые</span>}
            </header>
            {idle.length === 0 ? (
              <p className="planner__idle-empty">С каждой что-то запланировано.</p>
            ) : (
              <div className="planner__idle-list">
                {idle.map(({ girl, last }) => (
                  <IdleCard
                    key={girl.id}
                    girl={girl}
                    last={last}
                    url={urlOf(girl.avatar_path)}
                    today={today}
                    onOpen={() => onHistory(girl.id)}
                    onPlan={() => onCreate({ girlId: girl.id, day: today })}
                  />
                ))}
              </div>
            )}
          </section>

          <DragOverlay dropAnimation={dropAnimation}>
            {active?.item && (
              <div className="plan-card plan-card--overlay">
                <PlanCardContent item={active.item} url={urlOf(active.item.girl.avatar_path)} today={today} late={active.item.day < today} />
              </div>
            )}
            {active?.girl && (
              <div className="plan-card plan-card--overlay plan-card--idle">
                <Avatar name={active.girl.name} url={urlOf(active.girl.avatar_path)} className="plan-card__avatar" />
                <div className="plan-card__body">
                  <span className="plan-card__name">{active.girl.name}</span>
                </div>
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  );
}

function Column({ dropId, className = '', title, sub, count, footer, onAdd, dragging, line = null, children }) {
  const listRef = useRef(null);
  const { setNodeRef, isOver } = useDroppable({ id: dropId || `static:${title}`, disabled: !dropId, data: { listRef } });
  useFlip(listRef, dragging);
  const cls = ['planner__col', className, !dropId && 'planner__col--static', isOver && dropId && 'planner__col--over'].filter(Boolean).join(' ');
  return (
    <section ref={setNodeRef} className={cls}>
      <header className="planner__col-head">
        <span className="planner__col-title">{title}</span>
        {sub && <span className="planner__col-sub">{sub}</span>}
        {count > 0 && <span className="planner__col-count">{count}</span>}
        <span className="girl-editor__spacer" />
        {onAdd && (
          <button type="button" className="planner__col-add" onClick={onAdd} aria-label={`Запланировать: ${title.toLowerCase()}`} title="Запланировать">
            <PlusIcon />
          </button>
        )}
      </header>
      <div ref={listRef} className={`planner__col-list ${children.length ? '' : 'planner__col-list--empty'}`}>
        {children}
        {line != null && <div className="planner__drop-line" style={{ transform: `translateY(${line}px)` }} aria-hidden="true" />}
      </div>
      {footer}
    </section>
  );
}

function PlanCardContent({ item, url, today, late, onToggle }) {
  const tg = item.kind === 'message' ? telegramLink(item.girl.telegram) : null;
  const tel = item.kind === 'call' ? phoneHref(item.girl.phone) : null;
  const when = late ? formatWhen(item.day, item.time, today) : item.time;
  return (
    <>
      <span className="plan-card__pic">
        <Avatar name={item.girl.name} url={url} className="plan-card__avatar" />
        <span className={`plan-card__kind plan-card__kind--${item.kind}`} title={taskKind(item.kind).label}>
          <TaskKindIcon kind={item.kind} />
        </span>
      </span>
      <div className="plan-card__body">
        <div className="plan-card__top">
          <span className="plan-card__name">{item.girl.name}</span>
          {when && <span className="plan-card__when">{when}</span>}
        </div>
        <div className={`plan-card__note ${item.note ? '' : 'plan-card__note--kind'}`}>{item.note || taskKind(item.kind).label}</div>
      </div>
      {(item.source === 'task' || tg || tel) && (
        <div className="plan-card__side">
          {item.source === 'task' && (
            <button
              type="button"
              className="plan-card__check"
              aria-pressed={item.done}
              aria-label={item.done ? 'Вернуть в план' : 'Выполнено'}
              title={item.done ? 'Вернуть в план' : 'Выполнено'}
              onClick={(e) => {
                e.stopPropagation();
                onToggle?.();
              }}
              {...noDrag}
            >
              <CheckIcon />
            </button>
          )}
          {!item.done && (tg || tel) && (
            <a
              className="plan-card__link"
              href={tg ? tg.url : tel}
              target={tg ? '_blank' : undefined}
              rel={tg ? 'noreferrer' : undefined}
              onClick={stop}
              {...noDrag}
              aria-label={tg ? 'Написать в Telegram' : 'Позвонить'}
              title={tg ? 'Написать в Telegram' : 'Позвонить'}
            >
              {tg ? <TelegramIcon /> : <PhoneIcon />}
            </a>
          )}
        </div>
      )}
    </>
  );
}

function PlanCard({ item, url, today, late, shifted, onOpen, onToggle }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: item.key, data: { item } });
  const cls = [
    'plan-card',
    `plan-card--${item.kind}`,
    item.done && 'plan-card--done',
    late && item.day < today && 'plan-card--late',
    isDragging && 'plan-card--dragging',
    shifted && 'plan-card--shift',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      data-key={item.key}
      className={cls}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={onEnter(onOpen)}
      title="История"
    >
      <PlanCardContent item={item} url={url} today={today} late={late} onToggle={onToggle} />
    </div>
  );
}

function IdleCard({ girl, last, url, today, onOpen, onPlan }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `girl:${girl.id}`, data: { girl } });
  const ago = daysBetween(last.day, today);
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`plan-card plan-card--idle ${isDragging ? 'plan-card--dragging' : ''}`}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={onEnter(onOpen)}
      title="История"
    >
      <Avatar name={girl.name} url={url} className="plan-card__avatar" />
      <div className="plan-card__body">
        <span className="plan-card__name">{girl.name}</span>
        <span className={`plan-card__note ${ago >= STALE_DAYS ? 'plan-card__note--stale' : ''}`}>
          {LAST_CONTACT[last.kind]} {agoLabel(ago)}
          {girl.dates.length > 0 && ` · ${girl.dates.length} ${plural(girl.dates.length, 'свидание', 'свидания', 'свиданий')}`}
        </span>
      </div>
      <button
        type="button"
        className="plan-card__plus"
        onClick={(e) => {
          e.stopPropagation();
          onPlan();
        }}
        onKeyDown={stop}
        {...noDrag}
        aria-label={`Запланировать: ${girl.name}`}
        title="Запланировать"
      >
        <PlusIcon />
      </button>
    </div>
  );
}
