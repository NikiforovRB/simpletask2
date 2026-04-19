import { toLocalDateString } from '../constants';

const WD_MON = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];

/** Понедельник = первый день недели для подписи */
export function weekdayShortMon(date) {
  const d = date.getDay();
  const idx = d === 0 ? 6 : d - 1;
  return WD_MON[idx];
}

export const MONTH_SHORT_RU = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

export function monthShortRu(date) {
  return MONTH_SHORT_RU[date.getMonth()];
}

export function daysBetweenUtcMidnight(anchorStr, dateStr) {
  const a = new Date(anchorStr + 'T12:00:00');
  const b = new Date(dateStr + 'T12:00:00');
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

/** День, когда нужно отметить привычку (не «пропуск» по режиму) */
export function isRequiredDay(habit, dateStr) {
  const mode = habit.skip_mode || 'none';
  if (mode === 'none') return true;
  const anchor = habit.anchor_date || habit.created_at?.slice(0, 10) || dateStr;
  const n = daysBetweenUtcMidnight(anchor, dateStr);
  if (n < 0) return false;
  if (mode === 'every_other') return n % 2 === 0;
  if (mode === 'every_third') return n % 3 === 0;
  return true;
}

/** Нормализует время к HH:mm (поддержка значений вида 9:05:00 из input[type=time]) */
export function normalizeHabitTimeString(input) {
  if (input == null || input === '') return '';
  const s = String(input).trim();
  const m = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!m) return '';
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h < 0 || h > 23 || min < 0 || min > 59) return '';
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

export function parseTimeToMinutes(t) {
  if (t == null || t === '') return null;
  const norm = normalizeHabitTimeString(t);
  if (!norm) return null;
  const m = norm.match(/^(\d{2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h * 60 + min;
}

export function formatMinutesToHabitTime(mins) {
  if (mins == null || !Number.isFinite(mins)) return '';
  let total = Math.round(mins);
  total = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(total / 60);
  const m = total - h * 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Типы-заметки без оценки "успех/провал" (нет счётчика серии) */
export function isInfoHabitType(type) {
  return type === 'just_time' || type === 'just_text';
}

/** true = соблюдено, false = нет, null = нет данных / нельзя оценить */
export function isSatisfied(habit, rawEntry) {
  const type = habit.type;
  const entry = rawEntry || {};

  if (type === 'yes_no') {
    if (entry.yes_no === 'yes') return true;
    if (entry.yes_no === 'no') return false;
    return null;
  }

  if (type === 'not_more' || type === 'not_less') {
    const lim = Number(habit.limit_number);
    if (!Number.isFinite(lim)) return null;
    if (entry.num == null || entry.num === '') return null;
    const v = Number(entry.num);
    if (!Number.isFinite(v)) return null;
    if (type === 'not_more') return v <= lim;
    return v >= lim;
  }

  if (type === 'not_later') {
    const limitMin = parseTimeToMinutes(habit.limit_time);
    if (limitMin == null) return null;
    if (entry.time == null || entry.time === '') return null;
    const userMin = parseTimeToMinutes(entry.time);
    if (userMin == null) return null;
    return userMin <= limitMin;
  }

  // just_time / just_text — это просто заметки, успеха/провала нет
  return null;
}

export function getEntryColor(habit, rawEntry) {
  const sat = isSatisfied(habit, rawEntry);
  if (sat === true) return '#00b956';
  if (sat === false) return '#f33737';
  return undefined;
}

/**
 * Серия успешных обязательных дней до сегодня включительно.
 * Если сегодня привычка явно не соблюдена (sat === false) — серия 0.
 * Если сегодня ещё не отмечено (null) — сегодня пропускается, серия берётся до вчера.
 * Пропуски по режиму не считаются в серию и не рвут цепочку назад.
 */
export function computeStreak(habit, entriesByDate, todayStr) {
  if (!habit.streak_enabled) return 0;
  if (isInfoHabitType(habit.type)) return 0;

  if (isRequiredDay(habit, todayStr)) {
    const satToday = isSatisfied(habit, entriesByDate[todayStr]);
    if (satToday === false) return 0;
  }

  let streak = 0;
  const today = new Date(todayStr + 'T12:00:00');
  for (let i = 0; i < 4000; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const ds = toLocalDateString(d);
    if (!isRequiredDay(habit, ds)) continue;
    const sat = isSatisfied(habit, entriesByDate[ds]);
    if (sat === true) {
      streak += 1;
    } else if (i === 0 && sat === null) {
      continue;
    } else {
      break;
    }
  }
  return streak;
}
