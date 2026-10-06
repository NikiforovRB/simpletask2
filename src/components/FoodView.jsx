import { useMemo, useRef, useState } from 'react';
import { useMeals } from '../hooks/useMeals';
import { formatDayLabel } from '../constants';
import plusIcon from '../assets/plus.svg';
import plusNavIcon from '../assets/plus-nav.svg';
import deleteIcon from '../assets/delete.svg';
import deleteNavIcon from '../assets/delete-nav.svg';
import closeIcon from '../assets/close.svg';
import './FoodView.css';

const kcalFormat = new Intl.NumberFormat('ru-RU');
const NO_MEALS = [];

const pad2 = (n) => String(n).padStart(2, '0');
const shortTime = (t) => String(t || '').slice(0, 5);

/** The current time rounded to five minutes, "HH:MM". */
function currentTime() {
  const d = new Date();
  const mins = Math.min(23 * 60 + 55, Math.round((d.getHours() * 60 + d.getMinutes()) / 5) * 5);
  return `${pad2(Math.floor(mins / 60))}:${pad2(mins % 60)}`;
}

function compareMeals(a, b) {
  if (a.meal_time !== b.meal_time) return a.meal_time < b.meal_time ? -1 : 1;
  return (a.created_at || '') < (b.created_at || '') ? -1 : 1;
}

export function FoodView({ dates, hasHover }) {
  const from = dates[0];
  const to = dates[dates.length - 1];
  const { meals, error, dismissError, addMeal, updateMeal, deleteMeal } = useMeals(from, to);
  const [editingId, setEditingId] = useState(null);
  const [addingDate, setAddingDate] = useState(null);

  const mealsByDate = useMemo(() => {
    const map = new Map();
    for (const meal of meals) {
      if (!map.has(meal.meal_date)) map.set(meal.meal_date, []);
      map.get(meal.meal_date).push(meal);
    }
    for (const list of map.values()) list.sort(compareMeals);
    return map;
  }, [meals]);

  return (
    <div className="food">
      {error && (
        <div className="food__error" role="alert">
          <span>{error}</span>
          <button type="button" className="food__error-close" onClick={dismissError} aria-label="Закрыть">
            <img src={closeIcon} alt="" />
          </button>
        </div>
      )}
      <div className="food__days">
        {[...dates].reverse().map((date) => (
          <FoodDay
            key={date}
            date={date}
            meals={mealsByDate.get(date) || NO_MEALS}
            hasHover={hasHover}
            editingId={editingId}
            setEditingId={setEditingId}
            adding={addingDate === date}
            setAddingDate={setAddingDate}
            addMeal={addMeal}
            updateMeal={updateMeal}
            deleteMeal={deleteMeal}
          />
        ))}
      </div>
    </div>
  );
}

function FoodDay({ date, meals, hasHover, editingId, setEditingId, adding, setAddingDate, addMeal, updateMeal, deleteMeal }) {
  const [addHover, setAddHover] = useState(false);
  const counted = meals.filter((m) => m.calories != null);
  const total = counted.reduce((sum, m) => sum + m.calories, 0);

  // Another form may already have taken over by the time this one lets go.
  const closeEdit = (id) => setEditingId((cur) => (cur === id ? null : cur));
  const closeAdd = () => setAddingDate((cur) => (cur === date ? null : cur));

  const saveEdit = (meal, value) => {
    const changed = shortTime(meal.meal_time) !== shortTime(value.meal_time)
      || meal.comment !== value.comment
      || (meal.calories ?? null) !== value.calories;
    if (changed) updateMeal(meal.id, value);
    closeEdit(meal.id);
  };

  return (
    <section className="food-day">
      <div className="food-day__header">
        <span className="food-day__title">{formatDayLabel(date)}</span>
        {counted.length > 0 && (
          <span className="food-day__total">{kcalFormat.format(total)} ккал</span>
        )}
      </div>
      <div className="food-day__line" />

      {meals.length > 0 && (
        <ul className="food-day__list">
          {meals.map((meal) => (
            <li key={meal.id}>
              {editingId === meal.id ? (
                <MealForm
                  mode="edit"
                  hasHover={hasHover}
                  initial={{
                    time: shortTime(meal.meal_time),
                    comment: meal.comment,
                    calories: meal.calories != null ? String(meal.calories) : '',
                  }}
                  onSubmit={(value) => saveEdit(meal, value)}
                  onClose={() => closeEdit(meal.id)}
                  onDelete={() => {
                    deleteMeal(meal.id);
                    closeEdit(meal.id);
                  }}
                />
              ) : (
                <button type="button" className="food-meal" onClick={() => setEditingId(meal.id)}>
                  <span className="food-meal__time">{shortTime(meal.meal_time)}</span>
                  <span className="food-meal__comment">{meal.comment}</span>
                  {meal.calories != null && (
                    <span className="food-meal__kcal">
                      {kcalFormat.format(meal.calories)} <span className="food-meal__unit">ккал</span>
                    </span>
                  )}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <MealForm
          mode="add"
          hasHover={hasHover}
          initial={{ time: currentTime(), comment: '', calories: '' }}
          onSubmit={(value) => addMeal({ meal_date: date, ...value })}
          onClose={closeAdd}
        />
      ) : (
        <button
          type="button"
          className="food-day__add"
          onMouseEnter={() => hasHover && setAddHover(true)}
          onMouseLeave={() => hasHover && setAddHover(false)}
          onClick={() => {
            setAddHover(false);
            setAddingDate(date);
          }}
        >
          <img src={hasHover && addHover ? plusNavIcon : plusIcon} alt="" />
          <span>Добавить приём пищи</span>
        </button>
      )}
    </section>
  );
}

/**
 * One line to type a meal into: time, comment, calories. Enter saves; a new
 * meal keeps the form open (with the same time) for the next dish of the same
 * meal. Esc or a click elsewhere closes it — an edit is saved on the way out,
 * a half-typed new meal is kept until it is saved or dismissed with Esc.
 */
function MealForm({ mode, initial, hasHover, onSubmit, onClose, onDelete }) {
  const [time, setTime] = useState(initial.time);
  const [comment, setComment] = useState(initial.comment);
  const [calories, setCalories] = useState(initial.calories);
  const [invalid, setInvalid] = useState(null);
  const [deleteHover, setDeleteHover] = useState(false);
  const formRef = useRef(null);
  const timeRef = useRef(null);
  const commentRef = useRef(null);

  const read = () => {
    if (!/^\d{2}:\d{2}/.test(time)) return { error: 'time' };
    const text = comment.trim();
    if (!text) return { error: 'comment' };
    return {
      value: {
        meal_time: `${time.slice(0, 5)}:00`,
        comment: text,
        calories: calories === '' ? null : Number(calories),
      },
    };
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const { value, error } = read();
    if (error) {
      setInvalid(error);
      (error === 'time' ? timeRef : commentRef).current?.focus();
      return;
    }
    onSubmit(value);
    if (mode === 'add') {
      setComment('');
      setCalories('');
      setInvalid(null);
      commentRef.current?.focus();
    }
  };

  // Waits for the focus to land: moving to another element of the page closes
  // the form, leaving the window (or a native time picker taking it) does not.
  const handleBlur = () => {
    setTimeout(() => {
      const form = formRef.current;
      if (!form || !document.hasFocus() || form.contains(document.activeElement)) return;
      if (mode === 'edit') {
        const { value } = read();
        if (value) onSubmit(value);
        else onClose();
      } else if (!comment.trim()) {
        onClose();
      }
    }, 0);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    }
  };

  const keepFocus = (e) => e.preventDefault();

  return (
    <form
      ref={formRef}
      className={`food-form food-form--${mode}`}
      onSubmit={handleSubmit}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      noValidate
    >
      <input
        ref={timeRef}
        type="time"
        className={`food-form__input food-form__time ${invalid === 'time' ? 'food-form__input--invalid' : ''}`}
        value={time}
        onChange={(e) => {
          setTime(e.target.value);
          if (invalid === 'time') setInvalid(null);
        }}
        aria-label="Время"
        required
      />
      <input
        ref={commentRef}
        type="text"
        className={`food-form__input food-form__comment ${invalid === 'comment' ? 'food-form__input--invalid' : ''}`}
        value={comment}
        onChange={(e) => {
          setComment(e.target.value);
          if (invalid === 'comment') setInvalid(null);
        }}
        placeholder="Что съели"
        aria-label="Комментарий"
        maxLength={1000}
        autoFocus
        required
      />
      <input
        type="text"
        inputMode="numeric"
        className="food-form__input food-form__kcal"
        value={calories}
        onChange={(e) => setCalories(e.target.value.replace(/\D/g, '').slice(0, 5))}
        placeholder="ккал"
        aria-label="Калории (необязательно)"
      />
      <div className="food-form__actions">
        {mode === 'edit' && (
          <button
            type="button"
            className="food-form__btn food-form__btn--delete"
            onMouseDown={keepFocus}
            onMouseEnter={() => hasHover && setDeleteHover(true)}
            onMouseLeave={() => hasHover && setDeleteHover(false)}
            onClick={onDelete}
            aria-label="Удалить"
            title="Удалить"
          >
            <img src={hasHover && deleteHover ? deleteNavIcon : deleteIcon} alt="" />
          </button>
        )}
        <button
          type="submit"
          className="food-form__btn food-form__btn--submit"
          onMouseDown={keepFocus}
          aria-label={mode === 'edit' ? 'Сохранить' : 'Добавить'}
          title={mode === 'edit' ? 'Сохранить' : 'Добавить'}
        >
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M20 6L9 17L4 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </form>
  );
}
