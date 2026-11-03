import { toLocalDateString } from '../constants';
import { dueInDays, formatDueDate } from './kanbanCards';

/** The messengers a client can be reached in, in the order they are offered. */
export const MESSENGERS = [
  { id: 'telegram', label: 'Telegram' },
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'max', label: 'Max' },
];

export const messengerLabel = (id) => MESSENGERS.find((m) => m.id === id)?.label ?? '';

/**
 * The digits of a phone the way the world dials it: a Russian number typed
 * as 8 999… or 999… becomes 7 999…. Empty while there is too little to dial.
 */
export function phoneDigits(phone) {
  let d = String(phone || '').replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('8')) d = `7${d.slice(1)}`;
  else if (d.length === 10 && d.startsWith('9')) d = `7${d}`;
  return d.length >= 6 ? d : '';
}

/**
 * A Telegram username however it was pasted — "@name", "t.me/name", a full
 * link — down to the name itself. Empty when it is not one.
 */
export function telegramHandle(value) {
  const s = String(value || '').trim()
    .replace(/^(?:https?:\/\/)?(?:www\.)?(?:t\.me|telegram\.me)\//i, '')
    .replace(/^@/, '')
    .replace(/[/?#].*$/, '');
  return /^[A-Za-z][A-Za-z0-9_]{3,31}$/.test(s) ? s : '';
}

/**
 * Where a press on the contact of a client leads: the chat in its messenger,
 * or a call when no messenger is set. In Telegram the username, when there is
 * one, opens that very account; the number is the fallback. Max has no link
 * that opens a chat by number, so for it the number is copied and its web
 * version opened, to be pasted into the search there. Null when there is
 * nothing to reach the client by.
 */
export function contactAction(card) {
  const handle = card?.messenger === 'telegram' ? telegramHandle(card.telegram) : '';
  if (handle) return { kind: 'telegram', url: `https://t.me/${handle}`, title: `Написать @${handle} в Telegram` };
  const d = phoneDigits(card?.phone);
  if (!d) return null;
  switch (card.messenger) {
    case 'telegram':
      return { kind: 'telegram', url: `https://t.me/+${d}`, title: 'Написать в Telegram' };
    case 'whatsapp':
      return { kind: 'whatsapp', url: `https://wa.me/${d}`, title: 'Написать в WhatsApp' };
    case 'max':
      return { kind: 'max', url: 'https://web.max.ru/', copy: `+${d}`, title: 'Скопировать номер и открыть Max' };
    default:
      return { kind: 'phone', url: `tel:+${d}`, title: 'Позвонить' };
  }
}

/** A call to the client, whatever messenger they are in. */
export function callHref(card) {
  const d = phoneDigits(card?.phone);
  return d ? `tel:+${d}` : null;
}

/** With a keyboard Enter sends and Shift+Enter starts a line; on a phone Enter is just a new line. */
export const enterSends = () => window.matchMedia?.('(hover: hover) and (pointer: fine)').matches ?? true;

/** The local day of a touch, as YYYY-MM-DD. */
export const touchDay = (touch) => toLocalDateString(new Date(touch.touched_at));

/** "18:05" — the local time of a timestamp. */
export function clockOf(iso) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** "Сегодня", "Вчера", or "27 октября, вт". */
export function dayHeading(day) {
  if (day === dueInDays(0)) return 'Сегодня';
  if (day === dueInDays(-1)) return 'Вчера';
  return formatDueDate(day);
}

/** A day and a time of day, put back together as a moment in local time. */
export function momentOf(day, time) {
  return new Date(`${day}T${time || '12:00'}:00`).toISOString();
}

/** Closed reminders, the work counted day by day: day → touches. */
export function doneByDay(touches) {
  const map = new Map();
  for (const t of touches) {
    if (!t.closed_reminder) continue;
    const day = touchDay(t);
    const list = map.get(day);
    if (list) list.push(t);
    else map.set(day, [t]);
  }
  return map;
}

/** Monday of the week a day belongs to, and the six days after it. */
export function weekOf(day) {
  const d = new Date(`${day}T12:00:00`);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const x = new Date(d);
    x.setDate(d.getDate() + i);
    return toLocalDateString(x);
  });
}

/** The same day `weeks` weeks away. */
export function shiftWeeks(day, weeks) {
  const d = new Date(`${day}T12:00:00`);
  d.setDate(d.getDate() + weeks * 7);
  return toLocalDateString(d);
}

/** A uuid made here, so a touch can be shown before the database has it. */
export function newId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
