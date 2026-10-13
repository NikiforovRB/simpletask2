import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useGirls, genGirlId } from '../hooks/useGirls';
import { toLocalDateString, WEEKDAY_SHORT_RU } from '../constants';
import './GirlsView.css';

const MONTH_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const AVATAR_COLORS = ['#e8789b', '#b48cf2', '#5a86ee', '#3fb3a8', '#e0a34a', '#e07a5f', '#8fa3bf'];
const VIEW_KEY = 'girls_view_v1';

const TABS = [
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

const DEFAULT_VIEW = { tab: 'meet', sort: { meet: 'new', dating: 'upcoming' } };

function loadView() {
  try {
    const v = JSON.parse(localStorage.getItem(VIEW_KEY) || 'null');
    const tab = TABS.some((t) => t.key === v?.tab) ? v.tab : DEFAULT_VIEW.tab;
    const sort = { ...DEFAULT_VIEW.sort };
    for (const t of TABS) {
      if (SORTS[t.key].some(([k]) => k === v?.sort?.[t.key])) sort[t.key] = v.sort[t.key];
    }
    return { tab, sort };
  } catch {
    return DEFAULT_VIEW;
  }
}

// ---------------------------------------------------------------------------
// Dates and contacts
// ---------------------------------------------------------------------------

const todayStr = () => toLocalDateString(new Date());
const parseDay = (s) => new Date(`${s}T12:00:00`);

function formatDay(s) {
  const d = parseDay(s);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return `${d.getDate()} ${MONTH_SHORT[d.getMonth()]}${sameYear ? '' : ` ${d.getFullYear()}`}`;
}

function formatDateEntry(entry, today) {
  const tomorrow = new Date(parseDay(today));
  tomorrow.setDate(tomorrow.getDate() + 1);
  let label;
  if (entry.date === today) label = 'сегодня';
  else if (entry.date === toLocalDateString(tomorrow)) label = 'завтра';
  else label = `${WEEKDAY_SHORT_RU[parseDay(entry.date).getDay()]}, ${formatDay(entry.date)}`;
  return entry.time ? `${label}, ${entry.time}` : label;
}

const dateKey = (entry) => `${entry.date} ${entry.time || '00:00'}`;

function nextDate(girl, today) {
  let best = null;
  for (const d of girl.dates) {
    if (d.date >= today && (!best || dateKey(d) < dateKey(best))) best = d;
  }
  return best;
}

function lastPastDate(girl, today) {
  let best = null;
  for (const d of girl.dates) {
    if (d.date < today && (!best || dateKey(d) > dateKey(best))) best = d;
  }
  return best;
}

const latestKey = (girl) => girl.dates.reduce((max, d) => (dateKey(d) > max ? dateKey(d) : max), '');
const stageOf = (girl) => (girl.dates.length > 0 ? 'dating' : 'meet');

function plural(n, one, few, many) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

function phoneHref(phone) {
  const digits = String(phone || '').replace(/[^\d+]/g, '');
  return digits.replace(/\D/g, '').length >= 5 ? `tel:${digits}` : null;
}

/** «@name», «name», «t.me/name» or a phone number → a link to the chat. */
function telegramLink(raw) {
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

function avatarColor(name) {
  let h = 0;
  for (const ch of String(name)) h = (h * 31 + ch.codePointAt(0)) | 0;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function sortGirls(list, sort, today) {
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

function matches(girl, q) {
  if (!q) return true;
  const text = [girl.name, girl.place, girl.comment, girl.telegram, girl.phone, ...girl.dates.map((d) => d.note || '')]
    .join(' ')
    .toLowerCase();
  if (text.includes(q)) return true;
  const digits = q.replace(/\D/g, '');
  return digits.length >= 3 && String(girl.phone || '').replace(/\D/g, '').includes(digits);
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function Icon({ children, className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

const PhoneIcon = () => (
  <Icon>
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
  </Icon>
);
const SendIcon = () => (
  <Icon>
    <path d="M22 2 11 13" />
    <path d="M22 2 15 22l-4-9-9-4 20-7z" />
  </Icon>
);
const SearchIcon = () => (
  <Icon className="girls__search-icon">
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </Icon>
);
const PlusIcon = () => (
  <Icon>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);
const CloseIcon = () => (
  <Icon>
    <path d="M18 6 6 18M6 6l12 12" />
  </Icon>
);

// ---------------------------------------------------------------------------
// View
// ---------------------------------------------------------------------------

export function GirlsView() {
  const { girls, loaded, error, dismissError, addGirl, updateGirl, deleteGirl } = useGirls();
  const [view, setView] = useState(loadView);
  const [query, setQuery] = useState('');
  const [place, setPlace] = useState(null);
  const [showArchive, setShowArchive] = useState(false);
  const [editing, setEditing] = useState(null);
  const [notice, setNotice] = useState(null);
  const noticeTimer = useRef(null);
  const today = todayStr();

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_KEY, JSON.stringify(view));
    } catch {
      /* ignore */
    }
  }, [view]);

  useEffect(() => () => clearTimeout(noticeTimer.current), []);

  const tab = view.tab;
  const sort = view.sort[tab];
  const q = query.trim().toLowerCase();

  const counts = useMemo(() => {
    const c = { meet: 0, dating: 0, archived: 0 };
    for (const g of girls) {
      if (g.archived) c.archived += 1;
      else c[stageOf(g)] += 1;
    }
    return c;
  }, [girls]);

  const inTab = useMemo(() => girls.filter((g) => stageOf(g) === tab), [girls, tab]);

  const places = useMemo(() => {
    const byPlace = new Map();
    for (const g of inTab) {
      const p = g.place.trim();
      if (!g.archived && p) byPlace.set(p, (byPlace.get(p) || 0) + 1);
    }
    return [...byPlace.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ru'));
  }, [inTab]);

  const allPlaces = useMemo(
    () => [...new Set(girls.map((g) => g.place.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru')),
    [girls],
  );

  const filtered = inTab.filter((g) => matches(g, q) && (!place || g.place.trim() === place));
  const list = sortGirls(filtered.filter((g) => !g.archived), sort, today);
  const archivedList = sortGirls(filtered.filter((g) => g.archived), sort, today);

  const showNotice = (text) => {
    clearTimeout(noticeTimer.current);
    setNotice(text);
    noticeTimer.current = setTimeout(() => setNotice(null), 4000);
  };

  const switchTab = (key) => {
    setView((v) => ({ ...v, tab: key }));
    setPlace(null);
  };

  const editingGirl = editing && !editing.isNew ? girls.find((g) => g.id === editing.id) : null;

  const handleSave = async (fields) => {
    const stage = fields.dates.length > 0 ? 'dating' : 'meet';
    if (editing?.isNew) {
      setEditing(null);
      const id = await addGirl(fields);
      if (id && stage !== tab) switchTab(stage);
      return;
    }
    if (!editingGirl) return;
    const before = stageOf(editingGirl);
    setEditing(null);
    await updateGirl(editingGirl.id, fields);
    if (before !== stage) {
      showNotice(`${fields.name} — теперь в «${stage === 'dating' ? 'Свиданиях' : 'Знакомствах'}»`);
    }
  };

  const emptyText = (() => {
    if (q || place) return 'Ничего не найдено.';
    if (tab === 'meet') return 'Пока никого. Нажмите «Добавить», чтобы записать первое знакомство.';
    return 'Свиданий пока нет. Откройте знакомство и назначьте свидание — оно появится здесь.';
  })();

  return (
    <div className="girls">
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
        <button type="button" className="girls__add" onClick={() => setEditing({ isNew: true })}>
          <PlusIcon />
          <span>Добавить</span>
        </button>
      </div>

      {places.length >= 2 && (
        <div className="girls__chips">
          <button
            type="button"
            className={`girls__chip ${!place ? 'girls__chip--on' : ''}`}
            onClick={() => setPlace(null)}
          >
            Все
          </button>
          {places.map(([p, n]) => (
            <button
              key={p}
              type="button"
              className={`girls__chip ${place === p ? 'girls__chip--on' : ''}`}
              onClick={() => setPlace(place === p ? null : p)}
            >
              {p}
              <span className="girls__chip-count">{n}</span>
            </button>
          ))}
        </div>
      )}

      {!loaded && !error ? (
        <p className="girls__empty">Загрузка…</p>
      ) : list.length === 0 ? (
        <p className="girls__empty">{emptyText}</p>
      ) : (
        <ul className="girls__list">
          {list.map((g) => (
            <GirlCard key={g.id} girl={g} today={today} onOpen={() => setEditing({ id: g.id })} />
          ))}
        </ul>
      )}

      {archivedList.length > 0 && (
        <div className="girls__archive">
          <button type="button" className="girls__archive-toggle" onClick={() => setShowArchive((v) => !v)}>
            {showArchive ? 'Скрыть архив' : 'Архив'} · {archivedList.length}
          </button>
          {showArchive && (
            <ul className="girls__list girls__list--archived">
              {archivedList.map((g) => (
                <GirlCard key={g.id} girl={g} today={today} onOpen={() => setEditing({ id: g.id })} />
              ))}
            </ul>
          )}
        </div>
      )}

      <button type="button" className="girls__fab" onClick={() => setEditing({ isNew: true })} aria-label="Добавить">
        <PlusIcon />
      </button>

      {(editing?.isNew || editingGirl) && (
        <GirlEditor
          key={editing.isNew ? 'new' : editingGirl.id}
          girl={editingGirl}
          today={today}
          places={allPlaces}
          onSave={handleSave}
          onClose={() => setEditing(null)}
          onArchive={() => {
            const g = editingGirl;
            setEditing(null);
            updateGirl(g.id, { archived: !g.archived });
            showNotice(g.archived ? `${g.name} — возвращена из архива` : `${g.name} — в архиве`);
          }}
          onDelete={() => {
            const g = editingGirl;
            setEditing(null);
            deleteGirl(g.id);
          }}
        />
      )}
    </div>
  );
}

function GirlCard({ girl, today, onOpen }) {
  const tel = phoneHref(girl.phone);
  const tg = telegramLink(girl.telegram);
  const next = nextDate(girl, today);
  const last = lastPastDate(girl, today);
  const meta = [girl.place.trim(), girl.phone.trim(), tg?.label].filter(Boolean);
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
        <span className="girl-card__avatar" style={{ background: avatarColor(girl.name) }} aria-hidden="true">
          {girl.name.trim().charAt(0).toUpperCase()}
        </span>
        <div className="girl-card__body">
          <div className="girl-card__top">
            <span className="girl-card__name">{girl.name}</span>
            <span className="girl-card__met" title="Дата знакомства">{formatDay(girl.met_on)}</span>
          </div>
          {meta.length > 0 && <div className="girl-card__meta">{meta.join(' · ')}</div>}
          {girl.comment.trim() && <div className="girl-card__comment">{girl.comment}</div>}
          {girl.dates.length > 0 && (
            <div className={`girl-card__date ${next ? 'girl-card__date--next' : ''}`}>
              {next
                ? `Свидание ${formatDateEntry(next, today)}`
                : `${girl.dates.length} ${plural(girl.dates.length, 'свидание', 'свидания', 'свиданий')}${last ? ` · последнее ${formatDay(last.date)}` : ''}`}
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
                <SendIcon />
              </a>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------------

function draftOf(girl, today) {
  return {
    name: girl?.name ?? '',
    met_on: girl?.met_on ?? today,
    phone: girl?.phone ?? '',
    telegram: girl?.telegram ?? '',
    place: girl?.place ?? '',
    comment: girl?.comment ?? '',
    dates: (girl?.dates ?? []).map((d) => ({ id: d.id || genGirlId(), date: d.date || '', time: d.time || '', note: d.note || '' })),
  };
}

function GirlEditor({ girl, today, places, onSave, onClose, onArchive, onDelete }) {
  const isNew = !girl;
  const [initial] = useState(() => draftOf(girl, today));
  const [draft, setDraft] = useState(initial);
  const [invalid, setInvalid] = useState({});
  const [confirm, setConfirm] = useState(null);
  const ids = useId();
  const nameRef = useRef(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);

  const set = (field) => (e) => {
    const value = e.target.value;
    setDraft((d) => ({ ...d, [field]: value }));
    if (invalid[field]) setInvalid((v) => ({ ...v, [field]: false }));
  };

  const setDate = (id, field, value) => {
    setDraft((d) => ({ ...d, dates: d.dates.map((x) => (x.id === id ? { ...x, [field]: value } : x)) }));
    if (field === 'date' && invalid[`date:${id}`]) setInvalid((v) => ({ ...v, [`date:${id}`]: false }));
  };

  const addDate = () => {
    setDraft((d) => ({ ...d, dates: [...d.dates, { id: genGirlId(), date: today, time: '', note: '' }] }));
  };

  const removeDate = (id) => setDraft((d) => ({ ...d, dates: d.dates.filter((x) => x.id !== id) }));

  const save = () => {
    const errors = {};
    if (!draft.name.trim()) errors.name = true;
    for (const d of draft.dates) if (!d.date) errors[`date:${d.id}`] = true;
    if (Object.keys(errors).length) {
      setInvalid(errors);
      setConfirm(null);
      if (errors.name) nameRef.current?.focus();
      return;
    }
    onSave({
      name: draft.name.trim(),
      met_on: draft.met_on || today,
      phone: draft.phone.trim(),
      telegram: draft.telegram.trim(),
      place: draft.place.trim(),
      comment: draft.comment.trim(),
      dates: [...draft.dates]
        .sort((a, b) => (dateKey(a) < dateKey(b) ? -1 : 1))
        .map((d) => ({ id: d.id, date: d.date, time: d.time || null, note: d.note.trim() })),
    });
  };

  const requestClose = () => {
    if (dirty) setConfirm('close');
    else onClose();
  };

  const requestCloseRef = useRef(requestClose);
  useEffect(() => {
    requestCloseRef.current = requestClose;
  });

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        requestCloseRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, []);

  const tel = phoneHref(draft.phone);
  const tg = telegramLink(draft.telegram);
  const title = isNew ? 'Новое знакомство' : draft.name.trim() || 'Без имени';

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
            <label className="girl-field">
              <span className="girl-field__label">Дата знакомства</span>
              <input type="date" className="girl-input" value={draft.met_on} onChange={set('met_on')} />
            </label>
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
                    <SendIcon />
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

          <section className="girl-editor__dates">
            <div className="girl-editor__section-title">
              Свидания
              {draft.dates.length > 0 && <span className="girl-editor__section-count">{draft.dates.length}</span>}
            </div>
            {draft.dates.map((d) => {
              const upcoming = !!d.date && d.date >= today;
              return (
                <div key={d.id} className={`girl-date ${upcoming ? 'girl-date--next' : ''}`}>
                  <span className="girl-date__status">{d.date ? (upcoming ? 'Назначено' : 'Было') : 'Дата?'}</span>
                  <input
                    type="date"
                    className={`girl-input girl-date__day ${invalid[`date:${d.id}`] ? 'girl-input--invalid' : ''}`}
                    value={d.date}
                    onChange={(e) => setDate(d.id, 'date', e.target.value)}
                    aria-label="Дата свидания"
                  />
                  <input
                    type="time"
                    className="girl-input girl-date__time"
                    value={d.time}
                    onChange={(e) => setDate(d.id, 'time', e.target.value)}
                    aria-label="Время (необязательно)"
                  />
                  <button type="button" className="girl-date__remove" onClick={() => removeDate(d.id)} aria-label="Убрать свидание" title="Убрать">
                    <CloseIcon />
                  </button>
                  <input
                    className="girl-input girl-date__note"
                    value={d.note}
                    onChange={(e) => setDate(d.id, 'note', e.target.value)}
                    placeholder="Где, как прошло"
                    autoComplete="off"
                    maxLength={500}
                  />
                </div>
              );
            })}
            <button type="button" className="girl-editor__add-date" onClick={addDate}>
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
    </div>
  );
}
