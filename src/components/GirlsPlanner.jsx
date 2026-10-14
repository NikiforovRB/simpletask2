import { useState } from 'react';
import { DndContext, DragOverlay, MouseSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors } from '@dnd-kit/core';
import {
  addDays,
  agoLabel,
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
import { Avatar, CheckIcon, PhoneIcon, PlusIcon, TaskKindIcon, TelegramIcon } from './GirlsIcons';

const PLANNER_DAYS = 7;
// Silent this long — the girl is marked in «Без плана».
const STALE_DAYS = 7;

const LAST_CONTACT = { met: 'Знакомство', date: 'Свидание', message: 'Связь', call: 'Связь' };

const stop = (e) => e.stopPropagation();

function onEnter(fn) {
  return (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fn();
    }
  };
}

/**
 * The plan for the week: what to write, whom to call, which dates — by day.
 * Cards are dragged between the days; a girl from «Без плана» dragged onto a
 * day gets something planned for that day.
 */
export function GirlsPlanner({ girls, tasks, items, today, urlOf, loaded, tasksReady, onCreate, onOpen, onToggleDone, onMove, onMoveAll }) {
  const [active, setActive] = useState(null);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  );

  const days = Array.from({ length: PLANNER_DAYS }, (_, i) => addDays(today, i));
  const lastDay = days[days.length - 1];
  const sorted = [...items].sort(compareItems);
  const overdue = sorted.filter((it) => !it.done && it.day < today);
  const later = sorted.filter((it) => !it.done && it.day > lastDay);
  const byDay = new Map(days.map((d) => [d, []]));
  for (const it of sorted) byDay.get(it.day)?.push(it);
  // The done ones sink to the bottom of their day.
  for (const list of byDay.values()) list.sort((a, b) => Number(a.done) - Number(b.done));
  const planned = new Set(sorted.filter((it) => !it.done).map((it) => it.girl.id));
  const idle = girls
    .filter((g) => !g.archived && !planned.has(g.id))
    .map((girl) => ({ girl, last: lastContactOf(girl, tasks, today) }))
    .sort((a, b) => (a.last.day !== b.last.day ? (a.last.day < b.last.day ? -1 : 1) : a.girl.name.localeCompare(b.girl.name, 'ru')));
  const dueToday = (byDay.get(today) || []).filter((it) => !it.done).length;

  const handleDragEnd = ({ active: a, over }) => {
    setActive(null);
    if (!over) return;
    const day = String(over.id).slice('day:'.length);
    const { item, girl } = a.data.current || {};
    if (item && item.day !== day) onMove(item, day);
    else if (girl) onCreate({ girlId: girl.id, day });
  };

  if (!loaded) return <p className="girls__empty">Загрузка…</p>;

  const summary = [
    dueToday ? `на сегодня ${dueToday}` : 'на сегодня ничего',
    overdue.length ? `просрочено ${overdue.length}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const renderCard = (it, late = false) => (
    <PlanCard
      key={it.key}
      item={it}
      url={urlOf(it.girl.avatar_path)}
      today={today}
      late={late}
      onOpen={() => onOpen(it)}
      onToggle={() => onToggleDone(it)}
    />
  );

  return (
    <div className="planner">
      <div className="planner__head">
        <div className="planner__heading">
          <span className="planner__title">Планер</span>
          <span className="planner__summary">{summary}</span>
        </div>
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
          onDragStart={({ active: a }) => setActive(a.data.current)}
          onDragCancel={() => setActive(null)}
          onDragEnd={handleDragEnd}
        >
          <div className="planner__board">
            {overdue.length > 0 && (
              <Column
                className="planner__col--late"
                title="Просрочено"
                count={overdue.length}
                footer={
                  <button type="button" className="planner__col-action" onClick={() => onMoveAll(overdue, today)}>
                    Перенести всё на сегодня
                  </button>
                }
              >
                {overdue.map((it) => renderCard(it, true))}
              </Column>
            )}
            {days.map((day) => {
              const list = byDay.get(day);
              const open = list.filter((it) => !it.done).length;
              return (
                <Column
                  key={day}
                  dropId={`day:${day}`}
                  className={day === today ? 'planner__col--today' : ''}
                  title={dayTitle(day, today)}
                  sub={shortDay(day)}
                  count={open}
                  onAdd={() => onCreate({ day })}
                >
                  {list.map((it) => renderCard(it))}
                </Column>
              );
            })}
            {later.length > 0 && (
              <Column title="Позже" count={later.length}>
                {later.map((it) => renderCard(it, true))}
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
                    onPlan={() => onCreate({ girlId: girl.id, day: today })}
                  />
                ))}
              </div>
            )}
          </section>

          <DragOverlay dropAnimation={null}>
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

function Column({ dropId, className = '', title, sub, count, footer, onAdd, children }) {
  const { setNodeRef, isOver } = useDroppable({ id: dropId || `static:${title}`, disabled: !dropId });
  const empty = children.length === 0;
  return (
    <section ref={setNodeRef} className={`planner__col ${className} ${isOver ? 'planner__col--over' : ''} ${empty ? 'planner__col--empty' : ''}`}>
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
      <div className="planner__col-list">{empty ? <span className="planner__col-none">Пусто</span> : children}</div>
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
              onPointerDown={stop}
              onMouseDown={stop}
              onTouchStart={stop}
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
              onPointerDown={stop}
              onMouseDown={stop}
              onTouchStart={stop}
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

function PlanCard({ item, url, today, late, onOpen, onToggle }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: item.key, data: { item } });
  const cls = [
    'plan-card',
    `plan-card--${item.kind}`,
    item.done && 'plan-card--done',
    late && item.day < today && 'plan-card--late',
    isDragging && 'plan-card--dragging',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} className={cls} role="button" tabIndex={0} onClick={onOpen} onKeyDown={onEnter(onOpen)}>
      <PlanCardContent item={item} url={url} today={today} late={late} onToggle={onToggle} />
    </div>
  );
}

function IdleCard({ girl, last, url, today, onPlan }) {
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
      onClick={onPlan}
      onKeyDown={onEnter(onPlan)}
      title="Запланировать"
    >
      <Avatar name={girl.name} url={url} className="plan-card__avatar" />
      <div className="plan-card__body">
        <span className="plan-card__name">{girl.name}</span>
        <span className={`plan-card__note ${ago >= STALE_DAYS ? 'plan-card__note--stale' : ''}`}>
          {LAST_CONTACT[last.kind]} {agoLabel(ago)}
          {girl.dates.length > 0 && ` · ${girl.dates.length} ${plural(girl.dates.length, 'свидание', 'свидания', 'свиданий')}`}
        </span>
      </div>
      <span className="plan-card__plus" aria-hidden="true">
        <PlusIcon />
      </span>
    </div>
  );
}
