import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useGirls, useAvatarUrls, genGirlId } from '../hooks/useGirls';
import {
  DATE_PRESETS,
  addDays,
  avatarColor,
  dateKey,
  filterRange,
  formatDate,
  formatDateTime,
  formatRange,
  inRange,
  lastPastDate,
  matches,
  nextDate,
  phoneHref,
  plural,
  sortGirls,
  squareJpeg,
  stageOf,
  telegramLink,
  todayStr,
} from '../lib/girls';
import { GirlsDatePicker } from './GirlsDatePicker';
import { GirlsStats } from './GirlsStats';
import './GirlsView.css';

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

const DEFAULT_VIEW = {
  tab: 'meet',
  sort: { meet: 'new', dating: 'upcoming' },
  stats: { open: true, mode: 'week' },
};

function loadView() {
  try {
    const v = JSON.parse(localStorage.getItem(VIEW_KEY) || 'null');
    const tab = TABS.some((t) => t.key === v?.tab) ? v.tab : DEFAULT_VIEW.tab;
    const sort = { ...DEFAULT_VIEW.sort };
    for (const t of TABS) {
      if (SORTS[t.key].some(([k]) => k === v?.sort?.[t.key])) sort[t.key] = v.sort[t.key];
    }
    const stats = {
      open: typeof v?.stats?.open === 'boolean' ? v.stats.open : DEFAULT_VIEW.stats.open,
      mode: v?.stats?.mode === 'month' ? 'month' : 'week',
    };
    return { tab, sort, stats };
  } catch {
    return DEFAULT_VIEW;
  }
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
const CalendarIcon = () => (
  <Icon className="girl-input__icon">
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M16 3v4M8 3v4M3 10h18" />
  </Icon>
);
const CameraIcon = () => (
  <Icon>
    <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
    <circle cx="12" cy="13" r="3.5" />
  </Icon>
);

function Avatar({ name, url, className = '' }) {
  if (url) return <img className={`girl-avatar girl-avatar--photo ${className}`} src={url} alt="" draggable={false} />;
  return (
    <span className={`girl-avatar ${className}`} style={{ background: avatarColor(name) }} aria-hidden="true">
      {name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  );
}

// ---------------------------------------------------------------------------
// View
// ---------------------------------------------------------------------------

export function GirlsView() {
  const { girls, loaded, error, dismissError, addGirl, updateGirl, deleteGirl, setAvatar, clearAvatar } = useGirls();
  const [view, setView] = useState(loadView);
  const [query, setQuery] = useState('');
  const [dateFilter, setDateFilter] = useState({ key: 'all' });
  const [periodPicker, setPeriodPicker] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const [editing, setEditing] = useState(null);
  const [notice, setNotice] = useState(null);
  const noticeTimer = useRef(null);
  const today = todayStr();
  const urlOf = useAvatarUrls(girls.map((g) => g.avatar_path));

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
  const range = filterRange(dateFilter, today);

  const inPeriod = girls.filter((g) => inRange(g.met_on, range));
  const counts = { meet: 0, dating: 0 };
  for (const g of inPeriod) if (!g.archived) counts[stageOf(g)] += 1;

  const filtered = inPeriod.filter((g) => stageOf(g) === tab && matches(g, q));
  const list = sortGirls(filtered.filter((g) => !g.archived), sort, today);
  const archivedList = sortGirls(filtered.filter((g) => g.archived), sort, today);

  const allPlaces = useMemo(
    () => [...new Set(girls.map((g) => g.place.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru')),
    [girls],
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

  const handleSave = async (fields, avatar) => {
    const stage = fields.dates.length > 0 ? 'dating' : 'meet';
    if (editing?.isNew) {
      setEditing(null);
      const id = await addGirl(fields);
      if (!id) return;
      if (stage !== tab) switchTab(stage);
      if (avatar?.blob) setAvatar(id, avatar.blob, '');
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

      <div className="girls__chips" role="group" aria-label="Дата знакомства">
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

      {!loaded && !error ? (
        <p className="girls__empty">Загрузка…</p>
      ) : list.length === 0 ? (
        <p className="girls__empty">{emptyText}</p>
      ) : (
        <ul className="girls__list">
          {list.map((g) => (
            <GirlCard key={g.id} girl={g} url={urlOf(g.avatar_path)} today={today} onOpen={() => setEditing({ id: g.id })} />
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
                <GirlCard key={g.id} girl={g} url={urlOf(g.avatar_path)} today={today} onOpen={() => setEditing({ id: g.id })} />
              ))}
            </ul>
          )}
        </div>
      )}

      <button type="button" className="girls__fab" onClick={() => setEditing({ isNew: true })} aria-label="Добавить">
        <PlusIcon />
      </button>

      {periodPicker && (
        <GirlsDatePicker
          mode="range"
          title="Дата знакомства"
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

      {(editing?.isNew || editingGirl) && (
        <GirlEditor
          key={editing.isNew ? 'new' : editingGirl.id}
          girl={editingGirl}
          avatarUrl={editingGirl ? urlOf(editingGirl.avatar_path) : null}
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
            deleteGirl(g.id, g.avatar_path);
          }}
        />
      )}
    </div>
  );
}

function GirlCard({ girl, url, today, onOpen }) {
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
          {girl.dates.length > 0 && (
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

function GirlEditor({ girl, avatarUrl, today, places, onSave, onClose, onArchive, onDelete }) {
  const isNew = !girl;
  const [initial] = useState(() => draftOf(girl, today));
  const [draft, setDraft] = useState(initial);
  const [invalid, setInvalid] = useState({});
  const [confirm, setConfirm] = useState(null);
  // null — unchanged, { blob, preview } — a new photo, 'remove' — no photo.
  const [avatar, setAvatarDraft] = useState(null);
  const [photoState, setPhotoState] = useState(null);
  // null | { kind: 'met' } | { kind: 'date', id } | { kind: 'new' }
  const [picker, setPicker] = useState(null);
  const ids = useId();
  const nameRef = useRef(null);
  const fileRef = useRef(null);
  const dirty = avatar !== null || JSON.stringify(draft) !== JSON.stringify(initial);

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

  const save = () => {
    const errors = {};
    if (!draft.name.trim()) errors.name = true;
    if (Object.keys(errors).length) {
      setInvalid(errors);
      setConfirm(null);
      nameRef.current?.focus();
      return;
    }
    onSave(
      {
        name: draft.name.trim(),
        met_on: draft.met_on || today,
        phone: draft.phone.trim(),
        telegram: draft.telegram.trim(),
        place: draft.place.trim(),
        comment: draft.comment.trim(),
        dates: draft.dates
          .filter((d) => d.date)
          .sort((a, b) => (dateKey(a) < dateKey(b) ? -1 : 1))
          .map((d) => ({ id: d.id, date: d.date, time: d.time || null, note: d.note.trim() })),
      },
      avatar,
    );
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
    </div>
  );
}
