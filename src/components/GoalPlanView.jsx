import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
import plusIcon from '../assets/plus.svg';
import plusNavIcon from '../assets/plus-nav.svg';
import dragIcon from '../assets/drag.svg';
import dragNavIcon from '../assets/drag-nav.svg';
import './GoalPlanView.css';

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

function CrossIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
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
  const resize = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };
  useLayoutEffect(() => {
    resize();
  }, [value]);
  return (
    <textarea
      ref={ref}
      rows={1}
      className={classNames('goal-plan__day-note', className)}
      value={value}
      placeholder={placeholder}
      style={style}
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
  style,
}) {
  const [local, setLocal] = useState(value || '');
  const [editing, setEditing] = useState(autoFocus);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!editing) setLocal(value || '');
  }, [value, editing]);

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
      onBlurEmpty?.();
      setEditing(false);
      return;
    }
    if (trimmed !== (value || '')) onCommit(trimmed);
    setEditing(false);
  };

  if (!editing) {
    return (
      <button
        type="button"
        className={classNames('goal-plan__inline', className)}
        onClick={() => setEditing(true)}
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
    <input
      ref={inputRef}
      type="text"
      className={classNames('goal-plan__input', className)}
      value={local}
      placeholder={placeholder}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={commit}
      style={style}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commit();
          onKeyboardCreateBelow?.();
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

function CompletionToggle({ completed, onToggle }) {
  return (
    <button
      type="button"
      className={classNames('goal-plan__check', completed && 'goal-plan__check--done')}
      onClick={onToggle}
      aria-label={completed ? 'Отменить выполнение' : 'Отметить выполнение'}
    >
      {completed && <CheckIcon />}
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
  onChangeColor,
  placeholder,
  allowColor,
  allowSubtasks,
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
      className={classNames(
        'goal-plan__row',
        completed && 'goal-plan__row--done',
        sortable.isDragging && 'goal-plan__row--dragging'
      )}
    >
      {showCheckbox && <CompletionToggle completed={completed} onToggle={onToggle} />}
      <div className="goal-plan__row-text">
        <GoalEditableText
          value={item.text}
          placeholder={placeholder}
          onCommit={onCommit}
          onBlurEmpty={() => {
            if (!item.text) onDelete();
          }}
          onKeyboardCreateBelow={onKeyboardCreateBelow}
          autoFocus={!item.text}
          style={textStyle}
        />
      </div>
      {allowSubtasks && hasSubtasks && (
        <button
          type="button"
          className="goal-plan__subtask-toggle"
          onClick={onToggleSubtasksCollapsed}
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
      <button
        type="button"
        className="goal-plan__row-delete"
        onClick={onDelete}
        aria-label="Удалить"
        title="Удалить"
      >
        <CrossIcon />
      </button>
      {draggable && <DragHandle attributes={sortable.attributes} listeners={sortable.listeners} />}
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
  onCommit,
  onDelete,
  onToggle,
  onChangeColor,
  showCheckbox,
  showSubtasks,
}) {
  const containerId = `gpsec::${def.kind}`;
  return (
    <section className="goal-plan__section">
      <header className="goal-plan__section-head">
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
                onAddSibling={() => onAdd()}
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
  onAddSibling,
  placeholder,
}) {
  const [subCollapsed, setSubCollapsed] = useState(false);
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
        onKeyboardCreateBelow={onAddSibling}
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
                onKeyboardCreateBelow={onAddSubtask}
                placeholder="Подзадача"
              />
            ))}
          </SortableContext>
        </div>
      )}
    </div>
  );
}

function DayNoteField({ valueFromProps, colorFromProps, placeholder, onCommitText, onCommitColor, variant }) {
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
    <div className={`goal-plan__day-note-row goal-plan__day-note-row--${variant}`}>
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
  onCommit,
  onDelete,
  onToggle,
  onChangeColor,
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
              onAddSibling={onAddDayTask}
              onCommit={(id, text) => onCommit(id, text)}
              onDelete={(id) => onDelete(id)}
              onToggle={(id) => onToggle(id)}
              onChangeColor={(id, c) => onChangeColor(id, c)}
            />
          ))}
          <DropSlot id={containerId} index={dayItems.length} />
        </div>
      </SortableContext>
      <DayNoteField
        variant="end"
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
  onAddSibling,
  onCommit,
  onDelete,
  onToggle,
  onChangeColor,
}) {
  const [subCollapsed, setSubCollapsed] = useState(false);
  const subsContainerId = `gpsub-day::${item.id}`;
  return (
    <div className="goal-plan__tree goal-plan__tree--day">
      <DropSlot id={containerId} index={index} />
      <SortableItemRow
        item={item}
        containerId={containerId}
        showCheckbox
        draggable
        allowColor
        allowSubtasks
        hasSubtasks={subtasks.length > 0}
        subtasksCollapsed={subCollapsed}
        onToggleSubtasksCollapsed={() => setSubCollapsed((v) => !v)}
        onAddSubtask={onAddSubtask}
        onCommit={(text) => onCommit(item.id, text)}
        onDelete={() => onDelete(item.id)}
        onToggle={() => onToggle(item.id)}
        onChangeColor={(c) => onChangeColor(item.id, c)}
        onKeyboardCreateBelow={onAddSibling}
        placeholder="Задача дня"
      />
      {!subCollapsed && subtasks.length > 0 && (
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
                onKeyboardCreateBelow={onAddSubtask}
                placeholder="Подзадача"
              />
            ))}
          </SortableContext>
        </div>
      )}
    </div>
  );
}

export function GoalPlanView({
  days,
  itemsByKind,
  notes,
  addItem,
  updateItem,
  toggleComplete,
  deleteItem,
  reorderItems,
  moveDayItem,
  setDayNote,
}) {
  const [collapsed, setCollapsed] = useState({});
  const [activeDragId, setActiveDragId] = useState(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const toggleCollapsed = (kind) => setCollapsed((s) => ({ ...s, [kind]: !s[kind] }));

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

      // Drop on a slot
      const slot = parseSlotId(over.id);
      if (slot) {
        // Cross-day move (top-level day items only)
        if (
          activeItem.kind === 'day' &&
          !activeItem.parent_id &&
          slot.containerId.startsWith('gpday::')
        ) {
          const targetDate = slot.containerId.slice('gpday::'.length);
          // If reordering within the same day, adjust index because the source
          // is being removed from before the target.
          let idx = slot.index;
          if (targetDate === activeItem.entry_date) {
            const sourceList = (dayItemsByDate.get(targetDate) || []).map((it) => it.id);
            const srcIdx = sourceList.indexOf(activeItem.id);
            if (srcIdx !== -1 && srcIdx < idx) idx -= 1;
          }
          moveDayItem(activeItem.id, targetDate, idx);
        }
        return;
      }

      // Drop on another item — sort within container or cross-day
      const overData = over.data?.current;
      if (!overData) return;
      const { item: overItem, containerId: overContainer } = overData;

      // Same container reorder
      if (overContainer === activeContainer) {
        const list = getContainerItems(activeContainer);
        const ids = list.map((it) => it.id);
        const from = ids.indexOf(activeItem.id);
        const to = ids.indexOf(overItem.id);
        if (from === -1 || to === -1 || from === to) return;
        reorderItems(arrayMove(ids, from, to));
        return;
      }

      // Cross-day (day top-level only)
      if (
        activeItem.kind === 'day' &&
        !activeItem.parent_id &&
        overContainer.startsWith('gpday::')
      ) {
        const targetDate = overContainer.slice('gpday::'.length);
        const list = getContainerItems(overContainer);
        const targetIdx = Math.max(0, list.findIndex((it) => it.id === overItem.id));
        moveDayItem(activeItem.id, targetDate, targetIdx);
      }
    },
    [dayItemsByDate, getContainerItems, moveDayItem, reorderItems]
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

  const handleChangeColor = useCallback(
    (id, color) => updateItem(id, { text_color: color }),
    [updateItem]
  );

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
          <aside className="goal-plan__sidebar">
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
                    collapsed={!!collapsed[def.kind]}
                    onToggleCollapsed={() => toggleCollapsed(def.kind)}
                    onAdd={(parentId) => handleAddSection(def.kind, parentId)}
                    onCommit={(id, text) => updateItem(id, { text })}
                    onDelete={(id) => deleteItem(id)}
                    onToggle={def.showCheckbox ? (id) => toggleComplete(id) : null}
                    onChangeColor={handleChangeColor}
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
                  onCommit={(id, text) => updateItem(id, { text })}
                  onDelete={(id) => deleteItem(id)}
                  onToggle={(id) => toggleComplete(id)}
                  onChangeColor={handleChangeColor}
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
    </div>
  );
}
