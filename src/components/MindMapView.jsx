import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { ColorPalette } from './KanbanView';
import { cardFill } from '../lib/kanbanCards';
import { useMediaQuery } from '../hooks/useMediaQuery';
import plusIcon from '../assets/plus.svg';
import plusNavIcon from '../assets/plus-nav.svg';
import deleteIcon from '../assets/delete.svg';
import deleteNavIcon from '../assets/delete-nav.svg';
import deleteDangerIcon from '../assets/delete-danger.svg';
import dragIcon from '../assets/drag.svg';
import editIcon from '../assets/edit.svg';
import lineHeightIcon from '../assets/line-height.svg';
import childIcon from '../assets/doches.svg';
import siblingIcon from '../assets/ryadom.svg';
import copyBranchIcon from '../assets/copy2.svg';
import outdentIcon from '../assets/align-top.svg';
import rootIcon from '../assets/koren.svg';
import mindmapIcon from '../assets/mindmap.svg';
import upIcon from '../assets/up.svg';
import upNavIcon from '../assets/up-nav.svg';
import downIcon from '../assets/down.svg';
import downNavIcon from '../assets/down-nav.svg';
import gridTopIcon from '../assets/grid-top.svg';
import gridLeftIcon from '../assets/grid-left.svg';
import leftIcon from '../assets/left.svg';
import leftNavIcon from '../assets/left-nav.svg';
import rightIcon from '../assets/right.svg';
import rightNavIcon from '../assets/right-nav.svg';
import settingsIcon from '../assets/settings.svg';
import settingsNavIcon from '../assets/settings-nav.svg';
import zoomInIcon from '../assets/zoom-in.svg';
import zoomInNavIcon from '../assets/zoom-in-nav.svg';
import zoomOutIcon from '../assets/zoom-out.svg';
import zoomOutNavIcon from '../assets/zoom-out-nav.svg';
import fitIcon from '../assets/fit.svg';
import fitNavIcon from '../assets/fit-nav.svg';
import './MindMapView.css';

const MIN_NODE_WIDTH = 160;
const MAX_NODE_WIDTH = 520;
const NODE_WIDTH_STEP = 10;
const MIN_ZOOM = 30;
const MAX_ZOOM = 200;
const ZOOM_STEP = 10;
/** How long the zoom sits still before it is saved. */
const ZOOM_SAVE_DELAY = 500;
/** The colours offered straight from the context menu of a node. */
const QUICK_COLORS = ['#f33737', '#f4ba04', '#15c466', '#5a86ee', '#613aaf'];
/** How long a title or a description sits still before it is saved. */
const SAVE_DELAY = 600;

const slotId = (parentId, index) => `mslot::${parentId ?? 'root'}::${index}`;
const intoId = (nodeId) => `minto::${nodeId}`;

function parseSlotId(id) {
  if (typeof id !== 'string' || !id.startsWith('mslot::')) return null;
  const rest = id.slice(7);
  const at = rest.lastIndexOf('::');
  if (at < 0) return null;
  const index = Number(rest.slice(at + 2));
  if (!Number.isFinite(index)) return null;
  const parent = rest.slice(0, at);
  return { parentId: parent === 'root' ? null : parent, index };
}

const parseIntoId = (id) => (typeof id === 'string' && id.startsWith('minto::') ? id.slice(7) : null);

/** Which way the branches of a map grow. */
const branchDirection = (board) => (board.mind_direction === 'down' ? 'down' : 'right');

/**
 * How a node shows the level under it while the branches grow down: children
 * across a row, or stacked in one column off its left edge. Growing to the
 * right they are stacked either way, so there the setting sits idle.
 */
const kidsStacked = (node) => node.kids_layout === 'column';

const snapZoom = (n) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round(Number(n) || 100)));

/** Folding a branch takes it aside, or upwards when the branches go down. */
const foldIcon = (down, hover) => {
  if (down) return hover ? upNavIcon : upIcon;
  return hover ? leftNavIcon : leftIcon;
};

const unfoldIcon = (down, hover) => {
  if (down) return hover ? downNavIcon : downIcon;
  return hover ? rightNavIcon : rightIcon;
};

/** The children of every node, each branch in the order it stands in. */
function groupByParent(nodes) {
  const map = new Map();
  nodes.forEach((n) => {
    const key = n.parent_id ?? null;
    const bucket = map.get(key);
    if (bucket) bucket.push(n);
    else map.set(key, [n]);
  });
  map.forEach((list) => list.sort((a, b) => (a.position ?? 0) - (b.position ?? 0)));
  return map;
}

/** The node together with everything under it. */
function subtreeIds(byParent, id) {
  const out = new Set([id]);
  const walk = (pid) => (byParent.get(pid) || []).forEach((n) => {
    out.add(n.id);
    walk(n.id);
  });
  walk(id);
  return out;
}

/** How many nodes hang below this one, however deep. */
function countBelow(byParent, id) {
  let total = 0;
  const walk = (pid) => (byParent.get(pid) || []).forEach((n) => {
    total += 1;
    walk(n.id);
  });
  walk(id);
  return total;
}

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
 * The title of a node, typed over in place. It works the way an outline does:
 * Enter files the title away and opens a new node next to it, Tab opens one
 * under it, so a whole branch can be written out without touching the mouse.
 */
function NodeTitleEditor({ node, onCommit, onDone, onSibling, onChild }) {
  const [text, setText] = useState(node.title || '');
  const settled = useRef(false);
  const ref = useAutoGrow(text);

  const finish = (then) => {
    settled.current = true;
    const next = text.trim();
    if (next !== (node.title || '')) onCommit(node.id, next);
    onDone();
    then?.(node);
  };

  return (
    <textarea
      ref={ref}
      className="mind-node__title-input"
      style={node.title_color ? { color: node.title_color } : undefined}
      rows={1}
      autoFocus
      value={text}
      placeholder="Название плашки"
      onChange={(e) => setText(e.target.value)}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          finish(onSibling);
        } else if (e.key === 'Tab') {
          e.preventDefault();
          finish(onChild);
        } else if (e.key === 'Escape') {
          settled.current = true;
          onDone();
        }
      }}
      onBlur={() => {
        if (settled.current) return;
        finish(null);
      }}
    />
  );
}

/**
 * One node of the map. The whole body drags it on a desktop; under a finger
 * the map is swiped around instead, and a grip in the corner does the dragging
 * — otherwise every swipe would pick a node up.
 */
function MindNode({
  node, settings, childCount = 0, hiddenCount = 0, hasHover = false, editing = false,
  dropping = false, overlay = false, dragHandleProps,
  onOpen, onContextMenu, onToggleFold, onAddChild, onTitleCommit, onEditDone, onSibling, onChild,
}) {
  const downAt = useRef(null);
  const [foldHover, setFoldHover] = useState(false);
  const [addHover, setAddHover] = useState(false);
  const byHandle = !hasHover && !overlay && !!dragHandleProps;
  const bodyDrag = !!dragHandleProps && !byHandle;
  const collapsed = !!node.collapsed;
  const fill = cardFill(node.bg_color);
  const style = {
    ...(node.border_color ? { border: `1px solid ${node.border_color}` } : null),
    ...(fill ? { background: fill } : null),
  };
  const showFold = childCount > 0 && !overlay && !!onToggleFold;
  const showAdd = !overlay && !!onAddChild;

  return (
    <article
      className={`mind-node ${byHandle ? 'mind-node--handled' : ''} ${overlay ? 'mind-node--overlay' : ''} ${dropping ? 'mind-node--dropping' : ''}`}
      style={Object.keys(style).length ? style : undefined}
      {...(bodyDrag ? dragHandleProps.attributes : {})}
      {...(bodyDrag ? dragHandleProps.listeners : {})}
      onPointerDown={(e) => {
        downAt.current = { x: e.clientX, y: e.clientY };
        if (bodyDrag) dragHandleProps.listeners?.onPointerDown?.(e);
      }}
      onClick={(e) => {
        const from = downAt.current;
        if (from && Math.hypot(e.clientX - from.x, e.clientY - from.y) > 6) return;
        onOpen?.(node.id);
      }}
      onContextMenu={(e) => {
        if (!onContextMenu) return;
        e.preventDefault();
        onContextMenu(e, node);
      }}
    >
      {(showAdd || byHandle) && (
        <div className="mind-node__corner">
          {showAdd && (
            <button
              type="button"
              className="mind-node__plus"
              onPointerDown={(e) => e.stopPropagation()}
              onMouseEnter={() => hasHover && setAddHover(true)}
              onMouseLeave={() => hasHover && setAddHover(false)}
              onClick={(e) => {
                e.stopPropagation();
                onAddChild(node);
              }}
              aria-label="Добавить дочернюю плашку"
              title="Добавить дочернюю плашку"
            >
              <img src={hasHover && addHover ? plusNavIcon : plusIcon} alt="" />
            </button>
          )}
          {byHandle && (
            <span
              className="mind-node__grip"
              {...dragHandleProps.attributes}
              {...dragHandleProps.listeners}
              onClick={(e) => e.stopPropagation()}
              aria-label="Перетащить плашку"
            >
              <img src={dragIcon} alt="" />
            </span>
          )}
        </div>
      )}
      {editing ? (
        <NodeTitleEditor
          node={node}
          onCommit={onTitleCommit}
          onDone={onEditDone}
          onSibling={onSibling}
          onChild={onChild}
        />
      ) : (
        <div className="mind-node__title" style={node.title_color ? { color: node.title_color } : undefined}>
          {node.title || 'Без названия'}
        </div>
      )}
      {settings.showDescription && node.description?.trim() && (
        <p className="mind-node__desc">{node.description}</p>
      )}
      {showFold && (
        <button
          type="button"
          className={`mind-node__fold ${collapsed ? 'mind-node__fold--shown' : ''}`}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseEnter={() => hasHover && setFoldHover(true)}
          onMouseLeave={() => hasHover && setFoldHover(false)}
          onClick={(e) => {
            e.stopPropagation();
            onToggleFold(node.id, !collapsed);
          }}
          aria-label={collapsed ? 'Развернуть ветку' : 'Свернуть ветку'}
          title={collapsed ? `Развернуть ветку (${hiddenCount})` : 'Свернуть ветку'}
        >
          {collapsed && settings.showCount ? (
            <span className="mind-node__fold-count">{hiddenCount}</span>
          ) : (
            <img
              src={collapsed
                ? unfoldIcon(settings.down, hasHover && foldHover)
                : foldIcon(settings.down, hasHover && foldHover)}
              alt=""
            />
          )}
        </button>
      )}
    </article>
  );
}

/** A node that can be picked up, and that a node can be dropped into. */
function DraggableNode({ node, blocked, ...rest }) {
  const { attributes, listeners, setNodeRef: setDrag, isDragging } = useDraggable({ id: node.id });
  const { isOver, setNodeRef: setDrop } = useDroppable({ id: intoId(node.id), disabled: blocked });
  // One element is both what is picked up and what can be dropped on, so it
  // hands its node to each of them — and keeps the same callback across
  // renders, or every re-render during a drag would unregister it.
  const setRefs = useCallback((el) => {
    setDrag(el);
    setDrop(el);
  }, [setDrag, setDrop]);
  return (
    // The node stays where it is while it is dragged, only faded: a whole
    // branch leaving the tree would rearrange the map under the pointer.
    <div ref={setRefs} className={`mind-node-wrap ${isDragging ? 'mind-node-wrap--lifted' : ''}`}>
      <MindNode {...rest} node={node} dropping={isOver} dragHandleProps={{ attributes, listeners }} />
    </div>
  );
}

/**
 * The gap a node will drop into, drawn as a blue line once the pointer is over
 * it. It takes no height of its own, so the gaps don't stretch a branch; the
 * hit area is a band reaching into the nodes above and below it.
 */
function NodeSlot({ parentId, index, disabled, vertical }) {
  const { isOver, setNodeRef } = useDroppable({ id: slotId(parentId, index), disabled });
  return (
    <div className={`mind-slot ${vertical ? 'mind-slot--vertical' : ''}`}>
      <div ref={setNodeRef} className={`mind-slot__hit ${isOver ? 'mind-slot__hit--over' : ''}`}>
        <div className="mind-slot__line" aria-hidden />
      </div>
    </div>
  );
}

/**
 * A node with its branch: the node itself, and beside or below it the children,
 * joined to it by lines. First and last are marked, because the drop gaps stand
 * between the children and `:first-child` would find one of those instead.
 *
 * Where the lines are drawn depends on two things, and both are told in classes
 * for the stylesheet to read. `--stack` means this node holds its children in
 * one column rather than a row. `--anchored` means the node stands at the left
 * edge of its own branch instead of over the middle of it — which is where the
 * line must meet it, both when its children hang off that edge and when it is
 * itself one of a stacked set.
 */
function Branch({ node, depth, first, last, parentStacked, byParent, blocked, shared }) {
  const { editingId, ...rest } = shared;
  const kids = byParent.get(node.id) || [];
  const open = !node.collapsed && kids.length > 0;
  const inside = blocked.has(node.id);
  const down = shared.settings.down;
  const stack = down && kidsStacked(node);
  const anchored = down && (stack || parentStacked);
  const kidsAcross = down && !stack;
  return (
    <div
      className={[
        'mind-branch',
        depth === 0 ? 'mind-branch--root' : 'mind-branch--child',
        first ? 'mind-branch--first' : '',
        last ? 'mind-branch--last' : '',
        open ? 'mind-branch--open' : '',
        stack ? 'mind-branch--stack' : '',
        anchored ? 'mind-branch--anchored' : '',
      ].join(' ')}
    >
      <div className="mind-branch__self">
        <DraggableNode
          node={node}
          blocked={inside}
          childCount={kids.length}
          hiddenCount={countBelow(byParent, node.id)}
          editing={editingId === node.id}
          {...rest}
        />
      </div>
      {open && (
        <div className={`mind-branch__kids mind-branch__kids--${kidsAcross ? 'row' : 'column'}`}>
          <NodeSlot parentId={node.id} index={0} disabled={inside} vertical={kidsAcross} />
          {kids.map((kid, i) => (
            <Fragment key={kid.id}>
              <Branch
                node={kid}
                depth={depth + 1}
                first={i === 0}
                last={i === kids.length - 1}
                parentStacked={stack}
                byParent={byParent}
                blocked={blocked}
                shared={shared}
              />
              <NodeSlot parentId={node.id} index={i + 1} disabled={inside} vertical={kidsAcross} />
            </Fragment>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Right-click menu of a node. Everything done to a node often enough to not be
 * worth opening it for: the three colours it can be given, a quick go at its
 * title, a new node next to or under it, folding its branch, a copy of the
 * whole branch, the level it sits on, and getting rid of it.
 */
function NodeContextMenu({
  node, at, childCount, canOutdent, down,
  onUpdate, onAddChild, onAddSibling, onDuplicate, onFoldBranch, onMoveToRoot, onOutdent,
  onOpen, onQuickEdit, onDelete, onClose,
}) {
  const ref = useRef(null);
  const hasHover = useMediaQuery('(hover: hover)');

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { offsetWidth: w, offsetHeight: h } = el;
    el.style.left = `${Math.max(8, Math.min(at.x, window.innerWidth - w - 8))}px`;
    el.style.top = `${Math.max(8, Math.min(at.y, window.innerHeight - h - 8))}px`;
    el.style.visibility = 'visible';
  }, [at]);

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

  const swatches = (value, onPick, none) => (
    <div className="mind-menu__colors">
      <span className="mind-menu__colors-title">{none.of}</span>
      <span className="dashboard__context-menu-colors">
        <span
          className={`dashboard__context-menu-color-wrap ${!value ? 'dashboard__context-menu-color-wrap--selected' : ''}`}
          style={{ '--swatch-color': none.swatch }}
        >
          <button
            type="button"
            className={`dashboard__context-menu-color ${none.className || ''}`}
            style={none.style}
            onClick={() => onPick(null)}
            aria-label={none.label}
            title={none.label}
          />
        </span>
        {QUICK_COLORS.map((c) => {
          const selected = (value || '').toLowerCase() === c.toLowerCase();
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
                onClick={() => onPick(c)}
                aria-label={`${none.of} ${c}`}
                title={none.of}
              />
            </span>
          );
        })}
      </span>
    </div>
  );

  const folded = !!node.collapsed;

  return createPortal(
    <>
      <div className="dashboard__context-menu-backdrop" aria-hidden onClick={onClose} />
      <div
        ref={ref}
        className="dashboard__context-menu mind-menu"
        onClick={(e) => e.stopPropagation()}
        onContextMenu={(e) => e.preventDefault()}
      >
        {swatches(node.title_color, (c) => onUpdate(node.id, { title_color: c }), {
          label: 'Обычный цвет текста',
          of: 'Цвет заголовка',
          style: { background: 'var(--text-strong)' },
          swatch: 'var(--text-strong)',
        })}
        {swatches(node.border_color, (c) => onUpdate(node.id, { border_color: c }), {
          label: 'Без обводки',
          of: 'Цвет обводки',
          className: 'mind-menu__color--none',
          swatch: 'var(--border-strong)',
        })}
        {swatches(node.bg_color, (c) => onUpdate(node.id, { bg_color: c }), {
          label: 'Обычный фон',
          of: 'Цвет фона',
          className: 'mind-menu__color--none',
          swatch: 'var(--border-strong)',
        })}
        {item(lineHeightIcon, 'Быстрое редактирование', () => { onQuickEdit(node.id); onClose(); })}
        {item(editIcon, 'Открыть', () => { onOpen(node.id); onClose(); })}
        <div className="dashboard__context-menu-separator" aria-hidden />

        {item(childIcon, 'Дочерняя плашка', () => { onAddChild(node); onClose(); })}
        {item(siblingIcon, 'Плашка рядом', () => { onAddSibling(node); onClose(); })}
        {childCount > 0 && item(
          folded ? unfoldIcon(down, false) : foldIcon(down, false),
          folded ? 'Развернуть ветку' : 'Свернуть ветку',
          () => { onUpdate(node.id, { collapsed: !folded }); onClose(); },
        )}
        {childCount > 0 && item(foldIcon(down, false), 'Свернуть всё внутри', () => { onFoldBranch(node.id); onClose(); })}
        {down && childCount > 0 && item(
          kidsStacked(node) ? gridTopIcon : gridLeftIcon,
          kidsStacked(node) ? 'Уровень ниже по горизонтали' : 'Уровень ниже по вертикали',
          () => {
            onUpdate(node.id, { kids_layout: kidsStacked(node) ? 'row' : 'column' });
            onClose();
          },
        )}
        {item(copyBranchIcon, 'Скопировать с ветвями', () => { onDuplicate(node.id); onClose(); })}
        {canOutdent && item(outdentIcon, 'Поднять на уровень выше', () => { onOutdent(node); onClose(); })}
        {node.parent_id && item(rootIcon, 'Сделать корневой', () => { onMoveToRoot(node); onClose(); })}
        <div className="dashboard__context-menu-separator" aria-hidden />
        {item(
          deleteDangerIcon,
          childCount > 0 ? 'Удалить с ветвями' : 'Удалить',
          () => { onDelete(node.id); onClose(); },
          'dashboard__context-menu-item--danger',
        )}
        {!hasHover && (
          <div className="mind-menu__hint">Плашка перетаскивается за иконку в её углу</div>
        )}
      </div>
    </>,
    document.body,
  );
}

/**
 * Everything about one node, in a panel that slides in from the right: its
 * title and the three colours it can be given, and a description of any
 * length, kept exactly as it was typed — line breaks and all.
 */
function MindNodePanel({ node, childCount, down, onUpdate, onAddChild, onDelete, onClose }) {
  const CLOSE_MS = 220;
  const hasHover = useMediaQuery('(hover: hover)');
  const [closing, setClosing] = useState(false);
  const [title, setTitle] = useState(node.title || '');
  const [description, setDescription] = useState(node.description || '');
  const [picker, setPicker] = useState(null); // 'title' | 'border' | 'bg'
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [delHover, setDelHover] = useState(false);
  const titleRef = useAutoGrow(title);
  const descRef = useAutoGrow(description);
  const titleBtn = useRef(null);
  const borderBtn = useRef(null);
  const bgBtn = useRef(null);
  const nodeId = node.id;

  const requestClose = useRef(null);
  requestClose.current = () => {
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

  // Typing is saved once it has stood still for a moment, and again on the way
  // out of the field, so nothing is lost by closing the panel in a hurry.
  useEffect(() => {
    if (title === (node.title || '')) return undefined;
    const t = setTimeout(() => onUpdate(nodeId, { title: title.trim() }), SAVE_DELAY);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, nodeId]);

  useEffect(() => {
    if (description === (node.description || '')) return undefined;
    const t = setTimeout(() => onUpdate(nodeId, { description }), SAVE_DELAY);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [description, nodeId]);

  const colorButton = (field, ref, label, swatch, value, noneLabel) => (
    <>
      <button
        type="button"
        ref={ref}
        className="mind-panel__color"
        style={swatch}
        onClick={() => setPicker((v) => (v === field ? null : field))}
        aria-label={label}
        title={label}
      />
      {picker === field && (
        <ColorPalette
          anchor={ref}
          value={value}
          allowNone
          noneLabel={noneLabel}
          onPick={(c) => {
            onUpdate(nodeId, { [field]: c });
            setPicker(null);
          }}
          onClose={() => setPicker(null)}
        />
      )}
    </>
  );

  return (
    <div
      className={`mind-panel-overlay ${closing ? 'mind-panel-overlay--closing' : ''}`}
      onClick={() => requestClose.current?.()}
    >
      <aside
        className={`mind-panel ${closing ? 'mind-panel--closing' : ''}`}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="mind-panel__head">
          {colorButton(
            'title_color',
            titleBtn,
            'Цвет заголовка',
            { background: node.title_color || 'var(--text-strong)' },
            node.title_color,
            'Обычный цвет',
          )}
          {colorButton(
            'border_color',
            borderBtn,
            'Цвет обводки',
            node.border_color
              ? { background: 'transparent', border: `2px solid ${node.border_color}` }
              : { background: 'transparent', border: '2px solid var(--border-strong)' },
            node.border_color,
            'Без обводки',
          )}
          {colorButton(
            'bg_color',
            bgBtn,
            'Цвет фона',
            { background: cardFill(node.bg_color) || 'var(--bg-elev)', border: '1px solid var(--border-strong)' },
            node.bg_color,
            'Обычный фон',
          )}
          <span className="mind-panel__head-gap" />
          <button
            type="button"
            className="mind-panel__icon-btn"
            onClick={() => requestClose.current?.()}
            aria-label="Закрыть"
            title="Закрыть"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div className="mind-panel__body">
          <textarea
            ref={titleRef}
            className="mind-panel__title"
            style={node.title_color ? { color: node.title_color } : undefined}
            value={title}
            rows={1}
            placeholder="Название плашки"
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => onUpdate(nodeId, { title: title.trim() })}
          />

          <div className="mind-panel__label">Описание</div>
          <textarea
            ref={descRef}
            className="mind-panel__desc"
            value={description}
            rows={3}
            placeholder="Любое описание, с переносами строк"
            onChange={(e) => setDescription(e.target.value)}
            onBlur={() => onUpdate(nodeId, { description })}
          />

          {/* Only worth showing while the branches grow down: growing to the
              right, a level is a column whichever way this is set. */}
          {down && (
            <>
              <div className="mind-panel__label">Плашки следующего уровня</div>
              <div className="mind-panel__pair">
                {[
                  { id: 'row', label: 'По горизонтали' },
                  { id: 'column', label: 'По вертикали' },
                ].map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    className={`mind-panel__choice ${(kidsStacked(node) ? 'column' : 'row') === o.id ? 'mind-panel__choice--on' : ''}`}
                    onClick={() => onUpdate(nodeId, { kids_layout: o.id })}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </>
          )}

          <div className="mind-panel__row">
            <span className="mind-panel__meta">
              {childCount > 0 ? `Вложенных плашек: ${childCount}` : 'Вложенных плашек нет'}
            </span>
            <button
              type="button"
              className="mind-panel__add"
              onClick={() => {
                onAddChild(node);
                requestClose.current?.();
              }}
            >
              Добавить дочернюю
            </button>
          </div>
        </div>

        {/* Deleting lives here, in the corner furthest from the close button:
            a miss on a phone should not be the one press that clears a branch. */}
        <footer className="mind-panel__foot">
          {confirmDelete ? (
            <div className="mind-panel__confirm">
              <span>{childCount > 0 ? `Удалить вместе с ${childCount} вложенными?` : 'Удалить плашку?'}</span>
              <button
                type="button"
                className="mind-panel__confirm-yes"
                onClick={() => {
                  onDelete(nodeId);
                  onClose();
                }}
              >
                Удалить
              </button>
              <button type="button" className="mind-panel__confirm-no" onClick={() => setConfirmDelete(false)}>
                Отмена
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="mind-panel__icon-btn"
              onMouseEnter={() => hasHover && setDelHover(true)}
              onMouseLeave={() => hasHover && setDelHover(false)}
              onClick={() => setConfirmDelete(true)}
              aria-label="Удалить плашку"
              title="Удалить плашку"
            >
              <img src={hasHover && delHover ? deleteNavIcon : deleteIcon} alt="" />
            </button>
          )}
        </footer>
      </aside>
    </div>
  );
}

function snapNodeWidth(value) {
  const clamped = Math.max(MIN_NODE_WIDTH, Math.min(MAX_NODE_WIDTH, value));
  return Math.round(clamped / NODE_WIDTH_STEP) * NODE_WIDTH_STEP;
}

function MapSettingsModal({ board, onChange, onClose }) {
  // Steps come in bursts, so the width is only saved once it has stood still
  // for a moment; the map behind the modal still follows along.
  const [widthDraft, setWidthDraft] = useState(null);
  const [typed, setTyped] = useState(null);
  const saveTimer = useRef(null);
  useEffect(() => () => clearTimeout(saveTimer.current), []);
  const width = widthDraft ?? board.mind_node_width ?? 240;

  const applyWidth = (value) => {
    const next = snapNodeWidth(value);
    if (next === width) return;
    setWidthDraft(next);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      setWidthDraft(null);
      onChange({ mind_node_width: next });
    }, 400);
  };

  const commitTyped = () => {
    const value = parseInt((typed ?? '').replace(/[^\d]/g, ''), 10);
    setTyped(null);
    if (Number.isFinite(value)) applyWidth(value);
  };

  return (
    <div className="dashboard__settings-overlay" onClick={onClose}>
      <div
        className="dashboard__settings-popup dashboard__settings-popup--main"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dashboard__settings-head">
          <span className="dashboard__settings-heading">Настройки карты</span>
          <button type="button" className="dashboard__settings-close" onClick={onClose} aria-label="Закрыть">
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="dashboard__settings-group">
          <div className="dashboard__settings-title">Ширина плашек</div>
          <div className="dashboard__settings-row mind-settings__stepper">
            <button
              type="button"
              className="mind-settings__step"
              onClick={() => applyWidth(width - NODE_WIDTH_STEP)}
              disabled={width <= MIN_NODE_WIDTH}
              aria-label="Уже"
            >
              −
            </button>
            {typed !== null ? (
              <input
                className="mind-settings__value mind-settings__value--input"
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
                className="mind-settings__value"
                onClick={() => setTyped(String(width))}
                title={`От ${MIN_NODE_WIDTH} до ${MAX_NODE_WIDTH} px`}
              >
                {width} px
              </button>
            )}
            <button
              type="button"
              className="mind-settings__step"
              onClick={() => applyWidth(width + NODE_WIDTH_STEP)}
              disabled={width >= MAX_NODE_WIDTH}
              aria-label="Шире"
            >
              +
            </button>
          </div>
        </div>

        <div className="dashboard__settings-group">
          <div className="dashboard__settings-title">Куда растут ветки</div>
          <div className="dashboard__settings-row mind-settings__pair">
            {[
              { id: 'right', label: 'Вправо' },
              { id: 'down', label: 'Вниз' },
            ].map((o) => (
              <button
                key={o.id}
                type="button"
                className={`mind-settings__choice ${branchDirection(board) === o.id ? 'mind-settings__choice--on' : ''}`}
                onClick={() => onChange({ mind_direction: o.id })}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        <div className="dashboard__settings-group">
          <div className="dashboard__settings-title">Что показывать на плашке</div>
          <label className="dashboard__settings-check">
            <input
              type="checkbox"
              checked={board.mind_show_description !== false}
              onChange={(e) => onChange({ mind_show_description: e.target.checked })}
            />
            <span>Описание</span>
          </label>
          <label className="dashboard__settings-check">
            <input
              type="checkbox"
              checked={board.mind_show_count !== false}
              onChange={(e) => onChange({ mind_show_count: e.target.checked })}
            />
            <span>Число вложенных у свёрнутой ветки</span>
          </label>
          <p className="mind-settings__hint">
            Enter — плашка рядом, Tab — вложенная. Shift и колесо мыши ведут карту в сторону,
            Ctrl и колесо меняют масштаб.
          </p>
        </div>
      </div>
    </div>
  );
}

export function MindMapView({
  board, nodes, addNode, updateNode, updateNodes, deleteNode, moveNode, duplicateNode,
  onUpdateBoard, headerLeftSlot, zoom: savedZoom, setZoom: saveZoom,
}) {
  const hasHover = useMediaQuery('(hover: hover)');
  const wideHeader = useMediaQuery('(min-width: 501px)');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsHover, setSettingsHover] = useState(false);
  const [plusHover, setPlusHover] = useState(false);
  const [openHover, setOpenHover] = useState(false);
  const [foldHover, setFoldHover] = useState(false);
  const [zoomInHover, setZoomInHover] = useState(false);
  const [zoomOutHover, setZoomOutHover] = useState(false);
  const [fitHover, setFitHover] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [menu, setMenu] = useState(null); // { x, y, node }
  const [activeId, setActiveId] = useState(null);
  // The zoom answers the pointer at once and is written down once it settles:
  // a wheel or a held-down button would otherwise be a stream of writes.
  const [zoom, setZoom] = useState(() => snapZoom(savedZoom));
  // The zoom to come back to when the whole map has been fitted on the screen.
  const [zoomBefore, setZoomBefore] = useState(null);
  const canvasRef = useRef(null);
  const pan = useRef(null);
  const zoomSave = useRef(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const mapNodes = useMemo(
    () => nodes.filter((n) => n.board_id === board.id),
    [nodes, board.id],
  );
  const byParent = useMemo(() => groupByParent(mapNodes), [mapNodes]);
  const roots = byParent.get(null) || [];
  const parents = useMemo(
    () => mapNodes.filter((n) => (byParent.get(n.id) || []).length > 0),
    [mapNodes, byParent],
  );
  // While a node is dragged, nothing inside the branch it is being taken from
  // will take it: a node cannot become its own descendant.
  const blocked = useMemo(
    () => (activeId ? subtreeIds(byParent, activeId) : new Set()),
    [activeId, byParent],
  );
  const activeNode = activeId ? mapNodes.find((n) => n.id === activeId) : null;
  const openNode = openId ? mapNodes.find((n) => n.id === openId) : null;

  const width = Math.max(MIN_NODE_WIDTH, Math.min(MAX_NODE_WIDTH, board.mind_node_width ?? 240));
  const down = branchDirection(board) === 'down';
  const settings = {
    showDescription: board.mind_show_description !== false,
    showCount: board.mind_show_count !== false,
    down,
  };

  const addChild = async (node) => {
    const created = await addNode(board.id, node.id, {});
    if (created) setEditingId(created.id);
  };

  const addSibling = async (node) => {
    const created = await addNode(board.id, node.parent_id ?? null, { after: node.id });
    if (created) setEditingId(created.id);
  };

  const addRoot = async () => {
    const created = await addNode(board.id, null, {});
    if (created) setEditingId(created.id);
  };

  /** Folds every branch inside this one, and this one with them. */
  const foldBranch = (id) => {
    const inside = Array.from(subtreeIds(byParent, id))
      .filter((nid) => (byParent.get(nid) || []).length > 0);
    updateNodes(inside, { collapsed: true });
  };

  const outdent = (node) => {
    const parent = mapNodes.find((n) => n.id === node.parent_id);
    if (!parent) return;
    const grand = parent.parent_id ?? null;
    const above = byParent.get(grand) || [];
    const at = above.findIndex((n) => n.id === parent.id);
    moveNode(node.id, grand, at < 0 ? above.length : at + 1);
  };

  const setAllFolded = (collapsed) => {
    updateNodes(parents.map((n) => n.id), { collapsed });
  };

  const changeZoom = useCallback((next, keepFitMemory = false) => {
    const z = snapZoom(next);
    setZoom(z);
    if (!keepFitMemory) setZoomBefore(null);
    clearTimeout(zoomSave.current);
    zoomSave.current = setTimeout(() => saveZoom?.(z), ZOOM_SAVE_DELAY);
  }, [saveZoom]);

  useEffect(() => () => clearTimeout(zoomSave.current), []);

  /**
   * The whole map at once: the zoom it takes to bring every node inside the
   * screen, measured from where the nodes actually are — the canvas itself
   * always fills the view and would say nothing. Pressing it again goes back to
   * the zoom the map was read at.
   */
  const toggleFit = () => {
    if (zoomBefore !== null) {
      changeZoom(zoomBefore);
      return;
    }
    const el = canvasRef.current;
    const drawn = el?.querySelectorAll('.mind-node');
    if (!el || !drawn?.length) return;
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    drawn.forEach((n) => {
      const r = n.getBoundingClientRect();
      left = Math.min(left, r.left);
      top = Math.min(top, r.top);
      right = Math.max(right, r.right);
      bottom = Math.max(bottom, r.bottom);
    });
    // Those rectangles are as they look now, so back to 1:1 before asking how
    // much of the map there is; the margin leaves the lines around it room.
    const scale = zoom / 100;
    const full = (right - left) / scale + 56;
    const tall = (bottom - top) / scale + 56;
    const fits = Math.min(el.clientWidth / full, el.clientHeight / tall, 1);
    setZoomBefore(zoom);
    changeZoom(Math.floor((fits * 100) / 5) * 5, true);
    el.scrollTo({ left: 0, top: 0 });
  };

  // Shift and the wheel walk the map sideways, ctrl and the wheel zoom it; the
  // plain wheel scrolls it.
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.deltaY === 0) return;
        e.preventDefault();
        changeZoom(zoom + (e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP));
        return;
      }
      if (!e.shiftKey || e.deltaY === 0) return;
      el.scrollLeft += e.deltaY;
      e.preventDefault();
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoom, changeZoom]);

  const canPanFrom = (target) => (
    target === canvasRef.current
    || target?.classList?.contains('mind__roots')
    || target?.classList?.contains('mind__pan-space')
  );

  const startPan = (e) => {
    if (e.button !== 0 || !canPanFrom(e.target)) return;
    const el = canvasRef.current;
    if (!el) return;
    pan.current = {
      pointerId: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      left: el.scrollLeft,
      top: el.scrollTop,
      moved: false,
    };
    el.setPointerCapture?.(e.pointerId);
  };

  const movePan = (e) => {
    const p = pan.current;
    const el = canvasRef.current;
    if (!p || !el) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    if (!p.moved) {
      if (Math.hypot(dx, dy) < 4) return;
      p.moved = true;
      el.classList.add('mind__canvas--panning');
    }
    el.scrollLeft = p.left - dx;
    el.scrollTop = p.top - dy;
  };

  const endPan = () => {
    const p = pan.current;
    const el = canvasRef.current;
    if (!p || !el) return;
    el.releasePointerCapture?.(p.pointerId);
    el.classList.remove('mind__canvas--panning');
    pan.current = null;
  };

  /**
   * The pointer decides where a node lands: a gap between two nodes puts it
   * there, a node itself takes it in as its last child. Nothing under the
   * pointer means nothing moves — a map is wide, and a node guessed onto the
   * nearest branch would have to be found again.
   */
  const collide = (args) => {
    const inside = pointerWithin(args);
    return inside.length ? inside : rectIntersection(args);
  };

  const handleDragEnd = ({ active, over }) => {
    setActiveId(null);
    if (!over) return;
    const moved = mapNodes.find((n) => n.id === active.id);
    if (!moved) return;
    const family = subtreeIds(byParent, moved.id);

    const slot = parseSlotId(over.id);
    if (slot) {
      if (slot.parentId && family.has(slot.parentId)) return;
      // The gaps are numbered over the siblings as they stand now, so a node
      // moving down inside its own branch has to discount itself.
      const before = (byParent.get(slot.parentId) || []).slice(0, slot.index);
      moveNode(moved.id, slot.parentId, before.filter((n) => n.id !== moved.id).length);
      return;
    }

    const into = parseIntoId(over.id);
    if (!into || family.has(into)) return;
    const kids = (byParent.get(into) || []).filter((n) => n.id !== moved.id);
    moveNode(moved.id, into, kids.length);
    // A node dropped into a folded branch would be nowhere to be seen.
    if (mapNodes.find((n) => n.id === into)?.collapsed) updateNode(into, { collapsed: false });
  };

  // Everything every node of the tree needs, handed down the recursion.
  const shared = {
    settings,
    hasHover,
    editingId,
    onOpen: setOpenId,
    onContextMenu: (e, node) => setMenu({ x: e.clientX, y: e.clientY, node }),
    onToggleFold: (id, collapsed) => updateNode(id, { collapsed }),
    onAddChild: addChild,
    onTitleCommit: (id, title) => updateNode(id, { title }),
    onEditDone: () => setEditingId(null),
    onSibling: addSibling,
    onChild: addChild,
  };

  // The zoom of the map sits in the top bar, to the left of the menu, where
  // there is room for it; on a narrow screen there is none, so it joins the
  // tools of the map itself.
  const zoomGroup = (
    <div className="mind__zoom">
      <button
        type="button"
        className="mind__icon-btn"
        onMouseEnter={() => hasHover && setZoomOutHover(true)}
        onMouseLeave={() => hasHover && setZoomOutHover(false)}
        onClick={() => changeZoom(zoom - ZOOM_STEP)}
        disabled={zoom <= MIN_ZOOM}
        aria-label="Уменьшить масштаб"
        title="Уменьшить масштаб"
      >
        <img src={hasHover && zoomOutHover ? zoomOutNavIcon : zoomOutIcon} alt="" />
      </button>
      <button
        type="button"
        className="mind__zoom-value"
        onClick={() => changeZoom(100)}
        aria-label="Обычный масштаб"
        title="Обычный масштаб"
      >
        {zoom}%
      </button>
      <button
        type="button"
        className="mind__icon-btn"
        onMouseEnter={() => hasHover && setZoomInHover(true)}
        onMouseLeave={() => hasHover && setZoomInHover(false)}
        onClick={() => changeZoom(zoom + ZOOM_STEP)}
        disabled={zoom >= MAX_ZOOM}
        aria-label="Увеличить масштаб"
        title="Увеличить масштаб"
      >
        <img src={hasHover && zoomInHover ? zoomInNavIcon : zoomInIcon} alt="" />
      </button>
      <button
        type="button"
        className="mind__icon-btn"
        onMouseEnter={() => hasHover && setFitHover(true)}
        onMouseLeave={() => hasHover && setFitHover(false)}
        onClick={toggleFit}
        aria-label={zoomBefore !== null ? 'Вернуть прежний масштаб' : 'Вся карта на экране'}
        title={zoomBefore !== null ? 'Вернуть прежний масштаб' : 'Вся карта на экране'}
      >
        <img src={hasHover && fitHover ? fitNavIcon : fitIcon} alt="" />
      </button>
    </div>
  );
  const zoomInHeader = wideHeader && headerLeftSlot;

  return (
    <section className="mind">
      {zoomInHeader && createPortal(zoomGroup, headerLeftSlot)}
      <div className="mind__header">
        <span className="mind__title">{board.title}</span>
        <span className="mind__header-gap" />
        {!zoomInHeader && zoomGroup}
        {parents.length > 0 && (
          <>
            <button
              type="button"
              className="mind__icon-btn"
              onMouseEnter={() => hasHover && setFoldHover(true)}
              onMouseLeave={() => hasHover && setFoldHover(false)}
              onClick={() => setAllFolded(true)}
              aria-label="Свернуть все ветки"
              title="Свернуть все ветки"
            >
              <img src={foldIcon(down, hasHover && foldHover)} alt="" />
            </button>
            <button
              type="button"
              className="mind__icon-btn"
              onMouseEnter={() => hasHover && setOpenHover(true)}
              onMouseLeave={() => hasHover && setOpenHover(false)}
              onClick={() => setAllFolded(false)}
              aria-label="Развернуть все ветки"
              title="Развернуть все ветки"
            >
              <img src={unfoldIcon(down, hasHover && openHover)} alt="" />
            </button>
          </>
        )}
        <button
          type="button"
          className="mind__icon-btn"
          onMouseEnter={() => hasHover && setPlusHover(true)}
          onMouseLeave={() => hasHover && setPlusHover(false)}
          onClick={addRoot}
          aria-label="Добавить плашку"
          title="Добавить плашку"
        >
          <img src={hasHover && plusHover ? plusNavIcon : plusIcon} alt="" />
        </button>
        <button
          type="button"
          className="mind__icon-btn"
          onMouseEnter={() => hasHover && setSettingsHover(true)}
          onMouseLeave={() => hasHover && setSettingsHover(false)}
          onClick={() => setSettingsOpen(true)}
          aria-label="Настройки карты"
          title="Настройки карты"
        >
          <img src={hasHover && settingsHover ? settingsNavIcon : settingsIcon} alt="" />
        </button>
      </div>
      <div className="mind__header-line" />

      <DndContext
        sensors={sensors}
        collisionDetection={collide}
        onDragStart={({ active }) => setActiveId(active.id)}
        onDragCancel={() => setActiveId(null)}
        onDragEnd={handleDragEnd}
      >
        <div
          className={`mind__canvas ${down ? 'mind__canvas--down' : ''}`}
          ref={canvasRef}
          style={{ '--mind-node-width': `${width}px`, '--mind-zoom': zoom / 100 }}
          onPointerDown={startPan}
          onPointerMove={movePan}
          onPointerUp={endPan}
          onPointerCancel={endPan}
        >
          {roots.length === 0 ? (
            <div className="mind__empty">
              <img src={mindmapIcon} alt="" className="mind__empty-icon" />
              <p className="mind__empty-text">
                Карта пока пустая. Начните с главной мысли, а от неё разведите ветки.
              </p>
              <button type="button" className="mind__empty-btn" onClick={addRoot}>
                Добавить плашку
              </button>
            </div>
          ) : (
            <div className="mind__roots">
              <NodeSlot parentId={null} index={0} vertical={down} />
              {roots.map((node, i) => (
                <Fragment key={node.id}>
                  <Branch
                    node={node}
                    depth={0}
                    first={i === 0}
                    last={i === roots.length - 1}
                    parentStacked={false}
                    byParent={byParent}
                    blocked={blocked}
                    shared={shared}
                  />
                  <NodeSlot parentId={null} index={i + 1} vertical={down} />
                </Fragment>
              ))}
              <div className="mind__pan-space" />
            </div>
          )}
        </div>

        <DragOverlay dropAnimation={{ duration: 200, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' }}>
          {activeNode ? (
            <div
              className="mind-node-wrap mind-node-wrap--overlay"
              style={{ width: `${width}px`, zoom: zoom / 100 }}
            >
              <MindNode node={activeNode} settings={settings} overlay />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {menu && (
        <NodeContextMenu
          key={menu.node.id}
          node={mapNodes.find((n) => n.id === menu.node.id) || menu.node}
          at={menu}
          childCount={(byParent.get(menu.node.id) || []).length}
          canOutdent={!!menu.node.parent_id}
          down={down}
          onUpdate={updateNode}
          onAddChild={addChild}
          onAddSibling={addSibling}
          onDuplicate={duplicateNode}
          onFoldBranch={foldBranch}
          onMoveToRoot={(node) => moveNode(node.id, null, roots.length)}
          onOutdent={outdent}
          onOpen={setOpenId}
          onQuickEdit={setEditingId}
          onDelete={deleteNode}
          onClose={() => setMenu(null)}
        />
      )}

      {openNode && (
        <MindNodePanel
          key={openNode.id}
          node={openNode}
          childCount={countBelow(byParent, openNode.id)}
          down={down}
          onUpdate={updateNode}
          onAddChild={addChild}
          onDelete={deleteNode}
          onClose={() => setOpenId(null)}
        />
      )}

      {settingsOpen && (
        <MapSettingsModal
          board={board}
          onChange={(patch) => onUpdateBoard(board.id, patch)}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </section>
  );
}
