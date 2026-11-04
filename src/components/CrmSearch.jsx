import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { clientIndex, searchClients } from '../lib/crm';
import './KanbanCrm.css';

function SearchGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="2" />
      <path d="M16 16l4.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** The name with the part that was searched for picked out. */
function Marked({ text, query }) {
  const q = query.trim().toLowerCase().replace(/ё/g, 'е');
  const at = q ? text.toLowerCase().replace(/ё/g, 'е').indexOf(q) : -1;
  if (at < 0) return text;
  return (
    <>
      {text.slice(0, at)}
      <mark>{text.slice(at, at + q.length)}</mark>
      {text.slice(at + q.length)}
    </>
  );
}

/**
 * Finding a client on a CRM board by name or phone. The field slides out of
 * the button beside the menu; what it finds is listed under it.
 */
export function CrmSearch({ cards, columns, onOpen }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [listOpen, setListOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const index = useMemo(() => clientIndex(cards), [cards]);
  const asked = useDeferredValue(query);
  const results = useMemo(() => searchClients(index, asked), [index, asked]);
  const stages = useMemo(() => new Map(columns.map((c) => [c.id, c.title || 'Без названия'])), [columns]);
  const searching = asked.trim().length >= 2;

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (rootRef.current?.contains(e.target)) return;
      setListOpen(false);
      if (!inputRef.current?.value) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  useEffect(() => {
    listRef.current?.children[active]?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const close = () => {
    setOpen(false);
    setListOpen(false);
    setQuery('');
  };

  const pick = (card) => {
    close();
    onOpen(card.id);
  };

  return (
    <div className={`crm-search ${open ? 'crm-search--open' : ''}`} ref={rootRef}>
      <button
        type="button"
        className="crm-search__btn"
        onClick={() => (open ? close() : setOpen(true))}
        aria-label="Поиск клиента"
        title="Поиск клиента"
        aria-expanded={open}
      >
        <SearchGlyph />
      </button>
      <input
        ref={inputRef}
        className="crm-search__input"
        type="search"
        autoComplete="off"
        spellCheck={false}
        placeholder="Имя или телефон"
        aria-label="Поиск клиента"
        value={query}
        inert={!open}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setListOpen(true);
        }}
        onFocus={() => setListOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            if (query) setQuery('');
            else close();
          } else if (e.key === 'ArrowDown' && results.length) {
            e.preventDefault();
            setActive((i) => (i + 1) % results.length);
          } else if (e.key === 'ArrowUp' && results.length) {
            e.preventDefault();
            setActive((i) => (i - 1 + results.length) % results.length);
          } else if (e.key === 'Enter' && results[active]) {
            e.preventDefault();
            pick(results[active]);
          }
        }}
      />
      {open && listOpen && searching && (
        <div className="crm-search__results">
          {results.length === 0 ? (
            <div className="crm-search__empty">Ничего не найдено</div>
          ) : (
            <ul ref={listRef} className="crm-search__list" role="listbox">
              {results.map((card, i) => {
                const stage = card.column_id ? stages.get(card.column_id) : null;
                return (
                  <li key={card.id} role="option" aria-selected={i === active}>
                    <button
                      type="button"
                      className={`crm-search__row ${i === active ? 'crm-search__row--active' : ''}`}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => pick(card)}
                    >
                      <span className="crm-search__name">
                        <Marked text={card.title || 'Без названия'} query={asked} />
                      </span>
                      {(card.phone || stage) && (
                        <span className="crm-search__meta">
                          {[card.phone, stage].filter(Boolean).join(' · ')}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
