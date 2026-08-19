import { MONTH_GENITIVE_RU, WEEKDAY_SHORT_RU, toLocalDateString } from '../constants';

/** "20 августа, чт", with the year added once it is not the current one. */
export function formatDueDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(`${dateStr}T12:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  const year = d.getFullYear() === new Date().getFullYear() ? '' : ` ${d.getFullYear()}`;
  return `${d.getDate()} ${MONTH_GENITIVE_RU[d.getMonth()]}${year}, ${WEEKDAY_SHORT_RU[d.getDay()]}`;
}

/** The same, for a timestamp rather than a plain date. */
export function formatStamp(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : formatDueDate(toLocalDateString(d));
}

/** "осталось 28 дней" — how long an archived card is still kept. */
export function archiveDaysLeft(deletedAt, days) {
  const spent = Math.floor((Date.now() - Date.parse(deletedAt)) / 86400000);
  const left = Math.max(0, days - spent);
  const teen = left % 100 >= 11 && left % 100 <= 14;
  const last = left % 10;
  let word = 'дней';
  if (!teen && last === 1) word = 'день';
  else if (!teen && last >= 2 && last <= 4) word = 'дня';
  return `осталось ${left} ${word}`;
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

/**
 * How far ahead the board looks when it is laid out by date. Whatever is
 * chosen, everything already late is always shown: a missed day is the one
 * thing that must not fall out of sight.
 */
export const DATE_FILTERS = [
  { id: 'today', title: 'Только сегодня', ahead: 0 },
  { id: 'tomorrow', title: 'Сегодня и завтра', ahead: 1 },
  { id: 'days3', title: 'Ближайшие 3 дня', ahead: 2 },
  { id: 'days7', title: 'Ближайшие 7 дней', ahead: 6 },
  { id: 'all', title: 'Все', ahead: null },
];

/** The last day a filter reaches, or null when it reaches everything. */
export function dateFilterLimit(id) {
  const found = DATE_FILTERS.find((f) => f.id === id);
  return found && found.ahead !== null ? dueInDays(found.ahead) : null;
}

export const OVERDUE_KEY = 'overdue';
export const OVERDUE_ACCENT = '#f33737';
export const TODAY_ACCENT = '#5a86ee';
export const DAY_ACCENT = '#666666';

/** The id a date column is dropped on: `kdate::overdue` or `kdate::2026-08-20`. */
export const dateColumnId = (key) => `kdate::${key}`;

/** The day behind such an id, `overdue`, or null for anything else. */
export function dateColumnKey(id) {
  return typeof id === 'string' && id.startsWith('kdate::') ? id.slice(7) : null;
}

/** "Сегодня, 20 августа, чт" — the heading of one day column. */
export function dateColumnTitle(dateStr) {
  if (dateStr === dueInDays(0)) return `Сегодня, ${formatDueDate(dateStr)}`;
  if (dateStr === dueInDays(1)) return `Завтра, ${formatDueDate(dateStr)}`;
  return formatDueDate(dateStr);
}
