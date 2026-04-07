/** @typedef {'light'|'regular'|'medium'|'semibold'} TaskFontWeightId */

export const TASK_FONT_WEIGHT_OPTIONS = [
  { id: 'light', label: 'Light' },
  { id: 'regular', label: 'Regular' },
  { id: 'medium', label: 'Medium' },
  { id: 'semibold', label: 'Semibold' },
];

export const TASK_FONT_SCALE_OPTIONS = [0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6];

const WEIGHT_TO_CSS = {
  light: 300,
  regular: 400,
  medium: 500,
  semibold: 600,
};

/** @returns {TaskFontWeightId} */
export function normalizeTaskFontWeight(v) {
  const s = String(v || '').toLowerCase();
  if (['light', 'regular', 'medium', 'semibold'].includes(s)) return s;
  return 'medium';
}

export function normalizeTaskFontScale(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 1;
  const hit = TASK_FONT_SCALE_OPTIONS.find((a) => Math.abs(a - n) < 0.051);
  return hit ?? 1;
}

/** Label for scale chip (e.g. 1, 0.7, 1.1) */
export function formatTaskScaleLabel(sc) {
  const t = Number(sc).toFixed(1);
  return t.endsWith('.0') ? t.slice(0, -2) : t;
}

/** @param {TaskFontWeightId} id */
export function taskFontWeightToCssNumber(id) {
  return WEIGHT_TO_CSS[normalizeTaskFontWeight(id)] ?? 500;
}
