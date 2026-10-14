import { useId, useState } from 'react';
import { useModalClose } from '../hooks/useModalClose';
import { formatWhen, phoneHref, quickDays, stageOf, taskKind, telegramLink } from '../lib/girls';
import { CalendarIcon, CheckIcon, CloseIcon, PhoneIcon, TelegramIcon } from './GirlsIcons';
import { GirlsDatePicker } from './GirlsDatePicker';

const CONTACT_TIMES = ['10:00', '14:00', '19:00', '21:00'];

/**
 * One planned thing with a girl: «Написать», «Позвонить» or «Свидание».
 *
 * `item` — an existing one (see planItems), otherwise `seed` ({ girlId, kind,
 * day }) starts a new one. `girls` — who can be picked when she isn't chosen
 * yet; `kinds` — the kinds allowed for a new one. `onSave({ girlId, kind, day,
 * time, note })`.
 */
export function GirlTaskEditor({ item, seed, girls, kinds, today, onSave, onToggleDone, onDelete, onOpenGirl, onClose }) {
  const isNew = !item;
  const [draft, setDraft] = useState(() => ({
    girlId: item?.girl.id ?? seed?.girlId ?? '',
    kind: item?.kind ?? seed?.kind ?? kinds[0],
    day: item?.day ?? seed?.day ?? today,
    time: item?.time ?? '',
    note: item?.note ?? '',
  }));
  const [invalid, setInvalid] = useState(false);
  const [picker, setPicker] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const ids = useId();
  useModalClose(onClose);

  const girl = item?.girl ?? girls.find((g) => g.id === draft.girlId) ?? null;
  // An existing contact can turn from a message into a call, a date stays a date.
  const choices = isNew ? kinds : item.kind === 'date' ? [] : ['message', 'call'];
  const kind = taskKind(draft.kind);
  const tg = girl ? telegramLink(girl.telegram) : null;
  const tel = girl ? phoneHref(girl.phone) : null;

  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));

  const save = () => {
    if (!draft.girlId) {
      setInvalid(true);
      return;
    }
    onSave({ girlId: draft.girlId, kind: draft.kind, day: draft.day, time: draft.time || null, note: draft.note.trim() });
  };

  const title = isNew ? 'Запланировать' : `${kind.label}${girl ? ` — ${girl.name}` : ''}`;
  const groups = [
    ['meet', 'Знакомства'],
    ['dating', 'Свидания'],
  ].map(([stage, label]) => [label, girls.filter((g) => stageOf(g) === stage)]);

  return (
    <div
      className="girl-editor__overlay girl-editor__overlay--sheet girl-editor__overlay--task"
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
            save();
          }}
          noValidate
        >
          {isNew && !seed?.girlId ? (
            <label className="girl-field">
              <span className="girl-field__label">С кем</span>
              <select
                className={`girl-input ${invalid ? 'girl-input--invalid' : ''}`}
                value={draft.girlId}
                onChange={(e) => {
                  set({ girlId: e.target.value });
                  setInvalid(false);
                }}
                autoFocus
              >
                <option value="">Выберите девушку</option>
                {groups.map(
                  ([label, list]) =>
                    list.length > 0 && (
                      <optgroup key={label} label={label}>
                        {list.map((g) => (
                          <option key={g.id} value={g.id}>{g.name}</option>
                        ))}
                      </optgroup>
                    ),
                )}
              </select>
            </label>
          ) : (
            girl && (
              <div className="girl-field__line">
                {onOpenGirl ? (
                  <button type="button" className="approach-editor__girl task-editor__girl" onClick={() => onOpenGirl(girl.id)}>
                    <span>Карточка: {girl.name}</span>
                    <span aria-hidden="true">→</span>
                  </button>
                ) : (
                  <span className="task-editor__girl-name">{girl.name}</span>
                )}
                {tg && (
                  <a className="girl-icon-btn" href={tg.url} target="_blank" rel="noreferrer" aria-label="Написать в Telegram" title="Написать в Telegram">
                    <TelegramIcon />
                  </a>
                )}
                {tel && (
                  <a className="girl-icon-btn" href={tel} aria-label="Позвонить" title="Позвонить">
                    <PhoneIcon />
                  </a>
                )}
              </div>
            )
          )}

          {choices.length > 1 && (
            <div className="girl-field">
              <span className="girl-field__label">Что сделать</span>
              <div
                className={`girls-stats__modes approach-editor__seg ${choices.length > 2 ? 'task-editor__seg--3' : ''}`}
                role="radiogroup"
                aria-label="Что сделать"
              >
                {choices.map((key) => (
                  <button
                    key={key}
                    type="button"
                    role="radio"
                    aria-checked={draft.kind === key}
                    className={`girls-stats__mode ${draft.kind === key ? 'girls-stats__mode--on' : ''}`}
                    onClick={() => set({ kind: key })}
                  >
                    {taskKind(key).label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="girl-field">
            <span className="girl-field__label">Когда</span>
            <button type="button" className="girl-input girl-input--button" onClick={() => setPicker(true)}>
              <span>{formatWhen(draft.day, draft.time, today)}</span>
              <CalendarIcon />
            </button>
            <div className="task-editor__quick">
              {quickDays(today).map((q) => (
                <button
                  key={q.label}
                  type="button"
                  className={`girls__chip ${draft.day === q.value ? 'girls__chip--on' : ''}`}
                  onClick={() => set({ day: q.value })}
                >
                  {q.label}
                </button>
              ))}
            </div>
          </div>

          <label className="girl-field">
            <span className="girl-field__label">Комментарий</span>
            <textarea
              className="girl-input girl-input--area approach-editor__note"
              value={draft.note}
              onChange={(e) => set({ note: e.target.value })}
              placeholder={kind.hint}
              rows={2}
              maxLength={500}
            />
          </label>

          {isNew && draft.kind === 'date' && girl && stageOf(girl) === 'meet' && (
            <p className="girl-editor__hint">С первым свиданием {girl.name} перейдёт во вкладку «Свидания».</p>
          )}
        </form>

        <footer className="girl-editor__foot">
          {confirmDelete ? (
            <>
              <span className="girl-editor__ask">
                {item.kind === 'date' ? 'Отменить это свидание?' : 'Удалить из планов?'}
              </span>
              <button type="button" className="girl-btn girl-btn--ghost" onClick={() => setConfirmDelete(false)}>Нет</button>
              <button type="button" className="girl-btn girl-btn--danger" onClick={onDelete}>
                {item.kind === 'date' ? 'Отменить' : 'Удалить'}
              </button>
            </>
          ) : (
            <>
              {!isNew && (
                <button type="button" className="girl-btn girl-btn--ghost girl-btn--danger-text" onClick={() => setConfirmDelete(true)}>
                  Удалить
                </button>
              )}
              <span className="girl-editor__spacer" />
              {!isNew && onToggleDone && (
                <button type="button" className={`girl-btn ${item.done ? 'girl-btn--ghost' : 'girl-btn--soft'} task-editor__done`} onClick={onToggleDone}>
                  {!item.done && <CheckIcon />}
                  {item.done ? 'Вернуть в план' : 'Выполнено'}
                </button>
              )}
              <button type="submit" form={`${ids}-form`} className="girl-btn girl-btn--primary">
                {isNew ? 'Запланировать' : 'Сохранить'}
              </button>
            </>
          )}
        </footer>
      </div>

      {picker && (
        <GirlsDatePicker
          title={kind.key === 'date' ? 'Свидание' : 'Когда связаться'}
          withTime
          timePresets={kind.key === 'date' ? undefined : CONTACT_TIMES}
          value={draft.day}
          time={draft.time || ''}
          quick={quickDays(today).slice(0, 3)}
          onApply={({ date, time }) => {
            set({ day: date, time: time || '' });
            setPicker(false);
          }}
          onClose={() => setPicker(false)}
        />
      )}
    </div>
  );
}
