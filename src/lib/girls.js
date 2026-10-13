import { MONTH_GENITIVE_RU, WEEKDAY_SHORT_RU, toLocalDateString } from '../constants';

export const MONTH_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
export const MONTH_NOMINATIVE = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];
const AVATAR_COLORS = ['#e8789b', '#b48cf2', '#5a86ee', '#3fb3a8', '#e0a34a', '#e07a5f', '#8fa3bf'];

// ---------------------------------------------------------------------------
// Days ('YYYY-MM-DD' strings in local time)
// ---------------------------------------------------------------------------

export const todayStr = () => toLocalDateString(new Date());
export const parseDay = (s) => new Date(`${s}T12:00:00`);

export function addDays(s, n) {
  const d = parseDay(s);
  d.setDate(d.getDate() + n);
  return toLocalDateString(d);
}

export function startOfWeek(s) {
  const d = parseDay(s);
  return addDays(s, -((d.getDay() + 6) % 7));
}

export const startOfMonth = (s) => `${s.slice(0, 8)}01`;

export function endOfMonth(s) {
  const d = parseDay(startOfMonth(s));
  d.setMonth(d.getMonth() + 1, 0);
  return toLocalDateString(d);
}

const yearSuffix = (d) => (d.getFullYear() === new Date().getFullYear() ? '' : ` ${d.getFullYear()}`);

/** «10 октября, сб»; the year is added once it is not the current one. */
export function formatDate(s) {
  if (!s) return '';
  const d = parseDay(s);
  if (Number.isNaN(d.getTime())) return s;
  return `${d.getDate()} ${MONTH_GENITIVE_RU[d.getMonth()]}${yearSuffix(d)}, ${WEEKDAY_SHORT_RU[d.getDay()]}`;
}

/** «10 октября, сб • 18:00». */
export const formatDateTime = (s, time) => (time ? `${formatDate(s)} • ${time}` : formatDate(s));

/** «1–10 октября», «28 сентября – 3 октября». */
export function formatRange(from, to) {
  if (!to || from === to) return formatDate(from);
  const a = parseDay(from);
  const b = parseDay(to);
  if (a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()) {
    return `${a.getDate()}–${b.getDate()} ${MONTH_GENITIVE_RU[b.getMonth()]}${yearSuffix(b)}`;
  }
  const left = `${a.getDate()} ${MONTH_GENITIVE_RU[a.getMonth()]}${a.getFullYear() === b.getFullYear() ? '' : ` ${a.getFullYear()}`}`;
  return `${left} – ${b.getDate()} ${MONTH_GENITIVE_RU[b.getMonth()]}${yearSuffix(b)}`;
}

// ---------------------------------------------------------------------------
// Date filter («Сегодня», «Вчера», «В этом месяце», a custom period)
// ---------------------------------------------------------------------------

export const DATE_PRESETS = [
  { key: 'all', label: 'Всё время' },
  { key: 'today', label: 'Сегодня' },
  { key: 'yesterday', label: 'Вчера' },
  { key: 'month', label: 'В этом месяце' },
];

/** The inclusive {from, to} of a filter, or null for «всё время». */
export function filterRange(filter, today) {
  switch (filter?.key) {
    case 'today':
      return { from: today, to: today };
    case 'yesterday': {
      const y = addDays(today, -1);
      return { from: y, to: y };
    }
    case 'month':
      return { from: startOfMonth(today), to: endOfMonth(today) };
    case 'range':
      return filter.from ? { from: filter.from, to: filter.to || filter.from } : null;
    default:
      return null;
  }
}

export const inRange = (day, range) => !range || (!!day && day >= range.from && day <= range.to);

// ---------------------------------------------------------------------------
// Stats by weeks / months
// ---------------------------------------------------------------------------

export const STATS_MODES = [
  { key: 'week', label: 'Недели' },
  { key: 'month', label: 'Месяцы' },
];

/** The last `n` weeks / months, oldest first. */
function periodBuckets(mode, today, n) {
  const buckets = [];
  let from = mode === 'month' ? startOfMonth(today) : startOfWeek(today);
  for (let i = 0; i < n; i++) {
    const to = mode === 'month' ? endOfMonth(from) : addDays(from, 6);
    const d = parseDay(from);
    buckets.unshift({
      from,
      to,
      label: mode === 'month' ? MONTH_SHORT[d.getMonth()] : `${d.getDate()} ${MONTH_SHORT[d.getMonth()]}`,
    });
    from = mode === 'month' ? startOfMonth(addDays(from, -1)) : addDays(from, -7);
  }
  return buckets;
}

/** The last periods (oldest first) with the number of acquaintances in each. */
export function buildStats(girls, mode, today) {
  const buckets = periodBuckets(mode, today, mode === 'month' ? 6 : 8).map((b) => ({ ...b, count: 0 }));
  for (const g of girls) {
    const b = buckets.find((x) => g.met_on >= x.from && g.met_on <= x.to);
    if (b) b.count += 1;
  }
  return buckets;
}

// ---------------------------------------------------------------------------
// Girls
// ---------------------------------------------------------------------------

export const dateKey = (entry) => `${entry.date} ${entry.time || '00:00'}`;

export function nextDate(girl, today) {
  let best = null;
  for (const d of girl.dates) {
    if (d.date >= today && (!best || dateKey(d) < dateKey(best))) best = d;
  }
  return best;
}

export function lastPastDate(girl, today) {
  let best = null;
  for (const d of girl.dates) {
    if (d.date < today && (!best || dateKey(d) > dateKey(best))) best = d;
  }
  return best;
}

const latestKey = (girl) => girl.dates.reduce((max, d) => (dateKey(d) > max ? dateKey(d) : max), '');
export const stageOf = (girl) => (girl.dates.length > 0 ? 'dating' : 'meet');

export function plural(n, one, few, many) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

export function phoneHref(phone) {
  const digits = String(phone || '').replace(/[^\d+]/g, '');
  return digits.replace(/\D/g, '').length >= 5 ? `tel:${digits}` : null;
}

/** «@name», «name», «t.me/name» or a phone number → a link to the chat. */
export function telegramLink(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  const m = s.match(/(?:t\.me|telegram\.me)\/([A-Za-z0-9_+]+)/i);
  const name = (m ? m[1] : s).replace(/^@/, '');
  if (/^\+?\d[\d\s()-]{5,}$/.test(name)) {
    const digits = name.replace(/[^\d+]/g, '');
    return { url: `https://t.me/${digits.startsWith('+') ? digits : `+${digits}`}`, label: name };
  }
  if (!/^[A-Za-z0-9_]{3,}$/.test(name)) return null;
  return { url: `https://t.me/${name}`, label: `@${name}` };
}

export function avatarColor(name) {
  let h = 0;
  for (const ch of String(name)) h = (h * 31 + ch.codePointAt(0)) | 0;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

export function sortGirls(list, sort, today) {
  const byMet = (a, b) => {
    if (a.met_on !== b.met_on) return a.met_on < b.met_on ? -1 : 1;
    return (a.created_at || '') < (b.created_at || '') ? -1 : 1;
  };
  const byName = (a, b) => a.name.localeCompare(b.name, 'ru');
  const sorted = [...list];
  switch (sort) {
    case 'old':
      return sorted.sort(byMet);
    case 'name':
      return sorted.sort(byName);
    case 'upcoming':
      return sorted.sort((a, b) => {
        const na = nextDate(a, today);
        const nb = nextDate(b, today);
        if (na && nb) return dateKey(na) < dateKey(nb) ? -1 : 1;
        if (na || nb) return na ? -1 : 1;
        return latestKey(a) > latestKey(b) ? -1 : 1;
      });
    case 'recent':
      return sorted.sort((a, b) => (latestKey(a) > latestKey(b) ? -1 : 1));
    default:
      return sorted.sort((a, b) => byMet(b, a));
  }
}

export function matches(girl, q) {
  if (!q) return true;
  const text = [girl.name, girl.place, girl.comment, girl.telegram, girl.phone, ...girl.dates.map((d) => d.note || '')]
    .join(' ')
    .toLowerCase();
  if (text.includes(q)) return true;
  const digits = q.replace(/\D/g, '');
  return digits.length >= 3 && String(girl.phone || '').replace(/\D/g, '').includes(digits);
}

// ---------------------------------------------------------------------------
// Approaches and the «Подходы → Знакомства → Свидания» funnel
// ---------------------------------------------------------------------------

export function nowTime() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Newest first: by day, then time (those without one last), then when it was written down. */
export function sortApproaches(list) {
  const key = (a) => `${a.happened_on} ${a.time || '--:--'} ${a.created_at || ''}`;
  return [...list].sort((a, b) => (key(a) < key(b) ? 1 : -1));
}

export function approachMatches(approach, girl, q) {
  if (!q) return true;
  const text = [approach.place, approach.note, approach.outcome === 'contact' ? 'контакт' : 'отказ', girl?.name || '']
    .join(' ')
    .toLowerCase();
  return text.includes(q);
}

/**
 * Approaches made in the range and how far they went: a contact, then at least
 * one date (planned or past) with her — whenever that date is.
 */
export function funnelOf(approaches, girlsById, range) {
  const result = { approaches: 0, refusals: 0, contacts: 0, dates: 0 };
  for (const a of approaches) {
    if (!inRange(a.happened_on, range)) continue;
    result.approaches += 1;
    if (a.outcome !== 'contact') {
      result.refusals += 1;
      continue;
    }
    result.contacts += 1;
    if (girlsById.get(a.girl_id)?.dates.length) result.dates += 1;
  }
  return result;
}

/** The funnel of each of the last weeks / months, newest first. */
export function funnelByPeriod(approaches, girlsById, mode, today) {
  return periodBuckets(mode, today, mode === 'month' ? 6 : 8)
    .reverse()
    .map((b) => ({ ...b, ...funnelOf(approaches, girlsById, b) }));
}

/** «25%», or «—» when there is nothing to divide by. */
export function percent(part, whole) {
  if (!whole) return '—';
  const p = (part / whole) * 100;
  return `${p >= 10 || p === 0 ? Math.round(p) : Math.round(p * 10) / 10}%`.replace('.', ',');
}

// ---------------------------------------------------------------------------
// Avatar photos
// ---------------------------------------------------------------------------

/** Center-crops an image file to a square JPEG of at most `size` px. */
export async function squareJpeg(file, size = 384) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('Не удалось прочитать изображение'));
      i.src = url;
    });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const out = Math.min(size, side);
    const canvas = document.createElement('canvas');
    canvas.width = out;
    canvas.height = out;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, out, out);
    return await new Promise((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Не удалось сжать изображение'))), 'image/jpeg', 0.86);
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
