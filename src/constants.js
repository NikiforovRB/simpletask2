export const TASK_COLORS = [
  '#ffffff',
  '#f33737',
  '#666666',
  '#5a86ee',
  '#15c466',
  '#613aaf',
  '#00b5cc',
  '#c4d636',
  '#f5e538',
  '#f4ba04',
  '#f29300',
  '#755341',
];

export const DEFAULT_TASK_COLOR = TASK_COLORS[0];

const MONTH_GENITIVE_RU = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];
const WEEKDAY_SHORT_RU = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

export function formatDayLabel(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const t = new Date(d);
  t.setHours(0, 0, 0, 0);
  const dayNum = d.getDate();
  const month = MONTH_GENITIVE_RU[d.getMonth()];
  const weekday = WEEKDAY_SHORT_RU[d.getDay()];
  const part = `${dayNum} ${month}, ${weekday}`;
  if (t.getTime() === today.getTime()) return `Сегодня, ${part}`;
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (t.getTime() === tomorrow.getTime()) return `Завтра, ${part}`;
  return part;
}
