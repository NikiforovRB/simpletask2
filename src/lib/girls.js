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
// Planner: contacts (girl_tasks) and dates (girls.dates) as one list
// ---------------------------------------------------------------------------

export const TASK_KINDS = [
  { key: 'message', label: 'Написать', hint: 'О чём написать, что предложить' },
  { key: 'call', label: 'Позвонить', hint: 'О чём поговорить' },
  { key: 'date', label: 'Свидание', hint: 'Где, во сколько, что не забыть' },
];

export const taskKind = (key) => TASK_KINDS.find((k) => k.key === key) || TASK_KINDS[0];

export const quickDays = (today) => [
  { label: 'Сегодня', value: today },
  { label: 'Завтра', value: addDays(today, 1) },
  { label: 'Через 3 дня', value: addDays(today, 3) },
  { label: 'Через неделю', value: addDays(today, 7) },
];

const WEEKDAY_FULL = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];

export const daysBetween = (from, to) => Math.round((parseDay(to) - parseDay(from)) / 86_400_000);

/** «Сегодня», «Завтра», «Вчера» or «10 октября, сб». */
export function relativeDay(day, today) {
  const n = daysBetween(today, day);
  if (n === 0) return 'Сегодня';
  if (n === 1) return 'Завтра';
  if (n === -1) return 'Вчера';
  return formatDate(day);
}

export const formatWhen = (day, time, today) => (time ? `${relativeDay(day, today)} • ${time}` : relativeDay(day, today));

/** «14 окт». */
export function shortDay(s) {
  const d = parseDay(s);
  return `${d.getDate()} ${MONTH_SHORT[d.getMonth()]}`;
}

export const sortDates = (dates) => [...dates].sort((a, b) => (dateKey(a) < dateKey(b) ? -1 : 1));

/** A planner column title: «Сегодня», «Завтра», then the day of the week. */
export const dayTitle = (day, today) => (daysBetween(today, day) <= 1 ? relativeDay(day, today) : WEEKDAY_FULL[parseDay(day).getDay()]);

export function agoLabel(days) {
  if (days <= 0) return 'сегодня';
  if (days === 1) return 'вчера';
  return `${days} ${plural(days, 'день', 'дня', 'дней')} назад`;
}

/**
 * Everything planned with the girls who aren't archived: every contact task
 * (done ones too — they are the history) and the dates from today on.
 */
export function planItems(girls, tasks, today) {
  const byId = new Map(girls.map((g) => [g.id, g]));
  const items = [];
  for (const t of tasks) {
    const girl = byId.get(t.girl_id);
    if (!girl || girl.archived) continue;
    items.push({
      key: `task:${t.id}`,
      source: 'task',
      id: t.id,
      kind: t.kind,
      girl,
      day: t.due_on,
      time: t.time,
      note: t.note,
      done: !!t.done_at,
      doneAt: t.done_at,
      createdAt: t.created_at,
    });
  }
  for (const girl of girls) {
    if (girl.archived) continue;
    for (const d of girl.dates) {
      if (!d.date || d.date < today) continue;
      items.push({ key: `date:${d.id}`, source: 'date', id: d.id, kind: 'date', girl, day: d.date, time: d.time || null, note: d.note || '', done: false });
    }
  }
  return items;
}

/** By day; within a day the ones without a time first, then by time. */
export function compareItems(a, b) {
  if (a.day !== b.day) return a.day < b.day ? -1 : 1;
  if (!!a.time !== !!b.time) return a.time ? 1 : -1;
  if (a.time !== b.time) return a.time < b.time ? -1 : 1;
  return (a.createdAt || '') < (b.createdAt || '') ? -1 : 1;
}

/** Not done yet, by girl, the nearest first (an overdue one comes before everything). */
export function pendingByGirl(items) {
  const map = new Map();
  for (const it of [...items].sort(compareItems)) {
    if (it.done) continue;
    if (!map.has(it.girl.id)) map.set(it.girl.id, []);
    map.get(it.girl.id).push(it);
  }
  return map;
}

/** What is to be done today: today's and the overdue ones (the header counter). */
export const dueCount = (items, today) => items.filter((it) => !it.done && it.day <= today).length;

/** The last time she was in touch: a done contact, a past date, or the day they met. */
export function lastContactOf(girl, tasks, today) {
  let best = { day: girl.met_on, kind: 'met' };
  for (const t of tasks) {
    if (t.girl_id !== girl.id || !t.done_at) continue;
    const day = toLocalDateString(new Date(t.done_at));
    if (day > best.day) best = { day, kind: t.kind };
  }
  for (const d of girl.dates) {
    if (d.date && d.date < today && d.date > best.day) best = { day: d.date, kind: 'date' };
  }
  return best;
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
