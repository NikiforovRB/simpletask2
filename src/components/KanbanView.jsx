import { useEffect, useMemo, useRef, useState } from 'react';
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
import { useMediaQuery } from '../hooks/useMediaQuery';
import plusIcon from '../assets/plus.svg';
import plusNavIcon from '../assets/plus-nav.svg';
import deleteIcon from '../assets/delete.svg';
import deleteNavIcon from '../assets/delete-nav.svg';
import dragIcon from '../assets/drag.svg';
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
const COLUMN_WIDTH_STEP = 20;

const slotId = (columnId, index) => `kslot::${columnId}::${index}`;

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

/** The 13 task colours, offered for a column strip, a card outline or a title. */
export function ColorPalette({ value, onPick, allowNone = false, noneLabel = 'Без цвета', onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const onDown = (e) => {
      if (!ref.current?.contains(e.target)) onClose?.();
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [onClose]);
  return (
    <div className="kanban-palette" ref={ref} onPointerDown={(e) => e.stopPropagation()}>
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
    </div>
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

function KanbanCard({ card, settings, tasks, getSubtasks, onToggleTask, onOpen, dragHandleProps, overlay = false }) {
  // A card is dragged by its whole body, so a click only counts as a click
  // while the pointer stayed put.
  const downAt = useRef(null);
  const cardTasks = useMemo(
    () => tasks.filter((t) => t.card_id === card.id && !t.parent_id).sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
    [tasks, card.id],
  );
  const doneCount = cardTasks.filter((t) => t.completed_at).length;
  const style = card.border_color
    ? { border: `1px solid ${card.border_color}` }
    : undefined;

  return (
    <article
      className={`kanban-card ${overlay ? 'kanban-card--overlay' : ''}`}
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
    >
      <div className="kanban-card__title" style={card.title_color ? { color: card.title_color } : undefined}>
        {card.title || 'Без названия'}
      </div>
      {settings.showDescription && card.description?.trim() && (
        <p className="kanban-card__desc">{card.description}</p>
      )}
      {settings.showTasks && cardTasks.length > 0 && (
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
      {!settings.showTasks && cardTasks.length > 0 && (
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

function KanbanColumn({
  column, cards, width, settings, tasks, getSubtasks, onToggleTask,
  onOpenCard, onAddCard, onUpdateColumn, onDeleteColumn, hasHover,
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
  const collapsed = !!column.collapsed;
  const accent = column.accent_color || DEFAULT_COLUMN_COLOR;

  const commitTitle = () => {
    if (titleDraft === null) return;
    const next = titleDraft.trim();
    setTitleDraft(null);
    if (next !== (column.title || '')) onUpdateColumn(column.id, { title: next });
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
              className="kanban-column__color"
              style={{ background: accent }}
              onClick={() => setPaletteOpen((v) => !v)}
              aria-label="Цвет полоски"
              title="Цвет полоски"
            />
            {paletteOpen && (
              <ColorPalette
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
            onClick={() => onAddCard(column.id)}
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

      <div className="kanban-column__cards">
        <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          {cards.map((card, i) => (
            <div key={card.id}>
              <CardDropSlot columnId={column.id} index={i} />
              <SortableKanbanCard
                card={card}
                settings={settings}
                tasks={tasks}
                getSubtasks={getSubtasks}
                onToggleTask={onToggleTask}
                onOpen={onOpenCard}
              />
            </div>
          ))}
        </SortableContext>
        <CardDropSlot columnId={column.id} index={cards.length} tall={cards.length === 0} />
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

function BoardSettingsModal({ board, onChange, onClose }) {
  // A held-down step button repeats, so the width is only saved once it has
  // stood still for a moment; the board behind the modal still follows along.
  const [widthDraft, setWidthDraft] = useState(null);
  const saveTimer = useRef(null);
  useEffect(() => () => clearTimeout(saveTimer.current), []);
  const width = widthDraft ?? board.kanban_column_width ?? 280;
  const stepWidth = (delta) => {
    const next = Math.max(MIN_COLUMN_WIDTH, Math.min(MAX_COLUMN_WIDTH, width + delta));
    if (next === width) return;
    setWidthDraft(next);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      setWidthDraft(null);
      onChange({ kanban_column_width: next });
    }, 400);
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
              onClick={() => stepWidth(-COLUMN_WIDTH_STEP)}
              disabled={width <= MIN_COLUMN_WIDTH}
              aria-label="Уже"
            >
              −
            </button>
            <span className="kanban-settings__value">{width} px</span>
            <button
              type="button"
              className="kanban-settings__step"
              onClick={() => stepWidth(COLUMN_WIDTH_STEP)}
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
      </div>
    </div>
  );
}

/**
 * A kanban board: columns of cards, each card a small window into its own
 * description and task list. Cards are dragged inside a column and between
 * columns; columns are dragged by the grip in their header.
 */
export function KanbanView({
  board, columns, cards, tasks, getSubtasks,
  addColumn, updateColumn, deleteColumn, reorderColumns,
  addCard, moveCard, onToggleTask, onOpenCard, onUpdateBoard,
}) {
  const hasHover = useMediaQuery('(hover: hover)');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsHover, setSettingsHover] = useState(false);
  const [plusHover, setPlusHover] = useState(false);
  const [activeId, setActiveId] = useState(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const boardColumns = useMemo(
    () => columns.filter((c) => c.board_id === board.id).sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
    [columns, board.id],
  );
  const cardsByColumn = useMemo(() => {
    const map = new Map();
    cards
      .filter((c) => c.board_id === board.id)
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      .forEach((c) => {
        const list = map.get(c.column_id);
        if (list) list.push(c);
        else map.set(c.column_id, [c]);
      });
    return map;
  }, [cards, board.id]);

  const cardSettings = {
    showDescription: board.kanban_show_description !== false,
    showTasks: board.kanban_show_tasks !== false,
    showSubtasks: !!board.kanban_show_subtasks,
  };
  const width = Math.max(MIN_COLUMN_WIDTH, Math.min(MAX_COLUMN_WIDTH, board.kanban_column_width ?? 280));

  const activeCard = activeId ? cards.find((c) => c.id === activeId) : null;

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
      const at = (cardsByColumn.get(slot.columnId) || [])
        .slice(0, slot.index)
        .filter((c) => c.id !== moved.id).length;
      moveCard(moved.id, slot.columnId, at);
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
      </div>
      <div className="kanban__header-line" />

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={({ active }) => setActiveId(active.id)}
        onDragCancel={() => setActiveId(null)}
        onDragEnd={handleDragEnd}
      >
        <div className="kanban__board">
          {/* Columns differ in width once some of them are folded, so the plain
              rect strategy previews the shuffling better than the list one. */}
          <SortableContext items={boardColumns.map((c) => c.id)} strategy={rectSortingStrategy}>
            {boardColumns.map((column) => (
              <KanbanColumn
                key={column.id}
                column={column}
                cards={cardsByColumn.get(column.id) || []}
                width={width}
                settings={cardSettings}
                tasks={tasks}
                getSubtasks={getSubtasks}
                onToggleTask={onToggleTask}
                onOpenCard={onOpenCard}
                onAddCard={(columnId) => addCard(board.id, columnId)}
                onUpdateColumn={updateColumn}
                onDeleteColumn={deleteColumn}
                hasHover={hasHover}
              />
            ))}
          </SortableContext>
        </div>

        <DragOverlay dropAnimation={{ duration: 200, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' }}>
          {activeCard ? (
            <KanbanCard
              card={activeCard}
              settings={cardSettings}
              tasks={tasks}
              getSubtasks={getSubtasks}
              overlay
            />
          ) : null}
        </DragOverlay>
      </DndContext>

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
