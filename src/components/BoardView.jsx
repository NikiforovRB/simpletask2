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
const SNAP_SCREEN_PX = 6;

const RESIZE_DIRECTIONS = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function snapLines(activeLines, candidateLines, threshold) {
  let best = null;
  for (const a of activeLines) {
    for (const c of candidateLines) {
      const delta = c - a;
      const abs = Math.abs(delta);
      if (abs <= threshold && (!best || abs < Math.abs(best.delta))) {
        best = { delta };
      }
    }
  }
  return best;
}

function gatherAligned(activeLines, candidateLines, eps = 0.5) {
  const out = new Set();
  for (const a of activeLines) {
    for (const c of candidateLines) {
      if (Math.abs(a - c) <= eps) out.add(c);
    }
  }
  return Array.from(out);
}

function rectLinesV(r) {
  return [r.left, (r.left + r.right) / 2, r.right];
}

function rectLinesH(r) {
  return [r.top, (r.top + r.bottom) / 2, r.bottom];
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
  cloneItems,
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
  const [guides, setGuides] = useState({ v: [], h: [] });
  const [wideStyling, setWideStyling] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth > 1400 : false
  );

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onResize = () => setWideStyling(window.innerWidth > 1400);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // panelOpen recomputed below; we attach body class via separate effect

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

      if (mode === 'move' && e.shiftKey) {
        setSelectedIds((prev) => {
          const next = new Set(prev);
          if (next.has(item.id)) next.delete(item.id);
          else next.add(item.id);
          return next;
        });
        return;
      }

      if (e.pointerId != null && typeof e.currentTarget?.setPointerCapture === 'function') {
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {}
      }
      const isAlreadySelected = selectedIds.has(item.id);
      const groupIds = mode === 'move' && isAlreadySelected && selectedIds.size > 1
        ? Array.from(selectedIds)
        : [item.id];
      if (!isAlreadySelected && mode !== 'move') {
        setSelectedIds(new Set([item.id]));
      }

      let group;
      if (mode === 'move' && e.altKey && typeof cloneItems === 'function') {
        const mapping = cloneItems(groupIds, { dx: 0, dy: 0 });
        if (!mapping.length) return;
        group = mapping.map(({ newId, row }) => ({
          id: newId,
          startX: row.x,
          startY: row.y,
          startWidth: row.width,
          startHeight: row.height,
        }));
        setSelectedIds(new Set(group.map((g) => g.id)));
      } else {
        if (mode === 'move' && !isAlreadySelected) {
          setSelectedIds(new Set([item.id]));
        }
        group = groupIds
          .map((id) => items.find((it) => it.id === id))
          .filter(Boolean)
          .map((it) => ({ id: it.id, startX: it.x, startY: it.y, startWidth: it.width, startHeight: it.height }));
      }

      const groupSet = new Set(group.map((g) => g.id));
      const others = items
        .filter((it) => !groupSet.has(it.id))
        .map((it) => ({
          left: it.x,
          top: it.y,
          right: it.x + it.width,
          bottom: it.y + it.height,
        }));
      const groupBounds = group.reduce(
        (acc, g) => ({
          left: Math.min(acc.left, g.startX),
          top: Math.min(acc.top, g.startY),
          right: Math.max(acc.right, g.startX + g.startWidth),
          bottom: Math.max(acc.bottom, g.startY + g.startHeight),
        }),
        { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity }
      );

      dragRef.current = {
        primaryId: group[0]?.id ?? item.id,
        mode,
        startMouseX: e.clientX,
        startMouseY: e.clientY,
        group,
        moved: false,
        others,
        groupBounds,
      };
    },
    [editingId, selectedIds, items, cloneItems]
  );

  useEffect(() => {
    const onMove = (e) => {
      const d = dragRef.current;
      if (!d) return;
      const dx = (e.clientX - d.startMouseX) / zoomScale;
      const dy = (e.clientY - d.startMouseY) / zoomScale;
      if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) d.moved = true;

      const threshold = SNAP_SCREEN_PX / zoomScale;
      const otherV = [];
      const otherH = [];
      (d.others || []).forEach((o) => {
        otherV.push(...rectLinesV(o));
        otherH.push(...rectLinesH(o));
      });
      // Hold Ctrl/Cmd to temporarily disable snapping for fine positioning.
      const snapDisabled = e.ctrlKey || e.metaKey;

      if (d.mode === 'move') {
        const minDx = -Math.min(...d.group.map((g) => g.startX));
        const maxDx = Math.min(...d.group.map((g) => WORLD_WIDTH - g.startX - g.startWidth));
        const minDy = -Math.min(...d.group.map((g) => g.startY));
        const maxDy = Math.min(...d.group.map((g) => WORLD_HEIGHT - g.startY - g.startHeight));
        let cdx = clamp(dx, minDx, maxDx);
        let cdy = clamp(dy, minDy, maxDy);

        if (!snapDisabled && d.groupBounds && otherV.length) {
          const proposedV = [
            d.groupBounds.left + cdx,
            (d.groupBounds.left + d.groupBounds.right) / 2 + cdx,
            d.groupBounds.right + cdx,
          ];
          const sx = snapLines(proposedV, otherV, threshold);
          if (sx) cdx = clamp(cdx + sx.delta, minDx, maxDx);
        }
        if (!snapDisabled && d.groupBounds && otherH.length) {
          const proposedH = [
            d.groupBounds.top + cdy,
            (d.groupBounds.top + d.groupBounds.bottom) / 2 + cdy,
            d.groupBounds.bottom + cdy,
          ];
          const sy = snapLines(proposedH, otherH, threshold);
          if (sy) cdy = clamp(cdy + sy.delta, minDy, maxDy);
        }

        d.group.forEach((g) => {
          updateItemLocal(g.id, { x: Math.round(g.startX + cdx), y: Math.round(g.startY + cdy) });
        });

        if (!snapDisabled && d.groupBounds) {
          const finalV = [
            d.groupBounds.left + cdx,
            (d.groupBounds.left + d.groupBounds.right) / 2 + cdx,
            d.groupBounds.right + cdx,
          ];
          const finalH = [
            d.groupBounds.top + cdy,
            (d.groupBounds.top + d.groupBounds.bottom) / 2 + cdy,
            d.groupBounds.bottom + cdy,
          ];
          const vGuides = gatherAligned(finalV, otherV, 0.5);
          const hGuides = gatherAligned(finalH, otherH, 0.5);
          setGuides({ v: vGuides, h: hGuides });
        } else {
          setGuides({ v: [], h: [] });
        }
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

        if (!snapDisabled && otherV.length) {
          const movingV = [];
          if (d.mode.includes('e')) movingV.push(x + w);
          if (d.mode.includes('w')) movingV.push(x);
          if (movingV.length) {
            const s = snapLines(movingV, otherV, threshold);
            if (s) {
              if (d.mode.includes('e')) {
                const newW = clamp(w + s.delta, minW, WORLD_WIDTH - x);
                w = newW;
              } else {
                const newX = x + s.delta;
                const newW = w - s.delta;
                if (newW >= minW && newX >= 0) {
                  x = newX;
                  w = newW;
                }
              }
            }
          }
        }
        if (!snapDisabled && otherH.length) {
          const movingH = [];
          if (d.mode.includes('s')) movingH.push(y + h);
          if (d.mode.includes('n')) movingH.push(y);
          if (movingH.length) {
            const s = snapLines(movingH, otherH, threshold);
            if (s) {
              if (d.mode.includes('s')) {
                const newH = clamp(h + s.delta, minH, WORLD_HEIGHT - y);
                h = newH;
              } else {
                const newY = y + s.delta;
                const newH = h - s.delta;
                if (newH >= minH && newY >= 0) {
                  y = newY;
                  h = newH;
                }
              }
            }
          }
        }

        updateItemLocal(g.id, {
          x: Math.round(x),
          y: Math.round(y),
          width: Math.round(w),
          height: Math.round(h),
        });

        if (!snapDisabled) {
          const movingV = [];
          if (d.mode.includes('e')) movingV.push(x + w);
          if (d.mode.includes('w')) movingV.push(x);
          const movingH = [];
          if (d.mode.includes('s')) movingH.push(y + h);
          if (d.mode.includes('n')) movingH.push(y);
          const vGuides = movingV.length ? gatherAligned(movingV, otherV, 0.5) : [];
          const hGuides = movingH.length ? gatherAligned(movingH, otherH, 0.5) : [];
          setGuides({ v: vGuides, h: hGuides });
        } else {
          setGuides({ v: [], h: [] });
        }
      }
    };
    const onUp = () => {
      const d = dragRef.current;
      if (!d) return;
      dragRef.current = null;
      setGuides({ v: [], h: [] });
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

  const panelItems = useMemo(() => {
    if (wideStyling) {
      return items.filter((it) => selectedIds.has(it.id));
    }
    return stylingItem ? [stylingItem] : [];
  }, [wideStyling, items, selectedIds, stylingItem]);
  const panelOpen = panelItems.length > 0;
  const multiPanel = panelItems.length >= 2;

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    if (wideStyling && panelOpen) {
      document.body.classList.add('board-styling-side-open');
      return () => document.body.classList.remove('board-styling-side-open');
    }
    return undefined;
  }, [wideStyling, panelOpen]);

  // If wide mode turns on while a centered modal is open, translate it into a selection
  useEffect(() => {
    if (wideStyling && stylingId) {
      setSelectedIds(new Set([stylingId]));
      setStylingId(null);
    }
  }, [wideStyling, stylingId]);

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
        {multiSelected && !wideStyling && (
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
                if (wideStyling) {
                  setSelectedIds(new Set([it.id]));
                  setStylingId(null);
                } else {
                  setSelectedIds(new Set());
                  setStylingId(it.id);
                }
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
          {guides.v.map((x, i) => {
            const w = 1 / zoomScale;
            return (
              <div
                key={`vg-${i}-${x}`}
                className="board-view__guide board-view__guide--v"
                style={{ left: x - w / 2, width: w, top: 0, height: WORLD_HEIGHT }}
              />
            );
          })}
          {guides.h.map((y, i) => {
            const h = 1 / zoomScale;
            return (
              <div
                key={`hg-${i}-${y}`}
                className="board-view__guide board-view__guide--h"
                style={{ top: y - h / 2, height: h, left: 0, width: WORLD_WIDTH }}
              />
            );
          })}
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
            <svg
              className="board-view__context-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <rect x="9" y="9" width="12" height="12" rx="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
            <span>Копировать</span>
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
            <svg
              className="board-view__context-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M9 3H15M3 6H21M19 6L18.3 16.52C18.19 18.1 18.14 18.89 17.8 19.49C17.5 20.01 17.05 20.44 16.5 20.7C15.88 21 15.09 21 13.51 21H10.49C8.91 21 8.12 21 7.5 20.7C6.95 20.44 6.5 20.01 6.2 19.49C5.86 18.89 5.81 18.1 5.7 16.52L5 6M10 10.5V15.5M14 10.5V15.5" />
            </svg>
            <span>Удалить</span>
          </button>
        </div>
      )}

      <div className="board-view__offline-bar">
        <button
          type="button"
          className="board-view__offline-toggle"
          onClick={() => setOffline(!offline)}
          aria-label={offline ? 'Включить онлайн-режим' : 'Включить офлайн-режим'}
          title={offline ? 'Офлайн-режим' : 'Онлайн-режим'}
        >
          <img src={offline ? offlineIcon : globeIcon} alt="" />
        </button>
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
      </div>

      {panelOpen && (
        <StylingModal
          items={panelItems}
          layout={wideStyling ? 'side' : 'centered'}
          onClose={() => {
            if (wideStyling) {
              setSelectedIds(new Set());
            } else {
              setStylingId(null);
            }
          }}
          updateItem={updateItem}
          onDelete={() => {
            const ids = panelItems.map((it) => it.id);
            if (wideStyling) {
              setSelectedIds(new Set());
            } else {
              setStylingId(null);
              setSelectedIds((prev) => {
                const next = new Set(prev);
                ids.forEach((id) => next.delete(id));
                return next;
              });
            }
            ids.forEach((id) => deleteItem(id));
          }}
          showAlign={wideStyling && multiPanel}
          onAlign={alignSelected}
          alignHover={alignHover}
          setAlignHover={setAlignHover}
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

  const radius = Math.max(0, Number(item.border_radius) || 0);

  const style = {
    left: item.x,
    top: item.y,
    width: item.width,
    height: item.height,
    color: item.text_color,
    borderColor,
    borderRadius: radius,
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

function allSame(items, key) {
  if (!items.length) return true;
  const first = items[0][key];
  return items.every((it) => it[key] === first);
}

function StylingModal({
  items,
  layout,
  onClose,
  updateItem,
  onDelete,
  showAlign,
  onAlign,
  alignHover,
  setAlignHover,
  hasHover,
}) {
  const [deleteHover, setDeleteHover] = useState(false);
  const isMulti = items.length > 1;

  const xMixed = !allSame(items, 'x');
  const yMixed = !allSame(items, 'y');
  const widthMixed = !allSame(items, 'width');
  const heightMixed = !allSame(items, 'height');
  const radiusMixed = !allSame(
    items.map((it) => ({ v: Math.max(0, Math.round(Number(it.border_radius) || 0)) })),
    'v'
  );
  const paddingMixed = !allSame(items, 'padding');
  const textColorMixed = !allSame(
    items.map((it) => ({ v: (it.text_color || '').toLowerCase() })),
    'v'
  );
  const borderColorMixed = !allSame(
    items.map((it) => ({ v: (it.border_color || DEFAULT_BORDER_COLOR).toLowerCase() })),
    'v'
  );
  const hasBorderMixed = !allSame(items, 'has_border');
  const textScaleMixed = !allSame(
    items.map((it) => ({ v: Number.isFinite(Number(it.text_scale)) ? Number(it.text_scale) : 1 })),
    'v'
  );

  const first = items[0];
  const currentRadius = Math.max(0, Math.round(Number(first.border_radius) || 0));
  const currentBorderColor = (first.border_color || DEFAULT_BORDER_COLOR).toLowerCase();
  const currentScale = Number.isFinite(Number(first.text_scale)) ? Number(first.text_scale) : 1;

  const [xDraft, setXDraft] = useState(xMixed ? '' : String(first.x));
  const [yDraft, setYDraft] = useState(yMixed ? '' : String(first.y));
  const [widthDraft, setWidthDraft] = useState(widthMixed ? '' : String(first.width));
  const [heightDraft, setHeightDraft] = useState(heightMixed ? '' : String(first.height));
  const [radiusDraft, setRadiusDraft] = useState(radiusMixed ? '' : String(currentRadius));

  useEffect(() => {
    setXDraft(xMixed ? '' : String(first.x));
  }, [xMixed, first.x]);
  useEffect(() => {
    setYDraft(yMixed ? '' : String(first.y));
  }, [yMixed, first.y]);
  useEffect(() => {
    setWidthDraft(widthMixed ? '' : String(first.width));
  }, [widthMixed, first.width]);
  useEffect(() => {
    setHeightDraft(heightMixed ? '' : String(first.height));
  }, [heightMixed, first.height]);
  useEffect(() => {
    setRadiusDraft(radiusMixed ? '' : String(currentRadius));
  }, [radiusMixed, currentRadius]);

  const borderCheckboxRef = useRef(null);
  useEffect(() => {
    if (borderCheckboxRef.current) {
      borderCheckboxRef.current.indeterminate = hasBorderMixed;
    }
  }, [hasBorderMixed]);

  const radiusMax = 100;

  const setAll = (patcher) => {
    items.forEach((it) => {
      const patch = typeof patcher === 'function' ? patcher(it) : patcher;
      if (!patch) return;
      const keys = Object.keys(patch);
      const changed = keys.some((k) => it[k] !== patch[k]);
      if (changed) updateItem(it.id, patch);
    });
  };

  const stepAll = (key, delta, opts = {}) => {
    items.forEach((it) => {
      const cur = Number(it[key]) || 0;
      let next = cur + delta;
      if (opts.clampPerItem) next = opts.clampPerItem(next, it);
      if (Math.round(next) !== cur) updateItem(it.id, { [key]: Math.round(next) });
    });
  };

  const setAllValue = (key, value, opts = {}) => {
    items.forEach((it) => {
      let v = value;
      if (opts.clampPerItem) v = opts.clampPerItem(v, it);
      const rounded = Math.round(v);
      if (it[key] !== rounded) updateItem(it.id, { [key]: rounded });
    });
  };

  const clampX = (n, it) => clamp(n, 0, WORLD_WIDTH - it.width);
  const clampY = (n, it) => clamp(n, 0, WORLD_HEIGHT - it.height);
  const clampW = (n, it) => clamp(n, 60, WORLD_WIDTH - it.x);
  const clampH = (n, it) => clamp(n, 30, WORLD_HEIGHT - it.y);
  const clampR = (n) => clamp(n, 0, radiusMax);

  const applyXStep = (delta) => stepAll('x', delta, { clampPerItem: clampX });
  const applyYStep = (delta) => stepAll('y', delta, { clampPerItem: clampY });
  const applyWStep = (delta) => stepAll('width', delta, { clampPerItem: clampW });
  const applyHStep = (delta) => stepAll('height', delta, { clampPerItem: clampH });
  const applyRStep = (delta) => {
    items.forEach((it) => {
      const cur = Math.max(0, Math.round(Number(it.border_radius) || 0));
      const next = clampR(cur + delta);
      if (next !== cur) updateItem(it.id, { border_radius: next });
    });
  };

  const commitDraft = (draft, mixed, fallback, key, clampFn) => {
    const trimmed = String(draft).trim();
    if (trimmed === '') {
      // empty + mixed → keep as-is; empty + non-mixed → revert
      if (!mixed) return { revert: true };
      return null;
    }
    const n = parseInt(trimmed, 10);
    if (!Number.isFinite(n)) return { revert: true };
    setAllValue(key, n, { clampPerItem: clampFn });
    return null;
  };

  const commitX = () => {
    const r = commitDraft(xDraft, xMixed, first.x, 'x', clampX);
    if (r?.revert) setXDraft(xMixed ? '' : String(first.x));
  };
  const commitY = () => {
    const r = commitDraft(yDraft, yMixed, first.y, 'y', clampY);
    if (r?.revert) setYDraft(yMixed ? '' : String(first.y));
  };
  const commitWidth = () => {
    const r = commitDraft(widthDraft, widthMixed, first.width, 'width', clampW);
    if (r?.revert) setWidthDraft(widthMixed ? '' : String(first.width));
  };
  const commitHeight = () => {
    const r = commitDraft(heightDraft, heightMixed, first.height, 'height', clampH);
    if (r?.revert) setHeightDraft(heightMixed ? '' : String(first.height));
  };
  const commitRadius = () => {
    const trimmed = String(radiusDraft).trim();
    if (trimmed === '') {
      if (!radiusMixed) setRadiusDraft(String(currentRadius));
      return;
    }
    const n = parseInt(trimmed, 10);
    if (!Number.isFinite(n)) {
      setRadiusDraft(radiusMixed ? '' : String(currentRadius));
      return;
    }
    const v = clampR(n);
    items.forEach((it) => {
      const cur = Math.max(0, Math.round(Number(it.border_radius) || 0));
      if (cur !== v) updateItem(it.id, { border_radius: v });
    });
  };

  const renderSizeField = ({ label, value, mixed, onMinus, onPlus, onChange, onCommit, min, max }) => (
    <div className="board-view__styling-size-field">
      <span className="board-view__styling-size-label">{label}</span>
      <button
        type="button"
        className="board-view__styling-size-btn"
        onClick={onMinus}
        aria-label={`Уменьшить ${label}`}
      >
        −
      </button>
      <input
        type="number"
        className="board-view__styling-size-input"
        value={value}
        placeholder={mixed ? 'Mixed' : ''}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onCommit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onCommit();
            e.currentTarget.blur();
          }
        }}
        min={min}
        max={max}
        step={1}
      />
      <button
        type="button"
        className="board-view__styling-size-btn"
        onClick={onPlus}
        aria-label={`Увеличить ${label}`}
      >
        +
      </button>
    </div>
  );

  const wrapperClass = layout === 'side' ? 'board-view__styling-side' : 'dashboard__settings-overlay';
  const popupClass =
    layout === 'side'
      ? 'board-view__styling-popup board-view__styling-popup--side'
      : 'dashboard__settings-popup board-view__styling-popup';
  const onWrapperClick = layout === 'side' ? undefined : onClose;

  const content = (
    <div className={popupClass} onClick={(e) => e.stopPropagation()}>
        <div className="dashboard__settings-title">
          {isMulti ? `Настройки блоков (${items.length})` : 'Настройки блока'}
        </div>

        {showAlign && onAlign && (
          <>
            <div className="board-view__styling-section-label">Выравнивание</div>
            <div className="board-view__styling-align-row">
              <button
                type="button"
                className="board-view__icon-btn"
                onMouseEnter={() => hasHover && setAlignHover((h) => ({ ...h, left: true }))}
                onMouseLeave={() => hasHover && setAlignHover((h) => ({ ...h, left: false }))}
                onClick={() => onAlign('left')}
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
                onClick={() => onAlign('top')}
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
                onClick={() => onAlign('hcenter')}
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
                onClick={() => onAlign('vcenter')}
                aria-label="Выровнять по центру по вертикали"
                title="Выровнять по центру по вертикали"
              >
                <img src={hasHover && alignHover.vcenter ? vCenterNavIcon : vCenterIcon} alt="" />
              </button>
            </div>
          </>
        )}

        <div className="board-view__styling-section-label">Цвет текста</div>
        <div className="board-view__styling-colors">
          {TASK_COLORS.map((c) => {
            const selected = !textColorMixed && (first.text_color || '').toLowerCase() === c.toLowerCase();
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
                  onClick={() => setAll({ text_color: c })}
                  aria-label={`Цвет ${c}`}
                />
              </span>
            );
          })}
        </div>

        <label className="board-view__styling-toggle">
          <input
            ref={borderCheckboxRef}
            type="checkbox"
            checked={!hasBorderMixed && !!first.has_border}
            onChange={() => {
              const next = hasBorderMixed ? true : !first.has_border;
              setAll({ has_border: next });
            }}
          />
          <span>Показать границу{hasBorderMixed ? ' (Mixed)' : ''}</span>
        </label>

        <div className="board-view__styling-section-label">Цвет границы</div>
        <div className="board-view__styling-colors">
          {BORDER_COLOR_OPTIONS.map((c) => {
            const selected = !borderColorMixed && currentBorderColor === c.toLowerCase();
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
                  onClick={() => setAll({ border_color: c })}
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
              className={`board-view__styling-pad ${
                !paddingMixed && first.padding === p ? 'board-view__styling-pad--active' : ''
              }`}
              onClick={() => setAll({ padding: p })}
            >
              {p}px
            </button>
          ))}
        </div>

        <div className="board-view__styling-section-label">Скругление углов</div>
        <div className="board-view__styling-size-row">
          {renderSizeField({
            label: 'Радиус',
            value: radiusDraft,
            mixed: radiusMixed,
            onMinus: () => applyRStep(-1),
            onPlus: () => applyRStep(1),
            onChange: setRadiusDraft,
            onCommit: commitRadius,
            min: 0,
            max: radiusMax,
          })}
        </div>

        <div className="board-view__styling-section-label">Размер текста</div>
        <div className="board-view__styling-paddings">
          {TEXT_SCALE_OPTIONS.map((s) => (
            <button
              key={s}
              type="button"
              className={`board-view__styling-pad ${
                !textScaleMixed && Math.abs(currentScale - s) < 0.001 ? 'board-view__styling-pad--active' : ''
              }`}
              onClick={() => setAll({ text_scale: s })}
            >
              {formatScaleLabel(s)}
            </button>
          ))}
        </div>

        <div className="board-view__styling-section-label">Координаты</div>
        <div className="board-view__styling-size-row">
          {renderSizeField({
            label: 'X',
            value: xDraft,
            mixed: xMixed,
            onMinus: () => applyXStep(-1),
            onPlus: () => applyXStep(1),
            onChange: setXDraft,
            onCommit: commitX,
            min: 0,
            max: WORLD_WIDTH,
          })}
          {renderSizeField({
            label: 'Y',
            value: yDraft,
            mixed: yMixed,
            onMinus: () => applyYStep(-1),
            onPlus: () => applyYStep(1),
            onChange: setYDraft,
            onCommit: commitY,
            min: 0,
            max: WORLD_HEIGHT,
          })}
        </div>

        <div className="board-view__styling-section-label">Размер блока</div>
        <div className="board-view__styling-size-row">
          {renderSizeField({
            label: 'Ширина',
            value: widthDraft,
            mixed: widthMixed,
            onMinus: () => applyWStep(-1),
            onPlus: () => applyWStep(1),
            onChange: setWidthDraft,
            onCommit: commitWidth,
            min: 60,
            max: WORLD_WIDTH,
          })}
          {renderSizeField({
            label: 'Высота',
            value: heightDraft,
            mixed: heightMixed,
            onMinus: () => applyHStep(-1),
            onPlus: () => applyHStep(1),
            onChange: setHeightDraft,
            onCommit: commitHeight,
            min: 30,
            max: WORLD_HEIGHT,
          })}
        </div>

        <div className="board-view__styling-actions">
          <button
            type="button"
            className="board-view__styling-delete"
            onMouseEnter={() => hasHover && setDeleteHover(true)}
            onMouseLeave={() => hasHover && setDeleteHover(false)}
            onClick={onDelete}
            aria-label={isMulti ? 'Удалить блоки' : 'Удалить блок'}
          >
            <img src={hasHover && deleteHover ? deleteNavIcon : deleteIcon} alt="" />
            <span>Удалить</span>
          </button>
          <button type="button" className="dashboard__settings-submit" onClick={onClose}>
            {layout === 'side' ? 'Скрыть' : 'Готово'}
          </button>
        </div>
      </div>
  );

  if (layout === 'side') {
    return <div className={wrapperClass}>{content}</div>;
  }
  return (
    <div className={wrapperClass} onClick={onWrapperClick}>
      {content}
    </div>
  );
}
