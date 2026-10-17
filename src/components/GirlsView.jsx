import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useAvatarUrls, genGirlId } from '../hooks/useGirls';
import { useModalClose } from '../hooks/useModalClose';
import {
  DATE_PRESETS,
  addDays,
  agoLabel,
  approachMatches,
  compareItems,
  daysBetween,
  filterRange,
  formatDate,
  formatDateTime,
  formatRange,
  formatWhen,
  funnelOf,
  inRange,
  lastContactOf,
  lastPastDate,
  matches,
  nextDate,
  nowTime,
  pendingByGirl,
  percent,
  phoneHref,
  placeInDay,
  planItems,
  plural,
  quickDays,
  relativeDay,
  sortApproaches,
  sortDates,
  sortGirls,
  squareJpeg,
  stageOf,
  taskKind,
  telegramLink,
  todayStr,
} from '../lib/girls';
import {
  Avatar,
  CalendarIcon,
  CameraIcon,
  CheckIcon,
  CloseIcon,
  PhoneIcon,
  PlusIcon,
  SearchIcon,
  TaskKindIcon,
  TelegramIcon,
} from './GirlsIcons';
import { GirlHistory } from './GirlHistory';
import { GirlsAnalytics } from './GirlsAnalytics';
import { GirlsDatePicker } from './GirlsDatePicker';
import { GirlsPlanner } from './GirlsPlanner';
import { GirlsStats } from './GirlsStats';
import { GirlTaskEditor } from './GirlTaskEditor';
import './GirlsView.css';

const CONTACT_KINDS = ['message', 'call'];
const ALL_KINDS = ['message', 'call', 'date'];

/** A date entry with `patch`; one moved to another day loses its place in the planner day. */
function patchDateEntry(d, patch) {
  const next = { ...d, ...patch };
  if (patch.date && patch.date !== d.date) delete next.pos;
  return next;
}

const VIEW_KEY = 'girls_view_v1';

const TABS = [
  { key: 'approach', label: 'Подходы' },
  { key: 'meet', label: 'Знакомства' },
  { key: 'dating', label: 'Свидания' },
];

const SORTS = {
  meet: [
    ['new', 'Сначала новые'],
    ['old', 'Сначала старые'],
    ['name', 'По имени'],
  ],
  dating: [
    ['upcoming', 'Ближайшие'],
    ['recent', 'Недавние'],
    ['new', 'Сначала новые'],
    ['name', 'По имени'],
  ],
};

const DEFAULT_VIEW = {
  tab: 'approach',
  sort: { meet: 'new', dating: 'upcoming' },
  stats: { open: true, mode: 'week' },
  plannerDays: 7,
};

function loadView() {
  try {
    const v = JSON.parse(localStorage.getItem(VIEW_KEY) || 'null');
    const tab = TABS.some((t) => t.key === v?.tab) ? v.tab : DEFAULT_VIEW.tab;
    const sort = { ...DEFAULT_VIEW.sort };
    for (const key of Object.keys(SORTS)) {
      if (SORTS[key].some(([k]) => k === v?.sort?.[key])) sort[key] = v.sort[key];
    }
    const stats = {
      open: typeof v?.stats?.open === 'boolean' ? v.stats.open : DEFAULT_VIEW.stats.open,
      mode: v?.stats?.mode === 'month' ? 'month' : 'week',
    };
    const plannerDays = Number.isInteger(v?.plannerDays) && v.plannerDays >= 1 && v.plannerDays <= 7 ? v.plannerDays : DEFAULT_VIEW.plannerDays;
    return { tab, sort, stats, plannerDays };
  } catch {
    return DEFAULT_VIEW;
  }
}

// ---------------------------------------------------------------------------
// View
// ---------------------------------------------------------------------------

/** `store` — useGirls() of the dashboard (it also counts what's due for the header). */
export function GirlsView({ store, analyticsOpen = false, onAnalyticsClose, plannerOpen = false }) {
  const {
    girls,
    loaded,
    tasks,
    tasksLoaded,
    tasksReady,
    addTask,
    updateTask,
    deleteTask,
    approaches,
    approachesLoaded,
    approachesReady,
    error,
    dismissError,
    addGirl,
    updateGirl,
    deleteGirl,
    setAvatar,
    clearAvatar,
    addApproach,
    updateApproach,
    deleteApproach,
  } = store;
  const [view, setView] = useState(loadView);
  const [query, setQuery] = useState('');
  const [dateFilter, setDateFilter] = useState({ key: 'all' });
  const [periodPicker, setPeriodPicker] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  // A girl's card: { isNew, approach? } | { id }. `approach` — the approach
  // («Контакт») she comes from: { id | null, draft }.
  const [editing, setEditing] = useState(null);
  // The approach modal: {} — a new one, { id } — an existing one; `draft` —
  // the fields to start from (when coming back from her card).
  const [approachEdit, setApproachEdit] = useState(null);
  const [ownAnalytics, setOwnAnalytics] = useState(false);
  // A planned thing: { key } — an existing one, { seed } — a new one.
  const [taskEdit, setTaskEdit] = useState(null);
  // «What's next» after a done contact: { girlId, name, kind }.
  const [followUp, setFollowUp] = useState(null);
  // The whole story with her (GirlHistory): her id.
  const [historyId, setHistoryId] = useState(null);
  const [notice, setNotice] = useState(null);
  const noticeTimer = useRef(null);
  const followTimer = useRef(null);
  const today = todayStr();
  const urlOf = useAvatarUrls(girls.map((g) => g.avatar_path));

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_KEY, JSON.stringify(view));
    } catch {
      /* ignore */
    }
  }, [view]);

  useEffect(
    () => () => {
      clearTimeout(noticeTimer.current);
      clearTimeout(followTimer.current);
    },
    [],
  );

  const tab = view.tab;
  const sort = view.sort[tab];
  const q = query.trim().toLowerCase();
  const range = filterRange(dateFilter, today);

  const girlsById = useMemo(() => new Map(girls.map((g) => [g.id, g])), [girls]);
  const inPeriod = girls.filter((g) => inRange(g.met_on, range));
  const approachesInPeriod = approaches.filter((a) => inRange(a.happened_on, range));
  const counts = { approach: approachesInPeriod.length, meet: 0, dating: 0 };
  for (const g of inPeriod) if (!g.archived) counts[stageOf(g)] += 1;

  const filtered = tab === 'approach' ? [] : inPeriod.filter((g) => stageOf(g) === tab && matches(g, q));
  const list = sortGirls(filtered.filter((g) => !g.archived), sort, today);
  const archivedList = sortGirls(filtered.filter((g) => g.archived), sort, today);

  const approachDays = [];
  if (tab === 'approach') {
    for (const a of sortApproaches(approachesInPeriod.filter((x) => approachMatches(x, girlsById.get(x.girl_id), q)))) {
      const last = approachDays[approachDays.length - 1];
      if (last?.day === a.happened_on) last.items.push(a);
      else approachDays.push({ day: a.happened_on, items: [a] });
    }
  }
  const funnel = funnelOf(approaches, girlsById, range);

  const plan = planItems(girls, tasks, today);
  const pending = pendingByGirl(plan);
  const activeGirls = girls.filter((g) => !g.archived).sort((a, b) => a.name.localeCompare(b.name, 'ru'));

  const allPlaces = useMemo(
    () =>
      [...new Set([...girls.map((g) => g.place.trim()), ...approaches.map((a) => a.place.trim())].filter(Boolean))].sort(
        (a, b) => a.localeCompare(b, 'ru'),
      ),
    [girls, approaches],
  );

  const showNotice = (text) => {
    clearTimeout(noticeTimer.current);
    setNotice(text);
    noticeTimer.current = setTimeout(() => setNotice(null), 4000);
  };

  const switchTab = (key) => setView((v) => ({ ...v, tab: key }));
  const setStats = (patch) => setView((v) => ({ ...v, stats: { ...v.stats, ...patch } }));
  const setPeriod = (r) => setDateFilter(r ? { key: 'range', from: r.from, to: r.to } : { key: 'all' });

  const editingGirl = editing && !editing.isNew ? girls.find((g) => g.id === editing.id) : null;
  const editingApproach = approachEdit?.id ? approaches.find((a) => a.id === approachEdit.id) : null;
  const fromApproach = editing?.isNew ? editing.approach : null;

  const approachFields = (d) => ({
    happened_on: d.happened_on || today,
    time: d.time || null,
    place: d.place.trim(),
    note: d.note.trim(),
  });

  const recordRefusal = (draft) => {
    setApproachEdit(null);
    addApproach({ ...approachFields(draft), outcome: 'refusal', girl_id: null });
  };

  /** «Контакт»: her card opens; the approach is saved together with it. */
  const startContact = (draft, approachId = null) => {
    setApproachEdit(null);
    setEditing({ isNew: true, approach: { id: approachId, draft } });
  };

  const saveApproach = (draft, outcome) => {
    const a = editingApproach;
    if (!a) return;
    if (outcome === 'contact' && a.outcome !== 'contact') {
      startContact(draft, a.id);
      return;
    }
    setApproachEdit(null);
    updateApproach(a.id, { ...approachFields(draft), outcome, girl_id: outcome === 'contact' ? a.girl_id : null });
  };

  const closeAnalytics = () => {
    setOwnAnalytics(false);
    onAnalyticsClose?.();
  };

  // --- Planner -------------------------------------------------------------

  const editingItem = taskEdit?.key ? plan.find((it) => it.key === taskEdit.key) : null;
  const taskRow = (fields) => ({ kind: fields.kind, due_on: fields.day, time: fields.time, note: fields.note });

  const addDate = (girl, entry) => {
    updateGirl(girl.id, { dates: sortDates([...girl.dates, { id: genGirlId(), ...entry }]) });
    if (stageOf(girl) === 'meet') showNotice(`${girl.name} — теперь в «Свиданиях»`);
  };

  const saveTask = (item, fields) => {
    setTaskEdit(null);
    const girl = girlsById.get(fields.girlId);
    if (!girl) return;
    if (fields.kind !== 'date') {
      if (item) updateTask(item.id, { ...taskRow(fields), ...(item.day !== fields.day ? { position: null } : {}) });
      else addTask({ girl_id: girl.id, ...taskRow(fields) });
      return;
    }
    const entry = { date: fields.day, time: fields.time, note: fields.note };
    if (!item) {
      addDate(girl, entry);
      return;
    }
    updateGirl(girl.id, { dates: sortDates(girl.dates.map((d) => (d.id === item.id ? patchDateEntry(d, entry) : d))) });
  };

  /** To another day, to the end of its plan («Перенести всё на сегодня»). */
  const moveItem = (item, day) => {
    if (item.source === 'date') {
      updateGirl(item.girl.id, { dates: sortDates(item.girl.dates.map((d) => (d.id === item.id ? patchDateEntry(d, { date: day }) : d))) });
    } else {
      updateTask(item.id, { due_on: day, position: null });
    }
  };

  /** Dropped into `day` where `ordered` (the day's cards, in the new order) says. */
  const placeItem = (item, day, ordered) => {
    const positions = placeInDay(ordered, item.key);
    const dates = new Map();
    for (const it of ordered) {
      const pos = positions.get(it.key);
      const moved = it.key === item.key && item.day !== day;
      if (pos === undefined && !moved) continue;
      if (it.source === 'task') {
        updateTask(it.id, { ...(moved ? { due_on: day } : {}), ...(pos !== undefined ? { position: pos } : {}) });
        continue;
      }
      const g = dates.get(it.girl.id) || { girl: it.girl, patches: new Map() };
      g.patches.set(it.id, { ...(moved ? { date: day } : {}), ...(pos !== undefined ? { pos } : {}) });
      dates.set(it.girl.id, g);
    }
    for (const { girl, patches } of dates.values()) {
      updateGirl(girl.id, { dates: sortDates(girl.dates.map((d) => (patches.has(d.id) ? { ...d, ...patches.get(d.id) } : d))) });
    }
  };

  const deleteItem = (item) => {
    setTaskEdit(null);
    if (item.source === 'date') updateGirl(item.girl.id, { dates: item.girl.dates.filter((d) => d.id !== item.id) });
    else deleteTask(item.id);
  };

  const offerFollowUp = (girl, kind) => {
    clearTimeout(followTimer.current);
    setFollowUp({ girlId: girl.id, name: girl.name, kind });
    followTimer.current = setTimeout(() => setFollowUp(null), 20000);
  };

  /**
   * Ticked off. It happened today, so one planned for another day moves to
   * today — the history then shows when it really was.
   */
  const completeTask = (id, day, done) => {
    const patch = { done_at: done ? new Date().toISOString() : null };
    if (done && day !== today) Object.assign(patch, { due_on: today, time: null, position: null });
    updateTask(id, patch);
  };

  /** A done contact; if nothing else is planned with her — «what's next?». */
  const toggleDone = (item) => {
    const done = !item.done;
    completeTask(item.id, item.day, done);
    if (!done) return;
    const rest = (pending.get(item.girl.id) || []).filter((it) => it.key !== item.key);
    if (rest.length === 0) offerFollowUp(item.girl, item.kind);
  };

  // --- History ------------------------------------------------------------

  const historyGirl = historyId ? girlsById.get(historyId) : null;

  /** Written down in her history: a day ahead — a plan, today or earlier — done. */
  // `plan` — to be done even if the day has come; otherwise a day so far is a contact that happened.
  const addEntry = (girl, { kind, day, time, note, plan = false }) => {
    if (kind === 'date') {
      addDate(girl, { date: day, time, note });
      return;
    }
    addTask({ girl_id: girl.id, kind, due_on: day, time, note, done_at: !plan && day <= today ? new Date().toISOString() : null });
  };

  const editEntry = (girl, entry, { kind, day, time, note, done }) => {
    if (entry.source === 'date') {
      updateGirl(girl.id, { dates: sortDates(girl.dates.map((d) => (d.id === entry.id ? patchDateEntry(d, { date: day, time, note }) : d))) });
      return;
    }
    const task = tasks.find((t) => t.id === entry.id);
    if (!task) return;
    const patch = { kind, due_on: day, time, note };
    if (day !== task.due_on) patch.position = null;
    if (done !== !!task.done_at) patch.done_at = done ? new Date().toISOString() : null;
    updateTask(task.id, patch);
  };

  const deleteEntry = (girl, entry) => {
    if (entry.source === 'date') updateGirl(girl.id, { dates: girl.dates.filter((d) => d.id !== entry.id) });
    else deleteTask(entry.id);
  };

  const planFollowUp = (day) => {
    const f = followUp;
    clearTimeout(followTimer.current);
    setFollowUp(null);
    if (!f) return;
    addTask({ girl_id: f.girlId, kind: f.kind, due_on: day, time: null, note: '' });
    showNotice(`${f.name}: ${taskKind(f.kind).label.toLowerCase()} — ${relativeDay(day, today).toLowerCase()}`);
  };

  const planDateAfter = () => {
    const f = followUp;
    clearTimeout(followTimer.current);
    setFollowUp(null);
    if (f) setTaskEdit({ seed: { girlId: f.girlId, kind: 'date', day: addDays(today, 1) } });
  };

  const openPlan = (seed) => setTaskEdit({ seed });

  // --- Girls ---------------------------------------------------------------

  const handleSave = async (fields, avatar, newTasks = []) => {
    const stage = fields.dates.length > 0 ? 'dating' : 'meet';
    if (editing?.isNew) {
      const from = editing.approach;
      setEditing(null);
      const id = await addGirl(fields);
      if (!id) return;
      if (avatar?.blob) setAvatar(id, avatar.blob, '');
      for (const t of newTasks) addTask({ girl_id: id, kind: t.kind, due_on: t.due_on, time: t.time, note: t.note });
      if (from) {
        const link = { ...approachFields(from.draft), outcome: 'contact', girl_id: id };
        if (from.id) updateApproach(from.id, link);
        else addApproach(link);
        showNotice(`${fields.name} — контакт записан, она в «${stage === 'dating' ? 'Свиданиях' : 'Знакомствах'}»`);
        return;
      }
      if (stage !== tab) switchTab(stage);
      return;
    }
    const g = editingGirl;
    if (!g) return;
    const before = stageOf(g);
    setEditing(null);
    await updateGirl(g.id, fields);
    if (avatar?.blob) setAvatar(g.id, avatar.blob, g.avatar_path);
    else if (avatar === 'remove') clearAvatar(g.id, g.avatar_path);
    if (before !== stage) {
      showNotice(`${fields.name} — теперь в «${stage === 'dating' ? 'Свиданиях' : 'Знакомствах'}»`);
    }
  };

  const emptyText = (() => {
    if (q || range) return 'Ничего не найдено.';
    if (tab === 'approach') {
      return 'Подходов пока нет. Подошли к девушке — нажмите «Добавить» и отметьте результат: отказ или контакт.';
    }
    if (tab === 'meet') return 'Пока никого. Нажмите «Добавить», чтобы записать первое знакомство.';
    return 'Свиданий пока нет. Откройте знакомство и назначьте свидание — оно появится здесь.';
  })();

  const canAdd = tab !== 'approach' || approachesReady;
  const openAdd = () => (tab === 'approach' ? setApproachEdit({}) : setEditing({ isNew: true }));

  const renderList = () => {
    if (tab === 'approach') {
      if (!approachesLoaded) return <p className="girls__empty">Загрузка…</p>;
      if (!approachesReady) {
        return (
          <p className="girls__empty">
            Подходы пока негде хранить: примените миграцию <code>067_girl_approaches.sql</code> в Supabase.
          </p>
        );
      }
      if (approachDays.length === 0) return <p className="girls__empty">{emptyText}</p>;
      return (
        <div className="girls-days">
          {approachDays.map(({ day, items }) => {
            const contacts = items.filter((a) => a.outcome === 'contact').length;
            return (
              <section key={day} className="girls-day">
                <div className="girls-day__head">
                  <span className="girls-day__date">{day === today ? `Сегодня, ${formatDate(day)}` : formatDate(day)}</span>
                  <span className="girls-day__count">
                    {items.length} {plural(items.length, 'подход', 'подхода', 'подходов')}
                    {contacts > 0 && ` · ${contacts} ${plural(contacts, 'контакт', 'контакта', 'контактов')}`}
                  </span>
                </div>
                <ul className="girls__list">
                  {items.map((a) => {
                    const girl = girlsById.get(a.girl_id);
                    return (
                      <ApproachCard
                        key={a.id}
                        approach={a}
                        girl={girl}
                        url={girl ? urlOf(girl.avatar_path) : null}
                        onOpen={() => setApproachEdit({ id: a.id })}
                      />
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      );
    }
    if (!loaded && !error) return <p className="girls__empty">Загрузка…</p>;
    if (list.length === 0) return <p className="girls__empty">{emptyText}</p>;
    return (
      <ul className="girls__list">
        {list.map((g) => (
          <GirlCard
            key={g.id}
            girl={g}
            url={urlOf(g.avatar_path)}
            today={today}
            plan={pending.get(g.id)}
            onOpen={() => setEditing({ id: g.id })}
            onOpenHistory={() => setHistoryId(g.id)}
          />
        ))}
      </ul>
    );
  };

  return (
    <div className={`girls ${plannerOpen ? 'girls--planner' : ''}`}>
      {error && (
        <div className="girls__banner girls__banner--error" role="alert">
          <span>{error}</span>
          <button type="button" className="girls__banner-close" onClick={dismissError} aria-label="Закрыть">
            <CloseIcon />
          </button>
        </div>
      )}
      {notice && (
        <div className="girls__banner" role="status">
          <span>{notice}</span>
          <button type="button" className="girls__banner-close" onClick={() => setNotice(null)} aria-label="Закрыть">
            <CloseIcon />
          </button>
        </div>
      )}
      {followUp && (
        <div className="girls__banner girls-follow" role="status">
          <span className="girls-follow__text">
            {followUp.name}: когда {followUp.kind === 'call' ? 'позвонить' : 'написать'} снова?
          </span>
          <div className="girls-follow__chips">
            {quickDays(today)
              .slice(1)
              .map((q) => (
                <button key={q.label} type="button" className="girls__chip" onClick={() => planFollowUp(q.value)}>
                  {q.label}
                </button>
              ))}
            <button type="button" className="girls__chip" onClick={planDateAfter}>
              Свидание…
            </button>
          </div>
          <button type="button" className="girls__banner-close" onClick={() => setFollowUp(null)} aria-label="Закрыть">
            <CloseIcon />
          </button>
        </div>
      )}

      {plannerOpen && (
        <GirlsPlanner
          girls={girls}
          tasks={tasks}
          items={plan}
          today={today}
          dayCount={view.plannerDays}
          onDayCount={(n) => setView((v) => ({ ...v, plannerDays: n }))}
          urlOf={urlOf}
          loaded={loaded && tasksLoaded}
          tasksReady={tasksReady}
          onCreate={openPlan}
          onHistory={setHistoryId}
          onToggleDone={toggleDone}
          onPlace={placeItem}
          onMoveAll={(list, day) => list.forEach((it) => moveItem(it, day))}
        />
      )}

      {!plannerOpen && (
        <>
          {loaded && girls.length > 0 && (
            <GirlsStats
              girls={girls}
              today={today}
              mode={view.stats.mode}
              open={view.stats.open}
              onMode={(mode) => setStats({ mode })}
              onToggle={() => setStats({ open: !view.stats.open })}
              activeRange={range}
              onPickRange={setPeriod}
            />
          )}

          <div className="girls__tabs" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={tab === t.key}
                className={`girls__tab ${tab === t.key ? 'girls__tab--active' : ''}`}
                onClick={() => switchTab(t.key)}
              >
                <span>{t.label}</span>
                <span className="girls__tab-count">{counts[t.key]}</span>
              </button>
            ))}
          </div>

          <div className="girls__toolbar">
            <label className="girls__search">
              <SearchIcon />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Поиск"
                aria-label="Поиск"
              />
            </label>
            {SORTS[tab] && (
              <select
                className="girls__sort"
                value={sort}
                onChange={(e) => setView((v) => ({ ...v, sort: { ...v.sort, [tab]: e.target.value } }))}
                aria-label="Сортировка"
              >
                {SORTS[tab].map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            )}
            {canAdd && (
              <button type="button" className="girls__add" onClick={openAdd}>
                <PlusIcon />
                <span>Добавить</span>
              </button>
            )}
          </div>

          <div className="girls__chips" role="group" aria-label={tab === 'approach' ? 'Дата подхода' : 'Дата знакомства'}>
            {DATE_PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                className={`girls__chip ${dateFilter.key === p.key ? 'girls__chip--on' : ''}`}
                onClick={() => setDateFilter({ key: p.key })}
              >
                {p.label}
              </button>
            ))}
            {dateFilter.key === 'range' ? (
              <span className="girls__chip girls__chip--on girls__chip--range">
                <button type="button" className="girls__chip-main" onClick={() => setPeriodPicker(true)}>
                  <CalendarIcon />
                  {formatRange(range.from, range.to)}
                </button>
                <button type="button" className="girls__chip-clear" onClick={() => setPeriod(null)} aria-label="Сбросить период">
                  <CloseIcon />
                </button>
              </span>
            ) : (
              <button type="button" className="girls__chip" onClick={() => setPeriodPicker(true)}>
                <CalendarIcon />
                Период
              </button>
            )}
          </div>

          {tab === 'approach' && funnel.approaches > 0 && (
            <button type="button" className="girls-conv" onClick={() => setOwnAnalytics(true)}>
              <span className="girls-conv__step">
                <b>{funnel.approaches}</b> {plural(funnel.approaches, 'подход', 'подхода', 'подходов')}
              </span>
              <span className="girls-conv__arrow" aria-hidden="true">→</span>
              <span className="girls-conv__step">
                <b>{funnel.contacts}</b> {plural(funnel.contacts, 'знакомство', 'знакомства', 'знакомств')}
                <small>{percent(funnel.contacts, funnel.approaches)}</small>
              </span>
              <span className="girls-conv__arrow" aria-hidden="true">→</span>
              <span className="girls-conv__step">
                <b>{funnel.dates}</b> {plural(funnel.dates, 'свидание', 'свидания', 'свиданий')}
                <small>{percent(funnel.dates, funnel.contacts)}</small>
              </span>
            </button>
          )}

          {renderList()}

          {archivedList.length > 0 && (
            <div className="girls__archive">
              <button type="button" className="girls__archive-toggle" onClick={() => setShowArchive((v) => !v)}>
                {showArchive ? 'Скрыть архив' : 'Архив'} · {archivedList.length}
              </button>
              {showArchive && (
                <ul className="girls__list girls__list--archived">
                  {archivedList.map((g) => (
                    <GirlCard key={g.id} girl={g} url={urlOf(g.avatar_path)} today={today} onOpen={() => setEditing({ id: g.id })} />
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}

      {plannerOpen
        ? activeGirls.length > 0 && (
            <button type="button" className="girls__fab" onClick={() => openPlan({ day: today })} aria-label="Запланировать">
              <PlusIcon />
            </button>
          )
        : canAdd && (
            <button
              type="button"
              className="girls__fab"
              onClick={openAdd}
              aria-label={tab === 'approach' ? 'Записать подход' : 'Добавить знакомство'}
            >
              <PlusIcon />
            </button>
          )}

      {periodPicker && (
        <GirlsDatePicker
          mode="range"
          title={tab === 'approach' ? 'Дата подхода' : 'Дата знакомства'}
          from={range?.from || ''}
          to={range?.to || ''}
          quick={[
            { label: 'Сегодня', value: today },
            { label: 'Вчера', value: addDays(today, -1) },
          ]}
          onApply={(r) => {
            setPeriod(r);
            setPeriodPicker(false);
          }}
          onClose={() => setPeriodPicker(false)}
        />
      )}

      {approachEdit && (!approachEdit.id || editingApproach) && (
        <ApproachEditor
          key={approachEdit.id || 'new'}
          approach={editingApproach}
          girl={editingApproach ? girlsById.get(editingApproach.girl_id) : null}
          seed={approachEdit.draft}
          today={today}
          places={allPlaces}
          onRefusal={recordRefusal}
          onContact={(draft) => startContact(draft)}
          onSave={saveApproach}
          onOpenGirl={(girlId) => {
            setApproachEdit(null);
            setEditing({ id: girlId });
          }}
          onDelete={() => {
            const a = editingApproach;
            setApproachEdit(null);
            deleteApproach(a.id);
          }}
          onClose={() => setApproachEdit(null)}
        />
      )}

      {(analyticsOpen || ownAnalytics) && (
        <GirlsAnalytics
          approaches={approaches}
          approachesReady={!approachesLoaded || approachesReady}
          girls={girls}
          today={today}
          initialFilter={dateFilter}
          mode={view.stats.mode}
          onMode={(mode) => setStats({ mode })}
          onClose={closeAnalytics}
        />
      )}

      {(editing?.isNew || editingGirl) && (
        <GirlEditor
          key={editing.isNew ? 'new' : editingGirl.id}
          girl={editingGirl}
          prefill={
            fromApproach
              ? { met_on: fromApproach.draft.happened_on, place: fromApproach.draft.place, comment: fromApproach.draft.note }
              : null
          }
          avatarUrl={editingGirl ? urlOf(editingGirl.avatar_path) : null}
          today={today}
          places={allPlaces}
          tasks={editingGirl ? tasks.filter((t) => t.girl_id === editingGirl.id) : []}
          tasksReady={tasksReady}
          onAddTask={(row) => addTask({ girl_id: editingGirl.id, ...row })}
          onUpdateTask={updateTask}
          onCompleteTask={completeTask}
          onDeleteTask={deleteTask}
          onOpenHistory={() => setHistoryId(editingGirl.id)}
          onSave={handleSave}
          onClose={() => {
            setEditing(null);
            // Back to the approach she came from, to pick «Отказ» or close it.
            if (fromApproach) setApproachEdit({ id: fromApproach.id || undefined, draft: fromApproach.draft });
          }}
          onArchive={() => {
            const g = editingGirl;
            setEditing(null);
            updateGirl(g.id, { archived: !g.archived });
            showNotice(g.archived ? `${g.name} — возвращена из архива` : `${g.name} — в архиве`);
          }}
          onDelete={() => {
            const g = editingGirl;
            setEditing(null);
            deleteGirl(g.id, g.avatar_path);
          }}
        />
      )}

      {taskEdit && (taskEdit.seed || editingItem) && (
        <GirlTaskEditor
          key={taskEdit.key || `new:${taskEdit.seed.girlId || ''}:${taskEdit.seed.kind || ''}:${taskEdit.seed.day || ''}`}
          item={editingItem}
          seed={taskEdit.seed}
          girls={activeGirls}
          kinds={tasksReady ? ALL_KINDS : ['date']}
          today={today}
          onSave={(fields) => saveTask(editingItem, fields)}
          onToggleDone={
            editingItem?.source === 'task'
              ? () => {
                  setTaskEdit(null);
                  toggleDone(editingItem);
                }
              : undefined
          }
          onDelete={() => deleteItem(editingItem)}
          onOpenGirl={(id) => {
            setTaskEdit(null);
            setEditing({ id });
          }}
          onClose={() => setTaskEdit(null)}
        />
      )}

      {historyGirl && (
        <GirlHistory
          key={historyGirl.id}
          girl={historyGirl}
          tasks={tasks}
          today={today}
          url={urlOf(historyGirl.avatar_path)}
          kinds={tasksReady ? ALL_KINDS : ['date']}
          onAdd={(fields) => addEntry(historyGirl, fields)}
          onEdit={(entry, fields) => editEntry(historyGirl, entry, fields)}
          onDelete={(entry) => deleteEntry(historyGirl, entry)}
          onToggle={(entry, done) => completeTask(entry.id, entry.day, done)}
          onOpenGirl={() => {
            setHistoryId(null);
            setEditing({ id: historyGirl.id });
          }}
          onClose={() => setHistoryId(null)}
        />
      )}
    </div>
  );
}

/** The nearest planned thing with her: icon, when, comment. Opens the whole story with her. */
function GirlCardPlan({ plan, today, onOpen }) {
  const next = plan[0];
  const late = next.day < today;
  return (
    <button
      type="button"
      className={`girl-card__task girl-card__task--${next.kind} ${late ? 'girl-card__task--late' : next.day === today ? 'girl-card__task--today' : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      onKeyDown={(e) => e.stopPropagation()}
      title={`${taskKind(next.kind).label}${late ? ' — просрочено' : ''} · история`}
    >
      <TaskKindIcon kind={next.kind} />
      <span className="girl-card__task-when">{formatWhen(next.day, next.time, today)}</span>
      <span className={`girl-card__task-note ${next.note ? '' : 'girl-card__task-note--kind'}`}>{next.note || taskKind(next.kind).label}</span>
      {plan.length > 1 && <span className="girl-card__task-more">+{plan.length - 1}</span>}
    </button>
  );
}

function GirlCard({ girl, url, today, plan, onOpen, onOpenHistory }) {
  const tel = phoneHref(girl.phone);
  const tg = telegramLink(girl.telegram);
  const next = nextDate(girl, today);
  const last = lastPastDate(girl, today);
  const meta = [girl.phone.trim(), tg?.label].filter(Boolean);
  const stop = (e) => e.stopPropagation();

  return (
    <li>
      <div
        className={`girl-card ${girl.archived ? 'girl-card--archived' : ''}`}
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onOpen();
          }
        }}
      >
        <Avatar name={girl.name} url={url} className="girl-card__avatar" />
        <div className="girl-card__body">
          <div className="girl-card__top">
            <span className="girl-card__name">{girl.name}</span>
            <span className="girl-card__met" title="Дата знакомства">{formatDate(girl.met_on)}</span>
          </div>
          {meta.length > 0 && <div className="girl-card__meta">{meta.join(' · ')}</div>}
          {girl.comment.trim() && <div className="girl-card__comment">{girl.comment}</div>}
          {!plan?.length && girl.dates.length > 0 && (
            <div className={`girl-card__date ${next ? 'girl-card__date--next' : ''}`}>
              {next
                ? `Свидание ${formatDateTime(next.date, next.time)}`
                : `${girl.dates.length} ${plural(girl.dates.length, 'свидание', 'свидания', 'свиданий')}${last ? ` · последнее ${formatDate(last.date)}` : ''}`}
            </div>
          )}
        </div>
        {(tel || tg) && (
          <div className="girl-card__actions">
            {tel && (
              <a className="girl-card__action" href={tel} onClick={stop} aria-label="Позвонить" title="Позвонить">
                <PhoneIcon />
              </a>
            )}
            {tg && (
              <a
                className="girl-card__action"
                href={tg.url}
                target="_blank"
                rel="noreferrer"
                onClick={stop}
                aria-label="Написать в Telegram"
                title="Написать в Telegram"
              >
                <TelegramIcon />
              </a>
            )}
          </div>
        )}
        {plan?.length > 0 && (
          <div className="girl-card__plan">
            <GirlCardPlan plan={plan} today={today} onOpen={onOpenHistory} />
          </div>
        )}
      </div>
    </li>
  );
}

function ApproachCard({ approach, girl, url, onOpen }) {
  const contact = approach.outcome === 'contact';
  const meta = [contact && !girl ? 'карточка удалена' : null, approach.place].filter(Boolean);
  return (
    <li>
      <div
        className={`girl-card approach-card ${contact ? 'approach-card--contact' : ''}`}
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onOpen();
          }
        }}
      >
        {contact && girl ? (
          <Avatar name={girl.name} url={url} className="girl-card__avatar" />
        ) : (
          <span className={`approach-card__mark ${contact ? 'approach-card__mark--contact' : ''}`} aria-hidden="true">
            {contact ? <CheckIcon /> : <CloseIcon />}
          </span>
        )}
        <div className="girl-card__body">
          <div className="girl-card__top">
            <span className="girl-card__name">
              {contact ? (girl ? girl.name : 'Контакт') : 'Отказ'}
              {contact && girl && <span className="approach-card__tag">контакт</span>}
            </span>
            {approach.time && <span className="girl-card__met">{approach.time}</span>}
          </div>
          {meta.length > 0 && <div className="girl-card__meta">{meta.join(' · ')}</div>}
          {approach.note && <div className="girl-card__comment">{approach.note}</div>}
        </div>
      </div>
    </li>
  );
}

function approachDraftOf(approach, today) {
  return {
    happened_on: approach?.happened_on ?? today,
    time: approach ? approach.time || '' : nowTime(),
    place: approach?.place ?? '',
    note: approach?.note ?? '',
  };
}

/**
 * A new approach is saved by its result: «Отказ» right away, «Контакт» opens
 * her card. An existing one is edited and saved with «Сохранить».
 */
function ApproachEditor({ approach, girl, seed, today, places, onRefusal, onContact, onSave, onOpenGirl, onDelete, onClose }) {
  const isNew = !approach;
  const [draft, setDraft] = useState(() => seed || approachDraftOf(approach, today));
  const [outcome, setOutcome] = useState(approach?.outcome ?? 'refusal');
  const [picker, setPicker] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const ids = useId();
  useModalClose(onClose);

  const set = (field) => (e) => {
    const value = e.target.value;
    setDraft((d) => ({ ...d, [field]: value }));
  };

  const title = isNew ? 'Новый подход' : 'Подход';
  const converting = !isNew && outcome === 'contact' && approach.outcome !== 'contact';

  return (
    <div
      className="girl-editor__overlay girl-editor__overlay--sheet"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="girl-editor girl-editor--sheet" role="dialog" aria-modal="true" aria-label={title}>
        <header className="girl-editor__head">
          <span className="girl-editor__title">{title}</span>
          <button type="button" className="girl-editor__close" onClick={onClose} aria-label="Закрыть">
            <CloseIcon />
          </button>
        </header>

        <form
          className="girl-editor__body"
          id={`${ids}-form`}
          onSubmit={(e) => {
            e.preventDefault();
            if (!isNew) onSave(draft, outcome);
          }}
          noValidate
        >
          <div className="girl-field-row approach-editor__row">
            <div className="girl-field">
              <span className="girl-field__label">Когда</span>
              <button type="button" className="girl-input girl-input--button" onClick={() => setPicker(true)}>
                <span>{formatDateTime(draft.happened_on, draft.time)}</span>
                <CalendarIcon />
              </button>
            </div>
            <label className="girl-field">
              <span className="girl-field__label">Где</span>
              <input
                className="girl-input"
                value={draft.place}
                onChange={set('place')}
                placeholder="Улица, кафе, ТЦ…"
                list={`${ids}-places`}
                autoComplete="off"
                maxLength={120}
              />
              <datalist id={`${ids}-places`}>
                {places.map((p) => <option key={p} value={p} />)}
              </datalist>
            </label>
          </div>

          <label className="girl-field">
            <span className="girl-field__label">Заметка</span>
            <textarea
              className="girl-input girl-input--area approach-editor__note"
              value={draft.note}
              onChange={set('note')}
              placeholder="Как подошёл, что ответила"
              rows={2}
              maxLength={1000}
            />
          </label>

          {isNew ? (
            <div className="approach-editor__outcomes">
              <button type="button" className="approach-outcome approach-outcome--refusal" onClick={() => onRefusal(draft)}>
                <CloseIcon />
                Отказ
              </button>
              <button type="button" className="approach-outcome approach-outcome--contact" onClick={() => onContact(draft)}>
                <CheckIcon />
                Контакт
              </button>
            </div>
          ) : (
            <div className="girl-field">
              <span className="girl-field__label">Результат</span>
              <div className="girls-stats__modes approach-editor__seg" role="radiogroup" aria-label="Результат">
                {[
                  ['refusal', 'Отказ'],
                  ['contact', 'Контакт'],
                ].map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    role="radio"
                    aria-checked={outcome === key}
                    className={`girls-stats__mode ${outcome === key ? 'girls-stats__mode--on' : ''}`}
                    onClick={() => setOutcome(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {outcome === 'contact' && girl && (
                <button type="button" className="approach-editor__girl" onClick={() => onOpenGirl(girl.id)}>
                  <span>Карточка: {girl.name}</span>
                  <span aria-hidden="true">→</span>
                </button>
              )}
              {converting && <p className="girl-editor__hint">После сохранения откроется карточка нового знакомства.</p>}
              {outcome === 'refusal' && approach.outcome === 'contact' && girl && (
                <p className="girl-editor__hint">Карточка «{girl.name}» останется во вкладке со знакомствами.</p>
              )}
            </div>
          )}
          {isNew && <p className="girl-editor__hint">«Контакт» откроет карточку нового знакомства.</p>}
        </form>

        {!isNew && (
          <footer className="girl-editor__foot">
            {confirmDelete ? (
              <>
                <span className="girl-editor__ask">Удалить этот подход?{girl ? ` Карточка «${girl.name}» останется.` : ''}</span>
                <button type="button" className="girl-btn girl-btn--ghost" onClick={() => setConfirmDelete(false)}>Отмена</button>
                <button type="button" className="girl-btn girl-btn--danger" onClick={onDelete}>Удалить</button>
              </>
            ) : (
              <>
                <button type="button" className="girl-btn girl-btn--ghost girl-btn--danger-text" onClick={() => setConfirmDelete(true)}>
                  Удалить
                </button>
                <span className="girl-editor__spacer" />
                <button type="submit" form={`${ids}-form`} className="girl-btn girl-btn--primary">
                  {converting ? 'Дальше' : 'Сохранить'}
                </button>
              </>
            )}
          </footer>
        )}
      </div>

      {picker && (
        <GirlsDatePicker
          title="Когда был подход"
          withTime
          timePresets={[]}
          value={draft.happened_on}
          time={draft.time || ''}
          quick={[
            { label: 'Сегодня', value: today },
            { label: 'Вчера', value: addDays(today, -1) },
          ]}
          onApply={({ date, time }) => {
            setDraft((d) => ({ ...d, happened_on: date, time: time || '' }));
            setPicker(false);
          }}
          onClose={() => setPicker(false)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------------

function draftOf(girl, today, prefill) {
  return {
    name: girl?.name ?? '',
    met_on: girl?.met_on ?? prefill?.met_on ?? today,
    phone: girl?.phone ?? '',
    telegram: girl?.telegram ?? '',
    place: girl?.place ?? prefill?.place ?? '',
    comment: girl?.comment ?? prefill?.comment ?? '',
    dates: (girl?.dates ?? []).map((d) => ({
      id: d.id || genGirlId(),
      date: d.date || '',
      time: d.time || '',
      note: d.note || '',
      pos: typeof d.pos === 'number' ? d.pos : null,
    })),
  };
}

function GirlEditor({
  girl,
  prefill,
  avatarUrl,
  today,
  places,
  tasks,
  tasksReady,
  onAddTask,
  onUpdateTask,
  onCompleteTask,
  onDeleteTask,
  onOpenHistory,
  onSave,
  onClose,
  onArchive,
  onDelete,
}) {
  const isNew = !girl;
  const [initial] = useState(() => draftOf(girl, today, prefill));
  const [draft, setDraft] = useState(initial);
  const [invalid, setInvalid] = useState({});
  const [confirm, setConfirm] = useState(null);
  // null — unchanged, { blob, preview } — a new photo, 'remove' — no photo.
  const [avatar, setAvatarDraft] = useState(null);
  const [photoState, setPhotoState] = useState(null);
  // null | { kind: 'met' } | { kind: 'date', id } | { kind: 'new' }
  const [picker, setPicker] = useState(null);
  // A new girl's plans wait for her card to be saved.
  const [newTasks, setNewTasks] = useState([]);
  // null | { id } | { seed: true }
  const [taskEdit, setTaskEdit] = useState(null);
  const ids = useId();
  const nameRef = useRef(null);
  const fileRef = useRef(null);
  const dirty = avatar !== null || newTasks.length > 0 || JSON.stringify(draft) !== JSON.stringify(initial);

  useEffect(() => {
    const preview = avatar?.preview;
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [avatar]);

  const set = (field) => (e) => {
    const value = e.target.value;
    setDraft((d) => ({ ...d, [field]: value }));
    if (invalid[field]) setInvalid((v) => ({ ...v, [field]: false }));
  };

  const patchDate = (id, patch) => {
    setDraft((d) => ({ ...d, dates: d.dates.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
  };

  const removeDate = (id) => setDraft((d) => ({ ...d, dates: d.dates.filter((x) => x.id !== id) }));

  const choosePhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setPhotoState('Это не изображение.');
      return;
    }
    setPhotoState('busy');
    try {
      const blob = await squareJpeg(file);
      setAvatarDraft({ blob, preview: URL.createObjectURL(blob) });
      setPhotoState(null);
    } catch (err) {
      setPhotoState(err.message || 'Не удалось обработать фото.');
    }
  };

  /** False when something has to be filled in first. */
  const save = () => {
    const errors = {};
    if (!draft.name.trim()) errors.name = true;
    if (Object.keys(errors).length) {
      setInvalid(errors);
      setConfirm(null);
      nameRef.current?.focus();
      return false;
    }
    onSave(
      {
        name: draft.name.trim(),
        met_on: draft.met_on || today,
        phone: draft.phone.trim(),
        telegram: draft.telegram.trim(),
        place: draft.place.trim(),
        comment: draft.comment.trim(),
        dates: sortDates(draft.dates.filter((d) => d.date)).map((d) => ({
          id: d.id,
          date: d.date,
          time: d.time || null,
          note: d.note.trim(),
          ...(d.pos != null ? { pos: d.pos } : {}),
        })),
      },
      avatar,
      newTasks,
    );
    return true;
  };

  // The history writes straight into her card, so unsaved edits are saved first.
  const openHistory = () => {
    if (dirty) {
      if (!save()) return;
    } else {
      onClose();
    }
    onOpenHistory();
  };

  const requestClose = () => {
    if (dirty) setConfirm('close');
    else onClose();
  };

  useModalClose(requestClose);

  // --- Связь ---------------------------------------------------------------

  const contactGirl = { id: girl?.id ?? 'new', name: draft.name.trim() || 'Без имени', phone: draft.phone, telegram: draft.telegram, dates: [] };
  const asItem = (t) => ({
    key: `task:${t.id}`,
    source: 'task',
    id: t.id,
    kind: t.kind,
    girl: contactGirl,
    day: t.due_on,
    time: t.time,
    note: t.note,
    done: !!t.done_at,
    createdAt: t.created_at,
  });
  const canPlan = tasksReady && !girl?.archived;
  const planned = (isNew ? newTasks : tasks.filter((t) => !t.done_at)).map(asItem).sort(compareItems);
  const history = tasks.filter((t) => t.done_at);
  const lastContact = girl ? lastContactOf(girl, tasks, today) : null;
  const editingTask = taskEdit?.id ? planned.find((it) => it.id === taskEdit.id) : null;

  const addPlanned = (row) => {
    if (isNew) setNewTasks((list) => [...list, { id: genGirlId(), ...row, created_at: new Date().toISOString() }]);
    else onAddTask(row);
  };

  const saveTask = ({ kind, day, time, note }) => {
    const row = { kind, due_on: day, time, note };
    const id = taskEdit?.id;
    setTaskEdit(null);
    if (!id) addPlanned(row);
    else if (isNew) setNewTasks((list) => list.map((t) => (t.id === id ? { ...t, ...row } : t)));
    else onUpdateTask(id, row);
  };

  const removeTask = (id) => {
    setTaskEdit(null);
    if (isNew) setNewTasks((list) => list.filter((t) => t.id !== id));
    else onDeleteTask(id);
  };

  const markDone = (it) => onCompleteTask(it.id, it.day, true);

  const tel = phoneHref(draft.phone);
  const tg = telegramLink(draft.telegram);
  const title = isNew ? 'Новое знакомство' : draft.name.trim() || 'Без имени';
  const photoUrl = avatar === 'remove' ? null : avatar?.preview || avatarUrl;
  const pickerEntry = picker?.kind === 'date' ? draft.dates.find((d) => d.id === picker.id) : null;

  return (
    <div
      className="girl-editor__overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) requestClose();
      }}
    >
      <div className="girl-editor" role="dialog" aria-modal="true" aria-label={title}>
        <header className="girl-editor__head">
          <span className="girl-editor__title">{title}</span>
          <button type="button" className="girl-editor__close" onClick={requestClose} aria-label="Закрыть">
            <CloseIcon />
          </button>
        </header>

        <form
          className="girl-editor__body"
          id={`${ids}-form`}
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
          noValidate
        >
          <div className="girl-photo">
            <button
              type="button"
              className="girl-photo__pic"
              onClick={() => fileRef.current?.click()}
              aria-label={photoUrl ? 'Сменить фото' : 'Добавить фото'}
              disabled={photoState === 'busy'}
            >
              <Avatar name={draft.name} url={photoUrl} className="girl-photo__avatar" />
              <span className="girl-photo__badge" aria-hidden="true">
                <CameraIcon />
              </span>
            </button>
            <div className="girl-photo__side">
              <div className="girl-photo__actions">
                <button
                  type="button"
                  className="girl-btn girl-btn--soft"
                  onClick={() => fileRef.current?.click()}
                  disabled={photoState === 'busy'}
                >
                  {photoState === 'busy' ? 'Обработка…' : photoUrl ? 'Сменить фото' : 'Добавить фото'}
                </button>
                {photoUrl && (
                  <button type="button" className="girl-btn girl-btn--ghost" onClick={() => setAvatarDraft(avatarUrl ? 'remove' : null)}>
                    Убрать
                  </button>
                )}
              </div>
              {photoState && photoState !== 'busy' && <span className="girl-photo__error">{photoState}</span>}
            </div>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={choosePhoto} />
          </div>

          <label className="girl-field">
            <span className="girl-field__label">Имя</span>
            <input
              ref={nameRef}
              className={`girl-input ${invalid.name ? 'girl-input--invalid' : ''}`}
              value={draft.name}
              onChange={set('name')}
              placeholder="Как её зовут"
              autoComplete="off"
              autoFocus={isNew}
              maxLength={120}
            />
          </label>

          <div className="girl-field-row">
            <div className="girl-field">
              <span className="girl-field__label">Дата знакомства</span>
              <button type="button" className="girl-input girl-input--button" onClick={() => setPicker({ kind: 'met' })}>
                <span>{formatDate(draft.met_on)}</span>
                <CalendarIcon />
              </button>
            </div>
            <label className="girl-field">
              <span className="girl-field__label">Где познакомились</span>
              <input
                className="girl-input"
                value={draft.place}
                onChange={set('place')}
                placeholder="Улица, кафе, Tinder…"
                list={`${ids}-places`}
                autoComplete="off"
                maxLength={120}
              />
              <datalist id={`${ids}-places`}>
                {places.map((p) => <option key={p} value={p} />)}
              </datalist>
            </label>
          </div>

          <div className="girl-field-row">
            <div className="girl-field">
              <label className="girl-field__label" htmlFor={`${ids}-phone`}>Телефон</label>
              <div className="girl-field__line">
                <input
                  id={`${ids}-phone`}
                  type="tel"
                  inputMode="tel"
                  className="girl-input"
                  value={draft.phone}
                  onChange={set('phone')}
                  placeholder="+7 900 000-00-00"
                  autoComplete="off"
                  maxLength={40}
                />
                {tel && (
                  <a className="girl-icon-btn" href={tel} aria-label="Позвонить" title="Позвонить">
                    <PhoneIcon />
                  </a>
                )}
              </div>
            </div>
            <div className="girl-field">
              <label className="girl-field__label" htmlFor={`${ids}-tg`}>Telegram</label>
              <div className="girl-field__line">
                <input
                  id={`${ids}-tg`}
                  className="girl-input"
                  value={draft.telegram}
                  onChange={set('telegram')}
                  placeholder="@username"
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  maxLength={80}
                />
                {tg && (
                  <a className="girl-icon-btn" href={tg.url} target="_blank" rel="noreferrer" aria-label="Открыть в Telegram" title="Открыть в Telegram">
                    <TelegramIcon />
                  </a>
                )}
              </div>
            </div>
          </div>

          <label className="girl-field">
            <span className="girl-field__label">Комментарий</span>
            <textarea
              className="girl-input girl-input--area"
              value={draft.comment}
              onChange={set('comment')}
              placeholder="Чем занимается, о чём говорили, что важно не забыть"
              rows={3}
            />
          </label>

          {tasksReady && (canPlan || planned.length > 0 || history.length > 0) && (
            <section className="girl-editor__dates girl-contacts">
              <div className="girl-editor__section-title">
                Связь
                {planned.length > 0 && <span className="girl-editor__section-count">{planned.length}</span>}
                {lastContact && (
                  <span className="girl-contacts__last">
                    {lastContact.kind === 'met' ? 'знакомство' : 'последняя'} {agoLabel(daysBetween(lastContact.day, today))}
                  </span>
                )}
              </div>
              {planned.map((it) => (
                <div key={it.id} className={`girl-task ${!isNew && it.day < today ? 'girl-task--late' : ''}`}>
                  <button type="button" className="girl-task__main" onClick={() => setTaskEdit({ id: it.id })}>
                    <span className={`plan-card__kind plan-card__kind--${it.kind} girl-task__kind`}>
                      <TaskKindIcon kind={it.kind} />
                    </span>
                    <span className="girl-task__when">{formatWhen(it.day, it.time, today)}</span>
                    <span className={`girl-task__note ${it.note ? '' : 'girl-task__note--kind'}`}>{it.note || taskKind(it.kind).label}</span>
                  </button>
                  {isNew ? (
                    <button type="button" className="girl-date__remove" onClick={() => removeTask(it.id)} aria-label="Убрать" title="Убрать">
                      <CloseIcon />
                    </button>
                  ) : (
                    <button type="button" className="plan-card__check" onClick={() => markDone(it)} aria-label="Выполнено" title="Выполнено">
                      <CheckIcon />
                    </button>
                  )}
                </div>
              ))}
              {canPlan && (
                <div className="girl-contacts__quick">
                  <span className="girl-contacts__label">Написать:</span>
                  {quickDays(today).map((q) => (
                    <button
                      key={q.label}
                      type="button"
                      className="girls__chip"
                      onClick={() => addPlanned({ kind: 'message', due_on: q.value, time: null, note: '' })}
                    >
                      {q.label.toLowerCase()}
                    </button>
                  ))}
                  <button type="button" className="girls__chip" onClick={() => setTaskEdit({ seed: true })}>
                    <PlusIcon />
                    Другое
                  </button>
                </div>
              )}
              {!isNew && (
                <button type="button" className="girl-contacts__all" onClick={openHistory}>
                  <span>Вся история{history.length > 0 ? ` · ${history.length} ${plural(history.length, 'запись', 'записи', 'записей')}` : ''}</span>
                  <span aria-hidden="true">→</span>
                </button>
              )}
            </section>
          )}

          <section className="girl-editor__dates">
            <div className="girl-editor__section-title">
              Свидания
              {draft.dates.length > 0 && <span className="girl-editor__section-count">{draft.dates.length}</span>}
            </div>
            {draft.dates.map((d) => {
              const upcoming = d.date >= today;
              return (
                <div key={d.id} className={`girl-date ${upcoming ? 'girl-date--next' : ''}`}>
                  <span className="girl-date__status">{upcoming ? 'Назначено' : 'Было'}</span>
                  <button
                    type="button"
                    className="girl-input girl-input--button girl-date__pick"
                    onClick={() => setPicker({ kind: 'date', id: d.id })}
                    aria-label="Дата и время свидания"
                  >
                    <span>{formatDateTime(d.date, d.time)}</span>
                    <CalendarIcon />
                  </button>
                  <button type="button" className="girl-date__remove" onClick={() => removeDate(d.id)} aria-label="Убрать свидание" title="Убрать">
                    <CloseIcon />
                  </button>
                  <input
                    className="girl-input girl-date__note"
                    value={d.note}
                    onChange={(e) => patchDate(d.id, { note: e.target.value })}
                    placeholder="Где, как прошло"
                    autoComplete="off"
                    maxLength={500}
                  />
                </div>
              );
            })}
            <button type="button" className="girl-editor__add-date" onClick={() => setPicker({ kind: 'new' })}>
              <PlusIcon />
              {draft.dates.length ? 'Ещё свидание' : 'Назначить свидание'}
            </button>
            {draft.dates.length === 0 && (
              <p className="girl-editor__hint">С первым свиданием знакомство перейдёт во вкладку «Свидания».</p>
            )}
          </section>
        </form>

        <footer className="girl-editor__foot">
          {confirm === 'close' ? (
            <>
              <span className="girl-editor__ask">Сохранить изменения?</span>
              <button type="button" className="girl-btn girl-btn--ghost" onClick={onClose}>Не сохранять</button>
              <button type="button" className="girl-btn girl-btn--primary" onClick={save}>Сохранить</button>
            </>
          ) : confirm === 'delete' ? (
            <>
              <span className="girl-editor__ask">Удалить «{girl?.name}» навсегда?</span>
              <button type="button" className="girl-btn girl-btn--ghost" onClick={() => setConfirm(null)}>Отмена</button>
              <button type="button" className="girl-btn girl-btn--danger" onClick={onDelete}>Удалить</button>
            </>
          ) : (
            <>
              {!isNew && (
                <>
                  <button type="button" className="girl-btn girl-btn--ghost girl-btn--danger-text" onClick={() => setConfirm('delete')}>
                    Удалить
                  </button>
                  <button type="button" className="girl-btn girl-btn--ghost" onClick={onArchive}>
                    {girl.archived ? 'Из архива' : 'В архив'}
                  </button>
                </>
              )}
              <span className="girl-editor__spacer" />
              <button type="submit" form={`${ids}-form`} className="girl-btn girl-btn--primary">
                {isNew ? 'Добавить' : 'Сохранить'}
              </button>
            </>
          )}
        </footer>
      </div>

      {picker?.kind === 'met' && (
        <GirlsDatePicker
          title="Дата знакомства"
          value={draft.met_on}
          quick={[
            { label: 'Сегодня', value: today },
            { label: 'Вчера', value: addDays(today, -1) },
          ]}
          onApply={({ date }) => {
            setDraft((d) => ({ ...d, met_on: date }));
            setPicker(null);
          }}
          onClose={() => setPicker(null)}
        />
      )}
      {(picker?.kind === 'new' || pickerEntry) && (
        <GirlsDatePicker
          title={picker.kind === 'new' ? 'Новое свидание' : 'Свидание'}
          withTime
          value={pickerEntry ? pickerEntry.date : today}
          time={pickerEntry?.time || ''}
          quick={[
            { label: 'Вчера', value: addDays(today, -1) },
            { label: 'Сегодня', value: today },
            { label: 'Завтра', value: addDays(today, 1) },
          ]}
          onApply={({ date, time }) => {
            if (pickerEntry) patchDate(pickerEntry.id, { date, time: time || '' });
            else setDraft((d) => ({ ...d, dates: [...d.dates, { id: genGirlId(), date, time: time || '', note: '' }] }));
            setPicker(null);
          }}
          onClose={() => setPicker(null)}
        />
      )}
      {taskEdit && (taskEdit.seed || editingTask) && (
        <GirlTaskEditor
          key={taskEdit.id || 'new'}
          item={editingTask}
          seed={{ girlId: contactGirl.id, kind: 'message', day: today }}
          girls={[contactGirl]}
          kinds={CONTACT_KINDS}
          today={today}
          onSave={saveTask}
          onToggleDone={
            editingTask && !isNew
              ? () => {
                  setTaskEdit(null);
                  markDone(editingTask);
                }
              : undefined
          }
          onDelete={() => removeTask(editingTask.id)}
          onClose={() => setTaskEdit(null)}
        />
      )}
    </div>
  );
}
