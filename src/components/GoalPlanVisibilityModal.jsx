import { useEffect } from 'react';
import './GoalPlanVisibilityModal.css';

/**
 * Persisted keys used by both this modal and `GoalPlanView`. Storing `true`
 * means the element is hidden; absent / `false` keeps the default visible
 * behavior, so existing users see no change until they toggle something.
 */
export const GP_VIS_SIDEBAR = 'goal_plan_vis::sidebar';
export const GP_VIS_DAY_NOTE_START = 'goal_plan_vis::day_note_start';
export const GP_VIS_DAY_NOTE_END = 'goal_plan_vis::day_note_end';
export const gpVisSectionKey = (kind) => `goal_plan_vis::section::${kind}`;

const SIDEBAR_SECTIONS = [
  { kind: 'goal', label: 'Мои цели' },
  { kind: 'morning', label: 'Утро' },
  { kind: 'action', label: 'Задачи' },
  { kind: 'evening', label: 'Вечер' },
];

export function GoalPlanVisibilityModal({ open, onClose, getListCollapsed, setListCollapsed }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const isHidden = (key) => !!getListCollapsed?.(key);
  const setVisible = (key, visible) => setListCollapsed?.(key, !visible);

  const sidebarVisible = !isHidden(GP_VIS_SIDEBAR);

  return (
    <div className="dashboard__settings-overlay" onClick={onClose}>
      <div
        className="dashboard__settings-popup goal-plan-vis__popup"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Отображение"
      >
        <div className="dashboard__settings-title">Отображение</div>

        <ToggleRow
          label="Первый столбец"
          checked={sidebarVisible}
          onChange={(v) => setVisible(GP_VIS_SIDEBAR, v)}
        />

        <div
          className={`goal-plan-vis__group${sidebarVisible ? '' : ' goal-plan-vis__group--muted'}`}
        >
          {SIDEBAR_SECTIONS.map((s) => (
            <ToggleRow
              key={s.kind}
              label={s.label}
              indent
              checked={!isHidden(gpVisSectionKey(s.kind))}
              onChange={(v) => setVisible(gpVisSectionKey(s.kind), v)}
            />
          ))}
        </div>

        <div className="goal-plan-vis__sep" />

        <ToggleRow
          label="Текст в начале дня"
          checked={!isHidden(GP_VIS_DAY_NOTE_START)}
          onChange={(v) => setVisible(GP_VIS_DAY_NOTE_START, v)}
        />
        <ToggleRow
          label="Текст в конце дня"
          checked={!isHidden(GP_VIS_DAY_NOTE_END)}
          onChange={(v) => setVisible(GP_VIS_DAY_NOTE_END, v)}
        />
      </div>
    </div>
  );
}

function ToggleRow({ label, checked, onChange, indent = false }) {
  return (
    <label
      className={`goal-plan-vis__row${indent ? ' goal-plan-vis__row--indent' : ''}`}
    >
      <span className="goal-plan-vis__label">{label}</span>
      <span className={`goal-plan-vis__switch${checked ? ' goal-plan-vis__switch--on' : ''}`}>
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange?.(e.target.checked)}
        />
        <span className="goal-plan-vis__switch-track" aria-hidden />
        <span className="goal-plan-vis__switch-thumb" aria-hidden />
      </span>
    </label>
  );
}
