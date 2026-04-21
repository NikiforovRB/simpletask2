import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TASK_COLORS } from '../constants';
import plusIcon from '../assets/plus.svg';
import plusNavIcon from '../assets/plus-nav.svg';
import editIcon from '../assets/edit.svg';
import editNavIcon from '../assets/edit-nav.svg';
import deleteIcon from '../assets/delete.svg';
import deleteNavIcon from '../assets/delete-nav.svg';
import zoomInIcon from '../assets/zoom-in.svg';
import zoomInNavIcon from '../assets/zoom-in-nav.svg';
import zoomOutIcon from '../assets/zoom-out.svg';
import zoomOutNavIcon from '../assets/zoom-out-nav.svg';
import globeIcon from '../assets/globe.svg';
import offlineIcon from '../assets/offline.svg';
import gridLeftIcon from '../assets/grid-left.svg';
import gridLeftNavIcon from '../assets/grid-left-nav.svg';
import gridTopIcon from '../assets/grid-top.svg';
import gridTopNavIcon from '../assets/grid-top-nav.svg';
import hCenterIcon from '../assets/horizontal-center.svg';
import hCenterNavIcon from '../assets/horizontal-center-nav.svg';
import vCenterIcon from '../assets/vertical-center.svg';
import vCenterNavIcon from '../assets/vertical-center-nav.svg';
import './BoardView.css';

const ZOOM_PRESETS = [25, 50, 75, 100, 150, 200];
const ZOOM_MIN = 25;
const ZOOM_MAX = 200;
const ZOOM_STEP = 5;
const PADDING_OPTIONS = [5, 10, 15, 20, 25, 30];
const TEXT_SCALE_OPTIONS = [0.6, 0.8, 1, 1.2, 1.4, 1.6, 1.8, 2];
const DEFAULT_BORDER_COLOR = '#2f2f2f';
const BORDER_COLOR_OPTIONS = [DEFAULT_BORDER_COLOR, ...TASK_COLORS];

function formatScaleLabel(s) {
  const str = String(s);
  return str.replace('.', ',');
}

const WORLD_WIDTH = 4000;
const WORLD_HEIGHT = 3000;
const NEW_BLOCK_TOP_OFFSET = 100;

const RESIZE_DIRECTIONS = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function snapZoom(n) {
  return clamp(Math.round(Number(n) || 100), ZOOM_MIN, ZOOM_MAX);
}

function rectsIntersect(a, b) {
  return !(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y);
}

export function BoardView({
  items,
  addItem,
  updateItem,
  updateItemLocal,
  deleteItem,
  zoom,
  setZoom,
  hasHover,
  offline,
  setOffline,
  hasPending,
  onSync,
}) {
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [editingId, setEditingId] = useState(null);
  const [hoverId, setHoverId] = useState(null);
  const [stylingId, setStylingId] = useState(null);
  const [zoomOpen, setZoomOpen] = useState(false);
  const [addHover, setAddHover] = useState(false);
  const [zoomInHover, setZoomInHover] = useState(false);
  const [zoomOutHover, setZoomOutHover] = useState(false);
  const [alignHover, setAlignHover] = useState({ left: false, top: false, hcenter: false, vcenter: false });
  const [syncing, setSyncing] = useState(false);
  const [contextMenu, setContextMenu] = useState(null); // { x, y, itemId }
  const [lasso, setLasso] = useState(null); // {x,y,width,height} in world coords

  const canvasRef = useRef(null);
  const worldRef = useRef(null);
  const dragRef = useRef(null);
  const lassoRef = useRef(null);
  const panRef = useRef(null);
  const zoomMenuRef = useRef(null);

  const zoomScale = zoom / 100;

  useEffect(() => {
    if (!zoomOpen) return;
    const onDocClick = (e) => {
      if (!zoomMenuRef.current) return;
      if (!zoomMenuRef.current.contains(e.target)) setZoomOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [zoomOpen]);

  const changeZoom = useCallback(
    (next) => {
      const z = snapZoom(next);
      setZoom(z);
    },
    [setZoom]
  );

  const handleAddBlock = useCallback(() => {
    const canvas = canvasRef.current;
    const width = 200;
    const height = 100;
    let wx = (WORLD_WIDTH - width) / 2;
    let wy = NEW_BLOCK_TOP_OFFSET;
    if (canvas) {
      const viewCenterX = (canvas.scrollLeft + canvas.clientWidth / 2) / zoomScale;
      wx = Math.round(clamp(viewCenterX - width / 2, 0, WORLD_WIDTH - width));
      const viewTopY = canvas.scrollTop / zoomScale + NEW_BLOCK_TOP_OFFSET;
      wy = Math.round(clamp(viewTopY, 0, WORLD_HEIGHT - height));
    }
    addItem({ x: wx, y: wy, text: 'Новый текст', width, height });
  }, [addItem, zoomScale]);

  const selectOnly = useCallback((id) => {
    setSelectedIds(new Set(id == null ? [] : [id]));
  }, []);

  const beginDrag = useCallback(
    (e, item, mode) => {
      if (e.button !== 0) return;
      if (editingId === item.id) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.pointerId != null && typeof e.currentTarget?.setPointerCapture === 'function') {
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {}
      }
      const isAlreadySelected = selectedIds.has(item.id);
      const groupIds = mode === 'move' && isAlreadySelected && selectedIds.size > 1
        ? Array.from(selectedIds)
        : [item.id];
      if (!isAlreadySelected) {
        setSelectedIds(new Set([item.id]));
      }
      const group = groupIds
        .map((id) => items.find((it) => it.id === id))
        .filter(Boolean)
        .map((it) => ({ id: it.id, startX: it.x, startY: it.y, startWidth: it.width, startHeight: it.height }));
      dragRef.current = {
        primaryId: item.id,
        mode,
        startMouseX: e.clientX,
        startMouseY: e.clientY,
        group,
        moved: false,
      };
    },
    [editingId, selectedIds, items]
  );

  useEffect(() => {
    const onMove = (e) => {
      const d = dragRef.current;
      if (!d) return;
      const dx = (e.clientX - d.startMouseX) / zoomScale;
      const dy = (e.clientY - d.startMouseY) / zoomScale;
      if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) d.moved = true;

      if (d.mode === 'move') {
        const minDx = -Math.min(...d.group.map((g) => g.startX));
        const maxDx = Math.min(...d.group.map((g) => WORLD_WIDTH - g.startX - g.startWidth));
        const minDy = -Math.min(...d.group.map((g) => g.startY));
        const maxDy = Math.min(...d.group.map((g) => WORLD_HEIGHT - g.startY - g.startHeight));
        const cdx = clamp(dx, minDx, maxDx);
        const cdy = clamp(dy, minDy, maxDy);
        d.group.forEach((g) => {
          updateItemLocal(g.id, { x: Math.round(g.startX + cdx), y: Math.round(g.startY + cdy) });
        });
      } else {
        const g = d.group[0];
        const minW = 60;
        const minH = 30;
        let x = g.startX;
        let y = g.startY;
        let w = g.startWidth;
        let h = g.startHeight;
        if (d.mode.includes('e')) w = clamp(g.startWidth + dx, minW, WORLD_WIDTH - g.startX);
        if (d.mode.includes('s')) h = clamp(g.startHeight + dy, minH, WORLD_HEIGHT - g.startY);
        if (d.mode.includes('w')) {
          const newW = clamp(g.startWidth - dx, minW, g.startX + g.startWidth);
          x = g.startX + (g.startWidth - newW);
          w = newW;
        }
        if (d.mode.includes('n')) {
          const newH = clamp(g.startHeight - dy, minH, g.startY + g.startHeight);
          y = g.startY + (g.startHeight - newH);
          h = newH;
        }
        updateItemLocal(g.id, {
          x: Math.round(x),
          y: Math.round(y),
          width: Math.round(w),
          height: Math.round(h),
        });
      }
    };
    const onUp = () => {
      const d = dragRef.current;
      if (!d) return;
      dragRef.current = null;
      if (!d.moved) return;
      d.group.forEach((g) => {
        const cur = items.find((it) => it.id === g.id);
        if (!cur) return;
        if (d.mode === 'move') {
          updateItem(g.id, { x: cur.x, y: cur.y });
        } else {
          updateItem(g.id, { x: cur.x, y: cur.y, width: cur.width, height: cur.height });
        }
      });
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [items, updateItem, updateItemLocal, zoomScale]);

  useEffect(() => {
    const onKey = (e) => {
      if (selectedIds.size === 0) return;
      if (editingId) return;
      if (stylingId) return;
      const tag = (e.target?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || e.target?.isContentEditable) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        Array.from(selectedIds).forEach((id) => deleteItem(id));
        setSelectedIds(new Set());
        return;
      }
      let dx = 0;
      let dy = 0;
      const step = e.shiftKey ? 10 : 1;
      if (e.key === 'ArrowLeft') dx = -step;
      else if (e.key === 'ArrowRight') dx = step;
      else if (e.key === 'ArrowUp') dy = -step;
      else if (e.key === 'ArrowDown') dy = step;
      else return;
      e.preventDefault();
      const ids = Array.from(selectedIds);
      const groupItems = ids.map((id) => items.find((it) => it.id === id)).filter(Boolean);
      if (!groupItems.length) return;
      const minDx = -Math.min(...groupItems.map((g) => g.x));
      const maxDx = Math.min(...groupItems.map((g) => WORLD_WIDTH - g.x - g.width));
      const minDy = -Math.min(...groupItems.map((g) => g.y));
      const maxDy = Math.min(...groupItems.map((g) => WORLD_HEIGHT - g.y - g.height));
      const cdx = clamp(dx, minDx, maxDx);
      const cdy = clamp(dy, minDy, maxDy);
      if (cdx === 0 && cdy === 0) return;
      groupItems.forEach((g) => {
        updateItem(g.id, { x: g.x + cdx, y: g.y + cdy });
      });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedIds, editingId, stylingId, items, updateItem, deleteItem]);

  const getWorldPoint = useCallback(
    (clientX, clientY) => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      const x = (canvas.scrollLeft + (clientX - rect.left)) / zoomScale;
      const y = (canvas.scrollTop + (clientY - rect.top)) / zoomScale;
      return { x, y };
    },
    [zoomScale]
  );

  const handleCanvasMouseDown = useCallback(
    (e) => {
      if (e.button === 2) {
        const canvas = canvasRef.current;
        if (!canvas) return;
        e.preventDefault();
        panRef.current = {
          startX: e.clientX,
          startY: e.clientY,
          startScrollLeft: canvas.scrollLeft,
          startScrollTop: canvas.scrollTop,
          moved: false,
        };
        canvas.classList.add('board-view__canvas--panning');
        return;
      }
      if (e.button !== 0) return;
      const isEmpty =
        e.target === e.currentTarget || e.target.classList?.contains?.('board-view__world');
      if (!isEmpty) return;
      const start = getWorldPoint(e.clientX, e.clientY);
      lassoRef.current = { startX: start.x, startY: start.y, moved: false };
      setLasso({ x: start.x, y: start.y, width: 0, height: 0 });
    },
    [getWorldPoint]
  );

  useEffect(() => {
    const onMove = (e) => {
      if (panRef.current) {
        const p = panRef.current;
        const dx = e.clientX - p.startX;
        const dy = e.clientY - p.startY;
        if (Math.abs(dx) > 1 || Math.abs(dy) > 1) p.moved = true;
        const canvas = canvasRef.current;
        if (canvas) {
          canvas.scrollLeft = p.startScrollLeft - dx;
          canvas.scrollTop = p.startScrollTop - dy;
        }
        return;
      }
      const l = lassoRef.current;
      if (!l) return;
      const point = getWorldPoint(e.clientX, e.clientY);
      l.moved = true;
      const x = Math.min(l.startX, point.x);
      const y = Math.min(l.startY, point.y);
      const width = Math.abs(point.x - l.startX);
      const height = Math.abs(point.y - l.startY);
      setLasso({ x, y, width, height });
    };
    const onUp = () => {
      if (panRef.current) {
        const p = panRef.current;
        panRef.current = null;
        const canvas = canvasRef.current;
        if (canvas) canvas.classList.remove('board-view__canvas--panning');
        if (!p.moved) setSelectedIds(new Set());
        return;
      }
      const l = lassoRef.current;
      if (!l) return;
      lassoRef.current = null;
      const rect = lasso;
      if (!rect || !l.moved || rect.width < 2 || rect.height < 2) {
        setSelectedIds(new Set());
        setLasso(null);
        return;
      }
      const ids = items
        .filter((it) => rectsIntersect(rect, { x: it.x, y: it.y, width: it.width, height: it.height }))
        .map((it) => it.id);
      setSelectedIds(new Set(ids));
      setLasso(null);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [lasso, items, getWorldPoint]);

  const stylingItem = useMemo(
    () => (stylingId ? items.find((i) => i.id === stylingId) : null),
    [stylingId, items]
  );

  const alignSelected = useCallback(
    (mode) => {
      const ids = Array.from(selectedIds);
      const group = ids.map((id) => items.find((it) => it.id === id)).filter(Boolean);
      if (group.length < 2) return;
      if (mode === 'left') {
        const x = Math.min(...group.map((g) => g.x));
        group.forEach((g) => updateItem(g.id, { x }));
      } else if (mode === 'top') {
        const y = Math.min(...group.map((g) => g.y));
        group.forEach((g) => updateItem(g.id, { y }));
      } else if (mode === 'hcenter') {
        const minY = Math.min(...group.map((g) => g.y));
        const maxY = Math.max(...group.map((g) => g.y + g.height));
        const cy = (minY + maxY) / 2;
        group.forEach((g) => {
          const y = clamp(Math.round(cy - g.height / 2), 0, WORLD_HEIGHT - g.height);
          updateItem(g.id, { y });
        });
      } else if (mode === 'vcenter') {
        const minX = Math.min(...group.map((g) => g.x));
        const maxX = Math.max(...group.map((g) => g.x + g.width));
        const cx = (minX + maxX) / 2;
        group.forEach((g) => {
          const x = clamp(Math.round(cx - g.width / 2), 0, WORLD_WIDTH - g.width);
          updateItem(g.id, { x });
        });
      }
    },
    [selectedIds, items, updateItem]
  );

  const openContextMenu = useCallback(
    (e, itemId) => {
      e.preventDefault();
      e.stopPropagation();
      if (!selectedIds.has(itemId)) {
        setSelectedIds(new Set([itemId]));
      }
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        itemId,
      });
    },
    [selectedIds]
  );

  const handleCopyItem = useCallback(
    (id) => {
      const src = items.find((it) => it.id === id);
      if (!src) return;
      const width = src.width;
      const height = src.height;
      const x = clamp(Math.round(src.x + 20), 0, WORLD_WIDTH - width);
      const y = clamp(Math.round(src.y + 20), 0, WORLD_HEIGHT - height);
      addItem({
        x,
        y,
        width,
        height,
        text: src.text,
        text_color: src.text_color,
        has_border: src.has_border,
        padding: src.padding,
        text_scale: src.text_scale,
        border_color: src.border_color,
      });
    },
    [items, addItem]
  );

  useEffect(() => {
    if (!contextMenu) return;
    const onDown = (e) => {
      if (e.target.closest('.board-view__context-menu')) return;
      setContextMenu(null);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setContextMenu(null);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [contextMenu]);

  const handleSync = useCallback(async () => {
    if (!onSync || syncing) return;
    setSyncing(true);
    try {
      await onSync();
    } finally {
      setSyncing(false);
    }
  }, [onSync, syncing]);

  const multiSelected = selectedIds.size >= 2;

  return (
    <div className="board-view">
      <div className="board-view__toolbar-left">
        <div className="board-view__zoom" ref={zoomMenuRef}>
          <button
            type="button"
            className="board-view__zoom-btn"
            onClick={() => setZoomOpen((v) => !v)}
            aria-label="Масштаб"
          >
            <span>{zoom}%</span>
          </button>
          {zoomOpen && (
            <div className="board-view__zoom-menu">
              {ZOOM_PRESETS.map((z) => (
                <button
                  key={z}
                  type="button"
                  className={`board-view__zoom-option ${z === zoom ? 'board-view__zoom-option--active' : ''}`}
                  onClick={() => {
                    changeZoom(z);
                    setZoomOpen(false);
                  }}
                >
                  {z}%
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          type="button"
          className="board-view__icon-btn"
          onMouseEnter={() => hasHover && setZoomOutHover(true)}
          onMouseLeave={() => hasHover && setZoomOutHover(false)}
          onClick={() => changeZoom(zoom - ZOOM_STEP)}
          aria-label="Уменьшить масштаб"
          disabled={zoom <= ZOOM_MIN}
        >
          <img src={hasHover && zoomOutHover ? zoomOutNavIcon : zoomOutIcon} alt="" />
        </button>
        <button
          type="button"
          className="board-view__icon-btn"
          onMouseEnter={() => hasHover && setZoomInHover(true)}
          onMouseLeave={() => hasHover && setZoomInHover(false)}
          onClick={() => changeZoom(zoom + ZOOM_STEP)}
          aria-label="Увеличить масштаб"
          disabled={zoom >= ZOOM_MAX}
        >
          <img src={hasHover && zoomInHover ? zoomInNavIcon : zoomInIcon} alt="" />
        </button>
      </div>

      <div className="board-view__toolbar-right">
        {multiSelected && (
          <>
            <button
              type="button"
              className="board-view__icon-btn"
              onMouseEnter={() => hasHover && setAlignHover((h) => ({ ...h, left: true }))}
              onMouseLeave={() => hasHover && setAlignHover((h) => ({ ...h, left: false }))}
              onClick={() => alignSelected('left')}
              aria-label="Выровнять по левой границе"
              title="Выровнять по левой границе"
            >
              <img src={hasHover && alignHover.left ? gridLeftNavIcon : gridLeftIcon} alt="" />
            </button>
            <button
              type="button"
              className="board-view__icon-btn"
              onMouseEnter={() => hasHover && setAlignHover((h) => ({ ...h, top: true }))}
              onMouseLeave={() => hasHover && setAlignHover((h) => ({ ...h, top: false }))}
              onClick={() => alignSelected('top')}
              aria-label="Выровнять по верхней границе"
              title="Выровнять по верхней границе"
            >
              <img src={hasHover && alignHover.top ? gridTopNavIcon : gridTopIcon} alt="" />
            </button>
            <button
              type="button"
              className="board-view__icon-btn"
              onMouseEnter={() => hasHover && setAlignHover((h) => ({ ...h, hcenter: true }))}
              onMouseLeave={() => hasHover && setAlignHover((h) => ({ ...h, hcenter: false }))}
              onClick={() => alignSelected('hcenter')}
              aria-label="Выровнять по центру по горизонтали"
              title="Выровнять по центру по горизонтали"
            >
              <img src={hasHover && alignHover.hcenter ? hCenterNavIcon : hCenterIcon} alt="" />
            </button>
            <button
              type="button"
              className="board-view__icon-btn"
              onMouseEnter={() => hasHover && setAlignHover((h) => ({ ...h, vcenter: true }))}
              onMouseLeave={() => hasHover && setAlignHover((h) => ({ ...h, vcenter: false }))}
              onClick={() => alignSelected('vcenter')}
              aria-label="Выровнять по центру по вертикали"
              title="Выровнять по центру по вертикали"
            >
              <img src={hasHover && alignHover.vcenter ? vCenterNavIcon : vCenterIcon} alt="" />
            </button>
          </>
        )}
        <button
          type="button"
          className="board-view__icon-btn"
          onMouseEnter={() => hasHover && setAddHover(true)}
          onMouseLeave={() => hasHover && setAddHover(false)}
          onClick={handleAddBlock}
          aria-label="Добавить текстовый блок"
        >
          <img src={hasHover && addHover ? plusNavIcon : plusIcon} alt="" />
        </button>
      </div>

      <div
        className="board-view__canvas"
        ref={canvasRef}
        onMouseDown={handleCanvasMouseDown}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div
          ref={worldRef}
          className="board-view__world"
          style={{
            width: WORLD_WIDTH,
            height: WORLD_HEIGHT,
            transform: `scale(${zoomScale})`,
          }}
        >
          {items.map((it) => (
            <BoardTextBlock
              key={it.id}
              item={it}
              selected={selectedIds.has(it.id)}
              editing={editingId === it.id}
              hovered={hoverId === it.id}
              onSelect={() => selectOnly(it.id)}
              onHoverEnter={() => setHoverId(it.id)}
              onHoverLeave={() => setHoverId((cur) => (cur === it.id ? null : cur))}
              onBeginDrag={beginDrag}
              onContextMenu={(e) => openContextMenu(e, it.id)}
              onStartEdit={() => {
                setSelectedIds(new Set([it.id]));
                setEditingId(it.id);
              }}
              onCommitText={(text) => {
                if (text !== it.text) updateItem(it.id, { text });
                setEditingId((cur) => (cur === it.id ? null : cur));
              }}
              onOpenStyling={() => {
                setSelectedIds(new Set());
                setStylingId(it.id);
              }}
              hasHover={hasHover}
            />
          ))}
          {lasso && lasso.width > 0 && lasso.height > 0 && (
            <div
              className="board-view__lasso"
              style={{
                left: lasso.x,
                top: lasso.y,
                width: lasso.width,
                height: lasso.height,
              }}
            />
          )}
        </div>
      </div>

      {contextMenu && (
        <div
          className="board-view__context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            type="button"
            className="board-view__context-item"
            onClick={() => {
              handleCopyItem(contextMenu.itemId);
              setContextMenu(null);
            }}
          >
            Копировать
          </button>
          <button
            type="button"
            className="board-view__context-item board-view__context-item--danger"
            onClick={() => {
              const id = contextMenu.itemId;
              setContextMenu(null);
              setSelectedIds((prev) => {
                const next = new Set(prev);
                next.delete(id);
                return next;
              });
              deleteItem(id);
            }}
          >
            Удалить
          </button>
        </div>
      )}

      <div className="board-view__offline-bar">
        {hasPending && (
          <button
            type="button"
            className="board-view__sync-btn"
            onClick={handleSync}
            disabled={syncing}
          >
            <span>Синхронизировать</span>
            {syncing && <span className="board-view__sync-spinner" aria-hidden />}
          </button>
        )}
        <button
          type="button"
          className="board-view__offline-toggle"
          onClick={() => setOffline(!offline)}
          aria-label={offline ? 'Включить онлайн-режим' : 'Включить офлайн-режим'}
          title={offline ? 'Офлайн-режим' : 'Онлайн-режим'}
        >
          <img src={offline ? offlineIcon : globeIcon} alt="" />
        </button>
      </div>

      {stylingItem && (
        <StylingModal
          item={stylingItem}
          onClose={() => setStylingId(null)}
          onUpdate={(patch) => updateItem(stylingItem.id, patch)}
          onDelete={() => {
            const id = stylingItem.id;
            setStylingId(null);
            setSelectedIds((prev) => {
              const next = new Set(prev);
              next.delete(id);
              return next;
            });
            deleteItem(id);
          }}
          hasHover={hasHover}
        />
      )}
    </div>
  );
}

function BoardTextBlock({
  item,
  selected,
  editing,
  hovered,
  onSelect,
  onHoverEnter,
  onHoverLeave,
  onBeginDrag,
  onContextMenu,
  onStartEdit,
  onCommitText,
  onOpenStyling,
  hasHover,
}) {
  const [draft, setDraft] = useState(item.text);
  const [editHover, setEditHover] = useState(false);
  const textareaRef = useRef(null);

  useEffect(() => {
    if (!editing) setDraft(item.text);
  }, [item.text, editing]);

  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus();
      const len = textareaRef.current.value.length;
      try {
        textareaRef.current.setSelectionRange(len, len);
      } catch {
        /* some browsers may throw */
      }
    }
  }, [editing]);

  const commit = () => {
    onCommitText(draft);
  };

  const scale = Number.isFinite(Number(item.text_scale)) ? Number(item.text_scale) : 1;
  const customBorderColor = item.border_color || DEFAULT_BORDER_COLOR;
  const borderColor = selected ? '#5A86EE' : item.has_border ? customBorderColor : 'transparent';

  const style = {
    left: item.x,
    top: item.y,
    width: item.width,
    height: item.height,
    color: item.text_color,
    borderColor,
    padding: item.padding,
    fontSize: `${0.9375 * scale}rem`,
  };

  return (
    <div
      className={`board-view__block ${selected ? 'board-view__block--selected' : ''} ${
        editing ? 'board-view__block--editing' : ''
      }`}
      style={style}
      onMouseEnter={onHoverEnter}
      onMouseLeave={onHoverLeave}
      onPointerDown={(e) => {
        if (editing) return;
        if (e.target.closest('.board-view__block-resize')) return;
        if (e.target.closest('.board-view__block-edit-btn')) return;
        onBeginDrag(e, item, 'move');
      }}
      onContextMenu={(e) => {
        if (editing) return;
        onContextMenu?.(e);
      }}
      onDoubleClick={(e) => {
        if (e.target.closest('.board-view__block-resize')) return;
        if (e.target.closest('.board-view__block-edit-btn')) return;
        onStartEdit();
      }}
    >
      {editing ? (
        <textarea
          ref={textareaRef}
          className="board-view__block-editor"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              setDraft(item.text);
              onCommitText(item.text);
            } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              commit();
            }
          }}
          style={{ color: item.text_color }}
        />
      ) : (
        <div className="board-view__block-text">{item.text || <span className="board-view__block-placeholder">Текст</span>}</div>
      )}

      {!editing && (hovered || selected) && (
        <button
          type="button"
          className={`board-view__block-edit-btn ${hovered ? 'board-view__block-edit-btn--hovered' : ''} ${selected ? 'board-view__block-edit-btn--selected' : ''}`}
          onMouseEnter={() => hasHover && setEditHover(true)}
          onMouseLeave={() => hasHover && setEditHover(false)}
          onMouseDown={(e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            e.stopPropagation();
          }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onOpenStyling();
          }}
          aria-label="Настройки блока"
        >
          <img src={hasHover && editHover ? editNavIcon : editIcon} alt="" />
        </button>
      )}

      {!editing &&
        RESIZE_DIRECTIONS.map((dir) => (
          <div
            key={dir}
            className={`board-view__block-resize board-view__block-resize--${dir}`}
            onPointerDown={(e) => onBeginDrag(e, item, dir)}
          />
        ))}

      {!editing && selected && (
        <button
          type="button"
          className="board-view__block-mobile-resize"
          onPointerDown={(e) => onBeginDrag(e, item, 'se')}
          aria-label="Изменить размер блока"
        >
          <svg viewBox="0 0 14 14" aria-hidden>
            <path
              d="M13 5 L5 13 M13 9 L9 13"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      )}
    </div>
  );
}

function StylingModal({ item, onClose, onUpdate, onDelete, hasHover }) {
  const [deleteHover, setDeleteHover] = useState(false);
  const currentBorderColor = (item.border_color || DEFAULT_BORDER_COLOR).toLowerCase();
  const currentScale = Number.isFinite(Number(item.text_scale)) ? Number(item.text_scale) : 1;
  return (
    <div className="dashboard__settings-overlay" onClick={onClose}>
      <div
        className="dashboard__settings-popup board-view__styling-popup"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dashboard__settings-title">Настройки блока</div>

        <div className="board-view__styling-section-label">Цвет текста</div>
        <div className="board-view__styling-colors">
          {TASK_COLORS.map((c) => {
            const selected = (item.text_color || '').toLowerCase() === c.toLowerCase();
            return (
              <span
                key={c}
                className={`board-view__styling-swatch-wrap ${selected ? 'board-view__styling-swatch-wrap--selected' : ''}`}
                style={{ '--swatch-color': c }}
              >
                <button
                  type="button"
                  className="board-view__styling-swatch"
                  style={{ background: c }}
                  onClick={() => onUpdate({ text_color: c })}
                  aria-label={`Цвет ${c}`}
                />
              </span>
            );
          })}
        </div>

        <label className="board-view__styling-toggle">
          <input
            type="checkbox"
            checked={!!item.has_border}
            onChange={(e) => onUpdate({ has_border: e.target.checked })}
          />
          <span>Показать границу</span>
        </label>

        <div className="board-view__styling-section-label">Цвет границы</div>
        <div className="board-view__styling-colors">
          {BORDER_COLOR_OPTIONS.map((c) => {
            const selected = currentBorderColor === c.toLowerCase();
            return (
              <span
                key={c}
                className={`board-view__styling-swatch-wrap ${selected ? 'board-view__styling-swatch-wrap--selected' : ''}`}
                style={{ '--swatch-color': c }}
              >
                <button
                  type="button"
                  className="board-view__styling-swatch"
                  style={{ background: c }}
                  onClick={() => onUpdate({ border_color: c })}
                  aria-label={`Цвет границы ${c}`}
                />
              </span>
            );
          })}
        </div>

        <div className="board-view__styling-section-label">Внутренний отступ</div>
        <div className="board-view__styling-paddings">
          {PADDING_OPTIONS.map((p) => (
            <button
              key={p}
              type="button"
              className={`board-view__styling-pad ${item.padding === p ? 'board-view__styling-pad--active' : ''}`}
              onClick={() => onUpdate({ padding: p })}
            >
              {p}px
            </button>
          ))}
        </div>

        <div className="board-view__styling-section-label">Размер текста</div>
        <div className="board-view__styling-paddings">
          {TEXT_SCALE_OPTIONS.map((s) => (
            <button
              key={s}
              type="button"
              className={`board-view__styling-pad ${Math.abs(currentScale - s) < 0.001 ? 'board-view__styling-pad--active' : ''}`}
              onClick={() => onUpdate({ text_scale: s })}
            >
              {formatScaleLabel(s)}
            </button>
          ))}
        </div>

        <div className="board-view__styling-actions">
          <button
            type="button"
            className="board-view__styling-delete"
            onMouseEnter={() => hasHover && setDeleteHover(true)}
            onMouseLeave={() => hasHover && setDeleteHover(false)}
            onClick={onDelete}
            aria-label="Удалить блок"
          >
            <img src={hasHover && deleteHover ? deleteNavIcon : deleteIcon} alt="" />
            <span>Удалить</span>
          </button>
          <button type="button" className="dashboard__settings-submit" onClick={onClose}>
            Готово
          </button>
        </div>
      </div>
    </div>
  );
}
