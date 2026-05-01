import { useEffect, useRef, useState } from 'react';
import {
  BOARD_EXPORT_HEIGHT,
  BOARD_EXPORT_WIDTH,
  exportBoardItemsToPdf,
  renderBoardWorldToCanvas,
} from '../utils/boardPdfExport';
import './BoardPdfExportModal.css';

const PREVIEW_SCALE = 0.2;
const MIN_EXPORT_DIMENSION = 200;
const A4_PORTRAIT_ASPECT = 210 / 297;
const A4_LANDSCAPE_ASPECT = 297 / 210;

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function getAspect(orientation) {
  return orientation === 'portrait' ? A4_PORTRAIT_ASPECT : A4_LANDSCAPE_ASPECT;
}

function getMaxFitWidth(worldW, worldH, aspect) {
  return Math.min(worldW, worldH * aspect);
}

export function BoardPdfExportModal({
  open,
  onClose,
  worldRef,
  items,
  worldWidth = BOARD_EXPORT_WIDTH,
  worldHeight = BOARD_EXPORT_HEIGHT,
  fileBaseName,
  variant,
  onVariantChange,
  exporting,
  setExporting,
  onSuccess,
}) {
  const [orientation, setOrientation] = useState('landscape');
  const [cropX, setCropX] = useState(0);
  const [cropY, setCropY] = useState(0);
  const [cropW, setCropW] = useState(0);
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewBusy, setPreviewBusy] = useState(false);

  const cropFrameRef = useRef(null);
  const dragRef = useRef(null);
  const cropLiveRef = useRef({ x: 0, y: 0, w: 0 });

  const aspect = getAspect(orientation);
  const cropH = cropW > 0 ? cropW / aspect : 0;

  const minW = Math.max(MIN_EXPORT_DIMENSION, MIN_EXPORT_DIMENSION * aspect);

  useEffect(() => {
    if (!open) return;
    const targetAspect = getAspect(orientation);
    const w = getMaxFitWidth(worldWidth, worldHeight, targetAspect);
    const h = w / targetAspect;
    setCropW(Math.round(w));
    setCropX(Math.round((worldWidth - w) / 2));
    setCropY(Math.round((worldHeight - h) / 2));
  }, [open, orientation, worldWidth, worldHeight]);

  useEffect(() => {
    cropLiveRef.current = { x: cropX, y: cropY, w: cropW };
  }, [cropX, cropY, cropW]);

  useEffect(() => {
    if (!open) {
      setPreviewUrl('');
      return;
    }
    const el = worldRef?.current;
    if (!el) {
      setPreviewUrl('');
      return;
    }
    let cancelled = false;
    setPreviewBusy(true);
    (async () => {
      try {
        const canvas = await renderBoardWorldToCanvas(el, variant, {
          scale: PREVIEW_SCALE,
          crop: { left: 0, right: 0, top: 0, bottom: 0 },
        });
        if (cancelled) return;
        setPreviewUrl(canvas.toDataURL('image/png'));
      } catch (e) {
        console.error(e);
        if (!cancelled) setPreviewUrl('');
      } finally {
        if (!cancelled) setPreviewBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, worldRef, variant]);

  useEffect(() => {
    if (!open) return undefined;
    const onMove = (e) => {
      const d = dragRef.current;
      if (!d) return;
      const frame = cropFrameRef.current;
      if (!frame) return;
      const rect = frame.getBoundingClientRect();
      if (rect.width < 8 || rect.height < 8) return;
      const sx = worldWidth / rect.width;
      const sy = worldHeight / rect.height;
      const live = cropLiveRef.current;

      if (d.type === 'translate') {
        const dx = (e.clientX - d.startX) * sx;
        const dy = (e.clientY - d.startY) * sy;
        const liveH = live.w / aspect;
        const nx = clamp(d.startCropX + dx, 0, Math.max(0, worldWidth - live.w));
        const ny = clamp(d.startCropY + dy, 0, Math.max(0, worldHeight - liveH));
        setCropX(Math.round(nx));
        setCropY(Math.round(ny));
      } else if (d.type === 'corner') {
        const dx = (e.clientX - d.startX) * sx;
        const dy = (e.clientY - d.startY) * sy;
        const cand = d.startCropW + Math.max(dx, dy * aspect);
        const maxW = Math.min(worldWidth - live.x, (worldHeight - live.y) * aspect);
        const nextW = clamp(cand, minW, maxW);
        setCropW(Math.round(nextW));
      }
    };
    const onUp = () => {
      dragRef.current = null;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [open, worldWidth, worldHeight, aspect, minW]);

  const startWindowDrag = (e) => {
    if (e.target.closest('.board-pdf-modal__corner-handle')) return;
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = {
      type: 'translate',
      startX: e.clientX,
      startY: e.clientY,
      startCropX: cropX,
      startCropY: cropY,
    };
  };

  const startCornerDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = {
      type: 'corner',
      startX: e.clientX,
      startY: e.clientY,
      startCropW: cropW,
    };
  };

  const handleDownload = async () => {
    setExporting(true);
    try {
      const right = Math.max(0, worldWidth - (cropX + cropW));
      const bottom = Math.max(0, worldHeight - (cropY + cropH));
      await exportBoardItemsToPdf(items || [], variant, fileBaseName, {
        crop: { left: cropX, top: cropY, right, bottom },
        worldWidth,
        worldHeight,
      });
      onSuccess?.();
    } catch (err) {
      console.error(err);
    } finally {
      setExporting(false);
    }
  };

  if (!open) return null;

  const xPct = (cropX / worldWidth) * 100;
  const yPct = (cropY / worldHeight) * 100;
  const wPct = (cropW / worldWidth) * 100;
  const hPct = (cropH / worldHeight) * 100;
  const rPct = 100 - xPct - wPct;
  const bPct = 100 - yPct - hPct;

  const sheetAspect = orientation === 'portrait' ? '210 / 297' : '297 / 210';

  return (
    <div
      className="dashboard__settings-overlay board-pdf-modal-overlay"
      onClick={() => {
        if (!exporting) onClose();
      }}
    >
      <div
        className="dashboard__settings-popup board-pdf-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="board-pdf-modal-title"
      >
        <div className="dashboard__settings-title" id="board-pdf-modal-title">
          Экспорт в PDF
        </div>

        <div className="board-pdf-modal__toolbar">
          <div className="board-pdf-modal__field">
            <span className="board-pdf-modal__field-label">Фон</span>
            <div className="board-pdf-modal__segmented" role="group" aria-label="Фон PDF">
              <button
                type="button"
                className={`board-pdf-modal__segmented-btn ${variant === 'dark' ? 'board-pdf-modal__segmented-btn--active' : ''}`}
                onClick={() => onVariantChange('dark')}
                disabled={exporting || previewBusy}
              >
                На тёмном
              </button>
              <button
                type="button"
                className={`board-pdf-modal__segmented-btn ${variant === 'light' ? 'board-pdf-modal__segmented-btn--active' : ''}`}
                onClick={() => onVariantChange('light')}
                disabled={exporting || previewBusy}
              >
                На светлом
              </button>
            </div>
          </div>

          <div className="board-pdf-modal__field">
            <span className="board-pdf-modal__field-label">Ориентация</span>
            <div className="board-pdf-modal__segmented" role="group" aria-label="Ориентация листа">
              <button
                type="button"
                className={`board-pdf-modal__segmented-btn ${orientation === 'portrait' ? 'board-pdf-modal__segmented-btn--active' : ''}`}
                onClick={() => setOrientation('portrait')}
                disabled={exporting || previewBusy}
              >
                Вертикальный
              </button>
              <button
                type="button"
                className={`board-pdf-modal__segmented-btn ${orientation === 'landscape' ? 'board-pdf-modal__segmented-btn--active' : ''}`}
                onClick={() => setOrientation('landscape')}
                disabled={exporting || previewBusy}
              >
                Горизонтальный
              </button>
            </div>
          </div>
        </div>

        <div className="board-pdf-modal__layout">
          <div className="board-pdf-modal__col board-pdf-modal__col--crop">
            <div className="board-pdf-modal__section-label">Обрезка области (A4)</div>
            <div
              ref={cropFrameRef}
              className="board-pdf-modal__crop-frame"
              style={{ aspectRatio: `${worldWidth} / ${worldHeight}` }}
            >
              {previewBusy && <div className="board-pdf-modal__strip-loading">Загрузка превью…</div>}
              {!previewBusy && previewUrl && (
                <>
                  <img className="board-pdf-modal__crop-img" src={previewUrl} alt="" />
                  <div className="board-pdf-modal__crop-dim board-pdf-modal__crop-dim--top" style={{ height: `${yPct}%` }} />
                  <div className="board-pdf-modal__crop-dim board-pdf-modal__crop-dim--bottom" style={{ height: `${bPct}%` }} />
                  <div
                    className="board-pdf-modal__crop-dim board-pdf-modal__crop-dim--left"
                    style={{ top: `${yPct}%`, bottom: `${bPct}%`, width: `${xPct}%` }}
                  />
                  <div
                    className="board-pdf-modal__crop-dim board-pdf-modal__crop-dim--right"
                    style={{ top: `${yPct}%`, bottom: `${bPct}%`, width: `${rPct}%` }}
                  />
                  <div
                    className="board-pdf-modal__crop-window"
                    style={{ left: `${xPct}%`, top: `${yPct}%`, width: `${wPct}%`, height: `${hPct}%` }}
                    onPointerDown={startWindowDrag}
                    role="presentation"
                  >
                    <button
                      type="button"
                      className="board-pdf-modal__corner-handle"
                      aria-label="Изменить размер кадра"
                      onPointerDown={startCornerDrag}
                    />
                  </div>
                </>
              )}
            </div>
            <p className="board-pdf-modal__hint">
              Перетаскивайте кадр мышью, чтобы выбрать область. Тяните за правый‑нижний угол — пропорции A4 сохраняются автоматически.
            </p>
          </div>

          <div className="board-pdf-modal__col board-pdf-modal__col--preview">
            <div className="board-pdf-modal__section-label">Предпросмотр листа</div>
            <div className="board-pdf-modal__sheet" style={{ aspectRatio: sheetAspect }}>
              <div className="board-pdf-modal__sheet-bleed">
                {previewUrl && !previewBusy && cropW > 0 && cropH > 0 && (
                  <img
                    className="board-pdf-modal__sheet-img"
                    src={previewUrl}
                    alt=""
                    style={{
                      left: `${-(cropX / cropW) * 100}%`,
                      top: `${-(cropY / cropH) * 100}%`,
                      width: `${(worldWidth / cropW) * 100}%`,
                      height: `${(worldHeight / cropH) * 100}%`,
                    }}
                  />
                )}
              </div>
            </div>
          </div>
        </div>

        <button
          type="button"
          className="dashboard__settings-submit dashboard__board-pdf-download"
          disabled={exporting || previewBusy || !previewUrl || cropW < minW}
          onClick={handleDownload}
        >
          {exporting ? 'Формирование…' : 'Экспорт в PDF'}
        </button>
      </div>
    </div>
  );
}
