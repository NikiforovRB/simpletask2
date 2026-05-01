import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import gilroyLightUrl from '../fonts/Gilroy-Light.ttf?url';
import gilroyRegularUrl from '../fonts/Gilroy-Regular.ttf?url';
import gilroyMediumUrl from '../fonts/Gilroy-Medium.ttf?url';
import gilroySemiboldUrl from '../fonts/Gilroy-Semibold.ttf?url';
import gilroyBoldUrl from '../fonts/Gilroy-Bold.ttf?url';

export const BOARD_EXPORT_WIDTH = 4000;
export const BOARD_EXPORT_HEIGHT = 3000;

const PT_PER_MM = 1 / 0.352778;
const BOARD_BASE_FONT_PX = 15;
const BOARD_LINE_HEIGHT = 1.4;
const DEFAULT_BORDER_HEX = '#2f2f2f';

const FONT_VARIANTS = [
  { weight: 'light', url: gilroyLightUrl, postScript: 'Gilroy-Light' },
  { weight: 'regular', url: gilroyRegularUrl, postScript: 'Gilroy-Regular' },
  { weight: 'medium', url: gilroyMediumUrl, postScript: 'Gilroy-Medium' },
  { weight: 'semibold', url: gilroySemiboldUrl, postScript: 'Gilroy-Semibold' },
  { weight: 'bold', url: gilroyBoldUrl, postScript: 'Gilroy-Bold' },
];

let fontPayloadsPromise = null;

function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return typeof btoa === 'function' ? btoa(binary) : Buffer.from(binary, 'binary').toString('base64');
}

async function ensureFontPayloads() {
  if (!fontPayloadsPromise) {
    fontPayloadsPromise = Promise.all(
      FONT_VARIANTS.map(async (v) => {
        const res = await fetch(v.url);
        const buf = await res.arrayBuffer();
        return { ...v, base64: arrayBufferToBase64(buf) };
      })
    );
  }
  return fontPayloadsPromise;
}

async function registerGilroyFonts(pdf) {
  const payloads = await ensureFontPayloads();
  for (const f of payloads) {
    const fileName = `${f.postScript}.ttf`;
    pdf.addFileToVFS(fileName, f.base64);
    pdf.addFont(fileName, 'Gilroy', f.weight);
  }
}

const EXPORT_REMOVE_SELECTORS = [
  '.board-view__block-edit-btn',
  '.board-view__block-resize',
  '.board-view__block-mobile-resize',
  '.board-view__lasso',
  '.board-view__guide',
];

function stripExportChrome(clonedWorld) {
  EXPORT_REMOVE_SELECTORS.forEach((sel) => {
    clonedWorld.querySelectorAll(sel).forEach((n) => n.remove());
  });
  clonedWorld.querySelectorAll('.board-view__block--selected').forEach((el) => {
    el.classList.remove('board-view__block--selected');
  });
  clonedWorld.querySelectorAll('.board-view__block--editing').forEach((el) => {
    el.classList.remove('board-view__block--editing');
  });
}

function parseRgb(rgb) {
  const m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(rgb || '');
  if (!m) return null;
  return { r: +m[1], g: +m[2], b: +m[3] };
}

function rgbToHex(rgb) {
  const p = parseRgb(rgb);
  if (!p) return null;
  const h = (n) => n.toString(16).padStart(2, '0');
  return `#${h(p.r)}${h(p.g)}${h(p.b)}`;
}

function normalizeHex(value) {
  if (!value) return null;
  const s = String(value).trim().toLowerCase();
  if (/^#([0-9a-f]{3})$/.test(s)) {
    return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`;
  }
  if (/^#([0-9a-f]{6})$/.test(s)) return s;
  if (s === 'white') return '#ffffff';
  if (s === 'black') return '#000000';
  const fromRgb = rgbToHex(s);
  return fromRgb || null;
}

function isWhiteHex(hex) {
  return hex === '#ffffff';
}

function applyLightVariantColors({ textColor, borderColor }) {
  const out = { textColor, borderColor };
  const t = normalizeHex(textColor);
  if (t && isWhiteHex(t)) out.textColor = '#000000';
  const b = normalizeHex(borderColor);
  if (b && b === DEFAULT_BORDER_HEX) out.borderColor = '#e1e1e1';
  return out;
}

function isWhiteTextColor(cssColor) {
  const p = parseRgb(cssColor);
  if (!p) {
    const t = (cssColor || '').trim().toLowerCase();
    return t === '#fff' || t === '#ffffff' || t === 'white';
  }
  return p.r >= 250 && p.g >= 250 && p.b >= 250;
}

function isDefaultBorderGray(cssColor) {
  const p = parseRgb(cssColor);
  if (!p) return false;
  return p.r === 47 && p.g === 47 && p.b === 47;
}

function applyLightPdfColors(clonedWorld) {
  const win = clonedWorld.ownerDocument.defaultView;
  if (!win) return;

  const walk = (el) => {
    if (el.nodeType !== 1) return;
    for (const child of el.children) walk(child);

    if (el === clonedWorld) return;

    const cs = win.getComputedStyle(el);
    const tag = el.tagName.toLowerCase();

    if (tag === 'span' && el.classList.contains('board-view__block-placeholder')) {
      el.style.color = '#666666';
    }

    const color = cs.color;
    if (color && isWhiteTextColor(color)) {
      el.style.color = '#000000';
    } else {
      const hex = rgbToHex(color);
      if (hex === '#e0e0e0') el.style.color = '#333333';
    }

    const border = cs.borderColor;
    if (border && isDefaultBorderGray(border)) {
      el.style.borderColor = '#e1e1e1';
    }

    const bg = cs.backgroundColor;
    if (bg && isWhiteTextColor(bg)) {
      el.style.backgroundColor = '#000000';
    }
  };

  walk(clonedWorld);
}

/**
 * Растровый снимок мира для предпросмотра.
 * @param {HTMLElement} worldEl
 * @param {'dark' | 'light'} variant
 * @param {{ scale?: number, crop?: { left: number, right: number, top: number, bottom: number } }} [options]
 * @returns {Promise<HTMLCanvasElement>}
 */
export async function renderBoardWorldToCanvas(worldEl, variant, options = {}) {
  if (!worldEl) {
    throw new Error('Нет содержимого доски');
  }
  const scale = options.scale ?? 1;
  const crop = options.crop ?? { left: 0, right: 0, top: 0, bottom: 0 };
  if (typeof document !== 'undefined' && document.fonts?.ready) {
    try {
      await document.fonts.ready;
    } catch {
      /* ignore */
    }
  }

  const prevTransform = worldEl.style.transform;
  worldEl.style.transform = 'none';

  try {
    const canvas = await html2canvas(worldEl, {
      width: BOARD_EXPORT_WIDTH,
      height: BOARD_EXPORT_HEIGHT,
      windowWidth: BOARD_EXPORT_WIDTH,
      windowHeight: BOARD_EXPORT_HEIGHT,
      scale,
      backgroundColor: variant === 'dark' ? '#000000' : '#ffffff',
      logging: false,
      useCORS: true,
      allowTaint: true,
      onclone(_doc, cloned) {
        stripExportChrome(cloned);
        if (variant === 'light') {
          cloned.style.setProperty('background-color', '#ffffff', 'important');
          cloned.style.setProperty('background', '#ffffff', 'important');
          applyLightPdfColors(cloned);
        }
      },
    });

    const sx = Math.round(crop.left * scale);
    const sy = Math.round(crop.top * scale);
    const sw = canvas.width - sx - Math.round(crop.right * scale);
    const sh = canvas.height - sy - Math.round(crop.bottom * scale);
    if (sw < 2 || sh < 2) {
      throw new Error('Слишком маленькая область экспорта');
    }

    const cropped = document.createElement('canvas');
    cropped.width = sw;
    cropped.height = sh;
    const ctx = cropped.getContext('2d');
    ctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
    return cropped;
  } finally {
    worldEl.style.transform = prevTransform;
  }
}

function clipToCrop(item, crop, worldW, worldH) {
  const left = crop.left;
  const top = crop.top;
  const right = worldW - crop.right;
  const bottom = worldH - crop.bottom;
  const ix1 = Math.max(item.x, left);
  const iy1 = Math.max(item.y, top);
  const ix2 = Math.min(item.x + item.width, right);
  const iy2 = Math.min(item.y + item.height, bottom);
  if (ix2 <= ix1 || iy2 <= iy1) return null;
  return { ix1, iy1, ix2, iy2, left, top, right, bottom };
}

function fitImageToA4(cwPx, chPx) {
  const orientation = cwPx >= chPx ? 'l' : 'p';
  const pdf = new jsPDF({ orientation, unit: 'mm', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const imgRatio = cwPx / chPx;
  const pageRatio = pageW / pageH;
  let imgW;
  let imgH;
  if (imgRatio > pageRatio) {
    imgW = pageW;
    imgH = pageW / imgRatio;
  } else {
    imgH = pageH;
    imgW = pageH * imgRatio;
  }
  const x = (pageW - imgW) / 2;
  const y = (pageH - imgH) / 2;
  return { pdf, pageW, pageH, imgW, imgH, x, y, mmPerPx: imgW / cwPx };
}

function safeFileName(name) {
  return (
    String(name)
      .replace(/[^a-zA-Z0-9а-яА-ЯёЁ _.-]/g, '')
      .trim()
      .slice(0, 80) || 'doska'
  );
}

/**
 * Векторный экспорт: текст как текст, линии как фигуры, рамки как векторные обводки.
 *
 * @param {Array} items — board items для текущей доски
 * @param {'dark' | 'light'} variant
 * @param {string} fileBaseName
 * @param {{
 *   crop?: { left: number, right: number, top: number, bottom: number },
 *   worldWidth?: number,
 *   worldHeight?: number,
 * }} [opts]
 */
export async function exportBoardItemsToPdf(items, variant, fileBaseName = 'doska', opts = {}) {
  const worldW = opts.worldWidth ?? BOARD_EXPORT_WIDTH;
  const worldH = opts.worldHeight ?? BOARD_EXPORT_HEIGHT;
  const crop = opts.crop ?? { left: 0, right: 0, top: 0, bottom: 0 };

  const cwPx = Math.max(1, worldW - crop.left - crop.right);
  const chPx = Math.max(1, worldH - crop.top - crop.bottom);

  const { pdf, pageW, pageH, imgW, imgH, x: pageX, y: pageY, mmPerPx } = fitImageToA4(cwPx, chPx);

  await registerGilroyFonts(pdf);

  if (variant === 'dark') {
    pdf.setFillColor('#000000');
    pdf.rect(0, 0, pageW, pageH, 'F');
  }

  const toMmX = (px) => pageX + (px - crop.left) * mmPerPx;
  const toMmY = (px) => pageY + (px - crop.top) * mmPerPx;

  const list = Array.isArray(items) ? items.slice() : [];
  list.sort((a, b) => {
    const at = a?.created_at ? String(a.created_at) : '';
    const bt = b?.created_at ? String(b.created_at) : '';
    if (at < bt) return -1;
    if (at > bt) return 1;
    return 0;
  });

  for (const item of list) {
    if (!item) continue;
    const clip = clipToCrop(item, crop, worldW, worldH);
    if (!clip) continue;

    const isLine = item.kind === 'line_v' || item.kind === 'line_h';

    let textColor = normalizeHex(item.text_color) || (isLine ? '#ffffff' : '#ffffff');
    let borderColor = normalizeHex(item.border_color) || DEFAULT_BORDER_HEX;
    if (variant === 'light') {
      const adjusted = applyLightVariantColors({ textColor, borderColor });
      textColor = adjusted.textColor;
      borderColor = adjusted.borderColor;
    }

    if (isLine) {
      const x = toMmX(clip.ix1);
      const y = toMmY(clip.iy1);
      const w = (clip.ix2 - clip.ix1) * mmPerPx;
      const h = (clip.iy2 - clip.iy1) * mmPerPx;
      if (w > 0 && h > 0) {
        pdf.setFillColor(textColor);
        pdf.rect(x, y, w, h, 'F');
      }
      continue;
    }

    const blockX = toMmX(item.x);
    const blockY = toMmY(item.y);
    const blockW = item.width * mmPerPx;
    const blockH = item.height * mmPerPx;
    const radius = Math.max(0, Number(item.border_radius) || 0) * mmPerPx;
    const padding = Math.max(0, Number(item.padding) || 0) * mmPerPx;

    if (item.has_border) {
      pdf.setDrawColor(borderColor);
      pdf.setLineWidth(Math.max(0.05, mmPerPx));
      if (radius > 0) {
        pdf.roundedRect(blockX, blockY, blockW, blockH, radius, radius, 'S');
      } else {
        pdf.rect(blockX, blockY, blockW, blockH, 'S');
      }
    }

    const text = String(item.text ?? '');
    if (!text) continue;

    const scale = Number.isFinite(Number(item.text_scale)) ? Number(item.text_scale) : 1;
    const fontPx = BOARD_BASE_FONT_PX * scale;
    const fontMm = fontPx * mmPerPx;
    const fontPt = fontMm * PT_PER_MM;
    const lineGapMm = fontMm * BOARD_LINE_HEIGHT;

    const weight = item.text_font_weight && typeof item.text_font_weight === 'string' ? item.text_font_weight : 'medium';
    try {
      pdf.setFont('Gilroy', weight);
    } catch {
      pdf.setFont('Gilroy', 'medium');
    }
    pdf.setFontSize(fontPt);
    pdf.setTextColor(textColor);

    const innerX = blockX + padding;
    const innerY = blockY + padding;
    const innerW = Math.max(0, blockW - padding * 2);
    const innerH = Math.max(0, blockH - padding * 2);
    if (innerW <= 0 || innerH <= 0) continue;

    const paragraphs = text.split('\n');
    let lineIndex = 0;
    outer: for (const para of paragraphs) {
      const wrapped = para.length === 0 ? [''] : pdf.splitTextToSize(para, innerW);
      for (const line of wrapped) {
        const lineTopMm = innerY + lineIndex * lineGapMm;
        if (lineTopMm + fontMm > innerY + innerH + 0.01) break outer;
        const drawX = innerX;
        const drawY = lineTopMm;
        if (line.length > 0) {
          pdf.text(line, drawX, drawY, { baseline: 'top' });
        }
        lineIndex += 1;
      }
    }
  }

  pdf.save(`${safeFileName(fileBaseName)}.pdf`);
}

/**
 * Старый (растровый) экспорт через html2canvas — оставлен для совместимости.
 *
 * @param {HTMLElement} worldEl
 * @param {'dark' | 'light'} variant
 * @param {string} fileBaseName
 * @param {{ crop?: { left: number, right: number, top: number, bottom: number } }} [opts]
 */
export async function exportBoardWorldToPdf(worldEl, variant, fileBaseName = 'doska', opts = {}) {
  if (!worldEl) {
    throw new Error('Нет содержимого доски');
  }
  const crop = opts.crop ?? { left: 0, right: 0, top: 0, bottom: 0 };

  const canvas = await renderBoardWorldToCanvas(worldEl, variant, { scale: 1, crop });

  const { pdf, imgW, imgH, x, y } = fitImageToA4(canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL('image/png');
  pdf.addImage(dataUrl, 'PNG', x, y, imgW, imgH);
  pdf.save(`${safeFileName(fileBaseName)}.pdf`);
}
