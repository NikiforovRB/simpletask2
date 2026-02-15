import { useState, useCallback, useEffect } from 'react';
import { DndContext, PointerSensor, useSensor, useSensors, pointerWithin } from '@dnd-kit/core';
import { useAuth } from '../contexts/AuthContext';
import { useTasks } from '../hooks/useTasks';
import { useSettings } from '../hooks/useSettings';
import { useListCollapsed } from '../hooks/useListCollapsed';
import { DayCard } from '../components/DayCard';
import { NoDateList } from '../components/NoDateList';
import { getContainerId, parseContainerId } from '../lib/dnd';
import { parseSlotId } from '../components/DropSlot';
import leftIcon from '../assets/left.svg';
import leftNavIcon from '../assets/left-nav.svg';
import rightIcon from '../assets/right.svg';
import rightNavIcon from '../assets/right-nav.svg';
import bezdatIcon from '../assets/bezdat.svg';
import bezdatNavIcon from '../assets/bezdat-nav.svg';
import exitIcon from '../assets/exit.svg';
import exitNavIcon from '../assets/exit-nav.svg';
import eyeIcon from '../assets/eye.svg';
import eyeNavIcon from '../assets/eye-nav.svg';
import settingsIcon from '../assets/settings.svg';
import settingsNavIcon from '../assets/settings-nav.svg';
import refreshIcon from '../assets/refresh.svg';
import refreshNavIcon from '../assets/refresh-nav.svg';
import './Dashboard.css';

function getDays(baseDate, count) {
  const days = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(baseDate);
    d.setDate(d.getDate() + i);
    days.push(d);
  }
  return days;
}

function normDate(v) {
  if (v == null) return null;
  const s = typeof v === 'string' ? v.slice(0, 10) : v;
  return s === '' ? null : s;
}

function getTasksInContainer(tasks, containerId) {
  const c = parseContainerId(containerId);
  if (!c) return [];
  if (c.parent_id) {
    return tasks
      .filter((t) => t.parent_id === c.parent_id)
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  }
  const wantDate = normDate(c.scheduled_date);
  return tasks
    .filter(
      (t) =>
        !t.parent_id &&
        normDate(t.scheduled_date) === wantDate &&
        (c.completed ? !!t.completed_at : !t.completed_at)
    )
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
}

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const { tasks, addTask, updateTask, deleteTask, toggleComplete, moveTask } = useTasks();
  const { settings, setDaysCount, setNewTasksPosition, setNoDateListVisible } = useSettings();
  const { getCollapsed: getListCollapsed, setCollapsed: setListCollapsed } = useListCollapsed();
  const [dateOffset, setDateOffset] = useState(() => {
    try {
      const v = localStorage.getItem('dashboard_date_offset');
      return v !== null && v !== '' ? parseInt(v, 10) : 0;
    } catch {
      return 0;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('dashboard_date_offset', String(dateOffset));
    } catch {}
  }, [dateOffset]);
  const [recentCompletedIds, setRecentCompletedIds] = useState(new Set());
  const noDateListVisible = settings.no_date_list_visible !== false;
  const [completedVisible, setCompletedVisible] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [dateLeftHover, setDateLeftHover] = useState(false);
  const [dateRightHover, setDateRightHover] = useState(false);
  const [bezdatHover, setBezdatHover] = useState(false);
  const [eyeHover, setEyeHover] = useState(false);
  const [settingsHover, setSettingsHover] = useState(false);
  const [exitHover, setExitHover] = useState(false);
  const [refreshHover, setRefreshHover] = useState(false);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const baseDate = new Date(today);
  baseDate.setDate(baseDate.getDate() + dateOffset);
  const days = getDays(baseDate, settings.days_count);

  const handleToggle = useCallback(
    async (task) => {
      if (task.completed_at) {
        toggleComplete(task);
        return;
      }
      toggleComplete(task);
      setRecentCompletedIds((prev) => new Set(prev).add(task.id));
      setTimeout(() => {
        setRecentCompletedIds((prev) => {
          const next = new Set(prev);
          next.delete(task.id);
          return next;
        });
      }, 500);
    },
    [toggleComplete]
  );

  const handleAddTask = useCallback(
    (payload) => {
      const maxPos = tasks.filter((t) => t.scheduled_date === payload.scheduled_date && !t.parent_id).reduce((acc, t) => Math.max(acc, t.position || 0), 0);
      addTask({ ...payload, position: maxPos + 1 });
    },
    [tasks, addTask]
  );

  const handleAddTaskAt = useCallback(
    (payload) => {
      const sameDate = tasks.filter((t) => (t.scheduled_date === payload.scheduled_date && !t.parent_id));
      const atStart = settings.new_tasks_position === 'start';
      const position = atStart
        ? (sameDate.length ? Math.min(...sameDate.map((t) => t.position ?? 0)) : 0) - 1
        : (sameDate.length ? Math.max(...sameDate.map((t) => t.position ?? 0)) : 0) + 1;
      addTask({ ...payload, title: 'Новая задача', position });
    },
    [tasks, addTask, settings.new_tasks_position]
  );

  const handleAddSubtask = useCallback(
    (parentId) => {
      const parent = tasks.find((t) => t.id === parentId);
      if (!parent) return;
      const siblings = tasks.filter((t) => t.parent_id === parentId);
      const maxPos = siblings.reduce((acc, t) => Math.max(acc, t.position || 0), 0);
      addTask({
        title: 'Подзадача',
        parent_id: parentId,
        scheduled_date: parent.scheduled_date,
        text_color: '#ffffff',
        position: maxPos + 1,
      });
    },
    [tasks, addTask]
  );

  const handleDragEnd = useCallback(
    async (event) => {
      const { active, over } = event;
      if (!over) return;
      const slot = parseSlotId(over.id);
      if (!slot) return;
      const { containerId, index } = slot;
      const movedTask = tasks.find((t) => t.id === active.id);
      if (!movedTask) return;
      const targetConfig = parseContainerId(containerId);
      if (!targetConfig) return;
      let scheduled_date = targetConfig.scheduled_date;
      const parent_id = targetConfig.parent_id ?? null;
      if (targetConfig.parent_id) {
        const parentTask = tasks.find((t) => t.id === targetConfig.parent_id);
        scheduled_date = parentTask?.scheduled_date ?? null;
      }
      const completed_at = targetConfig.completed ? new Date().toISOString() : null;

      const targetList = getTasksInContainer(tasks, containerId);
      const sourceContainerId = getContainerId(movedTask.scheduled_date, movedTask.parent_id, !!movedTask.completed_at);
      const targetIds = targetList.map((t) => t.id).filter((id) => id !== movedTask.id);
      targetIds.splice(index, 0, movedTask.id);
      const newOrderedIds = targetIds;

      await moveTask(movedTask.id, { scheduled_date, parent_id, completed_at, position: index });
      for (let i = 0; i < newOrderedIds.length; i++) {
        if (newOrderedIds[i] !== movedTask.id) {
          await updateTask(newOrderedIds[i], { position: i });
        }
      }
      if (sourceContainerId !== containerId) {
        const sourceList = getTasksInContainer(tasks, sourceContainerId).filter((t) => t.id !== movedTask.id);
        for (let i = 0; i < sourceList.length; i++) {
          await updateTask(sourceList[i].id, { position: i });
        }
      }
    },
    [tasks, moveTask, updateTask]
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  return (
    <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragEnd={handleDragEnd}>
    <div className="dashboard">
      <header className="dashboard__header">
        <div className="dashboard__header-row">
          <div className="dashboard__top-left">
            <select
              value={settings.days_count}
              onChange={(e) => setDaysCount(Number(e.target.value))}
              className="dashboard__select"
              aria-label="Количество дней"
            >
              {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            <button type="button" className="dashboard__shift-btn" onMouseEnter={() => setDateLeftHover(true)} onMouseLeave={() => setDateLeftHover(false)} onClick={() => setDateOffset((o) => o - 1)} aria-label="Назад">
              <img src={dateLeftHover ? leftNavIcon : leftIcon} alt="" />
            </button>
            <button type="button" className="dashboard__shift-btn" onMouseEnter={() => setDateRightHover(true)} onMouseLeave={() => setDateRightHover(false)} onClick={() => setDateOffset((o) => o + 1)} aria-label="Вперёд">
              <img src={dateRightHover ? rightNavIcon : rightIcon} alt="" />
            </button>
          </div>
          <div className="dashboard__header-actions">
            <button type="button" className="dashboard__icon-btn" onMouseEnter={() => setBezdatHover(true)} onMouseLeave={() => setBezdatHover(false)} onClick={() => setNoDateListVisible(!noDateListVisible)} aria-label={noDateListVisible ? 'Скрыть список без даты' : 'Показать список без даты'}>
              <img src={bezdatHover ? bezdatNavIcon : bezdatIcon} alt="" />
            </button>
            <button type="button" className="dashboard__icon-btn" onMouseEnter={() => setEyeHover(true)} onMouseLeave={() => setEyeHover(false)} onClick={() => setCompletedVisible((v) => !v)} aria-label={completedVisible ? 'Скрыть выполненные' : 'Показать выполненные'}>
              <img src={eyeHover ? eyeNavIcon : eyeIcon} alt="" />
            </button>
            <button type="button" className="dashboard__icon-btn" onMouseEnter={() => setSettingsHover(true)} onMouseLeave={() => setSettingsHover(false)} onClick={() => setSettingsOpen((v) => !v)} aria-label="Настройки">
              <img src={settingsHover ? settingsNavIcon : settingsIcon} alt="" />
            </button>
            <button type="button" className="dashboard__icon-btn" onMouseEnter={() => setExitHover(true)} onMouseLeave={() => setExitHover(false)} onClick={signOut} aria-label="Выйти">
              <img src={exitHover ? exitNavIcon : exitIcon} alt="" />
            </button>
          </div>
        </div>
      </header>

      {settingsOpen && (
        <div className="dashboard__settings-overlay" onClick={() => setSettingsOpen(false)}>
          <div className="dashboard__settings-popup" onClick={(e) => e.stopPropagation()}>
            <div className="dashboard__settings-title">Новые задачи</div>
            <button type="button" className={`dashboard__settings-option ${settings.new_tasks_position === 'start' ? 'dashboard__settings-option--active' : ''}`} onClick={() => { setNewTasksPosition('start'); setSettingsOpen(false); }}>
              В начало списка
            </button>
            <button type="button" className={`dashboard__settings-option ${settings.new_tasks_position === 'end' ? 'dashboard__settings-option--active' : ''}`} onClick={() => { setNewTasksPosition('end'); setSettingsOpen(false); }}>
              В конец списка
            </button>
          </div>
        </div>
      )}

      <div className="dashboard__days">
        {days.map((date) => (
          <DayCard
            key={date.toISOString().slice(0, 10)}
            date={date}
            tasks={tasks}
            onToggle={handleToggle}
            onUpdate={updateTask}
            onDelete={deleteTask}
            onAddTask={handleAddTask}
            onAddSubtask={handleAddSubtask}
            onAddAtStart={handleAddTaskAt}
            recentCompletedIds={recentCompletedIds}
            completedVisible={completedVisible}
            getListCollapsed={getListCollapsed}
            setListCollapsed={setListCollapsed}
          />
        ))}
      </div>

      <NoDateList
        tasks={tasks}
        onToggle={handleToggle}
        onUpdate={updateTask}
        onDelete={deleteTask}
        onAddSubtask={handleAddSubtask}
        onAddAtStart={handleAddTaskAt}
        visible={noDateListVisible}
        completedVisible={completedVisible}
        getListCollapsed={getListCollapsed}
        setListCollapsed={setListCollapsed}
      />

      <button type="button" className="dashboard__refresh" onMouseEnter={() => setRefreshHover(true)} onMouseLeave={() => setRefreshHover(false)} onClick={() => window.location.reload()} aria-label="Обновить">
        <img src={refreshHover ? refreshNavIcon : refreshIcon} alt="" />
      </button>
    </div>
    </DndContext>
  );
}
