import { MONTH_GENITIVE_RU, WEEKDAY_SHORT_RU, toLocalDateString } from '../constants';

/** "20 августа, чт", with the year added once it is not the current one. */
export function formatDueDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(`${dateStr}T12:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  const year = d.getFullYear() === new Date().getFullYear() ? '' : ` ${d.getFullYear()}`;
  return `${d.getDate()} ${MONTH_GENITIVE_RU[d.getMonth()]}${year}, ${WEEKDAY_SHORT_RU[d.getDay()]}`;
}

/** True once the due day has passed; the card is highlighted from then on. */
export function isOverdue(dateStr) {
  return !!dateStr && dateStr < toLocalDateString(new Date());
}

/** Today plus `days`, as YYYY-MM-DD. */
export function dueInDays(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return toLocalDateString(d);
}

/** Black or white, whichever stays readable on a label of that colour. */
export function labelTextColor(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return '#ffffff';
  const n = parseInt(m[1], 16);
  const luma = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return luma > 150 ? '#1a1a1a' : '#ffffff';
}

/** The labels of a board that a card actually wears, in board order. */
export function cardLabels(card, boardLabels) {
  const ids = card?.label_ids || [];
  if (ids.length === 0) return [];
  return boardLabels.filter((l) => ids.includes(l.id));
}
