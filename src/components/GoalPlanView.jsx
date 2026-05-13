import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
} from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { formatDayLabel, toLocalDateString, TASK_COLORS } from '../constants';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { DropSlot, parseSlotId } from './DropSlot';
import { CalendarPopover } from './CalendarPopover';
import plusIcon from '../assets/plus.svg';
import plusNavIcon from '../assets/plus-nav.svg';
import dragIcon from '../assets/drag.svg';
import dragNavIcon from '../assets/drag-nav.svg';
import trashIcon from '../assets/delete.svg';
import trashHoverIcon from '../assets/delete-nav.svg';
import calIcon from '../assets/cal.svg';
import calNavIcon from '../assets/cal-nav.svg';
import starIcon from '../assets/star.svg';
import zavtraIcon from '../assets/zavtra.svg';
import poslezavtraIcon from '../assets/poslezavtra.svg';
import ctxDeleteIcon from '../assets/delete-nav2.svg';
import './GoalPlanView.css';

const MONTH_RU_SHORT = [
  'янв', 'фев', 'мар', 'апр', 'мая', 'июн',
  'июл', 'авг', 'сен', 'окт', 'ноя', 'дек',
];

function shortDateLabel(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T12:00:00');
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getDate()} ${MONTH_RU_SHORT[d.getMonth()]}`;
}

const SECTION_DEFS = [
  { kind: 'goal', title: 'Мои цели', placeholder: 'Новая цель', showCheckbox: false, showSubtasks: false },
  { kind: 'morning', title: 'Утро', placeholder: 'Утренняя задача', showCheckbox: false, showSubtasks: false },
  { kind: 'action', title: 'Задачи', placeholder: 'Задача для цели', showCheckbox: true, showSubtasks: true },
  { kind: 'evening', title: 'Вечер', placeholder: 'Вечерняя задача', showCheckbox: false, showSubtasks: false },
];

function classNames(...xs) {
  return xs.filter(Boolean).join(' ');
}

function ChevronIcon({ collapsed, size = 14 }) {
  return (
    <svg
      className={classNames('goal-plan__chevron-svg', collapsed && 'goal-plan__chevron-svg--collapsed')}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
    >
      <path
        d="M4 6L8 10L12 6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DeleteButton({ onClick }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      className="goal-plan__row-delete"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      aria-label="Удалить"
      title="Удалить"
    >
      <img src={hover ? trashHoverIcon : trashIcon} alt="" />
    </button>
  );
}

function DateButton({ value, onChange, clearable = true, showLabel = true }) {
  const [hover, setHover] = useState(false);
  const [open, setOpen] = useState(false);

  const hasDate = !!value;
  // Active color when hovered, open, or when a visible date label indicates
  // an assigned date. Day items pass showLabel=false because their day column
  // already conveys the date, so the icon stays neutral by default.
  const showActive = hover || open || (hasDate && showLabel);
  return (
    <div
      className="goal-plan__date-wrap"
      onMouseDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className={classNames(
          'goal-plan__date-btn',
          hasDate && showLabel && 'goal-plan__date-btn--set'
        )}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onClick={() => setOpen((v) => !v)}
        aria-label="Назначить дату"
        title={hasDate ? `Дата: ${shortDateLabel(value)}` : 'Назначить дату'}
      >
        <img src={showActive ? calNavIcon : calIcon} alt="" />
        {hasDate && showLabel && (
          <span className="goal-plan__date-label">{shortDateLabel(value)}</span>
        )}
      </button>
      {open && (
        <>
          <div
            className="goal-plan__calendar-backdrop"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => setOpen(false)}
          />
          <div
            className="goal-plan__calendar-popover"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <CalendarPopover
              value={value || null}
              onChange={(dateStr) => {
                onChange(dateStr);
                setOpen(false);
              }}
              onClose={() => setOpen(false)}
            />
            {clearable && hasDate && (
              <button
                type="button"
                className="goal-plan__date-clear"
                onClick={() => {
                  onChange(null);
                  setOpen(false);
                }}
              >
                Убрать дату
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function CheckIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 16 16" aria-hidden>
      <path
        d="M3 8.5l3 3 7-7"
        stroke="currentColor"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PlusIconImg({ hover }) {
  return <img src={hover ? plusNavIcon : plusIcon} alt="" />;
}

function PlusButton({ onClick, ariaLabel = 'Добавить', size = 22, className = '' }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      className={classNames('goal-plan__plus-btn', className)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onClick}
      aria-label={ariaLabel}
      title={ariaLabel}
      style={{ width: size, height: size }}
    >
      <PlusIconImg hover={hover} />
    </button>
  );
}

function DragHandle({ attributes, listeners }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      className="goal-plan__handle"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      {...attributes}
      {...listeners}
      aria-label="Перетащить"
      title="Перетащить"
    >
      <img src={hover ? dragNavIcon : dragIcon} alt="" />
    </button>
  );
}

function ColorDot({ color, selected, onClick, title }) {
  return (
    <button
      type="button"
      className={classNames('goal-plan__color-dot', selected && 'goal-plan__color-dot--selected')}
      onClick={onClick}
      title={title}
      aria-label={title}
      style={{ '--swatch-color': color }}
    >
      <span style={{ background: color }} />
    </button>
  );
}

function ColorPicker({ value, onChange, onClose }) {
  return (
    <div
      className="goal-plan__color-picker"
      role="dialog"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {TASK_COLORS.map((c) => (
        <ColorDot
          key={c}
          color={c}
          selected={(value || '').toLowerCase() === c.toLowerCase()}
          onClick={() => {
            onChange(c);
            onClose();
          }}
          title={c}
        />
      ))}
    </div>
  );
}

function AutoGrowTextarea({ value, onChange, onBlur, placeholder, className = '', style }) {
  const ref = useRef(null);
  // On touch devices we require two consecutive taps to focus the textarea so
  // we don't unintentionally pop up the on-screen keyboard from a single tap.
  // The first pointerdown is consumed for row activation; only the second
  // within the window allows the textarea to receive focus.
  const isTouch = useMediaQuery('(hover: none)');
  const lastTapRef = useRef(0);
  const resize = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };
  useLayoutEffect(() => {
    resize();
  }, [value]);
  const handlePointerDown = (e) => {
    if (!isTouch) return;
    const el = ref.current;
    if (el && document.activeElement === el) return;
    const now = Date.now();
    if (now - lastTapRef.current < 400) {
      lastTapRef.current = 0;
      return;
    }
    lastTapRef.current = now;
    e.preventDefault();
  };
  return (
    <textarea
      ref={ref}
      rows={1}
      className={classNames('goal-plan__day-note', className)}
      value={value}
      placeholder={placeholder}
      style={style}
      onPointerDown={handlePointerDown}
      onMouseDown={handlePointerDown}
      onChange={(e) => {
        onChange(e.target.value);
        resize();
      }}
      onBlur={(e) => onBlur(e.target.value)}
    />
  );
}

function GoalEditableText({
  value,
  placeholder,
  onCommit,
  onBlurEmpty,
  className = '',
  autoFocus = false,
  onKeyboardCreateBelow,
  onKeyboardCreateSubtask,
  style,
}) {
  const [local, setLocal] = useState(value || '');
  const [editing, setEditing] = useState(autoFocus);
  const inputRef = useRef(null);
  // Suppresses the empty-row deletion that would otherwise happen on the
  // synthetic blur fired when we programmatically exit edit mode after Tab.
  const suppressBlurEmptyRef = useRef(false);
  // Touch double-tap detection — desktop uses a single click to enter edit
  // mode, but on touch devices we require two consecutive taps within a short
  // window to avoid opening the keyboard on every accidental tap.
  const isTouch = useMediaQuery('(hover: none)');
  const lastTapRef = useRef(0);

  useEffect(() => {
    if (!editing) setLocal(value || '');
  }, [value, editing]);

  const resize = () => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };

  useLayoutEffect(() => {
    if (editing) resize();
  }, [editing, local]);

  useEffect(() => {
    if (editing && inputRef.current) {
      const el = inputRef.current;
      el.focus();
      try {
        const v = el.value;
        el.setSelectionRange(v.length, v.length);
      } catch {
        /* ignore */
      }
    }
  }, [editing]);

  const commit = () => {
    const trimmed = (local || '').replace(/\s+$/g, '');
    if (trimmed === '' && (value || '') === '') {
      if (!suppressBlurEmptyRef.current) onBlurEmpty?.();
      setEditing(false);
      return;
    }
    if (trimmed !== (value || '')) onCommit(trimmed);
    setEditing(false);
  };

  if (!editing) {
    const handleInlineClick = () => {
      if (!isTouch) {
        setEditing(true);
        return;
      }
      // Touch: enter edit only on the second tap inside a 400ms window. The
      // first tap is consumed by the row-activation (revealing the toolbar).
      const now = Date.now();
      if (now - lastTapRef.current < 400) {
        lastTapRef.current = 0;
        setEditing(true);
      } else {
        lastTapRef.current = now;
      }
    };
    return (
      <button
        type="button"
        className={classNames('goal-plan__inline', className)}
        onClick={handleInlineClick}
        style={style}
      >
        {value ? (
          <span className="goal-plan__inline-text" style={style}>{value}</span>
        ) : (
          <span className="goal-plan__inline-placeholder">{placeholder}</span>
        )}
      </button>
    );
  }

  return (
    <textarea
      ref={inputRef}
      rows={1}
      className={classNames('goal-plan__input', className)}
      value={local}
      placeholder={placeholder}
      onChange={(e) => {
        setLocal(e.target.value);
      }}
      onBlur={commit}
      style={style}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          commit();
          onKeyboardCreateBelow?.();
        } else if (e.key === 'Tab' && !e.shiftKey && onKeyboardCreateSubtask) {
          e.preventDefault();
          // Persist current text (without triggering the empty-row deletion),
          // exit edit mode, then ask the parent to add a subtask. The new
          // subtask will autoFocus because it has no text.
          const trimmed = (local || '').replace(/\s+$/g, '');
          if (trimmed && trimmed !== (value || '')) onCommit(trimmed);
          suppressBlurEmptyRef.current = true;
          setEditing(false);
          onKeyboardCreateSubtask();
          // Re-arm the flag on the next tick — after React has flushed the
          // unmount blur, but before any future edit cycle.
          setTimeout(() => {
            suppressBlurEmptyRef.current = false;
          }, 0);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          setLocal(value || '');
          setEditing(false);
          onBlurEmpty?.();
        }
      }}
    />
  );
}

function CompletionToggle({ completed, onToggle, hasSubtasks }) {
  return (
    <button
      type="button"
      className={classNames('goal-plan__check', completed && 'goal-plan__check--done')}
      onClick={onToggle}
      aria-label={completed ? 'Отменить выполнение' : 'Отметить выполнение'}
    >
      {completed ? (
        <CheckIcon />
      ) : hasSubtasks ? (
        <span className="goal-plan__check-subtask-hint" aria-hidden>
          <span />
          <span />
        </span>
      ) : null}
    </button>
  );
}

function SortableItemRow({
  item,
  containerId,
  showCheckbox,
  draggable,
  hasSubtasks,
  subtasksCollapsed,
  onToggleSubtasksCollapsed,
  onAddSubtask,
  onCommit,
  onDelete,
  onToggle,
  onKeyboardCreateBelow,
  onKeyboardCreateSubtask,
  onChangeColor,
  onChangeDate,
  onContextMenu,
  placeholder,
  allowColor,
  allowSubtasks,
  allowDate,
  dateClearable = true,
  dateShowLabel = true,
}) {
  const sortable = useSortable({
    id: item.id,
    disabled: !draggable,
    data: { item, containerId },
  });
  const style = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
    opacity: sortable.isDragging ? 0.4 : 1,
  };
  const completed = !!item.completed_at;
  const [colorOpen, setColorOpen] = useState(false);

  useEffect(() => {
    if (!colorOpen) return;
    const close = () => setColorOpen(false);
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [colorOpen]);

  const textStyle = item.text_color ? { color: item.text_color } : undefined;

  return (
    <div
      ref={sortable.setNodeRef}
      style={style}
      data-gp-touch-key={`row::${item.id}`}
      className={classNames(
        'goal-plan__row',
        completed && 'goal-plan__row--done',
        sortable.isDragging && 'goal-plan__row--dragging'
      )}
      onContextMenu={onContextMenu}
    >
      {showCheckbox && (
        <CompletionToggle
          completed={completed}
          onToggle={onToggle}
          hasSubtasks={!!(allowSubtasks && hasSubtasks)}
        />
      )}
      <div className="goal-plan__row-text">
        <GoalEditableText
          value={item.text}
          placeholder={placeholder}
          onCommit={onCommit}
          onBlurEmpty={() => {
            if (!item.text) onDelete();
          }}
          onKeyboardCreateBelow={onKeyboardCreateBelow}
          onKeyboardCreateSubtask={onKeyboardCreateSubtask}
          autoFocus={!item.text}
          style={textStyle}
        />
      </div>
      <div className="goal-plan__row-actions">
        {allowSubtasks && hasSubtasks && (
          <button
            type="button"
            className="goal-plan__subtask-toggle"
            onClick={(e) => {
              onToggleSubtasksCollapsed();
              e.currentTarget.blur();
            }}
            aria-label={subtasksCollapsed ? 'Раскрыть подзадачи' : 'Свернуть подзадачи'}
            title={subtasksCollapsed ? 'Раскрыть подзадачи' : 'Свернуть подзадачи'}
          >
            <ChevronIcon collapsed={subtasksCollapsed} size={12} />
          </button>
        )}
        {allowColor && (
          <div className="goal-plan__color-wrap">
            <button
              type="button"
              className="goal-plan__color-btn"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                setColorOpen((v) => !v);
              }}
              aria-label="Изменить цвет"
              title="Изменить цвет"
              style={{ background: item.text_color || '#ffffff' }}
            />
            {colorOpen && (
              <ColorPicker
                value={item.text_color}
                onChange={(c) => onChangeColor(c)}
                onClose={() => setColorOpen(false)}
              />
            )}
          </div>
        )}
        {allowSubtasks && onAddSubtask && (
          <button
            type="button"
            className="goal-plan__row-icon-btn"
            onClick={onAddSubtask}
            aria-label="Добавить подзадачу"
            title="Добавить подзадачу"
          >
            <PlusIconBtnInner />
          </button>
        )}
        {allowDate && onChangeDate && (
          <DateButton
            value={item.entry_date || null}
            onChange={(d) => onChangeDate(d)}
            clearable={dateClearable}
            showLabel={dateShowLabel}
          />
        )}
        <DeleteButton onClick={onDelete} />
        {draggable && <DragHandle attributes={sortable.attributes} listeners={sortable.listeners} />}
      </div>
    </div>
  );
}

function PlusIconBtnInner() {
  const [hover, setHover] = useState(false);
  return (
    <span
      className="goal-plan__row-plus"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <PlusIconImg hover={hover} />
    </span>
  );
}

function Section({
  def,
  items,
  byParent,
  collapsed,
  onToggleCollapsed,
  onAdd,
  onCreateAfter,
  onCommit,
  onDelete,
  onToggle,
  onChangeColor,
  onUpdate,
  showCheckbox,
  showSubtasks,
}) {
  const containerId = `gpsec::${def.kind}`;
  return (
    <section className="goal-plan__section">
      <header
        className="goal-plan__section-head"
        data-gp-touch-key={`sec::${def.kind}`}
      >
        <span className="goal-plan__section-title">{def.title}</span>
        <div className="goal-plan__section-head-tools">
          <PlusButton
            onClick={() => {
              if (collapsed) onToggleCollapsed();
              onAdd();
            }}
            ariaLabel="Добавить"
          />
          <button
            type="button"
            className="goal-plan__section-toggle"
            onClick={onToggleCollapsed}
            aria-label={collapsed ? 'Раскрыть' : 'Свернуть'}
            title={collapsed ? 'Раскрыть' : 'Свернуть'}
          >
            <ChevronIcon collapsed={collapsed} />
          </button>
        </div>
      </header>
      {!collapsed && (
        <SortableContext items={items.map((it) => it.id)} strategy={verticalListSortingStrategy}>
          <div className="goal-plan__rows">
            {items.length === 0 && (
              <div className="goal-plan__empty" onClick={() => onAdd()}>
                {def.placeholder} — нажмите, чтобы добавить
              </div>
            )}
            {items.map((it) => (
              <SectionItem
                key={it.id}
                item={it}
                containerId={containerId}
                showCheckbox={showCheckbox}
                showSubtasks={showSubtasks}
                subtasks={byParent.get(it.id) || []}
                onAddSubtask={() => onAdd(it.id)}
                onCommit={(id, text) => onCommit(id, text)}
                onDelete={(id) => onDelete(id)}
                onToggle={(id) => onToggle?.(id)}
                onChangeColor={(id, c) => onChangeColor(id, c)}
                onCreateAfter={onCreateAfter}
                onUpdate={onUpdate}
                placeholder={def.placeholder}
              />
            ))}
          </div>
        </SortableContext>
      )}
      <div className="goal-plan__section-divider" />
    </section>
  );
}

function SectionItem({
  item,
  containerId,
  showCheckbox,
  showSubtasks,
  subtasks,
  onAddSubtask,
  onCommit,
  onDelete,
  onToggle,
  onChangeColor,
  onCreateAfter,
  onUpdate,
  placeholder,
}) {
  // Persisted collapsed state — driven by the item field so it survives reloads.
  const subCollapsed = !!item.subtasks_collapsed;
  const setSubCollapsed = (next) => {
    const value = typeof next === 'function' ? next(subCollapsed) : !!next;
    if (value !== subCollapsed) onUpdate?.(item.id, { subtasks_collapsed: value });
  };
  const subsContainerId = `gpsub-action::${item.id}`;
  return (
    <div className="goal-plan__tree">
      <SortableItemRow
        item={item}
        containerId={containerId}
        showCheckbox={showCheckbox}
        draggable
        allowColor
        allowSubtasks={showSubtasks}
        hasSubtasks={showSubtasks && subtasks.length > 0}
        subtasksCollapsed={subCollapsed}
        onToggleSubtasksCollapsed={() => setSubCollapsed((v) => !v)}
        onAddSubtask={showSubtasks ? onAddSubtask : null}
        onCommit={(text) => onCommit(item.id, text)}
        onDelete={() => onDelete(item.id)}
        onToggle={() => onToggle(item.id)}
        onChangeColor={(c) => onChangeColor(item.id, c)}
        onKeyboardCreateBelow={() => onCreateAfter?.(item)}
        onKeyboardCreateSubtask={
          showSubtasks
            ? () => {
                setSubCollapsed(false);
                onAddSubtask();
              }
            : undefined
        }
        placeholder={placeholder}
      />
      {showSubtasks && !subCollapsed && subtasks.length > 0 && (
        <div className="goal-plan__subtasks">
          <SortableContext items={subtasks.map((s) => s.id)} strategy={verticalListSortingStrategy}>
            {subtasks.map((sub) => (
              <SortableItemRow
                key={sub.id}
                item={sub}
                containerId={subsContainerId}
                showCheckbox
                draggable
                allowColor
                onCommit={(text) => onCommit(sub.id, text)}
                onDelete={() => onDelete(sub.id)}
                onToggle={() => onToggle(sub.id)}
                onChangeColor={(c) => onChangeColor(sub.id, c)}
                onKeyboardCreateBelow={() => onCreateAfter?.(sub)}
                placeholder="Подзадача"
              />
            ))}
          </SortableContext>
        </div>
      )}
    </div>
  );
}

function DayNoteField({ valueFromProps, colorFromProps, placeholder, onCommitText, onCommitColor, variant, dateStr }) {
  const [val, setVal] = useState(valueFromProps || '');
  const lastSeed = useRef(valueFromProps || '');
  const [colorOpen, setColorOpen] = useState(false);
  useEffect(() => {
    if (valueFromProps !== lastSeed.current) {
      lastSeed.current = valueFromProps || '';
      setVal(valueFromProps || '');
    }
  }, [valueFromProps]);
  useEffect(() => {
    if (!colorOpen) return;
    const close = () => setColorOpen(false);
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [colorOpen]);
  const textStyle = colorFromProps ? { color: colorFromProps } : undefined;
  return (
    <div
      className={`goal-plan__day-note-row goal-plan__day-note-row--${variant}`}
      data-gp-touch-key={`note::${dateStr || ''}::${variant}`}
    >
      <AutoGrowTextarea
        className={`goal-plan__day-note--${variant}`}
        value={val}
        placeholder={placeholder}
        onChange={(v) => setVal(v)}
        onBlur={(v) => {
          if (v !== lastSeed.current) {
            lastSeed.current = v;
            onCommitText(v);
          }
        }}
        style={textStyle}
      />
      <div className="goal-plan__color-wrap goal-plan__color-wrap--note">
        <button
          type="button"
          className="goal-plan__color-btn goal-plan__color-btn--note"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            setColorOpen((v) => !v);
          }}
          aria-label="Изменить цвет"
          title="Изменить цвет"
          style={{ background: colorFromProps || '#ffffff' }}
        />
        {colorOpen && (
          <ColorPicker
            value={colorFromProps}
            onChange={(c) => onCommitColor(c)}
            onClose={() => setColorOpen(false)}
          />
        )}
      </div>
    </div>
  );
}

function DayColumn({
  date,
  dayItems,
  dayByParent,
  note,
  onSetNote,
  onAddDayTask,
  onAddSubtask,
  onCreateAfter,
  onCommit,
  onDelete,
  onToggle,
  onChangeColor,
  onChangeDate,
  onUpdate,
  onContextMenu,
  isDragging,
}) {
  const ds = toLocalDateString(date);
  const containerId = `gpday::${ds}`;
  const total = dayItems.length;
  const done = dayItems.filter((it) => it.completed_at).length;
  const progress = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <section className="goal-plan__day">
      <header className="goal-plan__day-head">
        <div className="goal-plan__day-head-top">
          <h3 className="goal-plan__day-title">{formatDayLabel(ds)}</h3>
          <PlusButton onClick={onAddDayTask} ariaLabel="Добавить задачу дня" />
        </div>
        <div className="goal-plan__day-progress" title={`${done} из ${total}`}>
          <div className="goal-plan__day-progress-bar" style={{ width: `${progress}%` }} />
        </div>
      </header>
      <DayNoteField
        variant="start"
        dateStr={ds}
        valueFromProps={note?.start_text || ''}
        colorFromProps={note?.start_color || null}
        placeholder="Текст в начале дня"
        onCommitText={(v) => onSetNote(ds, { start_text: v })}
        onCommitColor={(c) => onSetNote(ds, { start_color: c })}
      />
      <SortableContext items={dayItems.map((it) => it.id)} strategy={verticalListSortingStrategy}>
        <div className="goal-plan__day-tasks">
          {dayItems.map((it, i) => (
            <DayItemTree
              key={it.id}
              item={it}
              index={i}
              containerId={containerId}
              subtasks={dayByParent.get(it.id) || []}
              onAddSubtask={() => onAddSubtask(it.id, ds)}
              onCreateAfter={onCreateAfter}
              onCommit={(id, text) => onCommit(id, text)}
              onDelete={(id) => onDelete(id)}
              onToggle={(id) => onToggle(id)}
              onChangeColor={(id, c) => onChangeColor(id, c)}
              onChangeDate={(id, d) => onChangeDate(id, d)}
              onUpdate={onUpdate}
              onContextMenu={onContextMenu}
              isDragging={isDragging}
            />
          ))}
          <DropSlot id={containerId} index={dayItems.length} />
        </div>
      </SortableContext>
      <DayNoteField
        variant="end"
        dateStr={ds}
        valueFromProps={note?.end_text || ''}
        colorFromProps={note?.end_color || null}
        placeholder="Текст в конце дня"
        onCommitText={(v) => onSetNote(ds, { end_text: v })}
        onCommitColor={(c) => onSetNote(ds, { end_color: c })}
      />
    </section>
  );
}

function DayItemTree({
  item,
  index,
  containerId,
  subtasks,
  onAddSubtask,
  onCreateAfter,
  onCommit,
  onDelete,
  onToggle,
  onChangeColor,
  onChangeDate,
  onUpdate,
  onContextMenu,
  isDragging,
}) {
  // Persisted collapsed state — driven by the item field so it survives reloads.
  const subCollapsed = !!item.subtasks_collapsed;
  const setSubCollapsed = (next) => {
    const value = typeof next === 'function' ? next(subCollapsed) : !!next;
    if (value !== subCollapsed) onUpdate?.(item.id, { subtasks_collapsed: value });
  };
  const subsContainerId = `gpsub-day::${item.id}`;
  // While a drag is active we render the subtask drop zone even for items
  // that have no subtasks yet, so the user can drop an item into an empty
  // subtask list. Outside of drag the empty zone stays hidden to avoid
  // adding visual gaps below the row.
  const showSubtasks = !subCollapsed && (subtasks.length > 0 || isDragging);
  return (
    <div className="goal-plan__tree goal-plan__tree--day">
      <DropSlot id={containerId} index={index} />
      <SortableItemRow
        item={item}
        containerId={containerId}
        showCheckbox
        draggable
        allowColor
        allowDate
        dateClearable={false}
        dateShowLabel={false}
        allowSubtasks
        hasSubtasks={subtasks.length > 0}
        subtasksCollapsed={subCollapsed}
        onToggleSubtasksCollapsed={() => setSubCollapsed((v) => !v)}
        onAddSubtask={onAddSubtask}
        onCommit={(text) => onCommit(item.id, text)}
        onDelete={() => onDelete(item.id)}
        onToggle={() => onToggle(item.id)}
        onChangeColor={(c) => onChangeColor(item.id, c)}
        onChangeDate={(d) => onChangeDate(item.id, d)}
        onKeyboardCreateBelow={() => onCreateAfter?.(item)}
        onKeyboardCreateSubtask={() => {
          setSubCollapsed(false);
          onAddSubtask();
        }}
        onContextMenu={(e) => onContextMenu?.(e, item)}
        placeholder="Задача дня"
      />
      {showSubtasks && (
        <div className="goal-plan__subtasks">
          <SortableContext items={subtasks.map((s) => s.id)} strategy={verticalListSortingStrategy}>
            {subtasks.map((sub, i) => (
              <Fragment key={sub.id}>
                <DropSlot id={subsContainerId} index={i} />
                <SortableItemRow
                  item={sub}
                  containerId={subsContainerId}
                  showCheckbox
                  draggable
                  allowColor
                  onCommit={(text) => onCommit(sub.id, text)}
                  onDelete={() => onDelete(sub.id)}
                  onToggle={() => onToggle(sub.id)}
                  onChangeColor={(c) => onChangeColor(sub.id, c)}
                  onKeyboardCreateBelow={() => onCreateAfter?.(sub)}
                  onContextMenu={(e) => onContextMenu?.(e, sub)}
                  placeholder="Подзадача"
                />
              </Fragment>
            ))}
            <DropSlot id={subsContainerId} index={subtasks.length} />
          </SortableContext>
        </div>
      )}
    </div>
  );
}

const SIDEBAR_MIN = 240;
const SIDEBAR_MAX = 560;
const SIDEBAR_DEFAULT = 320;

function loadSidebarWidth() {
  try {
    const v = parseInt(localStorage.getItem('goal_plan_sidebar_width'), 10);
    if (Number.isFinite(v) && v >= SIDEBAR_MIN && v <= SIDEBAR_MAX) return v;
  } catch {
    /* ignore */
  }
  return SIDEBAR_DEFAULT;
}

export function GoalPlanView({
  days,
  itemsByKind,
  notes,
  addItem,
  addItemAfter,
  updateItem,
  toggleComplete,
  deleteItem,
  reorderItems,
  moveDayItem,
  setDayNote,
  getListCollapsed,
  setListCollapsed,
}) {
  const [activeDragId, setActiveDragId] = useState(null);
  const [sidebarWidth, setSidebarWidth] = useState(loadSidebarWidth);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  // Context menu (right-click on day items / subtasks). `{ x, y, item }`.
  const [ctxMenu, setCtxMenu] = useState(null);
  const ctxMenuRef = useRef(null);

  // Touch activation: on devices that don't support hover, manage an
  // `.is-touch-active` class imperatively on the last-tapped container that
  // exposes hover-only controls (rows, section heads, day-note rows). The
  // class is what CSS uses to reveal those controls.
  const isTouch = useMediaQuery('(hover: none)');
  useEffect(() => {
    if (!isTouch) return undefined;
    let lastEl = null;
    const handleDown = (e) => {
      const el = e.target.closest('[data-gp-touch-key]');
      if (el === lastEl) return;
      if (lastEl) lastEl.classList.remove('is-touch-active');
      if (el) el.classList.add('is-touch-active');
      lastEl = el;
    };
    document.addEventListener('pointerdown', handleDown, true);
    return () => {
      if (lastEl) lastEl.classList.remove('is-touch-active');
      document.removeEventListener('pointerdown', handleDown, true);
    };
  }, [isTouch]);

  useEffect(() => {
    try {
      localStorage.setItem('goal_plan_sidebar_width', String(sidebarWidth));
    } catch {
      /* ignore */
    }
  }, [sidebarWidth]);

  const handleResizePointerDown = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startW = sidebarWidth;
      document.body.style.cursor = 'ew-resize';
      document.body.style.userSelect = 'none';
      const onMove = (ev) => {
        const dx = ev.clientX - startX;
        const next = Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, startW + dx));
        setSidebarWidth(next);
      };
      const onUp = () => {
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    },
    [sidebarWidth]
  );

  // Sidebar section collapsed state is persisted to the `user_list_collapsed`
  // table via the shared `useListCollapsed` hook (created at the page level
  // and passed in). We namespace each kind under `goal_plan_section::<kind>`.
  const sectionCollapseKey = (kind) => `goal_plan_section::${kind}`;
  const isSectionCollapsed = (kind) =>
    !!getListCollapsed?.(sectionCollapseKey(kind));
  const toggleCollapsed = (kind) => {
    const next = !isSectionCollapsed(kind);
    setListCollapsed?.(sectionCollapseKey(kind), next);
  };

  /** Action subtasks grouped by parent. */
  const byParent = useMemo(() => {
    const map = new Map();
    for (const it of itemsByKind.action || []) {
      if (!it.parent_id) continue;
      if (!map.has(it.parent_id)) map.set(it.parent_id, []);
      map.get(it.parent_id).push(it);
    }
    for (const arr of map.values()) arr.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    return map;
  }, [itemsByKind]);

  /** Top-level day items grouped by date. */
  const dayItemsByDate = useMemo(() => {
    const map = new Map();
    for (const it of itemsByKind.day || []) {
      if (it.parent_id) continue;
      const ds = it.entry_date;
      if (!ds) continue;
      if (!map.has(ds)) map.set(ds, []);
      map.get(ds).push(it);
    }
    for (const arr of map.values()) arr.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    return map;
  }, [itemsByKind]);

  /** Day subtasks grouped by parent. */
  const dayByParent = useMemo(() => {
    const map = new Map();
    for (const it of itemsByKind.day || []) {
      if (!it.parent_id) continue;
      if (!map.has(it.parent_id)) map.set(it.parent_id, []);
      map.get(it.parent_id).push(it);
    }
    for (const arr of map.values()) arr.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    return map;
  }, [itemsByKind]);

  /** Resolve a container id back to its ordered item list. */
  const getContainerItems = useCallback(
    (containerId) => {
      if (containerId.startsWith('gpsec::')) {
        const kind = containerId.slice('gpsec::'.length);
        if (kind === 'action') {
          return (itemsByKind.action || []).filter((it) => !it.parent_id);
        }
        return itemsByKind[kind] || [];
      }
      if (containerId.startsWith('gpsub-action::')) {
        const parentId = containerId.slice('gpsub-action::'.length);
        return byParent.get(parentId) || [];
      }
      if (containerId.startsWith('gpsub-day::')) {
        const parentId = containerId.slice('gpsub-day::'.length);
        return dayByParent.get(parentId) || [];
      }
      if (containerId.startsWith('gpday::')) {
        const ds = containerId.slice('gpday::'.length);
        return dayItemsByDate.get(ds) || [];
      }
      return [];
    },
    [itemsByKind, byParent, dayByParent, dayItemsByDate]
  );

  const handleDragStart = useCallback((event) => {
    setActiveDragId(event.active.id);
  }, []);

  const handleDragEnd = useCallback(
    (event) => {
      setActiveDragId(null);
      const { active, over } = event;
      if (!over) return;
      const activeData = active.data.current;
      if (!activeData) return;
      const { item: activeItem, containerId: activeContainer } = activeData;

      // Resolve a container id (gpday:: / gpsub-day::) to `{ date, parentId }`.
      // Returns null for non-day containers (sidebar lists, action subtasks).
      const resolveDayContainer = (containerId) => {
        if (typeof containerId !== 'string') return null;
        if (containerId.startsWith('gpday::')) {
          return { date: containerId.slice('gpday::'.length), parentId: null };
        }
        if (containerId.startsWith('gpsub-day::')) {
          const parentId = containerId.slice('gpsub-day::'.length);
          const parent = (itemsByKind.day || []).find((it) => it.id === parentId);
          if (!parent) return null;
          return { date: parent.entry_date, parentId };
        }
        return null;
      };

      // Disallow placing an item that has its own subtasks into another
      // subtask list — the UI only renders one level of nesting and the
      // deeper subtasks would become hidden orphans.
      const willCreateDeepNesting = (target) => {
        if (!target?.parentId) return false;
        return (itemsByKind.day || []).some((it) => it.parent_id === activeItem.id);
      };

      // ---- Drop on a slot (empty drop indicator) ----
      const slot = parseSlotId(over.id);
      if (slot) {
        if (activeItem.kind !== 'day') return;
        const target = resolveDayContainer(slot.containerId);
        if (!target) return;
        if (willCreateDeepNesting(target)) return;
        // Same-list reorder: account for the source row being removed from
        // before the target index when moving down.
        let idx = slot.index;
        if (slot.containerId === activeContainer) {
          const sourceList = getContainerItems(activeContainer).map((it) => it.id);
          const srcIdx = sourceList.indexOf(activeItem.id);
          if (srcIdx !== -1 && srcIdx < idx) idx -= 1;
        }
        moveDayItem(activeItem.id, target.date, idx, target.parentId);
        return;
      }

      // ---- Drop on another item ----
      const overData = over.data?.current;
      if (!overData) return;
      const { item: overItem, containerId: overContainer } = overData;

      // Same container reorder — covers all sidebar lists, action subtasks,
      // day top-level lists and day subtask lists alike.
      if (overContainer === activeContainer) {
        const list = getContainerItems(activeContainer);
        const ids = list.map((it) => it.id);
        const from = ids.indexOf(activeItem.id);
        const to = ids.indexOf(overItem.id);
        if (from === -1 || to === -1 || from === to) return;
        reorderItems(arrayMove(ids, from, to));
        return;
      }

      // Cross-container moves — only meaningful between day lists.
      if (activeItem.kind !== 'day') return;
      const target = resolveDayContainer(overContainer);
      if (!target) return;
      if (willCreateDeepNesting(target)) return;
      const list = getContainerItems(overContainer);
      const targetIdx = Math.max(0, list.findIndex((it) => it.id === overItem.id));
      moveDayItem(activeItem.id, target.date, targetIdx, target.parentId);
    },
    [itemsByKind, getContainerItems, moveDayItem, reorderItems]
  );

  const handleAddSection = useCallback(
    (kind, parent_id = null) => addItem({ kind, text: '', parent_id }),
    [addItem]
  );

  const handleAddDayTask = useCallback(
    (ds) => addItem({ kind: 'day', text: '', entry_date: ds }),
    [addItem]
  );

  const handleAddDaySubtask = useCallback(
    (parentId, ds) => addItem({ kind: 'day', text: '', parent_id: parentId, entry_date: ds }),
    [addItem]
  );

  /** Insert a new sibling directly after the given item (Enter-key behavior).
   * Falls back to appending at end of the same list when the helper isn't
   * available or the after-item can't be found. */
  const insertItemAfter = useCallback(
    (afterItem) => {
      if (!afterItem) return;
      const kind = afterItem.kind;
      const parent_id = afterItem.parent_id || null;
      const entry_date = kind === 'day' ? afterItem.entry_date || null : null;
      if (typeof addItemAfter === 'function') {
        return addItemAfter({ afterId: afterItem.id, kind, parent_id, entry_date, text: '' });
      }
      return addItem({ kind, parent_id, entry_date, text: '' });
    },
    [addItem, addItemAfter]
  );

  const handleChangeColor = useCallback(
    (id, color) => updateItem(id, { text_color: color }),
    [updateItem]
  );

  /** Day-item date change moves the item to the new day's plan (top position),
   * re-indexing positions in both source and target days. */
  const handleChangeDateDay = useCallback(
    (id, dateStr) => {
      if (!dateStr) return;
      moveDayItem(id, dateStr, 0);
    },
    [moveDayItem]
  );

  // Right-click context menu for day items / subtasks.
  const handleRowContextMenu = useCallback((e, item) => {
    if (!item || item.kind !== 'day') return;
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY, item });
  }, []);

  // Reposition the menu so it stays inside the viewport.
  useEffect(() => {
    if (!ctxMenu || !ctxMenuRef.current) return;
    const menu = ctxMenuRef.current;
    const rect = menu.getBoundingClientRect();
    let nextX = ctxMenu.x;
    let nextY = ctxMenu.y;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (rect.right > vw - 8) nextX = Math.max(8, vw - rect.width - 8);
    if (rect.bottom > vh - 8) nextY = Math.max(8, ctxMenu.y - rect.height);
    if (nextX !== ctxMenu.x || nextY !== ctxMenu.y) {
      setCtxMenu((prev) => (prev ? { ...prev, x: nextX, y: nextY } : prev));
    }
  }, [ctxMenu]);

  const ctxMoveToOffset = useCallback(
    (offsetDays) => {
      if (!ctxMenu?.item) return;
      const d = new Date();
      d.setDate(d.getDate() + offsetDays);
      const ds = toLocalDateString(d);
      moveDayItem(ctxMenu.item.id, ds, Number.MAX_SAFE_INTEGER);
      setCtxMenu(null);
    },
    [ctxMenu, moveDayItem]
  );

  const ctxSetColor = useCallback(
    (color) => {
      if (!ctxMenu?.item) return;
      updateItem(ctxMenu.item.id, { text_color: color });
      setCtxMenu(null);
    },
    [ctxMenu, updateItem]
  );

  const ctxDelete = useCallback(() => {
    if (!ctxMenu?.item) return;
    deleteItem(ctxMenu.item.id);
    setCtxMenu(null);
  }, [ctxMenu, deleteItem]);

  const isWide = useMediaQuery('(min-width: 900px)');

  const activeDragItem = useMemo(() => {
    if (!activeDragId) return null;
    for (const list of Object.values(itemsByKind)) {
      const found = list.find((it) => it.id === activeDragId);
      if (found) return found;
    }
    return null;
  }, [activeDragId, itemsByKind]);

  return (
    <div className="goal-plan">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveDragId(null)}
      >
        <div className="goal-plan__layout">
          <aside
            className="goal-plan__sidebar"
            style={isWide ? { flex: `0 0 ${sidebarWidth}px` } : undefined}
          >
            {isWide && (
              <div
                className="goal-plan__resize-handle"
                onPointerDown={handleResizePointerDown}
                role="separator"
                aria-orientation="vertical"
                aria-label="Изменить ширину"
                title="Перетащите, чтобы изменить ширину"
              />
            )}
            <div className="goal-plan__sidebar-inner">
              {SECTION_DEFS.map((def) => {
                const items = def.kind === 'action'
                  ? (itemsByKind.action || []).filter((it) => !it.parent_id)
                  : itemsByKind[def.kind] || [];
                return (
                  <Section
                    key={def.kind}
                    def={def}
                    items={items}
                    byParent={byParent}
                    collapsed={isSectionCollapsed(def.kind)}
                    onToggleCollapsed={() => toggleCollapsed(def.kind)}
                    onAdd={(parentId) => handleAddSection(def.kind, parentId)}
                    onCreateAfter={insertItemAfter}
                    onCommit={(id, text) => updateItem(id, { text })}
                    onDelete={(id) => deleteItem(id)}
                    onToggle={def.showCheckbox ? (id) => toggleComplete(id) : null}
                    onChangeColor={handleChangeColor}
                    onUpdate={updateItem}
                    showCheckbox={def.showCheckbox}
                    showSubtasks={def.showSubtasks}
                  />
                );
              })}
            </div>
          </aside>
          <div className={classNames('goal-plan__days', !isWide && 'goal-plan__days--stack')}>
            {days.map((date) => {
              const ds = toLocalDateString(date);
              const dayItems = dayItemsByDate.get(ds) || [];
              return (
                <DayColumn
                  key={ds}
                  date={date}
                  dayItems={dayItems}
                  dayByParent={dayByParent}
                  note={notes[ds]}
                  onSetNote={(d, patch) => setDayNote(d, patch)}
                  onAddDayTask={() => handleAddDayTask(ds)}
                  onAddSubtask={handleAddDaySubtask}
                  onCreateAfter={insertItemAfter}
                  onCommit={(id, text) => updateItem(id, { text })}
                  onDelete={(id) => deleteItem(id)}
                  onToggle={(id) => toggleComplete(id)}
                  onChangeColor={handleChangeColor}
                  onChangeDate={handleChangeDateDay}
                  onUpdate={updateItem}
                  onContextMenu={handleRowContextMenu}
                  isDragging={!!activeDragId}
                />
              );
            })}
          </div>
        </div>
        <DragOverlay dropAnimation={null}>
          {activeDragItem ? (
            <div className="goal-plan__drag-overlay" style={activeDragItem.text_color ? { color: activeDragItem.text_color } : undefined}>
              {activeDragItem.text || ''}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
      {ctxMenu && (
        <>
          <div
            className="goal-plan__ctxmenu-backdrop"
            aria-hidden
            onClick={() => setCtxMenu(null)}
            onContextMenu={(e) => {
              e.preventDefault();
              setCtxMenu(null);
            }}
          />
          <div
            ref={ctxMenuRef}
            className="goal-plan__ctxmenu"
            style={{ left: ctxMenu.x, top: ctxMenu.y }}
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.preventDefault()}
          >
            <div className="goal-plan__ctxmenu-colors">
              {TASK_COLORS.map((c) => {
                const cur = (ctxMenu.item.text_color || '#ffffff').toLowerCase();
                const selected = cur === c.toLowerCase();
                return (
                  <span
                    key={c}
                    className={classNames(
                      'goal-plan__ctxmenu-color-wrap',
                      selected && 'goal-plan__ctxmenu-color-wrap--selected'
                    )}
                    style={{ '--swatch-color': c }}
                  >
                    <button
                      type="button"
                      className="goal-plan__ctxmenu-color"
                      style={{ background: c }}
                      onClick={() => ctxSetColor(c)}
                      aria-label={`Цвет ${c}`}
                    />
                  </span>
                );
              })}
            </div>
            <button
              type="button"
              className="goal-plan__ctxmenu-item"
              onClick={() => ctxMoveToOffset(0)}
            >
              <img src={starIcon} alt="" className="goal-plan__ctxmenu-icon" />
              <span>Сегодня</span>
            </button>
            <button
              type="button"
              className="goal-plan__ctxmenu-item"
              onClick={() => ctxMoveToOffset(1)}
            >
              <img src={zavtraIcon} alt="" className="goal-plan__ctxmenu-icon" />
              <span>Завтра</span>
            </button>
            <button
              type="button"
              className="goal-plan__ctxmenu-item"
              onClick={() => ctxMoveToOffset(2)}
            >
              <img src={poslezavtraIcon} alt="" className="goal-plan__ctxmenu-icon" />
              <span>Послезавтра</span>
            </button>
            <div className="goal-plan__ctxmenu-separator" aria-hidden />
            <button
              type="button"
              className="goal-plan__ctxmenu-item goal-plan__ctxmenu-item--danger"
              onClick={ctxDelete}
            >
              <img src={ctxDeleteIcon} alt="" className="goal-plan__ctxmenu-icon" />
              <span>Удалить</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
