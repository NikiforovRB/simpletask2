import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { SortableTask } from './SortableTask';
import { DropSlot } from './DropSlot';
import { ColorPalette, LabelPicker, Popover } from './KanbanView';
import { CalendarPopover } from './CalendarPopover';
import { getContainerIdForCard } from '../lib/dnd';
import { cardLabels, formatDueDate, isOverdue, labelTextColor } from '../lib/kanbanCards';
import { DEFAULT_TASK_COLOR, toLocalDateString } from '../constants';
import { useMediaQuery } from '../hooks/useMediaQuery';
import plusIcon from '../assets/plus.svg';
import plusNavIcon from '../assets/plus-nav.svg';
import deleteIcon from '../assets/delete.svg';
import deleteNavIcon from '../assets/delete-nav.svg';
import calIcon from '../assets/cal.svg';
import tagIcon from '../assets/tag.svg';
import './KanbanCardPanel.css';

const CLOSE_MS = 220;

/** A textarea that keeps its height at the height of its text. */
function useAutoGrow(value) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return ref;
}

/**
 * Everything about one card, in a panel that slides in from the right: its
 * title, description, outline colour and its task list — the same list as in
 * "Планы", so the tasks keep their subtasks, colours, spacing and drag and
 * drop. The list is dragged in the dashboard's own DndContext, which is why
 * the panel is mounted there rather than inside the board.
 */
export function KanbanCardPanel({
  card, tasks, getSubtasks, completedVisible = true,
  boardLabels = [], onAddLabel, onUpdateLabel, onDeleteLabel,
  onUpdateCard, onDeleteCard, onClose,
  onToggle, onUpdate, onDelete, onAddSubtask, onAddTask, onTaskContextMenu,
  editingTaskId, onEditingTaskConsumed,
  onCreateSiblingTask, onCreateSiblingSubtask, onCreateSubtaskAndEdit,
}) {
  const hasHover = useMediaQuery('(hover: hover)');
  const [closing, setClosing] = useState(false);
  const [title, setTitle] = useState(card.title || '');
  const [description, setDescription] = useState(card.description || '');
  // Which of the two colour pickers of the header is open: 'title', 'border'
  // or none of them.
  const [openPalette, setOpenPalette] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [plusHover, setPlusHover] = useState(false);
  const [delHover, setDelHover] = useState(false);
  const [labelsOpen, setLabelsOpen] = useState(false);
  const [dueOpen, setDueOpen] = useState(false);
  const titleRef = useAutoGrow(title);
  const descRef = useAutoGrow(description);
  const titleColorRef = useRef(null);
  const borderColorRef = useRef(null);
  const labelsBtnRef = useRef(null);
  const dueBtnRef = useRef(null);

  const requestClose = useRef(null);
  requestClose.current = () => {
    if (closing) return;
    setClosing(true);
    setTimeout(onClose, CLOSE_MS);
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') requestClose.current?.();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Typing is saved on a short pause, so the board behind the panel keeps up
  // without a write per keystroke.
  const cardId = card.id;
  useEffect(() => {
    if (title === (card.title || '')) return undefined;
    const t = setTimeout(() => onUpdateCard(cardId, { title }), 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, cardId]);

  useEffect(() => {
    if (description === (card.description || '')) return undefined;
    const t = setTimeout(() => onUpdateCard(cardId, { description }), 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [description, cardId]);

  const cardTasks = useMemo(
    () => tasks.filter((t) => t.card_id === cardId && !t.parent_id),
    [tasks, cardId],
  );
  const openTasks = useMemo(
    () => cardTasks.filter((t) => !t.completed_at).sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
    [cardTasks],
  );
  const doneTasks = useMemo(
    () => cardTasks.filter((t) => t.completed_at).sort((a, b) => {
      const ca = a.completed_at || '';
      const cb = b.completed_at || '';
      return ca === cb ? (a.position ?? 0) - (b.position ?? 0) : (ca < cb ? -1 : 1);
    }),
    [cardTasks],
  );

  const mainContainerId = getContainerIdForCard(cardId, false);
  const doneContainerId = getContainerIdForCard(cardId, true);

  const taskProps = {
    onToggle,
    onUpdate,
    onDelete,
    onAddSubtask,
    onTaskContextMenu,
    editingTaskId,
    onEditingTaskConsumed,
    onCreateSiblingTask,
    onCreateSiblingSubtask,
    onCreateSubtaskAndEdit,
    getSubtasks,
  };

  return (
    <div
      className={`kanban-panel-overlay ${closing ? 'kanban-panel-overlay--closing' : ''}`}
      onClick={() => requestClose.current?.()}
    >
      <aside
        className={`kanban-panel ${closing ? 'kanban-panel--closing' : ''}`}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="kanban-panel__head">
          <span className="kanban-panel__color-wrap">
            <button
              type="button"
              ref={titleColorRef}
              className="kanban-panel__title-color"
              style={{ background: card.title_color || 'var(--text-strong)' }}
              onClick={() => setOpenPalette((v) => (v === 'title' ? null : 'title'))}
              aria-label="Цвет заголовка плашки"
              title="Цвет заголовка плашки"
            />
            {openPalette === 'title' && (
              <ColorPalette
                anchor={titleColorRef}
                value={card.title_color}
                allowNone
                noneLabel="Обычный цвет"
                onPick={(c) => {
                  onUpdateCard(cardId, { title_color: c });
                  setOpenPalette(null);
                }}
                onClose={() => setOpenPalette(null)}
              />
            )}
          </span>
          <span className="kanban-panel__color-wrap">
            <button
              type="button"
              ref={borderColorRef}
              className={`kanban-panel__color ${card.border_color ? '' : 'kanban-panel__color--none'}`}
              style={card.border_color ? { borderColor: card.border_color } : undefined}
              onClick={() => setOpenPalette((v) => (v === 'border' ? null : 'border'))}
              aria-label="Цвет обводки плашки"
              title="Цвет обводки плашки"
            />
            {openPalette === 'border' && (
              <ColorPalette
                anchor={borderColorRef}
                value={card.border_color}
                allowNone
                noneLabel="Без обводки"
                onPick={(c) => {
                  onUpdateCard(cardId, { border_color: c });
                  setOpenPalette(null);
                }}
                onClose={() => setOpenPalette(null)}
              />
            )}
          </span>
          <button
            type="button"
            className="kanban-panel__icon-btn"
            onMouseEnter={() => hasHover && setDelHover(true)}
            onMouseLeave={() => hasHover && setDelHover(false)}
            onClick={() => setConfirmDelete(true)}
            aria-label="Удалить плашку"
            title="Удалить плашку"
          >
            <img src={hasHover && delHover ? deleteNavIcon : deleteIcon} alt="" />
          </button>
          <button
            type="button"
            className="kanban-panel__close"
            onClick={() => requestClose.current?.()}
            aria-label="Закрыть"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div className="kanban-panel__body">
          <textarea
            ref={titleRef}
            className="kanban-panel__title"
            style={card.title_color ? { color: card.title_color } : undefined}
            value={title}
            rows={1}
            placeholder="Название плашки"
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => onUpdateCard(cardId, { title })}
          />

          <div className="kanban-panel__meta">
            <button
              type="button"
              ref={dueBtnRef}
              className={`kanban-panel__due ${isOverdue(card.due_date) ? 'kanban-panel__due--overdue' : ''}`}
              onClick={() => setDueOpen((v) => !v)}
            >
              <img src={calIcon} alt="" />
              {card.due_date ? formatDueDate(card.due_date) : 'Без срока'}
            </button>
            {card.due_date && (
              <button
                type="button"
                className="kanban-panel__chip-clear"
                onClick={() => onUpdateCard(cardId, { due_date: null })}
              >
                Убрать срок
              </button>
            )}
            {dueOpen && (
              <Popover anchor={dueBtnRef} align="left" onClose={() => setDueOpen(false)} className="kanban-due-pop">
                <CalendarPopover
                  value={card.due_date || null}
                  onChange={(dateStr) => onUpdateCard(cardId, { due_date: dateStr })}
                  onClose={() => setDueOpen(false)}
                />
                <div className="kanban-due-pop__actions">
                  <button
                    type="button"
                    className="kanban-due-pop__action"
                    onClick={() => {
                      onUpdateCard(cardId, { due_date: toLocalDateString(new Date()) });
                      setDueOpen(false);
                    }}
                  >
                    Сегодня
                  </button>
                  <button
                    type="button"
                    className="kanban-due-pop__action kanban-due-pop__action--clear"
                    onClick={() => {
                      onUpdateCard(cardId, { due_date: null });
                      setDueOpen(false);
                    }}
                  >
                    Без срока
                  </button>
                </div>
              </Popover>
            )}
          </div>

          <div className="kanban-panel__labels">
            {cardLabels(card, boardLabels).map((l) => (
              <button
                key={l.id}
                type="button"
                className="kanban-panel__label"
                style={{ background: l.color, color: labelTextColor(l.color) }}
                onClick={() => onUpdateCard(cardId, {
                  label_ids: (card.label_ids || []).filter((x) => x !== l.id),
                })}
                title="Снять метку"
              >
                {l.title || 'Метка'}
                <span aria-hidden>×</span>
              </button>
            ))}
            <button
              type="button"
              ref={labelsBtnRef}
              className="kanban-panel__label-add"
              onClick={() => setLabelsOpen((v) => !v)}
            >
              <img src={tagIcon} alt="" />
              Метки
            </button>
            {labelsOpen && (
              <LabelPicker
                anchor={labelsBtnRef}
                boardId={card.board_id}
                labels={boardLabels}
                selected={card.label_ids || []}
                onToggle={(id) => {
                  const ids = card.label_ids || [];
                  onUpdateCard(cardId, {
                    label_ids: ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id],
                  });
                }}
                onAdd={onAddLabel}
                onUpdate={onUpdateLabel}
                onDelete={onDeleteLabel}
                onClose={() => setLabelsOpen(false)}
              />
            )}
          </div>

          <div className="kanban-panel__section-title">Описание</div>
          <textarea
            ref={descRef}
            className="kanban-panel__desc"
            value={description}
            rows={2}
            placeholder="Любое описание"
            onChange={(e) => setDescription(e.target.value)}
            onBlur={() => onUpdateCard(cardId, { description })}
          />

          <div className="kanban-panel__tasks-head">
            <span className="kanban-panel__section-title">Задачи</span>
            <button
              type="button"
              className="kanban-panel__icon-btn"
              onMouseEnter={() => hasHover && setPlusHover(true)}
              onMouseLeave={() => hasHover && setPlusHover(false)}
              onClick={() => onAddTask?.({
                list_type: 'kanban',
                project_id: card.board_id,
                card_id: cardId,
                text_color: DEFAULT_TASK_COLOR,
              })}
              aria-label="Добавить задачу"
            >
              <img src={hasHover && plusHover ? plusNavIcon : plusIcon} alt="" />
            </button>
          </div>

          <ul className="kanban-panel__list">
            <SortableContext items={openTasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
              {openTasks.map((task, i) => (
                <li key={task.id}>
                  <DropSlot id={mainContainerId} index={i} />
                  <SortableTask
                    task={task}
                    containerId={mainContainerId}
                    subtasks={getSubtasks(task.id)}
                    {...taskProps}
                  />
                </li>
              ))}
            </SortableContext>
            <li><DropSlot id={mainContainerId} index={openTasks.length} /></li>
          </ul>

          {completedVisible && doneTasks.length > 0 && (
            <>
              <div className="kanban-panel__section-title kanban-panel__section-title--done">Выполненные задачи</div>
              <ul className="kanban-panel__list kanban-panel__list--completed">
                <SortableContext items={doneTasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                  {doneTasks.map((task, i) => (
                    <li key={task.id}>
                      <DropSlot id={doneContainerId} index={i} />
                      <SortableTask
                        task={task}
                        containerId={doneContainerId}
                        subtasks={getSubtasks(task.id)}
                        isCompleted
                        {...taskProps}
                      />
                    </li>
                  ))}
                </SortableContext>
                <li><DropSlot id={doneContainerId} index={doneTasks.length} /></li>
              </ul>
            </>
          )}
        </div>
      </aside>

      {confirmDelete && (
        <div className="dashboard__settings-overlay" onClick={(e) => { e.stopPropagation(); setConfirmDelete(false); }}>
          <div className="dashboard__settings-popup" onClick={(e) => e.stopPropagation()}>
            <div className="dashboard__settings-title">Удалить плашку?</div>
            <p className="dashboard__confirm-text">Задачи этой плашки также будут удалены.</p>
            <div className="dashboard__settings-edit-actions">
              <button type="button" className="dashboard__settings-submit" onClick={(e) => { e.stopPropagation(); setConfirmDelete(false); }}>
                Отмена
              </button>
              <button
                type="button"
                className="dashboard__settings-delete"
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmDelete(false);
                  onDeleteCard(cardId);
                  onClose();
                }}
              >
                Удалить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
