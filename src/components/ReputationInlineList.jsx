import { promiseState } from '../hooks/useReputation';
import './ReputationInlineList.css';

const fmtMinutes = (min) => {
  if (min == null) return '—';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h && m) return `${h} ч ${m} мин`;
  if (h) return `${h} ч`;
  return `${m} мин`;
};

function metricsText(promise) {
  if (promise.kind === 'time') {
    return `${fmtMinutes(promise.fact_value)} из ${fmtMinutes(promise.plan_value)}`;
  }
  if (promise.kind === 'count') {
    const fact = promise.fact_value ?? '—';
    const plan = promise.plan_value ?? '—';
    return `${fact} из ${plan}`;
  }
  return null;
}

function Mark({ state }) {
  if (state === 'done') {
    return (
      <svg width="10" height="10" viewBox="0 0 16 16" aria-hidden>
        <path d="M3 8.5l3.5 3.5L13 5" stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (state === 'failed') {
    return (
      <svg width="10" height="10" viewBox="0 0 16 16" aria-hidden>
        <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round" />
      </svg>
    );
  }
  return null;
}

/**
 * The day's reputation promises shown among its tasks in Plans and Calendar.
 * Yes/no promises can be cycled straight from here; measured ones stay
 * read-only, since their numbers are edited in the reputation section itself.
 */
export function ReputationInlineList({ promises, onUpdate }) {
  if (!promises || promises.length === 0) return null;

  const cycle = (promise) => {
    const cur = promise.fact_value;
    const next = cur == null ? 1 : (cur >= 1 ? 0 : null);
    onUpdate?.(promise.id, { fact_value: next });
  };

  return (
    <ul className="rep-inline">
      {promises.map((p) => {
        const state = promiseState(p);
        const metrics = metricsText(p);
        return (
          <li className={`rep-inline__row rep-inline__row--${state}`} key={p.id}>
            {p.kind === 'yesno' ? (
              <button
                type="button"
                className={`rep-inline__check rep-inline__check--${state}`}
                onClick={() => cycle(p)}
                aria-label="Изменить статус"
              >
                <Mark state={state} />
              </button>
            ) : (
              <span className={`rep-inline__check rep-inline__check--${state}`} aria-hidden>
                <Mark state={state} />
              </span>
            )}
            <span className="rep-inline__title">{p.title || 'Обещание'}</span>
            {metrics && <span className="rep-inline__metrics">{metrics}</span>}
          </li>
        );
      })}
    </ul>
  );
}
