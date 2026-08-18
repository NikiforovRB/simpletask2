import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  closestCenter,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  arrayMove,
  rectSortingStrategy,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { TASK_COLORS } from '../constants';
import { cardLabels, dueInDays, formatDueDate, isOverdue, labelTextColor } from '../lib/kanbanCards';
import { useMediaQuery } from '../hooks/useMediaQuery';
import plusIcon from '../assets/plus.svg';
import plusNavIcon from '../assets/plus-nav.svg';
import deleteIcon from '../assets/delete.svg';
import deleteNavIcon from '../assets/delete-nav.svg';
import dragIcon from '../assets/drag.svg';
import editIcon from '../assets/edit.svg';
import upIcon from '../assets/up.svg';
import upNavIcon from '../assets/up-nav.svg';
import downIcon from '../assets/down.svg';
import downNavIcon from '../assets/down-nav.svg';
import calIcon from '../assets/cal.svg';
import tagIcon from '../assets/tag.svg';
import tagNavIcon from '../assets/tag-nav.svg';
import layersIcon from '../assets/layers.svg';
import starIcon from '../assets/star.svg';
import zavtraIcon from '../assets/zavtra.svg';
import closeIcon from '../assets/close.svg';
import leftIcon from '../assets/left.svg';
import leftNavIcon from '../assets/left-nav.svg';
import rightIcon from '../assets/right.svg';
import rightNavIcon from '../assets/right-nav.svg';
import settingsIcon from '../assets/settings.svg';
import settingsNavIcon from '../assets/settings-nav.svg';
import './KanbanView.css';

const DEFAULT_COLUMN_COLOR = '#5a86ee';
const MIN_COLUMN_WIDTH = 180;
const MAX_COLUMN_WIDTH = 640;
const COLUMN_WIDTH_STEP = 10;
/** The outline colours offered straight from the context menu of a card. */
const QUICK_COLORS = ['#f33737', '#f4ba04', '#15c466', '#5a86ee', '#613aaf'];

const slotId = (columnId, index) => `kslot::${columnId}::${index}`;

const groupByColumn = (list) => {
  const map = new Map();
  list.forEach((c) => {
    const bucket = map.get(c.column_id);
    if (bucket) bucket.push(c);
    else map.set(c.column_id, [c]);
  });
  return map;
};

function parseKanbanSlotId(id) {
  if (typeof id !== 'string' || !id.startsWith('kslot::')) return null;
  const rest = id.slice(7);
  const at = rest.lastIndexOf('::');
  if (at < 0) return null;
  const index = Number(rest.slice(at + 2));
  if (!Number.isFinite(index)) return null;
  return { columnId: rest.slice(0, at), index };
}

/**
 * A little panel drawn at the end of the page and placed under `anchor` by
 * hand. Inside the board it would be covered by the scrolling card lists and
 * by the drop targets that come after a column header, so nothing that has to
 * be clicked is left in the flow of the board.
 */
export function Popover({ anchor, onClose, className = '', align = 'right', children }) {
  const ref = useRef(null);

  useLayoutEffect(() => {
    const box = ref.current;
    const at = anchor?.current;
    if (!box || !at) return undefined;
    const place = () => {
      const a = at.getBoundingClientRect();
      const { offsetWidth: w, offsetHeight: h } = box;
      const wanted = align === 'left' ? a.left : a.right - w;
      box.style.left = `${Math.max(8, Math.min(wanted, window.innerWidth - w - 8))}px`;
      const below = a.bottom + 6;
      box.style.top = `${below + h > window.innerHeight - 8 ? Math.max(8, a.top - h - 6) : below}px`;
      box.style.visibility = 'visible';
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  });

  useEffect(() => {
    const onDown = (e) => {
      // A press on the button that opened it is left to the button, which
      // closes the popover by toggling.
      if (ref.current?.contains(e.target) || anchor?.current?.contains(e.target)) return;
      onClose?.();
    };
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose, anchor]);

  return createPortal(
    <div className={`kanban-pop ${className}`} ref={ref} onPointerDown={(e) => e.stopPropagation()}>
      {children}
    </div>,
    document.body,
  );
}

/** The 13 task colours, offered for a column strip, a card outline or a title. */
export function ColorPalette({ anchor, value, onPick, allowNone = false, noneLabel = 'Без цвета', onClose }) {
  return (
    <Popover anchor={anchor} onClose={onClose} className="kanban-palette">
      {allowNone && (
        <button
          type="button"
          className={`kanban-palette__none ${!value ? 'kanban-palette__none--active' : ''}`}
          onClick={() => onPick(null)}
        >
          {noneLabel}
        </button>
      )}
      <div className="kanban-palette__grid">
        {TASK_COLORS.map((c) => {
          const active = (value || '').toLowerCase() === c.toLowerCase();
          return (
            <span
              key={c}
              className={`kanban-palette__wrap ${active ? 'kanban-palette__wrap--active' : ''}`}
              style={{ '--swatch-color': c }}
            >
              <button
                type="button"
                className="kanban-palette__swatch"
                style={{ background: c }}
                onClick={() => onPick(c)}
                aria-label={c}
              />
            </span>
          );
        })}
      </div>
    </Popover>
  );
}

/** One label being renamed and recoloured. The name is saved on the way out. */
function LabelEditor({ label, onUpdate, onDelete, onDone }) {
  const [title, setTitle] = useState(label.title || '');
  const commit = () => {
    if (title !== (label.title || '')) onUpdate(label.id, { title });
    onDone();
  };
  return (
    <div className="kanban-labels__edit">
      <input
        className="kanban-labels__input"
        value={title}
        autoFocus
        placeholder="Название метки"
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') onDone();
        }}
      />
      <div className="kanban-palette__grid">
        {TASK_COLORS.map((c) => (
          <span
            key={c}
            className={`kanban-palette__wrap ${(label.color || '').toLowerCase() === c ? 'kanban-palette__wrap--active' : ''}`}
            style={{ '--swatch-color': c }}
          >
            <button
              type="button"
              className="kanban-palette__swatch"
              style={{ background: c }}
              onClick={() => onUpdate(label.id, { color: c })}
              aria-label={c}
            />
          </span>
        ))}
      </div>
      <div className="kanban-labels__edit-actions">
        <button type="button" className="kanban-labels__done" onClick={commit}>
          Готово
        </button>
        <button
          type="button"
          className="kanban-labels__delete"
          onClick={() => {
            onDone();
            onDelete(label.id);
          }}
        >
          Удалить метку
        </button>
      </div>
    </div>
  );
}

/**
 * The labels of a board, offered to a card. The same panel both puts a label
 * on the card and looks after the label itself: a board rarely has more than a
 * handful of them, and a separate settings screen for six words would be worse
 * than the pencil next to each of them.
 */
export function LabelPicker({
  anchor, boardId, labels, selected = [], onToggle, onAdd, onUpdate, onDelete, onClose,
}) {
  const [editingId, setEditingId] = useState(null);

  const create = async () => {
    const color = TASK_COLORS[(labels.length + 2) % TASK_COLORS.length];
    const made = await onAdd(boardId, { title: '', color });
    if (!made) return;
    // A label made from a card is meant for that card.
    onToggle(made.id);
    setEditingId(made.id);
  };

  return (
    <Popover anchor={anchor} onClose={onClose} className="kanban-labels">
      {labels.length === 0 && (
        <div className="kanban-filter__empty">Меток пока нет.</div>
      )}
      {labels.map((l) => {
        const on = selected.includes(l.id);
        if (editingId === l.id) {
          return (
            <LabelEditor
              key={l.id}
              label={l}
              onUpdate={onUpdate}
              onDelete={onDelete}
              onDone={() => setEditingId(null)}
            />
          );
        }
        return (
          <div key={l.id} className="kanban-labels__row">
            <button
              type="button"
              className={`kanban-filter__item ${on ? 'kanban-filter__item--on' : ''}`}
              onClick={() => onToggle(l.id)}
            >
              <span className="kanban-menu__dot" style={{ background: l.color }} aria-hidden />
              <span className="kanban-filter__title">{l.title || 'Метка'}</span>
              {on && <span className="kanban-menu__check" aria-hidden>✓</span>}
            </button>
            <button
              type="button"
              className="kanban-labels__pencil"
              onClick={() => setEditingId(l.id)}
              aria-label="Изменить метку"
              title="Изменить метку"
            >
              <img src={editIcon} alt="" />
            </button>
          </div>
        );
      })}
      <button type="button" className="kanban-labels__add" onClick={create}>
        + Новая метка
      </button>
    </Popover>
  );
}

/** A task line as it is previewed on a card (read-only apart from the tick). */
function CardTaskLine({ task, subtasks, showSubtasks, onToggle, depth = 0 }) {
  const children = subtasks(task.id);
  return (
    <>
      <li className={`kanban-card__task kanban-card__task--depth-${depth}`}>
        <button
          type="button"
          className={`kanban-card__task-check ${task.completed_at ? 'kanban-card__task-check--done' : ''}`}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onToggle?.(task);
          }}
          aria-label={task.completed_at ? 'Вернуть в список' : 'Выполнено'}
        >
          {task.completed_at ? (
            <svg width="9" height="9" viewBox="0 0 16 16" aria-hidden>
              <path d="M3 8.5l3 3 7-7" stroke="currentColor" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : children.length > 0 ? (
            // Two stripes: the same hint as in the plans, telling that the task
            // holds subtasks even when they are not drawn on the card.
            <span className="kanban-card__task-hint" aria-hidden>
              <span />
              <span />
            </span>
          ) : null}
        </button>
        <span
          className="kanban-card__task-title"
          style={{ color: task.completed_at ? undefined : task.text_color || undefined }}
        >
          {task.title || 'Без названия'}
        </span>
      </li>
      {showSubtasks && children.map((st) => (
        <CardTaskLine
          key={st.id}
          task={st}
          subtasks={subtasks}
          showSubtasks={showSubtasks}
          onToggle={onToggle}
          depth={depth + 1}
        />
      ))}
    </>
  );
}

function KanbanCard({
  card, settings, tasks, getSubtasks, boardLabels = [], hasHover = false,
  onToggleTask, onOpen, onContextMenu, onToggleFold, dragHandleProps, overlay = false,
}) {
  // A card is dragged by its whole body, so a click only counts as a click
  // while the pointer stayed put.
  const downAt = useRef(null);
  const [foldHover, setFoldHover] = useState(false);
  const cardTasks = useMemo(
    () => tasks.filter((t) => t.card_id === card.id && !t.parent_id).sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
    [tasks, card.id],
  );
  const doneCount = cardTasks.filter((t) => t.completed_at).length;
  const marks = cardLabels(card, boardLabels);
  const overdue = isOverdue(card.due_date);
  const folded = !!card.collapsed;
  // There is something to fold away only if the board is set to show it and
  // the card actually has it.
  const hasBody = (settings.showDescription && !!card.description?.trim())
    || (settings.showTasks && cardTasks.length > 0);
  const style = card.border_color
    ? { border: `1px solid ${card.border_color}` }
    : undefined;

  return (
    <article
      className={`kanban-card ${overdue ? 'kanban-card--overdue' : ''} ${!overlay && hasBody && onToggleFold ? 'kanban-card--foldable' : ''} ${overlay ? 'kanban-card--overlay' : ''}`}
      style={style}
      {...(dragHandleProps?.attributes || {})}
      {...(dragHandleProps?.listeners || {})}
      onPointerDown={(e) => {
        downAt.current = { x: e.clientX, y: e.clientY };
        dragHandleProps?.listeners?.onPointerDown?.(e);
      }}
      onClick={(e) => {
        const from = downAt.current;
        if (from && Math.hypot(e.clientX - from.x, e.clientY - from.y) > 6) return;
        onOpen?.(card.id);
      }}
      onContextMenu={(e) => {
        if (!onContextMenu) return;
        e.preventDefault();
        onContextMenu(e, card);
      }}
    >
      {!overlay && hasBody && onToggleFold && (
        <button
          type="button"
          className={`kanban-card__fold ${folded ? 'kanban-card__fold--shown' : ''}`}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseEnter={() => hasHover && setFoldHover(true)}
          onMouseLeave={() => hasHover && setFoldHover(false)}
          onClick={(e) => {
            e.stopPropagation();
            onToggleFold(card.id, !folded);
          }}
          aria-label={folded ? 'Развернуть плашку' : 'Свернуть плашку'}
          title={folded ? 'Развернуть плашку' : 'Свернуть плашку'}
        >
          <img
            src={folded
              ? (hasHover && foldHover ? downNavIcon : downIcon)
              : (hasHover && foldHover ? upNavIcon : upIcon)}
            alt=""
          />
        </button>
      )}
      {(marks.length > 0 || card.due_date) && (
        <div className="kanban-card__tags">
          {marks.map((l) => (
            <span
              key={l.id}
              className="kanban-card__label"
              style={{ background: l.color, color: labelTextColor(l.color) }}
            >
              {l.title || 'Метка'}
            </span>
          ))}
          {card.due_date && (
            <span className={`kanban-card__due ${overdue ? 'kanban-card__due--overdue' : ''}`}>
              {formatDueDate(card.due_date)}
            </span>
          )}
        </div>
      )}
      <div className="kanban-card__title" style={card.title_color ? { color: card.title_color } : undefined}>
        {card.title || 'Без названия'}
      </div>
      {!folded && settings.showDescription && card.description?.trim() && (
        <p className="kanban-card__desc">{card.description}</p>
      )}
      {!folded && settings.showTasks && cardTasks.length > 0 && (
        <ul className="kanban-card__tasks">
          {cardTasks.map((t) => (
            <CardTaskLine
              key={t.id}
              task={t}
              subtasks={getSubtasks}
              showSubtasks={settings.showSubtasks}
              onToggle={onToggleTask}
            />
          ))}
        </ul>
      )}
      {/* Folded, or with the task list turned off: how far along it is. */}
      {(folded || !settings.showTasks) && cardTasks.length > 0 && (
        <div className="kanban-card__meta">{`${doneCount} из ${cardTasks.length}`}</div>
      )}
    </article>
  );
}

function SortableKanbanCard(props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.card.id,
    data: { type: 'card', card: props.card },
  });
  const style = isDragging
    ? { opacity: 0, transition }
    : { transform: CSS.Translate.toString(transform), transition };
  return (
    <div ref={setNodeRef} style={style} className="kanban-card-wrap">
      <KanbanCard {...props} dragHandleProps={{ attributes, listeners }} />
    </div>
  );
}

/**
 * The gap a card will drop into, drawn as a blue line once the pointer is over
 * it. The anchor takes no space of its own so the gaps don't stretch a column;
 * the hit area is a band reaching into the cards above and below it.
 */
function CardDropSlot({ columnId, index, tall = false, fill = false }) {
  const { isOver, setNodeRef } = useDroppable({ id: slotId(columnId, index) });
  const variant = fill ? 'kanban-slot--fill' : tall ? 'kanban-slot--tall' : '';
  return (
    <div className={`kanban-slot ${variant}`}>
      <div ref={setNodeRef} className={`kanban-slot__hit ${isOver ? 'kanban-slot__hit--over' : ''}`}>
        <div className="kanban-slot__line" aria-hidden />
      </div>
    </div>
  );
}

/**
 * The field a new card is typed into, in the place the card will take. Enter
 * files it away and leaves the field open, so a column can be filled with a
 * dozen ideas without ever opening a card.
 */
function CardComposer({ onSubmit, onClose }) {
  const [text, setText] = useState('');
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);

  const submit = () => {
    const title = text.trim();
    setText('');
    if (title) onSubmit(title);
  };

  return (
    <div className="kanban-composer">
      <textarea
        ref={ref}
        className="kanban-composer__input"
        rows={1}
        autoFocus
        value={text}
        placeholder="Название плашки"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submit();
          } else if (e.key === 'Escape') {
            setText('');
            onClose();
          }
        }}
        onBlur={() => {
          submit();
          onClose();
        }}
      />
      <span className="kanban-composer__hint">Enter — добавить, Esc — закрыть</span>
    </div>
  );
}

function KanbanColumn({
  column, cards, width, settings, tasks, getSubtasks, boardLabels, onToggleTask,
  onOpenCard, onAddCard, onUpdateColumn, onDeleteColumn, onCardMenu, onToggleFold, hasHover,
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: column.id,
    data: { type: 'column', column },
  });
  // `null` while the title is only being shown; a string once it is edited,
  // which also keeps a rename by a collaborator from wiping what is typed.
  const [titleDraft, setTitleDraft] = useState(null);
  const editingTitle = titleDraft !== null;
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [foldHover, setFoldHover] = useState(false);
  const [plusHover, setPlusHover] = useState(false);
  const [delHover, setDelHover] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [composing, setComposing] = useState(false);
  const colorBtnRef = useRef(null);
  const cardsElRef = useRef(null);
  const collapsed = !!column.collapsed;
  const accent = column.accent_color || DEFAULT_COLUMN_COLOR;

  const commitTitle = () => {
    if (titleDraft === null) return;
    const next = titleDraft.trim();
    setTitleDraft(null);
    if (next !== (column.title || '')) onUpdateColumn(column.id, { title: next });
  };

  const scrollToEnd = () => {
    requestAnimationFrame(() => {
      const el = cardsElRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  };

  const openComposer = () => {
    if (collapsed) onUpdateColumn(column.id, { collapsed: false });
    setComposing(true);
    scrollToEnd();
  };

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
  };
  const grip = (
    <span className="kanban-column__grip" {...attributes} {...listeners} aria-label="Перетащить столбец">
      <img src={dragIcon} alt="" />
    </span>
  );

  // Folded away: a narrow strip with the title turned on its side. Cards can
  // still be dropped on it — they join the end of its list — so a column can be
  // used as a parking place without unfolding it first.
  if (collapsed) {
    return (
      <section ref={setNodeRef} style={style} className="kanban-column kanban-column--collapsed">
        <div className="kanban-column__strip" style={{ background: accent }} />
        <button
          type="button"
          className="kanban-column__fold"
          onMouseEnter={() => hasHover && setFoldHover(true)}
          onMouseLeave={() => hasHover && setFoldHover(false)}
          onClick={() => onUpdateColumn(column.id, { collapsed: false })}
          aria-label="Развернуть столбец"
          title="Развернуть столбец"
        >
          <img src={hasHover && foldHover ? rightNavIcon : rightIcon} alt="" />
        </button>
        <button
          type="button"
          className="kanban-column__collapsed-title"
          onClick={() => onUpdateColumn(column.id, { collapsed: false })}
        >
          {column.title || 'Без названия'}
        </button>
        <span className="kanban-column__count">{cards.length}</span>
        {grip}
        <CardDropSlot columnId={column.id} index={cards.length} fill />
      </section>
    );
  }

  return (
    <section ref={setNodeRef} style={{ ...style, width: `${width}px` }} className="kanban-column">
      <header className={`kanban-column__head ${paletteOpen ? 'kanban-column__head--pinned' : ''}`}>
        {editingTitle ? (
          <input
            className="kanban-column__title-input"
            value={titleDraft}
            autoFocus
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
              if (e.key === 'Escape') setTitleDraft(null);
            }}
          />
        ) : (
          <button type="button" className="kanban-column__title" onClick={() => setTitleDraft(column.title || '')}>
            {column.title || 'Без названия'}
          </button>
        )}
        {/* The tools sit over the end of the title instead of squeezing it. */}
        <span className="kanban-column__tools">
          <span className="kanban-column__count">{cards.length}</span>
          <span className="kanban-column__color-wrap">
            <button
              type="button"
              ref={colorBtnRef}
              className="kanban-column__color"
              style={{ background: accent }}
              onClick={() => setPaletteOpen((v) => !v)}
              aria-label="Цвет полоски"
              title="Цвет полоски"
            />
            {paletteOpen && (
              <ColorPalette
                anchor={colorBtnRef}
                value={column.accent_color}
                onPick={(c) => {
                  onUpdateColumn(column.id, { accent_color: c });
                  setPaletteOpen(false);
                }}
                onClose={() => setPaletteOpen(false)}
              />
            )}
          </span>
          <button
            type="button"
            className="kanban-column__icon-btn"
            onMouseEnter={() => hasHover && setFoldHover(true)}
            onMouseLeave={() => hasHover && setFoldHover(false)}
            onClick={() => onUpdateColumn(column.id, { collapsed: true })}
            aria-label="Свернуть столбец"
            title="Свернуть столбец"
          >
            <img src={hasHover && foldHover ? leftNavIcon : leftIcon} alt="" />
          </button>
          <button
            type="button"
            className="kanban-column__icon-btn"
            onMouseEnter={() => hasHover && setPlusHover(true)}
            onMouseLeave={() => hasHover && setPlusHover(false)}
            onClick={openComposer}
            aria-label="Добавить плашку"
            title="Добавить плашку"
          >
            <img src={hasHover && plusHover ? plusNavIcon : plusIcon} alt="" />
          </button>
          <button
            type="button"
            className="kanban-column__icon-btn"
            onMouseEnter={() => hasHover && setDelHover(true)}
            onMouseLeave={() => hasHover && setDelHover(false)}
            onClick={() => setConfirmDelete(true)}
            aria-label="Удалить столбец"
            title="Удалить столбец"
          >
            <img src={hasHover && delHover ? deleteNavIcon : deleteIcon} alt="" />
          </button>
          {grip}
        </span>
      </header>
      <div className="kanban-column__strip" style={{ background: accent }} />

      {/* A press on the free part of a column starts a new card there. */}
      <div
        className="kanban-column__cards"
        ref={cardsElRef}
        onClick={(e) => {
          if (settings.quickAdd && e.target === e.currentTarget) openComposer();
        }}
      >
        <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          {cards.map((card, i) => (
            <div key={card.id}>
              <CardDropSlot columnId={column.id} index={i} />
              <SortableKanbanCard
                card={card}
                settings={settings}
                tasks={tasks}
                getSubtasks={getSubtasks}
                boardLabels={boardLabels}
                hasHover={hasHover}
                onToggleTask={onToggleTask}
                onOpen={onOpenCard}
                onContextMenu={onCardMenu}
                onToggleFold={onToggleFold}
              />
            </div>
          ))}
        </SortableContext>
        <CardDropSlot columnId={column.id} index={cards.length} tall={cards.length === 0 && !composing} />
        {composing && (
          <CardComposer
            onSubmit={(title) => {
              onAddCard(column.id, title);
              scrollToEnd();
            }}
            onClose={() => setComposing(false)}
          />
        )}
      </div>

      {confirmDelete && (
        <div className="dashboard__settings-overlay" onClick={() => setConfirmDelete(false)}>
          <div className="dashboard__settings-popup" onClick={(e) => e.stopPropagation()}>
            <div className="dashboard__settings-title">Удалить столбец?</div>
            <p className="dashboard__confirm-text">Все плашки этого столбца и их задачи будут удалены.</p>
            <div className="dashboard__settings-edit-actions">
              <button type="button" className="dashboard__settings-submit" onClick={() => setConfirmDelete(false)}>
                Отмена
              </button>
              <button
                type="button"
                className="dashboard__settings-delete"
                onClick={() => {
                  setConfirmDelete(false);
                  onDeleteColumn(column.id);
                }}
              >
                Удалить
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * Right-click menu of a card. Everything that is done to a card often enough
 * to not be worth opening it for: its outline colour, its due date, its
 * labels, a copy of it, the column it lives in, and getting rid of it. The
 * longer lists open as a second page rather than as a flyout, which keeps the
 * menu inside the window and works the same under a finger.
 */
function CardContextMenu({
  card, at, columns, cardsByColumn, boardLabels,
  onUpdate, onDuplicate, onDelete, onMove, onOpen, onClose,
}) {
  const ref = useRef(null);
  const [page, setPage] = useState('root');

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { offsetWidth: w, offsetHeight: h } = el;
    el.style.left = `${Math.max(8, Math.min(at.x, window.innerWidth - w - 8))}px`;
    el.style.top = `${Math.max(8, Math.min(at.y, window.innerHeight - h - 8))}px`;
    el.style.visibility = 'visible';
  }, [at, page]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const item = (icon, label, onClick, extra = '') => (
    <button type="button" className={`dashboard__context-menu-item ${extra}`} onClick={onClick}>
      <img src={icon} alt="" className="dashboard__context-menu-item-icon" />
      <span>{label}</span>
    </button>
  );

  const back = item(leftIcon, 'Назад', () => setPage('root'));
  const labelIds = card.label_ids || [];

  return createPortal(
    <>
      <div className="dashboard__context-menu-backdrop" aria-hidden onClick={onClose} />
      <div
        ref={ref}
        className="dashboard__context-menu kanban-menu"
        onClick={(e) => e.stopPropagation()}
        onContextMenu={(e) => e.preventDefault()}
      >
        {page === 'root' && (
          <>
            <div className="dashboard__context-menu-colors">
              <span
                className={`dashboard__context-menu-color-wrap ${!card.border_color ? 'dashboard__context-menu-color-wrap--selected' : ''}`}
                style={{ '--swatch-color': 'var(--border-strong)' }}
              >
                <button
                  type="button"
                  className="dashboard__context-menu-color kanban-menu__color--none"
                  onClick={() => onUpdate(card.id, { border_color: null })}
                  aria-label="Без обводки"
                  title="Без обводки"
                />
              </span>
              {QUICK_COLORS.map((c) => {
                const selected = (card.border_color || '').toLowerCase() === c.toLowerCase();
                return (
                  <span
                    key={c}
                    className={`dashboard__context-menu-color-wrap ${selected ? 'dashboard__context-menu-color-wrap--selected' : ''}`}
                    style={{ '--swatch-color': c }}
                  >
                    <button
                      type="button"
                      className="dashboard__context-menu-color"
                      style={{ background: c }}
                      onClick={() => onUpdate(card.id, { border_color: c })}
                      aria-label={`Обводка ${c}`}
                    />
                  </span>
                );
              })}
            </div>
            {item(editIcon, 'Открыть', () => { onOpen(card.id); onClose(); })}
            <div className="dashboard__context-menu-separator" aria-hidden />
            {item(calIcon, card.due_date ? `Срок: ${formatDueDate(card.due_date)}` : 'Срок…', () => setPage('due'))}
            {item(tagIcon, labelIds.length ? `Метки: ${labelIds.length}` : 'Метки…', () => setPage('labels'))}
            <div className="dashboard__context-menu-separator" aria-hidden />
            {item(layersIcon, 'Скопировать', () => { onDuplicate(card); onClose(); })}
            {item(rightIcon, 'Переместить в столбец…', () => setPage('move'))}
            {item(deleteNavIcon, 'Удалить', () => { onDelete(card.id); onClose(); }, 'dashboard__context-menu-item--danger')}
          </>
        )}

        {page === 'due' && (
          <>
            {back}
            <div className="dashboard__context-menu-separator" aria-hidden />
            {item(starIcon, 'Сегодня', () => { onUpdate(card.id, { due_date: dueInDays(0) }); onClose(); })}
            {item(zavtraIcon, 'Завтра', () => { onUpdate(card.id, { due_date: dueInDays(1) }); onClose(); })}
            {item(calIcon, 'Через неделю', () => { onUpdate(card.id, { due_date: dueInDays(7) }); onClose(); })}
            {card.due_date && item(closeIcon, 'Убрать срок', () => { onUpdate(card.id, { due_date: null }); onClose(); })}
          </>
        )}

        {page === 'labels' && (
          <>
            {back}
            <div className="dashboard__context-menu-separator" aria-hidden />
            {boardLabels.length === 0 && (
              <div className="kanban-menu__empty">Метки создаются в плашке</div>
            )}
            {boardLabels.map((l) => {
              const on = labelIds.includes(l.id);
              return (
                <button
                  key={l.id}
                  type="button"
                  className="dashboard__context-menu-item"
                  onClick={() => onUpdate(card.id, {
                    label_ids: on ? labelIds.filter((x) => x !== l.id) : [...labelIds, l.id],
                  })}
                >
                  <span className="kanban-menu__dot" style={{ background: l.color }} aria-hidden />
                  <span>{l.title || 'Метка'}</span>
                  {on && <span className="kanban-menu__check" aria-hidden>✓</span>}
                </button>
              );
            })}
          </>
        )}

        {page === 'move' && (
          <>
            {back}
            <div className="dashboard__context-menu-separator" aria-hidden />
            {columns.map((c) => (
              <button
                key={c.id}
                type="button"
                className="dashboard__context-menu-item"
                disabled={c.id === card.column_id}
                onClick={() => {
                  onMove(card.id, c.id, (cardsByColumn.get(c.id) || []).filter((x) => x.id !== card.id).length);
                  onClose();
                }}
              >
                <span className="kanban-menu__dot" style={{ background: c.accent_color || DEFAULT_COLUMN_COLOR }} aria-hidden />
                <span>{c.title || 'Без названия'}</span>
                {c.id === card.column_id && <span className="kanban-menu__check" aria-hidden>✓</span>}
              </button>
            ))}
          </>
        )}
      </div>
    </>,
    document.body,
  );
}

/** The nearest width the board can actually take. */
function snapColumnWidth(value) {
  const clamped = Math.max(MIN_COLUMN_WIDTH, Math.min(MAX_COLUMN_WIDTH, value));
  return Math.round(clamped / COLUMN_WIDTH_STEP) * COLUMN_WIDTH_STEP;
}

function BoardSettingsModal({ board, onChange, onClose }) {
  // Steps come in bursts, so the width is only saved once it has stood still
  // for a moment; the board behind the modal still follows along.
  const [widthDraft, setWidthDraft] = useState(null);
  // Not null while the number is being typed over.
  const [typed, setTyped] = useState(null);
  const saveTimer = useRef(null);
  useEffect(() => () => clearTimeout(saveTimer.current), []);
  const width = widthDraft ?? board.kanban_column_width ?? 280;

  const applyWidth = (value) => {
    const next = snapColumnWidth(value);
    if (next === width) return;
    setWidthDraft(next);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      setWidthDraft(null);
      onChange({ kanban_column_width: next });
    }, 400);
  };

  const commitTyped = () => {
    const value = parseInt((typed ?? '').replace(/[^\d]/g, ''), 10);
    setTyped(null);
    if (Number.isFinite(value)) applyWidth(value);
  };

  return (
    <div className="dashboard__settings-overlay" onClick={onClose}>
      <div className="dashboard__settings-popup dashboard__settings-popup--main" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="dashboard__settings-head">
          <span className="dashboard__settings-heading">Настройки доски</span>
          <button type="button" className="dashboard__settings-close" onClick={onClose} aria-label="Закрыть">
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="dashboard__settings-group">
          <div className="dashboard__settings-title">Ширина столбцов</div>
          <div className="dashboard__settings-row kanban-settings__stepper">
            <button
              type="button"
              className="kanban-settings__step"
              onClick={() => applyWidth(width - COLUMN_WIDTH_STEP)}
              disabled={width <= MIN_COLUMN_WIDTH}
              aria-label="Уже"
            >
              −
            </button>
            {typed !== null ? (
              <input
                className="kanban-settings__value kanban-settings__value--input"
                value={typed}
                autoFocus
                inputMode="numeric"
                onChange={(e) => setTyped(e.target.value)}
                onFocus={(e) => e.currentTarget.select()}
                onBlur={commitTyped}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur();
                  if (e.key === 'Escape') setTyped(null);
                }}
              />
            ) : (
              <button
                type="button"
                className="kanban-settings__value"
                onClick={() => setTyped(String(width))}
                title={`От ${MIN_COLUMN_WIDTH} до ${MAX_COLUMN_WIDTH} px`}
              >
                {width} px
              </button>
            )}
            <button
              type="button"
              className="kanban-settings__step"
              onClick={() => applyWidth(width + COLUMN_WIDTH_STEP)}
              disabled={width >= MAX_COLUMN_WIDTH}
              aria-label="Шире"
            >
              +
            </button>
          </div>
        </div>

        <div className="dashboard__settings-group">
          <div className="dashboard__settings-title">Что показывать на плашке</div>
          <label className="dashboard__settings-check">
            <input
              type="checkbox"
              checked={board.kanban_show_description !== false}
              onChange={(e) => onChange({ kanban_show_description: e.target.checked })}
            />
            <span>Описание</span>
          </label>
          <label className="dashboard__settings-check">
            <input
              type="checkbox"
              checked={board.kanban_show_tasks !== false}
              onChange={(e) => onChange({ kanban_show_tasks: e.target.checked })}
            />
            <span>Задачи</span>
          </label>
          {board.kanban_show_tasks !== false && (
            <label className="dashboard__settings-check">
              <input
                type="checkbox"
                checked={!!board.kanban_show_subtasks}
                onChange={(e) => onChange({ kanban_show_subtasks: e.target.checked })}
              />
              <span>Подзадачи</span>
            </label>
          )}
        </div>

        <div className="dashboard__settings-group">
          <div className="dashboard__settings-title">Создание плашек</div>
          <label className="dashboard__settings-check">
            <input
              type="checkbox"
              checked={board.kanban_quick_add !== false}
              onChange={(e) => onChange({ kanban_quick_add: e.target.checked })}
            />
            <span>Поле для новой плашки по клику на пустое место</span>
          </label>
        </div>
      </div>
    </div>
  );
}

/**
 * A kanban board: columns of cards, each card a small window into its own
 * description and task list. Cards are dragged inside a column and between
 * columns; columns are dragged by the grip in their header. The strip of
 * columns is scrolled sideways with shift and the wheel, or by dragging the
 * board itself by any free spot.
 */
export function KanbanView({
  board, columns, cards, labels, tasks, getSubtasks,
  addColumn, updateColumn, deleteColumn, reorderColumns,
  addCard, updateCard, deleteCard, duplicateCard, moveCard,
  onToggleTask, onOpenCard, onUpdateBoard,
}) {
  const hasHover = useMediaQuery('(hover: hover)');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsHover, setSettingsHover] = useState(false);
  const [plusHover, setPlusHover] = useState(false);
  const [filterHover, setFilterHover] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterIds, setFilterIds] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [cardMenu, setCardMenu] = useState(null); // { x, y, card }
  const filterBtnRef = useRef(null);
  const boardRef = useRef(null);
  const pan = useRef(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const boardColumns = useMemo(
    () => columns.filter((c) => c.board_id === board.id).sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
    [columns, board.id],
  );
  const boardLabels = useMemo(
    () => (labels || []).filter((l) => l.board_id === board.id).sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
    [labels, board.id],
  );
  // Only the labels that still exist can be filtered by.
  const activeFilter = useMemo(
    () => filterIds.filter((id) => boardLabels.some((l) => l.id === id)),
    [filterIds, boardLabels],
  );

  const boardCards = useMemo(
    () => cards.filter((c) => c.board_id === board.id).sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
    [cards, board.id],
  );
  const cardsByColumn = useMemo(() => groupByColumn(boardCards), [boardCards]);
  // What is drawn: every card, or only the ones wearing one of the labels the
  // filter is set to.
  const shownByColumn = useMemo(() => (
    activeFilter.length === 0
      ? cardsByColumn
      : groupByColumn(boardCards.filter((c) => (c.label_ids || []).some((id) => activeFilter.includes(id))))
  ), [activeFilter, boardCards, cardsByColumn]);

  const cardSettings = {
    showDescription: board.kanban_show_description !== false,
    showTasks: board.kanban_show_tasks !== false,
    showSubtasks: !!board.kanban_show_subtasks,
    quickAdd: board.kanban_quick_add !== false,
  };
  const width = Math.max(MIN_COLUMN_WIDTH, Math.min(MAX_COLUMN_WIDTH, board.kanban_column_width ?? 280));

  const activeCard = activeId ? cards.find((c) => c.id === activeId) : null;

  // Shift and the wheel walk the columns sideways; the plain wheel is left to
  // the cards of a column.
  useEffect(() => {
    const el = boardRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      if (!e.shiftKey || e.deltaY === 0) return;
      el.scrollLeft += e.deltaY;
      e.preventDefault();
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const canPanFrom = (target) => (
    target === boardRef.current || target?.classList?.contains('kanban__pan-space')
  );

  const startPan = (e) => {
    if (e.button !== 0 || !canPanFrom(e.target)) return;
    const el = boardRef.current;
    if (!el) return;
    pan.current = { pointerId: e.pointerId, x: e.clientX, left: el.scrollLeft, moved: false };
    el.setPointerCapture?.(e.pointerId);
  };

  const movePan = (e) => {
    const p = pan.current;
    const el = boardRef.current;
    if (!p || !el) return;
    const dx = e.clientX - p.x;
    if (!p.moved) {
      if (Math.abs(dx) < 4) return;
      p.moved = true;
      el.classList.add('kanban__board--panning');
    }
    el.scrollLeft = p.left - dx;
  };

  const endPan = () => {
    const p = pan.current;
    const el = boardRef.current;
    if (!p || !el) return;
    el.releasePointerCapture?.(p.pointerId);
    el.classList.remove('kanban__board--panning');
    pan.current = null;
  };

  /**
   * Where a card lands in the full list of a column, given the gap it was
   * dropped into among the cards that are on screen. The two differ as soon as
   * the board is filtered.
   */
  const dropIndex = (columnId, shownIndex, movedId) => {
    const full = (cardsByColumn.get(columnId) || []).filter((c) => c.id !== movedId);
    const shown = (shownByColumn.get(columnId) || []).filter((c) => c.id !== movedId);
    const anchor = shown[shownIndex];
    if (!anchor) return full.length;
    const at = full.findIndex((c) => c.id === anchor.id);
    return at < 0 ? full.length : at;
  };

  const handleDragEnd = ({ active, over }) => {
    setActiveId(null);
    if (!over) return;

    // Columns are reordered among themselves.
    if (boardColumns.some((c) => c.id === active.id)) {
      const overColumnId = boardColumns.some((c) => c.id === over.id)
        ? over.id
        : (parseKanbanSlotId(over.id)?.columnId
          ?? cards.find((c) => c.id === over.id)?.column_id);
      if (!overColumnId || overColumnId === active.id) return;
      const ids = boardColumns.map((c) => c.id);
      reorderColumns(arrayMove(ids, ids.indexOf(active.id), ids.indexOf(overColumnId)));
      return;
    }

    const moved = cards.find((c) => c.id === active.id);
    if (!moved) return;

    const slot = parseKanbanSlotId(over.id);
    if (slot) {
      // The slot index counts the cards as they are drawn, so the dragged card
      // itself has to be discounted when it comes from above the gap.
      const shownAt = (shownByColumn.get(slot.columnId) || [])
        .slice(0, slot.index)
        .filter((c) => c.id !== moved.id).length;
      moveCard(moved.id, slot.columnId, dropIndex(slot.columnId, shownAt, moved.id));
      return;
    }

    // Dropped on a column itself (its head, or a folded one): join the end.
    if (boardColumns.some((c) => c.id === over.id)) {
      const list = (cardsByColumn.get(over.id) || []).filter((c) => c.id !== moved.id);
      moveCard(moved.id, over.id, list.length);
      return;
    }

    const overCard = cards.find((c) => c.id === over.id);
    if (!overCard || overCard.id === moved.id) return;
    const list = (cardsByColumn.get(overCard.column_id) || []).filter((c) => c.id !== moved.id);
    const at = list.findIndex((c) => c.id === overCard.id);
    const translated = active.rect.current.translated;
    const overMiddleY = over.rect.top + over.rect.height / 2;
    const pointerY = translated ? translated.top + translated.height / 2 : overMiddleY;
    moveCard(moved.id, overCard.column_id, at + (pointerY > overMiddleY ? 1 : 0));
  };

  return (
    <section className="kanban">
      <div className="kanban__header">
        <span className="kanban__title">{board.title}</span>
        <span className="kanban__header-gap" />
        <button
          type="button"
          ref={filterBtnRef}
          className="kanban__icon-btn"
          onMouseEnter={() => hasHover && setFilterHover(true)}
          onMouseLeave={() => hasHover && setFilterHover(false)}
          onClick={() => setFilterOpen((v) => !v)}
          aria-label="Фильтр по меткам"
          title="Фильтр по меткам"
        >
          <img src={(hasHover && filterHover) || activeFilter.length > 0 ? tagNavIcon : tagIcon} alt="" />
          {activeFilter.length > 0 && <span className="kanban__icon-badge">{activeFilter.length}</span>}
        </button>
        <button
          type="button"
          className="kanban__icon-btn"
          onMouseEnter={() => hasHover && setPlusHover(true)}
          onMouseLeave={() => hasHover && setPlusHover(false)}
          onClick={() => addColumn(board.id)}
          aria-label="Добавить столбец"
          title="Добавить столбец"
        >
          <img src={hasHover && plusHover ? plusNavIcon : plusIcon} alt="" />
        </button>
        <button
          type="button"
          className="kanban__icon-btn"
          onMouseEnter={() => hasHover && setSettingsHover(true)}
          onMouseLeave={() => hasHover && setSettingsHover(false)}
          onClick={() => setSettingsOpen(true)}
          aria-label="Настройки доски"
          title="Настройки доски"
        >
          <img src={hasHover && settingsHover ? settingsNavIcon : settingsIcon} alt="" />
        </button>
        {filterOpen && (
          <Popover anchor={filterBtnRef} onClose={() => setFilterOpen(false)} className="kanban-filter">
            <div className="kanban-filter__head">Показывать плашки с метками</div>
            {boardLabels.length === 0 && (
              <div className="kanban-filter__empty">Меток пока нет. Их можно завести в любой плашке.</div>
            )}
            {boardLabels.map((l) => {
              const on = activeFilter.includes(l.id);
              return (
                <button
                  key={l.id}
                  type="button"
                  className={`kanban-filter__item ${on ? 'kanban-filter__item--on' : ''}`}
                  onClick={() => setFilterIds((prev) => (
                    prev.includes(l.id) ? prev.filter((x) => x !== l.id) : [...prev, l.id]
                  ))}
                >
                  <span className="kanban-menu__dot" style={{ background: l.color }} aria-hidden />
                  <span className="kanban-filter__title">{l.title || 'Метка'}</span>
                  {on && <span className="kanban-menu__check" aria-hidden>✓</span>}
                </button>
              );
            })}
            {activeFilter.length > 0 && (
              <button type="button" className="kanban-filter__reset" onClick={() => setFilterIds([])}>
                Показать все
              </button>
            )}
          </Popover>
        )}
      </div>
      <div className="kanban__header-line" />

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={({ active }) => setActiveId(active.id)}
        onDragCancel={() => setActiveId(null)}
        onDragEnd={handleDragEnd}
      >
        <div
          className="kanban__board"
          ref={boardRef}
          onPointerDown={startPan}
          onPointerMove={movePan}
          onPointerUp={endPan}
          onPointerCancel={endPan}
        >
          {/* Columns differ in width once some of them are folded, so the plain
              rect strategy previews the shuffling better than the list one. */}
          <SortableContext items={boardColumns.map((c) => c.id)} strategy={rectSortingStrategy}>
            {boardColumns.map((column) => (
              <KanbanColumn
                key={column.id}
                column={column}
                cards={shownByColumn.get(column.id) || []}
                width={width}
                settings={cardSettings}
                tasks={tasks}
                getSubtasks={getSubtasks}
                boardLabels={boardLabels}
                onToggleTask={onToggleTask}
                onOpenCard={onOpenCard}
                onAddCard={(columnId, title) => addCard(board.id, columnId, { title })}
                onUpdateColumn={updateColumn}
                onDeleteColumn={deleteColumn}
                onCardMenu={(e, card) => setCardMenu({ x: e.clientX, y: e.clientY, card })}
                onToggleFold={(cardId, collapsed) => updateCard(cardId, { collapsed })}
                hasHover={hasHover}
              />
            ))}
          </SortableContext>
          {/* Free space to take hold of the board by, past the last column. */}
          <div className="kanban__pan-space" />
        </div>

        <DragOverlay dropAnimation={{ duration: 200, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' }}>
          {activeCard ? (
            <KanbanCard
              card={activeCard}
              settings={cardSettings}
              tasks={tasks}
              getSubtasks={getSubtasks}
              boardLabels={boardLabels}
              overlay
            />
          ) : null}
        </DragOverlay>
      </DndContext>

      {cardMenu && (
        <CardContextMenu
          key={cardMenu.card.id}
          card={cards.find((c) => c.id === cardMenu.card.id) || cardMenu.card}
          at={cardMenu}
          columns={boardColumns}
          cardsByColumn={cardsByColumn}
          boardLabels={boardLabels}
          onUpdate={updateCard}
          onDuplicate={duplicateCard}
          onDelete={deleteCard}
          onMove={moveCard}
          onOpen={onOpenCard}
          onClose={() => setCardMenu(null)}
        />
      )}

      {settingsOpen && (
        <BoardSettingsModal
          board={board}
          onChange={(patch) => onUpdateBoard(board.id, patch)}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </section>
  );
}
