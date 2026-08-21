import { useState, useCallback, useEffect, useMemo, useRef } from 'react';

function clampSidebarWidthPx(n) {
  const v = Number(n);
  if (Number.isFinite(v)) return Math.max(100, Math.min(400, Math.round(v)));
  return 220;
}

function loadCompletedVisibleByList() {
  try {
    const raw = localStorage.getItem('dashboard_completed_visible_by_list');
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}

function inheritBucketFromTask(task, tasks) {
  let root = task;
  const seen = new Set();
  while (root?.parent_id && !seen.has(root.id)) {
    seen.add(root.id);
    const p = tasks.find((t) => t.id === root.parent_id);
    if (!p) break;
    root = p;
  }
  return {
    scheduled_date: task.scheduled_date ?? root?.scheduled_date ?? null,
    list_type: task.list_type || root?.list_type || 'inbox',
    project_id: task.project_id ?? root?.project_id ?? null,
    card_id: task.card_id ?? root?.card_id ?? null,
  };
}
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, closestCenter } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { useTasks } from '../hooks/useTasks';
import { useSettings, FOCUS_SCALE_COLORS } from '../hooks/useSettings';
import { useListCollapsed } from '../hooks/useListCollapsed';
import { useCalendarDayHours } from '../hooks/useCalendarDayHours';
import { useReputation } from '../hooks/useReputation';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { useProjects } from '../hooks/useProjects';
import { useHabits } from '../hooks/useHabits';
import { useBoardItems } from '../hooks/useBoardItems';
import { useKanban } from '../hooks/useKanban';
import { useGoalPlan } from '../hooks/useGoalPlan';
import { DayCard } from '../components/DayCard';
import { HabitsView } from '../components/HabitsView';
import { BoardView } from '../components/BoardView';
import { KanbanView } from '../components/KanbanView';
import { KanbanCardPanel } from '../components/KanbanCardPanel';
import { GoalPlanView } from '../components/GoalPlanView';
import { CalendarView } from '../components/CalendarView';
import { TodayFocusTotal, FocusQuickStart } from '../components/TodayFocusTotal';
import { ReputationView } from '../components/ReputationView';
import { ReputationTaskRow } from '../components/ReputationTaskRow';
import { NoDateList } from '../components/NoDateList';
import { SomedayList } from '../components/SomedayList';
import { ProjectList } from '../components/ProjectList';
import { FocusTimer } from '../components/FocusTimer';
import { FocusAnalytics } from '../components/FocusAnalytics';
import { useFocus } from '../contexts/FocusContext';
import { useReminderScheduler } from '../hooks/useReminderScheduler';
import { registerReminderServiceWorker } from '../lib/reminders';
import { getContainerId, getContainerIdForBucket, getContainerIdFromTask, parseContainerId } from '../lib/dnd';
import { anchorForIndex, mergeDayItems, parseRepDndId, splitDonePromises } from '../lib/dayItems';
import { toLocalDateString } from '../constants';
import { parseSlotId } from '../components/DropSlot';
import {
  TASK_FONT_SCALE_OPTIONS,
  TASK_FONT_WEIGHT_OPTIONS,
  formatTaskScaleLabel,
  normalizeTaskFontScale,
  normalizeTaskFontWeight,
  taskFontWeightToCssNumber,
} from '../lib/taskFontSettings';
import menuIcon from '../assets/menu.svg';
import menuNavIcon from '../assets/menu-nav.svg';
import leftIcon from '../assets/left.svg';
import leftNavIcon from '../assets/left-nav.svg';
import rightIcon from '../assets/right.svg';
import rightNavIcon from '../assets/right-nav.svg';
import starIcon from '../assets/star.svg';
import starNavIcon from '../assets/star-nav.svg';
import calendarIcon from '../assets/calendar.svg';
import calendarNavIcon from '../assets/calendar-nav.svg';
import plansIcon from '../assets/plans.svg';
import plansNavIcon from '../assets/plans-nav.svg';
import goalIcon from '../assets/goal.svg';
import goalNavIcon from '../assets/goal-nav.svg';
import layersIcon from '../assets/layers.svg';
import layersNavIcon from '../assets/layers-nav.svg';
import archiveIcon from '../assets/archive.svg';
import archiveNavIcon from '../assets/archive-nav.svg';
import folderIcon from '../assets/folder.svg';
import folderNavIcon from '../assets/folder-nav.svg';
import dragIcon from '../assets/drag.svg';
import dragNavIcon from '../assets/drag-nav.svg';
import plusIcon from '../assets/plus.svg';
import plusNavIcon from '../assets/plus-nav.svg';
import textIcon from '../assets/text.svg';
import textNavIcon from '../assets/text-nav.svg';
import exitIcon from '../assets/exit.svg';
import exitNavIcon from '../assets/exit-nav.svg';
import eyeIcon from '../assets/eye.svg';
import eyeNavIcon from '../assets/eye-nav.svg';
import eyeoffIcon from '../assets/eyeoff.svg';
import eyeoffNavIcon from '../assets/eyeoff-nav.svg';
import settingsIcon from '../assets/settings.svg';
import settingsNavIcon from '../assets/settings-nav.svg';
import refreshIcon from '../assets/refresh.svg';
import refreshNavIcon from '../assets/refresh-nav.svg';
import editIcon from '../assets/edit.svg';
import editNavIcon from '../assets/edit-nav.svg';
import deleteNavIcon from '../assets/delete-nav2.svg';
import zavtraIcon from '../assets/zavtra.svg';
import poslezavtraIcon from '../assets/poslezavtra.svg';
import privIcon from '../assets/priv.svg';
import privNavIcon from '../assets/priv-nav.svg';
import focusIcon from '../assets/focus.svg';
import focusNavIcon from '../assets/focus-nav.svg';
import sunIcon from '../assets/sun.svg';
import sunNavIcon from '../assets/sun-nav.svg';
import moonIcon from '../assets/moon.svg';
import moonNavIcon from '../assets/moon-nav.svg';
import doskaIcon from '../assets/doska.svg';
import doskaNavIcon from '../assets/doska-nav.svg';
import kanbanIcon from '../assets/align.svg';
import kanbanNavIcon from '../assets/align-nav.svg';
import pdfIcon from '../assets/pdf.svg';
import pdfNavIcon from '../assets/pdf-nav.svg';
import { BoardPdfExportModal } from '../components/BoardPdfExportModal';
import { GoalPlanVisibilityModal } from '../components/GoalPlanVisibilityModal';
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
  if (c.card_id) {
    return tasks
      .filter((t) => !t.parent_id && t.card_id === c.card_id && (c.completed ? !!t.completed_at : !t.completed_at))
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  }
  if (c.list_type === 'someday') {
    return tasks
      .filter((t) => !t.parent_id && (t.list_type || '') === 'someday' && (c.completed ? !!t.completed_at : !t.completed_at))
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  }
  if (c.list_type === 'project' && c.project_id) {
    const pid = String(c.project_id);
    return tasks
      .filter((t) => !t.parent_id && (t.list_type || '') === 'project' && String(t.project_id) === pid && (c.completed ? !!t.completed_at : !t.completed_at))
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  }
  const wantDate = normDate(c.scheduled_date);
  return tasks
    .filter(
      (t) =>
        !t.parent_id &&
        (t.list_type || 'inbox') === 'inbox' &&
        normDate(t.scheduled_date) === wantDate &&
        (c.completed ? !!t.completed_at : !t.completed_at)
    )
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
}

// Configuration for the built-in menu rows inside «Порядок пунктов меню».
// Order here is fixed; only visibility can be toggled.
const BUILTIN_MENU_ITEMS = [
  { key: 'today', label: 'Сегодня' },
  { key: 'plans', label: 'Планы' },
  { key: 'calendar', label: 'Календарь' },
  { key: 'goal_plan', label: 'Планы с целями' },
  { key: 'reputation', label: 'Репутация перед собой' },
  { key: 'no_date', label: 'Задачи без даты' },
  { key: 'someday', label: 'Когда-нибудь' },
  { key: 'habits', label: 'Привычки' },
  { key: 'focus_analytics', label: 'Фокус' },
];

// Icon pair (default, hover/active) of a user-made section, by its kind.
const PROJECT_KIND_ICONS = {
  project: [folderIcon, folderNavIcon],
  board: [doskaIcon, doskaNavIcon],
  kanban: [kanbanIcon, kanbanNavIcon],
};

const projectIcons = (kind) => PROJECT_KIND_ICONS[kind] || PROJECT_KIND_ICONS.project;

// What each kind of user-made section is called in the modals that create,
// rename and delete it.
const PROJECT_KIND_WORDS = {
  project: {
    tab: 'Список задач',
    createTitle: 'Новый проект',
    createButton: 'Добавить проект',
    namePlaceholder: 'Название проекта',
    editTitle: 'Редактировать проект',
    deleteButton: 'Удалить проект',
    deleteTitle: 'Удалить проект?',
    deleteText: 'Все задачи в этом проекте также будут удалены.',
  },
  board: {
    tab: 'Доска',
    createTitle: 'Новая доска',
    createButton: 'Добавить доску',
    namePlaceholder: 'Название доски',
    editTitle: 'Редактировать доску',
    deleteButton: 'Удалить доску',
    deleteTitle: 'Удалить доску?',
    deleteText: 'Все текстовые блоки на этой доске также будут удалены.',
  },
  kanban: {
    tab: 'Канбан',
    createTitle: 'Новая канбан-доска',
    createButton: 'Добавить канбан-доску',
    namePlaceholder: 'Название канбан-доски',
    editTitle: 'Редактировать канбан-доску',
    deleteButton: 'Удалить канбан-доску',
    deleteTitle: 'Удалить канбан-доску?',
    deleteText: 'Все столбцы, плашки и их задачи также будут удалены.',
  },
};

const kindWords = (kind) => PROJECT_KIND_WORDS[kind] || PROJECT_KIND_WORDS.project;

const menuHiddenKey = (kind, id) =>
  kind === 'builtin' ? `menu_hidden::${id}` : `menu_hidden::project::${id}`;

// Icon-only shortcut to another section, used in the header of views that have
// no day controls of their own.
function HeaderSectionLink({ icon, hoverIcon, label, onClick }) {
  const [hover, setHover] = useState(false);
  const hasHover = useMediaQuery('(hover: hover)');
  return (
    <button
      type="button"
      className="dashboard__icon-btn"
      onMouseEnter={() => hasHover && setHover(true)}
      onMouseLeave={() => hasHover && setHover(false)}
      onClick={onClick}
      aria-label={label}
      title={label}
    >
      <img src={hasHover && hover ? hoverIcon : icon} alt="" />
    </button>
  );
}

function MenuOrderVisibilityToggle({ hidden, onToggle }) {
  return (
    <button
      type="button"
      className={`dashboard-menu__order-vis ${hidden ? 'dashboard-menu__order-vis--off' : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        onToggle?.();
      }}
      onPointerDown={(e) => e.stopPropagation()}
      aria-label={hidden ? 'Показать в меню' : 'Скрыть из меню'}
      title={hidden ? 'Показать в меню' : 'Скрыть из меню'}
    >
      <img src={hidden ? eyeoffIcon : eyeIcon} alt="" />
    </button>
  );
}

function BuiltinMenuOrderRow({ item, hidden, onToggleHidden, icon }) {
  return (
    <div className="dashboard-menu__order-row dashboard-menu__order-row--builtin">
      <img src={icon} alt="" className="dashboard-menu__order-icon" />
      <span className="dashboard-menu__order-title">{item.label}</span>
      <MenuOrderVisibilityToggle hidden={hidden} onToggle={onToggleHidden} />
    </div>
  );
}

function SortableMenuOrderRow({ project, hidden, onToggleHidden }) {
  const { setNodeRef, transform, transition, isDragging, attributes, listeners } = useSortable({ id: project.id });
  const [icon] = projectIcons(project.kind || 'project');
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0 : 1,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`dashboard-menu__order-row ${isDragging ? 'dashboard-menu__order-row--dragging' : ''}`}
    >
      <img src={icon} alt="" className="dashboard-menu__order-icon" />
      <span className="dashboard-menu__order-title">{project.title}</span>
      <MenuOrderVisibilityToggle hidden={hidden} onToggle={onToggleHidden} />
      <span
        className="dashboard-menu__order-handle"
        aria-label="Перетащить"
        title="Перетащить"
        {...attributes}
        {...listeners}
      >
        <img src={dragIcon} alt="" />
      </span>
    </div>
  );
}

function SortableProjectItem({ project, isActive, isHover, iconDefault, iconHover, onClick, onMouseEnter, onMouseLeave, dirty }) {
  const { setNodeRef, transform, transition, isDragging } = useSortable({ id: project.id, disabled: true });
  const icon = (isActive || isHover) ? iconHover : iconDefault;
  const smoothTransition = transition
    ? transition.replace(/(\d+)ms/g, (_, ms) => `${Math.round(Number(ms) * 1.85)}ms`)
    : 'transform 400ms cubic-bezier(0.2, 0.8, 0.2, 1)';
  const style = isDragging
    ? { opacity: 0, transition: smoothTransition }
    : {
        transform: CSS.Transform.toString(transform),
        transition: smoothTransition,
      };
  return (
    <div ref={setNodeRef} style={style} className={`dashboard-menu__project-row ${isDragging ? 'dashboard-menu__project-row--dragging' : ''}`}>
      <button
        type="button"
        className={`dashboard-menu__item ${isActive ? 'dashboard-menu__item--active' : ''}`}
        onClick={onClick}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        <img src={icon} alt="" />
        <span>{project.title}</span>
        {dirty && <span className="dashboard-menu__dirty-dot" aria-label="Есть несохранённые изменения" />}
      </button>
    </div>
  );
}

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const { tasks, addTask, updateTask, deleteTask, toggleComplete, moveTask } = useTasks();
  const focus = useFocus();
  const {
    settings,
    setDaysCount,
    setNewTasksPosition,
    setNoDateListVisible,
    setSidebarWidthPx,
    setHabitsSidebarWidthPx,
    setTaskFontWeight,
    setTaskFontScale,
    setBoardZoom,
    setBoardDots,
    setTheme,
    setCalendarScale,
    setCalendarShowCheckboxes,
    setCalendarTwoColumns,
    setCalendarFocusScale,
    setCalendarFocusColor,
    setFocusTimerShowTotal,
    setShowReputationInLists,
    setReputationInCompleted,
    setKanbanDateFilter,
  } = useSettings();
  const { dayHours, setDayHours, resetDayHours } = useCalendarDayHours();
  const { getCollapsed: getListCollapsed, setCollapsed: setListCollapsed } = useListCollapsed();
  const {
    promises: reputationPromises,
    updatePromise: updateReputationPromise,
    deletePromise: deleteReputationPromise,
  } = useReputation();
  const { projects, loading: projectsLoading, addProject, updateProject, updateProjectSettings, deleteProject, reorderProjects } = useProjects();
  const kanbanBoardIds = useMemo(() => projects.filter((p) => p.kind === 'kanban').map((p) => p.id), [projects]);
  const {
    columns: kanbanColumns,
    cards: kanbanCards,
    archived: kanbanArchive,
    labels: kanbanLabels,
    addColumn: addKanbanColumn,
    updateColumn: updateKanbanColumn,
    deleteColumn: deleteKanbanColumn,
    reorderColumns: reorderKanbanColumns,
    addCard: addKanbanCard,
    updateCard: updateKanbanCard,
    deleteCard: deleteKanbanCard,
    restoreCard: restoreKanbanCard,
    purgeCard: purgeKanbanCard,
    purgeArchive: purgeKanbanArchive,
    moveCard: moveKanbanCard,
    planDay: planKanbanDay,
    addLabel: addKanbanLabel,
    updateLabel: updateKanbanLabel,
    deleteLabel: deleteKanbanLabel,
  } = useKanban(kanbanBoardIds);
  const { habits, entries: habitEntries, addHabit, updateHabit, deleteHabit, reorderHabits, setEntry: setHabitEntry } = useHabits();
  const {
    items: boardItems,
    loading: boardItemsLoading,
    addItem: addBoardItem,
    updateItem: updateBoardItem,
    updateItemLocal: updateBoardItemLocal,
    deleteItem: deleteBoardItem,
    cloneItems: cloneBoardItems,
    restoreItem: restoreBoardItem,
    offline: boardOffline,
    setOffline: setBoardOffline,
    hasPending: boardHasPending,
    dirtyBoardIds: boardDirtyIds,
    sync: syncBoardItems,
  } = useBoardItems();
  const {
    itemsByKind: goalPlanItemsByKind,
    notes: goalPlanNotes,
    addItem: addGoalPlanItem,
    addItemAfter: addGoalPlanItemAfter,
    updateItem: updateGoalPlanItem,
    toggleComplete: toggleGoalPlanItem,
    deleteItem: deleteGoalPlanItem,
    reorderItems: reorderGoalPlanItems,
    moveDayItem: moveGoalPlanDayItem,
    bulkMoveToDate: bulkMoveGoalPlanToDate,
    setDayNote: setGoalPlanDayNote,
  } = useGoalPlan();
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
  const [viewMode, setViewMode] = useState(() => {
    try {
      const raw = localStorage.getItem('dashboard_view_state');
      if (!raw) return 'plans';
      const parsed = JSON.parse(raw);
      const v = parsed?.viewMode;
      return ['today', 'plans', 'calendar', 'goal_plan', 'reputation', 'no_date', 'someday', 'habits', 'focus_analytics', 'board', 'kanban', 'project'].includes(v) ? v : 'plans';
    } catch {
      return 'plans';
    }
  }); // 'today' | 'plans' | 'goal_plan' | 'no_date' | 'someday' | 'habits' | 'project'
  const [dateTodayHover, setDateTodayHover] = useState(false);

  const [menuOpen, setMenuOpen] = useState(() => {
    try {
      const raw = localStorage.getItem('dashboard_view_state');
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      return parsed?.menuOpen === true;
    } catch {
      return false;
    }
  });
  const [mobileMenuClosing, setMobileMenuClosing] = useState(false);
  const mobileMenuCloseTimeoutRef = useRef(null);
  const [activeProjectId, setActiveProjectId] = useState(() => {
    try {
      const raw = localStorage.getItem('dashboard_view_state');
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed?.activeProjectId ?? null;
    } catch {
      return null;
    }
  });
  const [activeBoardId, setActiveBoardId] = useState(() => {
    try {
      const raw = localStorage.getItem('dashboard_view_state');
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed?.activeBoardId ?? null;
    } catch {
      return null;
    }
  });
  const [activeKanbanId, setActiveKanbanId] = useState(() => {
    try {
      const raw = localStorage.getItem('dashboard_view_state');
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed?.activeKanbanId ?? null;
    } catch {
      return null;
    }
  });
  const [openCardId, setOpenCardId] = useState(null);
  const [completedVisibleByList, setCompletedVisibleByList] = useState(loadCompletedVisibleByList);
  const completedVisibleListKey = useMemo(() => {
    if (viewMode === 'today') return 'today';
    if (viewMode === 'plans') return 'plans';
    if (viewMode === 'calendar') return 'calendar';
    if (viewMode === 'goal_plan') return 'goal_plan';
    if (viewMode === 'no_date') return 'no_date';
    if (viewMode === 'someday') return 'someday';
    if (viewMode === 'habits') return 'habits';
    if (viewMode === 'project' && activeProjectId) return `project:${activeProjectId}`;
    return null;
  }, [viewMode, activeProjectId]);
  const completedVisible = completedVisibleListKey == null ? true : completedVisibleByList[completedVisibleListKey] !== false;
  const toggleCompletedVisibleForList = () => {
    if (completedVisibleListKey == null) return;
    setCompletedVisibleByList((prev) => {
      const next = { ...prev, [completedVisibleListKey]: !(prev[completedVisibleListKey] !== false) };
      try {
        localStorage.setItem('dashboard_completed_visible_by_list', JSON.stringify(next));
      } catch {}
      return next;
    });
  };
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notice, setNotice] = useState(null);
  const noticeTimer = useRef(null);
  const [dateLeftHover, setDateLeftHover] = useState(false);
  const [dateRightHover, setDateRightHover] = useState(false);
  const [menuHover, setMenuHover] = useState(false);
  const [todayHover, setTodayHover] = useState(false);
  const [plansHover, setPlansHover] = useState(false);
  const [calendarMenuHover, setCalendarMenuHover] = useState(false);
  const [reputationMenuHover, setReputationMenuHover] = useState(false);
  const [goalPlanHover, setGoalPlanHover] = useState(false);
  const [noDateHover, setNoDateHover] = useState(false);
  const [somedayHover, setSomedayHover] = useState(false);
  const [habitsHover, setHabitsHover] = useState(false);
  const [focusHover, setFocusHover] = useState(false);
  const [projectHoverId, setProjectHoverId] = useState(null);
  const [eyeHover, setEyeHover] = useState(false);
  const [settingsHover, setSettingsHover] = useState(false);
  const [exitHover, setExitHover] = useState(false);
  const [refreshHover, setRefreshHover] = useState(false);
  const [editProjectFabHover, setEditProjectFabHover] = useState(false);
  const [boardPdfFabHover, setBoardPdfFabHover] = useState(false);
  const [boardPdfModalOpen, setBoardPdfModalOpen] = useState(false);
  const [goalPlanVisFabHover, setGoalPlanVisFabHover] = useState(false);
  const [goalPlanVisModalOpen, setGoalPlanVisModalOpen] = useState(false);
  const [boardPdfVariant, setBoardPdfVariant] = useState('dark');
  const [boardPdfExporting, setBoardPdfExporting] = useState(false);
  const boardWorldRef = useRef(null);
  const [boardHeaderLeftSlot, setBoardHeaderLeftSlot] = useState(null);
  const [boardHeaderRightSlot, setBoardHeaderRightSlot] = useState(null);
  const [repHeaderSlot, setRepHeaderSlot] = useState(null);
  const [addProjectModalOpen, setAddProjectModalOpen] = useState(false);
  const [addProjectTitle, setAddProjectTitle] = useState('');
  const [addProjectKind, setAddProjectKind] = useState('project'); // 'project' | 'board'
  const [editProjectOpen, setEditProjectOpen] = useState(false);
  const [editProjectId, setEditProjectId] = useState(null);
  const [editProjectTitle, setEditProjectTitle] = useState('');
  const [editProjectKind, setEditProjectKind] = useState('project');
  const [editProjectIsOwner, setEditProjectIsOwner] = useState(true);
  const [shareMembers, setShareMembers] = useState([]);
  const [shareEmail, setShareEmail] = useState('');
  const [shareMessage, setShareMessage] = useState(null); // { type: 'ok'|'error', text }
  const [shareBusy, setShareBusy] = useState(false);
  const [activeDragId, setActiveDragId] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [activeProjectDragId, setActiveProjectDragId] = useState(null);
  const [activeHabitDragId, setActiveHabitDragId] = useState(null);
  // Live width while the user is dragging the right-edge resize handle of
  // the side menu. `null` means no active drag → fall back to the saved
  // width. The value is committed to settings on pointer-up.
  const [resizingMenuWidth, setResizingMenuWidth] = useState(null);
  const [fontModalOpen, setFontModalOpen] = useState(false);
  const [fontWeightDraft, setFontWeightDraft] = useState('medium');
  const [fontScaleDraft, setFontScaleDraft] = useState(1);
  const [textFontBtnHover, setTextFontBtnHover] = useState(false);
  const [menuOrderBtnHover, setMenuOrderBtnHover] = useState(false);
  const [themeBtnHover, setThemeBtnHover] = useState(false);
  // Hover state for the desktop bottom-tools «+» (add-project) button.
  // Used to swap plus-nav.svg in on hover, mirroring the other three
  // buttons in the row so all four behave identically.
  const [addProjectBtnHover, setAddProjectBtnHover] = useState(false);
  const [menuOrderModalOpen, setMenuOrderModalOpen] = useState(false);
  const [menuOrderDraft, setMenuOrderDraft] = useState([]);
  const [menuOrderActiveId, setMenuOrderActiveId] = useState(null);
  // Draft visibility map keyed by `menu_hidden::*` list-key (true = hidden).
  // Filled when the modal opens and committed on Save.
  const [menuVisDraft, setMenuVisDraft] = useState({});
  const contextMenuRef = useRef(null);
  const hasHover = useMediaQuery('(hover: hover)');
  const isWideMenu = useMediaQuery('(min-width: 600px)');

  // Theme: reflect the user's saved theme on <html data-theme> so all CSS
  // light-overrides can fire immediately. We also stash it on <body> so any
  // legacy selectors that key on `body[data-theme]` keep working.
  useEffect(() => {
    const theme = settings.theme === 'light' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    document.body.setAttribute('data-theme', theme);
  }, [settings.theme]);

  // Register the (local-only) reminder service worker once.
  useEffect(() => {
    registerReminderServiceWorker();
  }, []);

  // Combined reminder list: tasks (all lists/projects) + goal-plan day items.
  const reminderItems = useMemo(() => {
    const list = (tasks || []).map((t) => ({
      id: t.id,
      title: t.title,
      scheduled_date: t.scheduled_date,
      scheduled_time: t.scheduled_time,
      reminder_minutes: t.reminder_minutes,
      completed_at: t.completed_at,
    }));
    for (const it of goalPlanItemsByKind?.day || []) {
      list.push({
        id: `gp-${it.id}`,
        title: it.text,
        scheduled_date: it.entry_date,
        scheduled_time: it.scheduled_time,
        reminder_minutes: it.reminder_minutes,
        completed_at: it.completed_at,
      });
    }
    return list;
  }, [tasks, goalPlanItemsByKind]);
  useReminderScheduler(reminderItems);
  const sidebarWidthPx = useMemo(() => clampSidebarWidthPx(settings.sidebar_width_px), [settings.sidebar_width_px]);
  const liveMenuWidth = useMemo(
    () => (resizingMenuWidth != null ? clampSidebarWidthPx(resizingMenuWidth) : sidebarWidthPx),
    [resizingMenuWidth, sidebarWidthPx]
  );
  const activeProjectDrag = useMemo(
    () => (activeProjectDragId ? projects.find((p) => p.id === activeProjectDragId) : null),
    [activeProjectDragId, projects]
  );
  const activeHabitDrag = useMemo(
    () => (activeHabitDragId ? habits.find((h) => h.id === activeHabitDragId) : null),
    [activeHabitDragId, habits]
  );

  const closeMenu = useCallback(() => {
    if (mobileMenuCloseTimeoutRef.current) {
      clearTimeout(mobileMenuCloseTimeoutRef.current);
      mobileMenuCloseTimeoutRef.current = null;
    }
    setMobileMenuClosing(true);
    setMenuOpen(false);
    mobileMenuCloseTimeoutRef.current = setTimeout(() => {
      setMobileMenuClosing(false);
      mobileMenuCloseTimeoutRef.current = null;
    }, 360);
  }, []);

  const openMenu = useCallback(() => {
    if (mobileMenuCloseTimeoutRef.current) {
      clearTimeout(mobileMenuCloseTimeoutRef.current);
      mobileMenuCloseTimeoutRef.current = null;
    }
    setMobileMenuClosing(false);
    setMenuOpen(true);
  }, []);

  useEffect(() => {
    return () => {
      if (mobileMenuCloseTimeoutRef.current) clearTimeout(mobileMenuCloseTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        'dashboard_view_state',
        JSON.stringify({ viewMode, activeProjectId, activeBoardId, activeKanbanId, menuOpen })
      );
    } catch {}
  }, [viewMode, activeProjectId, activeBoardId, activeKanbanId, menuOpen]);

  useEffect(() => {
    if (viewMode === 'project') {
      if (!activeProjectId) {
        setViewMode('plans');
        return;
      }
      if (projects.length && !projects.some((p) => p.id === activeProjectId && (p.kind || 'project') === 'project')) {
        setViewMode('plans');
        setActiveProjectId(null);
      }
      return;
    }
    if (viewMode === 'board') {
      if (!activeBoardId) {
        if (projectsLoading || boardItemsLoading) return;

        const firstBoard = projects.find((p) => p.kind === 'board');
        const hasLegacyItems = boardItems.some((it) => (it.board_id ?? null) === null);

        if (firstBoard && !hasLegacyItems) {
          setActiveBoardId(firstBoard.id);
        } else if (!firstBoard && !hasLegacyItems) {
          setViewMode('plans');
        }
        return;
      }
      if (projects.length && !projects.some((p) => p.id === activeBoardId && p.kind === 'board')) {
        setActiveBoardId(null);
      }
      return;
    }
    if (viewMode === 'kanban') {
      if (projectsLoading) return;
      if (projects.some((p) => p.id === activeKanbanId && p.kind === 'kanban')) return;
      const firstKanban = projects.find((p) => p.kind === 'kanban');
      if (firstKanban) setActiveKanbanId(firstKanban.id);
      else setViewMode('plans');
    }
  }, [viewMode, activeProjectId, activeBoardId, activeKanbanId, projects, projectsLoading, boardItems, boardItemsLoading]);

  const handleMenuSelect = useCallback((target) => {
    const isBuiltinView = ['today', 'plans', 'calendar', 'goal_plan', 'reputation', 'no_date', 'someday', 'habits', 'focus_analytics'].includes(target);
    if (isBuiltinView) {
      setViewMode(target);
      setActiveProjectId(null);
    } else {
      const project = projects.find((p) => p.id === target);
      if (project && project.kind === 'board') {
        setViewMode('board');
        setActiveBoardId(target);
        setActiveProjectId(null);
      } else if (project && project.kind === 'kanban') {
        setViewMode('kanban');
        setActiveKanbanId(target);
        setActiveProjectId(null);
      } else {
        setViewMode('project');
        setActiveProjectId(target);
      }
    }
    if (!isWideMenu) closeMenu();
  }, [isWideMenu, closeMenu, projects]);

  // A line that shows up for a few seconds and goes away on its own, for the
  // cases where there is nothing to open and nothing to decide.
  const showNotice = useCallback((text) => {
    setNotice(text);
    clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 3200);
  }, []);

  useEffect(() => () => clearTimeout(noticeTimer.current), []);

  const openFirstKanban = useCallback(() => {
    const board = projects.find((p) => p.kind === 'kanban');
    if (!board) {
      showNotice('Ни одна канбан-доска ещё не создана');
      return;
    }
    handleMenuSelect(board.id);
  }, [projects, handleMenuSelect, showNotice]);

  const handleAddProjectSubmit = useCallback(async () => {
    const title = addProjectTitle.trim();
    if (!title) return;
    const created = await addProject(title, addProjectKind);
    setAddProjectTitle('');
    setAddProjectModalOpen(false);
    setAddProjectKind('project');
    if (created?.id) {
      if (addProjectKind === 'board') {
        setViewMode('board');
        setActiveBoardId(created.id);
        setActiveProjectId(null);
      } else if (addProjectKind === 'kanban') {
        setViewMode('kanban');
        setActiveKanbanId(created.id);
        setActiveProjectId(null);
      } else {
        setViewMode('project');
        setActiveProjectId(created.id);
      }
    }
  }, [addProjectTitle, addProjectKind, addProject]);

  const loadShareMembers = useCallback(async (projectId) => {
    if (!projectId) return;
    const { data, error } = await supabase.rpc('list_project_members', { p_project_id: projectId });
    if (!error) setShareMembers(data || []);
  }, []);

  const handleOpenEditProject = useCallback((id, title, kind = 'project') => {
    const entry = projects.find((p) => p.id === id);
    const isOwner = !entry || entry.user_id === user?.id;
    setEditProjectId(id);
    setEditProjectTitle(title ?? '');
    setEditProjectKind(kind);
    setEditProjectIsOwner(isOwner);
    setShareEmail('');
    setShareMessage(null);
    setShareMembers([]);
    setEditProjectOpen(true);
    if (isOwner) loadShareMembers(id);
  }, [projects, user?.id, loadShareMembers]);

  const handleShareProject = useCallback(async () => {
    const email = shareEmail.trim();
    if (!editProjectId || !email) return;
    setShareBusy(true);
    setShareMessage(null);
    const { data, error } = await supabase.rpc('share_project', {
      p_project_id: editProjectId,
      p_email: email,
    });
    setShareBusy(false);
    if (error) {
      setShareMessage({ type: 'error', text: 'Ошибка. Попробуйте ещё раз.' });
      return;
    }
    if (data?.ok) {
      setShareEmail('');
      setShareMessage({ type: 'ok', text: `Доступ открыт: ${data.email}` });
      loadShareMembers(editProjectId);
    } else if (data?.error === 'user_not_found') {
      setShareMessage({ type: 'error', text: 'Пользователь с таким email не найден.' });
    } else if (data?.error === 'self') {
      setShareMessage({ type: 'error', text: 'Это ваш собственный аккаунт.' });
    } else if (data?.error === 'not_owner') {
      setShareMessage({ type: 'error', text: 'Делиться может только владелец.' });
    } else {
      setShareMessage({ type: 'error', text: 'Не удалось предоставить доступ.' });
    }
  }, [editProjectId, shareEmail, loadShareMembers]);

  const handleRemoveShareMember = useCallback(async (memberUserId) => {
    if (!editProjectId || !memberUserId) return;
    const { error } = await supabase
      .from('project_members')
      .delete()
      .eq('project_id', editProjectId)
      .eq('user_id', memberUserId);
    if (!error) {
      setShareMembers((prev) => prev.filter((m) => m.user_id !== memberUserId));
    }
  }, [editProjectId]);

  const handleEditProjectSave = useCallback(() => {
    if (editProjectId && editProjectTitle.trim()) {
      updateProject(editProjectId, { title: editProjectTitle.trim() });
      setEditProjectOpen(false);
      setEditProjectId(null);
      setEditProjectTitle('');
    }
  }, [editProjectId, editProjectTitle, updateProject]);

  const [deleteProjectConfirmOpen, setDeleteProjectConfirmOpen] = useState(false);

  const handleEditProjectDeleteClick = useCallback(() => {
    if (!editProjectId) return;
    setDeleteProjectConfirmOpen(true);
  }, [editProjectId]);

  const handleConfirmDeleteProject = useCallback(() => {
    if (!editProjectId) return;
    const kind = editProjectKind;
    deleteProject(editProjectId);
    if (kind === 'board') {
      if (activeBoardId === editProjectId) {
        setActiveBoardId(null);
      }
      setViewMode('plans');
    } else {
      if (activeProjectId === editProjectId) {
        setActiveProjectId(null);
      }
      setViewMode('plans');
    }
    setEditProjectOpen(false);
    setEditProjectId(null);
    setEditProjectTitle('');
    setDeleteProjectConfirmOpen(false);
  }, [editProjectId, editProjectKind, activeBoardId, activeProjectId, deleteProject]);

  const handleCancelDeleteProject = useCallback(() => {
    setDeleteProjectConfirmOpen(false);
  }, []);

  const handleTaskContextMenu = useCallback((e, task) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, task });
  }, []);

  useEffect(() => {
    if (!contextMenu || !contextMenuRef.current) return;
    const menu = contextMenuRef.current;
    const rect = menu.getBoundingClientRect();
    let nextX = contextMenu.x;
    let nextY = contextMenu.y;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    if (rect.right > viewportWidth - 8) {
      nextX = Math.max(8, viewportWidth - rect.width - 8);
    }
    if (rect.bottom > viewportHeight - 8) {
      nextY = Math.max(8, contextMenu.y - rect.height);
    }
    if (nextX !== contextMenu.x || nextY !== contextMenu.y) {
      setContextMenu((prev) => (prev ? { ...prev, x: nextX, y: nextY } : prev));
    }
  }, [contextMenu]);

  const getTargetPayload = useCallback(
    (destination) => {
      const completed_at = contextMenu?.task?.completed_at ?? null;
      if (destination.type === 'today') {
        const todayStr = toLocalDateString(new Date());
        const containerId = getContainerId(todayStr, null, !!completed_at);
        const targetList = getTasksInContainer(tasks, containerId);
        const position = targetList.length ? Math.max(...targetList.map((t) => t.position ?? 0)) + 1 : 0;
        return { list_type: 'inbox', project_id: null, scheduled_date: todayStr, parent_id: null, position, completed_at };
      }
      if (destination.type === 'tomorrow') {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const dateStr = toLocalDateString(tomorrow);
        const containerId = getContainerId(dateStr, null, !!completed_at);
        const targetList = getTasksInContainer(tasks, containerId);
        const position = targetList.length ? Math.max(...targetList.map((t) => t.position ?? 0)) + 1 : 0;
        return { list_type: 'inbox', project_id: null, scheduled_date: dateStr, parent_id: null, position, completed_at };
      }
      if (destination.type === 'day_after_tomorrow') {
        const date = new Date();
        date.setDate(date.getDate() + 2);
        const dateStr = toLocalDateString(date);
        const containerId = getContainerId(dateStr, null, !!completed_at);
        const targetList = getTasksInContainer(tasks, containerId);
        const position = targetList.length ? Math.max(...targetList.map((t) => t.position ?? 0)) + 1 : 0;
        return { list_type: 'inbox', project_id: null, scheduled_date: dateStr, parent_id: null, position, completed_at };
      }
      if (destination.type === 'plans' || destination.type === 'no_date') {
        const containerId = getContainerId(null, null, !!completed_at);
        const targetList = getTasksInContainer(tasks, containerId);
        const position = targetList.length ? Math.max(...targetList.map((t) => t.position ?? 0)) + 1 : 0;
        return { list_type: 'inbox', project_id: null, scheduled_date: null, parent_id: null, position, completed_at };
      }
      if (destination.type === 'someday') {
        const containerId = getContainerIdForBucket('someday', null, !!completed_at);
        const targetList = getTasksInContainer(tasks, containerId);
        const position = targetList.length ? Math.max(...targetList.map((t) => t.position ?? 0)) + 1 : 0;
        return { list_type: 'someday', project_id: null, scheduled_date: null, parent_id: null, position, completed_at };
      }
      if (destination.type === 'project' && destination.projectId) {
        const containerId = getContainerIdForBucket('project', destination.projectId, !!completed_at);
        const targetList = getTasksInContainer(tasks, containerId);
        const position = targetList.length ? Math.max(...targetList.map((t) => t.position ?? 0)) + 1 : 0;
        return { list_type: 'project', project_id: destination.projectId, scheduled_date: null, parent_id: null, position, completed_at };
      }
      return null;
    },
    [tasks, contextMenu]
  );

  const handleMoveTaskToDestination = useCallback(
    (destination) => {
      if (!contextMenu?.task) return;
      const task = contextMenu.task;
      const payload = getTargetPayload(destination);
      if (!payload) return;
      const sourceContainerId = getContainerIdFromTask(task);
      moveTask(task.id, payload);
      const sourceList = getTasksInContainer(tasks, sourceContainerId).filter((t) => t.id !== task.id);
      sourceList.forEach((t, i) => updateTask(t.id, { position: i }));
      setContextMenu(null);
    },
    [contextMenu, getTargetPayload, tasks, moveTask, updateTask]
  );

  const handleContextMenuDelete = useCallback(() => {
    if (!contextMenu?.task) return;
    deleteTask(contextMenu.task.id);
    setContextMenu(null);
  }, [contextMenu, deleteTask]);

  const handleContextMenuColor = useCallback((textColor) => {
    if (!contextMenu?.task) return;
    updateTask(contextMenu.task.id, { text_color: textColor });
    setContextMenu(null);
  }, [contextMenu, updateTask]);

  const handleContextMenuFocus = useCallback(() => {
    if (!contextMenu?.task) return;
    focus.openFocus({ ref: contextMenu.task.id, title: contextMenu.task.title, source: 'task' }, 'stopwatch');
    setContextMenu(null);
  }, [contextMenu, focus]);


  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const baseDate = new Date(today);
  baseDate.setDate(baseDate.getDate() + dateOffset);
  const days =
    viewMode === 'today'
      ? [today]
      : getDays(baseDate, settings.days_count);

  const inboxTasks = useMemo(() => tasks.filter((t) => (t.list_type || 'inbox') === 'inbox'), [tasks]);

  // Subtasks by parent, for the views that are rendered here rather than by a
  // list component of their own (the kanban board and its card panel).
  const subtasksByParent = useMemo(() => {
    const map = new Map();
    for (const t of tasks) {
      if (!t.parent_id) continue;
      const list = map.get(t.parent_id);
      if (list) list.push(t);
      else map.set(t.parent_id, [t]);
    }
    for (const list of map.values()) list.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    return map;
  }, [tasks]);
  const getSubtasksOf = useCallback((parentId) => subtasksByParent.get(parentId) || [], [subtasksByParent]);

  const activeKanbanBoard = useMemo(
    () => (viewMode === 'kanban' ? projects.find((p) => p.id === activeKanbanId && p.kind === 'kanban') ?? null : null),
    [viewMode, projects, activeKanbanId],
  );
  // The card panel closes by itself when its card is gone (deleted here or by
  // someone else on a shared board).
  const openCard = useMemo(
    () => (openCardId ? kanbanCards.find((c) => c.id === openCardId) ?? null : null),
    [openCardId, kanbanCards],
  );
  const openCardLabels = useMemo(
    () => (openCard
      ? kanbanLabels.filter((l) => l.board_id === openCard.board_id).sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      : []),
    [openCard, kanbanLabels],
  );

  /**
   * A copy of a card next to the original, with its task list copied too:
   * the cards of a board are often variations of one another, and rebuilding
   * a checklist by hand each time is the tedious part.
   */
  const handleDuplicateKanbanCard = useCallback(async (card) => {
    const copy = await addKanbanCard(card.board_id, card.column_id, {
      title: card.title,
      description: card.description,
      border_color: card.border_color,
      title_color: card.title_color,
      due_date: card.due_date ?? null,
      label_ids: card.label_ids || [],
    });
    if (!copy) return;
    const siblings = kanbanCards
      .filter((c) => c.column_id === card.column_id && c.id !== copy.id)
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    const at = siblings.findIndex((c) => c.id === card.id);
    if (at >= 0) await moveKanbanCard(copy.id, card.column_id, at + 1);

    // Parents first, so a subtask can be hung on the copy of its own parent.
    const copyBranch = async (source, parentId) => {
      for (const t of source) {
        const made = await addTask({
          title: t.title,
          list_type: 'kanban',
          project_id: copy.board_id,
          card_id: copy.id,
          parent_id: parentId,
          position: t.position ?? 0,
          ...(t.text_color ? { text_color: t.text_color } : {}),
          top_style: t.top_style ?? 0,
          completed_at: t.completed_at ?? null,
        });
        if (made) await copyBranch(subtasksByParent.get(t.id) || [], made.id);
      }
    };
    const roots = tasks
      .filter((t) => t.card_id === card.id && !t.parent_id)
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    await copyBranch(roots, null);
  }, [addKanbanCard, moveKanbanCard, kanbanCards, tasks, subtasksByParent, addTask]);

  // Promises grouped by their day, for the optional reputation rows in the
  // Plans and Calendar day lists.
  const reputationByDate = useMemo(() => {
    if (!settings.show_reputation_in_lists) return null;
    const map = new Map();
    for (const p of reputationPromises || []) {
      const list = map.get(p.promise_date);
      if (list) list.push(p);
      else map.set(p.promise_date, [p]);
    }
    return map;
  }, [settings.show_reputation_in_lists, reputationPromises]);

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
      let sameBucket;
      if (payload.card_id) {
        sameBucket = tasks.filter((t) => !t.parent_id && t.card_id === payload.card_id);
      } else if (payload.list_type === 'someday') {
        sameBucket = tasks.filter((t) => !t.parent_id && (t.list_type || '') === 'someday');
      } else if (payload.list_type === 'project' && payload.project_id) {
        sameBucket = tasks.filter((t) => !t.parent_id && (t.list_type || '') === 'project' && t.project_id === payload.project_id);
      } else if (payload.scheduled_date == null && (payload.list_type || 'inbox') === 'inbox') {
        sameBucket = tasks.filter((t) => !t.parent_id && (t.list_type || 'inbox') === 'inbox' && t.scheduled_date == null);
      } else {
        sameBucket = tasks.filter((t) => !t.parent_id && t.scheduled_date === payload.scheduled_date);
      }
      const atStart = settings.new_tasks_position === 'start';
      const position = atStart
        ? (sameBucket.length ? Math.min(...sameBucket.map((t) => t.position ?? 0)) : 0) - 1
        : (sameBucket.length ? Math.max(...sameBucket.map((t) => t.position ?? 0)) : 0) + 1;
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
        list_type: parent.list_type || 'inbox',
        project_id: parent.project_id ?? null,
        card_id: parent.card_id ?? null,
        text_color: '#ffffff',
        position: maxPos + 1,
      });
    },
    [tasks, addTask]
  );

  const handleCreateSubtaskAndEdit = useCallback(
    async (task) => {
      if (!task) return;
      const bucket = inheritBucketFromTask(task, tasks);
      const siblings = tasks.filter((t) => t.parent_id === task.id);
      const maxPos = siblings.reduce((acc, t) => Math.max(acc, t.position ?? 0), 0);
      const created = await addTask({
        title: '',
        parent_id: task.id,
        scheduled_date: bucket.scheduled_date,
        list_type: bucket.list_type,
        project_id: bucket.project_id,
        card_id: bucket.card_id,
        text_color: task.text_color || '#ffffff',
        completed_at: null,
        position: maxPos + 1,
      });
      if (created?.id) setEditingTaskId(created.id);
    },
    [tasks, addTask]
  );

  const handleCreateSiblingTask = useCallback(
    async (task) => {
      if (!task) return;
      const siblings = tasks
        .filter((t) => !t.parent_id && (t.list_type || 'inbox') === (task.list_type || 'inbox') && (t.project_id ?? null) === (task.project_id ?? null) && (t.card_id ?? null) === (task.card_id ?? null) && normDate(t.scheduled_date) === normDate(task.scheduled_date))
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
      const insertPosition = (task.position ?? 0) + 1;
      siblings
        .filter((t) => (t.position ?? 0) >= insertPosition)
        .forEach((t) => updateTask(t.id, { position: (t.position ?? 0) + 1 }));
      const created = await addTask({
        title: '',
        scheduled_date: task.scheduled_date ?? null,
        list_type: task.list_type || 'inbox',
        project_id: task.project_id ?? null,
        card_id: task.card_id ?? null,
        parent_id: null,
        text_color: task.text_color || '#ffffff',
        completed_at: null,
        position: insertPosition,
      });
      if (created?.id) setEditingTaskId(created.id);
    },
    [tasks, addTask, updateTask]
  );

  const handleCreateSiblingSubtask = useCallback(
    async (task) => {
      if (!task?.parent_id) return;
      const parent = tasks.find((t) => t.id === task.parent_id);
      if (!parent) return;
      const siblings = tasks.filter((t) => t.parent_id === task.parent_id).sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
      const insertPosition = (task.position ?? 0) + 1;
      siblings
        .filter((t) => (t.position ?? 0) >= insertPosition)
        .forEach((t) => updateTask(t.id, { position: (t.position ?? 0) + 1 }));
      const created = await addTask({
        title: '',
        parent_id: task.parent_id,
        scheduled_date: parent.scheduled_date ?? null,
        list_type: parent.list_type || 'inbox',
        project_id: parent.project_id ?? null,
        card_id: parent.card_id ?? null,
        text_color: task.text_color || parent.text_color || '#ffffff',
        completed_at: null,
        position: insertPosition,
      });
      if (created?.id) setEditingTaskId(created.id);
    },
    [tasks, addTask, updateTask]
  );

  // Tasks and reputation promises of one day list, in the order they are shown.
  // Promise anchors live in this list's index space, so a drop can be turned
  // into an anchor between two neighbours.
  const getDayItems = useCallback(
    (containerId) => {
      const c = parseContainerId(containerId);
      if (!c || c.completed || c.parent_id || (c.list_type ?? 'inbox') !== 'inbox' || !c.scheduled_date) return null;
      const dayTasks = getTasksInContainer(tasks, containerId);
      const promises = reputationPromises.filter((p) => p.promise_date === c.scheduled_date);
      // Promises listed under "Выполненные задачи" are not part of the day list,
      // so they must not take up a slot in it either.
      const { open } = splitDonePromises(promises, settings.reputation_in_completed);
      return { date: c.scheduled_date, items: mergeDayItems(dayTasks, open) };
    },
    [tasks, reputationPromises, settings.reputation_in_completed],
  );

  const handleDragEnd = useCallback(
    async (event) => {
      const { active, over } = event;
      const habitIds = habits.map((h) => h.id);
      if (habitIds.includes(active.id) && over && habitIds.includes(over.id) && active.id !== over.id) {
        const oldIndex = habitIds.indexOf(active.id);
        const newIndex = habitIds.indexOf(over.id);
        const newOrder = arrayMove(habitIds, oldIndex, newIndex);
        reorderHabits(newOrder);
        return;
      }
      const projectIds = projects.map((p) => p.id);
      if (projectIds.includes(active.id) && over && projectIds.includes(over.id) && active.id !== over.id) {
        const oldIndex = projectIds.indexOf(active.id);
        const newIndex = projectIds.indexOf(over.id);
        const newOrder = arrayMove(projectIds, oldIndex, newIndex);
        await reorderProjects(newOrder);
        return;
      }
      if (!over) return;
      const droppedBelowMiddle = () => {
        const translated = active.rect.current.translated;
        const overMiddleY = over.rect.top + over.rect.height / 2;
        const pointerY = translated ? translated.top + translated.height / 2 : overMiddleY;
        return pointerY > overMiddleY;
      };
      let containerId;
      let index; // insertion index among the tasks of the container
      let mergedIndex; // insertion index among the tasks *and* promises of a day
      const slot = parseSlotId(over.id);
      const overPromiseId = parseRepDndId(over.id);
      if (slot) {
        containerId = slot.containerId;
        index = slot.index;
      } else if (overPromiseId) {
        const overPromise = reputationPromises.find((p) => p.id === overPromiseId);
        if (!overPromise) return;
        containerId = getContainerId(overPromise.promise_date, null, false);
        const day = getDayItems(containerId);
        if (!day) return;
        const at = day.items.findIndex((it) => it.promise?.id === overPromiseId);
        if (at < 0) return;
        mergedIndex = at + (droppedBelowMiddle() ? 1 : 0);
      } else {
        const overTask = tasks.find((t) => t.id === over.id);
        if (!overTask) return;
        containerId = getContainerIdFromTask(overTask);
        const list = getTasksInContainer(tasks, containerId);
        const idx = list.findIndex((t) => t.id === over.id);
        if (idx < 0) return;
        index = idx + (droppedBelowMiddle() ? 1 : 0);
      }

      // A promise row was dragged: only its anchor inside the day list (and,
      // across day cards, its date) changes — the tasks stay untouched.
      const draggedPromiseId = parseRepDndId(active.id);
      if (draggedPromiseId) {
        const moved = reputationPromises.find((p) => p.id === draggedPromiseId);
        const day = getDayItems(containerId);
        if (!moved || !day) return;
        let at = mergedIndex;
        if (at == null) {
          // Dropped on a slot line, which is drawn right above its task.
          const taskAt = day.items.findIndex((it) => it.kind === 'task' && it.anchor === index);
          at = taskAt < 0 ? day.items.length : taskAt;
        }
        const selfAt = day.items.findIndex((it) => it.promise?.id === draggedPromiseId);
        if (selfAt >= 0 && selfAt < at) at -= 1;
        const rest = day.items.filter((it) => it.promise?.id !== draggedPromiseId);
        const patch = { list_position: anchorForIndex(rest, at) };
        if (moved.promise_date !== day.date) {
          const sameDay = reputationPromises.filter((p) => p.promise_date === day.date);
          patch.promise_date = day.date;
          patch.position = sameDay.length ? Math.max(...sameDay.map((p) => p.position ?? 0)) + 1 : 0;
        }
        updateReputationPromise(draggedPromiseId, patch);
        return;
      }

      // A task dropped on a promise row lands where that row is.
      if (index == null) {
        const day = getDayItems(containerId);
        if (!day) return;
        index = day.items
          .slice(0, mergedIndex)
          .filter((it) => it.kind === 'task' && it.task.id !== active.id).length;
      }

      const movedTask = tasks.find((t) => t.id === active.id);
      if (!movedTask) return;
      const targetConfig = parseContainerId(containerId);
      if (!targetConfig) return;
      let scheduled_date = targetConfig.scheduled_date;
      let parent_id = targetConfig.parent_id ?? null;
      let list_type = targetConfig.list_type ?? 'inbox';
      let project_id = targetConfig.project_id ?? null;
      let card_id = targetConfig.card_id ?? null;
      if (targetConfig.parent_id) {
        const parentTask = tasks.find((t) => t.id === targetConfig.parent_id);
        scheduled_date = parentTask?.scheduled_date ?? null;
        list_type = parentTask?.list_type ?? 'inbox';
        project_id = parentTask?.project_id ?? null;
        card_id = parentTask?.card_id ?? null;
      } else if (card_id) {
        // The board of a card is not part of the container id, so the task
        // takes it from the card itself: that is what shares it with everyone
        // the board is shared with.
        project_id = kanbanCards.find((c) => c.id === card_id)?.board_id ?? null;
      }
      const completed_at = targetConfig.completed ? new Date().toISOString() : null;

      const targetList = getTasksInContainer(tasks, containerId);
      const sourceContainerId = getContainerIdFromTask(movedTask);
      const targetIds = targetList.map((t) => t.id).filter((id) => id !== movedTask.id);
      targetIds.splice(index, 0, movedTask.id);
      const newOrderedIds = targetIds;

      const updates = [];
      updates.push({ id: movedTask.id, payload: { scheduled_date, parent_id, completed_at, position: index, list_type, project_id, card_id } });
      for (let i = 0; i < newOrderedIds.length; i++) {
        if (newOrderedIds[i] !== movedTask.id) {
          updates.push({ id: newOrderedIds[i], payload: { position: i } });
        }
      }
      if (sourceContainerId !== containerId) {
        const sourceList = getTasksInContainer(tasks, sourceContainerId).filter((t) => t.id !== movedTask.id);
        for (let i = 0; i < sourceList.length; i++) {
          updates.push({ id: sourceList[i].id, payload: { position: i } });
        }
      }
      updates.forEach(({ id, payload }) => {
        if (id === movedTask.id) {
          moveTask(id, payload);
        } else {
          updateTask(id, payload);
        }
      });
    },
    [tasks, projects, habits, moveTask, updateTask, reorderProjects, reorderHabits, reputationPromises, updateReputationPromise, getDayItems, kanbanCards]
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const handleDragStart = useCallback(
    (event) => {
      if (habits.some((h) => h.id === event.active.id)) {
        setActiveHabitDragId(event.active.id);
        setActiveDragId(null);
        setActiveProjectDragId(null);
      } else if (projects.some((p) => p.id === event.active.id)) {
        setActiveProjectDragId(event.active.id);
        setActiveDragId(null);
        setActiveHabitDragId(null);
      } else {
        setActiveDragId(event.active.id);
        setActiveProjectDragId(null);
        setActiveHabitDragId(null);
      }
    },
    [habits, projects]
  );

  const handleDragEndWithClear = useCallback(
    async (event) => {
      await handleDragEnd(event);
      setActiveDragId(null);
      setActiveProjectDragId(null);
      setActiveHabitDragId(null);
    },
    [handleDragEnd]
  );

  const activeTask = activeDragId ? tasks.find((t) => t.id === activeDragId) : null;
  const activeDragPromise = useMemo(() => {
    const id = parseRepDndId(activeDragId);
    return id ? reputationPromises.find((p) => p.id === id) : null;
  }, [activeDragId, reputationPromises]);

  // Pointer-down on the right-edge resize handle of the side menu. Tracks
  // pointer movement against `window` so the drag survives the cursor
  // leaving the handle, and only persists the new width if it actually
  // changed (a stray click on the divider should be a no-op).
  const handleMenuResizePointerDown = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startW = sidebarWidthPx;
      document.body.style.cursor = 'ew-resize';
      document.body.style.userSelect = 'none';
      let lastWidth = startW;
      const onMove = (ev) => {
        const dx = ev.clientX - startX;
        const next = clampSidebarWidthPx(startW + dx);
        lastWidth = next;
        setResizingMenuWidth(next);
      };
      const onUp = () => {
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
        if (lastWidth !== startW) {
          Promise.resolve(setSidebarWidthPx(lastWidth)).finally(() => setResizingMenuWidth(null));
        } else {
          setResizingMenuWidth(null);
        }
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    },
    [sidebarWidthPx, setSidebarWidthPx]
  );

  const liveTaskFontWeight = fontModalOpen ? fontWeightDraft : settings.task_font_weight;
  const liveTaskFontScale = fontModalOpen ? fontScaleDraft : settings.task_font_scale;

  useEffect(() => {
    const w = taskFontWeightToCssNumber(normalizeTaskFontWeight(liveTaskFontWeight));
    const s = normalizeTaskFontScale(liveTaskFontScale);
    document.documentElement.style.setProperty('--task-font-weight', String(w));
    document.documentElement.style.setProperty('--task-font-scale', String(s));
  }, [liveTaskFontWeight, liveTaskFontScale]);

  const openFontModal = useCallback(() => {
    setFontWeightDraft(normalizeTaskFontWeight(settings.task_font_weight));
    setFontScaleDraft(normalizeTaskFontScale(settings.task_font_scale));
    setFontModalOpen(true);
  }, [settings.task_font_weight, settings.task_font_scale]);

  const saveFontModal = useCallback(async () => {
    await setTaskFontWeight(fontWeightDraft);
    await setTaskFontScale(fontScaleDraft);
    setFontModalOpen(false);
  }, [fontWeightDraft, fontScaleDraft, setTaskFontWeight, setTaskFontScale]);

  const menuOrderSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const openMenuOrderModal = useCallback(() => {
    setMenuOrderDraft(projects.map((p) => p.id));
    // Seed the visibility draft from currently persisted state.
    const draft = {};
    BUILTIN_MENU_ITEMS.forEach((item) => {
      const key = menuHiddenKey('builtin', item.key);
      draft[key] = !!getListCollapsed?.(key);
    });
    projects.forEach((p) => {
      const key = menuHiddenKey('project', p.id);
      draft[key] = !!getListCollapsed?.(key);
    });
    setMenuVisDraft(draft);
    setMenuOrderModalOpen(true);
  }, [projects, getListCollapsed]);

  const toggleMenuVisDraft = useCallback((key) => {
    setMenuVisDraft((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  // Live read of menu visibility (true means the row is hidden).
  const isBuiltinHidden = useCallback(
    (key) => !!getListCollapsed?.(menuHiddenKey('builtin', key)),
    [getListCollapsed]
  );
  const isProjectHidden = useCallback(
    (id) => !!getListCollapsed?.(menuHiddenKey('project', id)),
    [getListCollapsed]
  );

  const handleMenuOrderDragStart = useCallback((event) => {
    setMenuOrderActiveId(event.active?.id ?? null);
  }, []);

  const handleMenuOrderDragEnd = useCallback((event) => {
    setMenuOrderActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setMenuOrderDraft((prev) => {
      const oldIndex = prev.indexOf(active.id);
      const newIndex = prev.indexOf(over.id);
      if (oldIndex < 0 || newIndex < 0) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  }, []);

  const saveMenuOrder = useCallback(async () => {
    if (projects.length > 1) {
      await reorderProjects(menuOrderDraft);
    }
    // Persist only the visibility flags that actually changed compared to
    // the live state, so we don't generate noise on the user_list_collapsed
    // table for unchanged rows.
    const writes = [];
    Object.entries(menuVisDraft).forEach(([key, hidden]) => {
      const current = !!getListCollapsed?.(key);
      if (current !== !!hidden) writes.push(setListCollapsed?.(key, !!hidden));
    });
    if (writes.length) await Promise.all(writes);
    setMenuOrderModalOpen(false);
  }, [menuOrderDraft, menuVisDraft, projects.length, reorderProjects, getListCollapsed, setListCollapsed]);

  const activeMenuOrderProject = menuOrderActiveId
    ? projects.find((p) => p.id === menuOrderActiveId)
    : null;

  const renderFontMenuButton = () => (
    <button
      type="button"
      className="dashboard-menu__font-btn"
      onMouseEnter={() => hasHover && setTextFontBtnHover(true)}
      onMouseLeave={() => hasHover && setTextFontBtnHover(false)}
      onClick={openFontModal}
      aria-label="Изменить размер шрифта"
    >
      <img src={hasHover && textFontBtnHover ? textNavIcon : textIcon} alt="" />
    </button>
  );

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEndWithClear}>
    <div
      className={`dashboard ${menuOpen && isWideMenu ? 'dashboard--menu-open' : ''} ${viewMode === 'habits' ? 'dashboard--habits' : ''} ${viewMode === 'board' ? 'dashboard--board' : ''} ${viewMode === 'board' && !activeBoardId ? 'dashboard--board-pdf-only' : ''} ${viewMode === 'kanban' ? 'dashboard--kanban' : ''} ${viewMode === 'goal_plan' ? 'dashboard--goal-plan' : ''}`}
      style={{
        '--sidebar-width': `${liveMenuWidth}px`,
        '--task-font-weight': String(taskFontWeightToCssNumber(normalizeTaskFontWeight(liveTaskFontWeight))),
        '--task-font-scale': String(normalizeTaskFontScale(liveTaskFontScale)),
      }}
    >
      <header className="dashboard__header">
        <div className="dashboard__header-row">
          <div className="dashboard__top-left">
            <button
              type="button"
              className="dashboard__menu-btn"
              onMouseEnter={() => hasHover && setMenuHover(true)}
              onMouseLeave={() => hasHover && setMenuHover(false)}
              onClick={() => (menuOpen ? closeMenu() : openMenu())}
              aria-label="Меню"
            >
              <img src={hasHover && menuHover ? menuNavIcon : menuIcon} alt="" />
            </button>
            {viewMode === 'board' && (
              <div
                ref={setBoardHeaderLeftSlot}
                className="dashboard__board-header-slot dashboard__board-header-slot--left"
              />
            )}
            {(viewMode === 'plans' || viewMode === 'goal_plan' || viewMode === 'calendar') && (
              <>
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
                <button type="button" className="dashboard__shift-btn" onMouseEnter={() => hasHover && setDateLeftHover(true)} onMouseLeave={() => hasHover && setDateLeftHover(false)} onClick={() => setDateOffset((o) => o - 1)} aria-label="Назад">
                  <img src={hasHover && dateLeftHover ? leftNavIcon : leftIcon} alt="" />
                </button>
                <button
                  type="button"
                  className="dashboard__shift-btn dashboard__shift-btn--today"
                  onMouseEnter={() => hasHover && setDateTodayHover(true)}
                  onMouseLeave={() => hasHover && setDateTodayHover(false)}
                  onClick={() => setDateOffset(0)}
                  aria-label="Сегодня"
                >
                  <span className={`dashboard__shift-today-dot ${hasHover && dateTodayHover ? 'dashboard__shift-today-dot--hover' : ''}`} aria-hidden />
                </button>
                <button type="button" className="dashboard__shift-btn" onMouseEnter={() => hasHover && setDateRightHover(true)} onMouseLeave={() => hasHover && setDateRightHover(false)} onClick={() => setDateOffset((o) => o + 1)} aria-label="Вперёд">
                  <img src={hasHover && dateRightHover ? rightNavIcon : rightIcon} alt="" />
                </button>
                {viewMode === 'plans' && (
                  <>
                    <TodayFocusTotal onOpen={() => handleMenuSelect('focus_analytics')} />
                    <FocusQuickStart />
                  </>
                )}
              </>
            )}
            {viewMode === 'calendar' && (
              <span className="dashboard__calendar-hours">
                <select
                  value={settings.calendar_scale}
                  onChange={(e) => setCalendarScale(Number(e.target.value))}
                  className="dashboard__select"
                  aria-label="Масштаб временной шкалы"
                  title="Масштаб временной шкалы"
                >
                  {Array.from({ length: 11 }, (_, i) => Math.round((1 + i * 0.2) * 10) / 10).map((s) => (
                    <option key={s} value={s}>{(Number.isInteger(s) ? String(s) : s.toFixed(1).replace('.', ',')) + 'x'}</option>
                  ))}
                </select>
                <TodayFocusTotal onOpen={() => handleMenuSelect('focus_analytics')} />
                <FocusQuickStart />
              </span>
            )}
            {viewMode === 'kanban' && (
              <>
                <TodayFocusTotal onOpen={() => handleMenuSelect('focus_analytics')} />
                <FocusQuickStart />
              </>
            )}
            {viewMode === 'focus_analytics' && (
              <>
                <HeaderSectionLink
                  icon={plansIcon}
                  hoverIcon={plansNavIcon}
                  label="Планы"
                  onClick={() => handleMenuSelect('plans')}
                />
                <HeaderSectionLink
                  icon={calendarIcon}
                  hoverIcon={calendarNavIcon}
                  label="Календарь"
                  onClick={() => handleMenuSelect('calendar')}
                />
                <HeaderSectionLink
                  icon={kanbanIcon}
                  hoverIcon={kanbanNavIcon}
                  label="Канбан-доски"
                  onClick={openFirstKanban}
                />
              </>
            )}
            {viewMode === 'reputation' && (
              <div ref={setRepHeaderSlot} className="dashboard__rep-header-slot" />
            )}
          </div>
          <div className="dashboard__header-actions">
            {viewMode === 'board' && (
              <div
                ref={setBoardHeaderRightSlot}
                className="dashboard__board-header-slot dashboard__board-header-slot--right"
              />
            )}
            {viewMode !== 'habits' && viewMode !== 'board' && viewMode !== 'kanban' && viewMode !== 'goal_plan' && viewMode !== 'focus_analytics' && viewMode !== 'reputation' && (
            <button type="button" className="dashboard__icon-btn" onMouseEnter={() => hasHover && setEyeHover(true)} onMouseLeave={() => hasHover && setEyeHover(false)} onClick={toggleCompletedVisibleForList} aria-label={completedVisible ? 'Скрыть выполненные' : 'Показать выполненные'}>
              <img src={completedVisible ? (hasHover && eyeHover ? eyeoffNavIcon : eyeoffIcon) : hasHover && eyeHover ? eyeNavIcon : eyeIcon} alt="" />
            </button>
            )}
            {viewMode !== 'board' && viewMode !== 'kanban' && viewMode !== 'reputation' && (
            <button type="button" className="dashboard__icon-btn" onMouseEnter={() => hasHover && setSettingsHover(true)} onMouseLeave={() => hasHover && setSettingsHover(false)} onClick={() => setSettingsOpen((v) => !v)} aria-label="Настройки">
              <img src={hasHover && settingsHover ? settingsNavIcon : settingsIcon} alt="" />
            </button>
            )}
            <button type="button" className="dashboard__icon-btn" onMouseEnter={() => hasHover && setExitHover(true)} onMouseLeave={() => hasHover && setExitHover(false)} onClick={signOut} aria-label="Выйти">
              <img src={hasHover && exitHover ? exitNavIcon : exitIcon} alt="" />
            </button>
          </div>
        </div>
      </header>

      {(menuOpen || mobileMenuClosing) && (
        isWideMenu ? (
          <nav
            className={`dashboard-menu dashboard-menu--side ${!menuOpen && mobileMenuClosing ? 'dashboard-menu--closing' : ''}`}
            style={{ width: `${liveMenuWidth}px` }}
          >
            <div
              className="dashboard-menu__resize-handle"
              onPointerDown={handleMenuResizePointerDown}
              role="separator"
              aria-orientation="vertical"
              aria-label="Изменить ширину меню"
              title="Перетащите, чтобы изменить ширину"
            />
            <div className="dashboard-menu__body">
              {!isBuiltinHidden('today') && (
                <button
                  type="button"
                  className={`dashboard-menu__item ${viewMode === 'today' ? 'dashboard-menu__item--active' : ''}`}
                  onMouseEnter={() => hasHover && setTodayHover(true)}
                  onMouseLeave={() => hasHover && setTodayHover(false)}
                  onClick={() => handleMenuSelect('today')}
                >
                  <img src={viewMode === 'today' || (hasHover && todayHover) ? starNavIcon : starIcon} alt="" />
                  <span>Сегодня</span>
                </button>
              )}
              {!isBuiltinHidden('plans') && (
                <button
                  type="button"
                  className={`dashboard-menu__item ${viewMode === 'plans' ? 'dashboard-menu__item--active' : ''}`}
                  onMouseEnter={() => hasHover && setPlansHover(true)}
                  onMouseLeave={() => hasHover && setPlansHover(false)}
                  onClick={() => handleMenuSelect('plans')}
                >
                  <img src={viewMode === 'plans' || (hasHover && plansHover) ? plansNavIcon : plansIcon} alt="" />
                  <span>Планы</span>
                </button>
              )}
              {!isBuiltinHidden('calendar') && (
                <button
                  type="button"
                  className={`dashboard-menu__item ${viewMode === 'calendar' ? 'dashboard-menu__item--active' : ''}`}
                  onMouseEnter={() => hasHover && setCalendarMenuHover(true)}
                  onMouseLeave={() => hasHover && setCalendarMenuHover(false)}
                  onClick={() => handleMenuSelect('calendar')}
                >
                  <img src={viewMode === 'calendar' || (hasHover && calendarMenuHover) ? calendarNavIcon : calendarIcon} alt="" />
                  <span>Календарь</span>
                </button>
              )}
              {!isBuiltinHidden('reputation') && (
                <button
                  type="button"
                  className={`dashboard-menu__item ${viewMode === 'reputation' ? 'dashboard-menu__item--active' : ''}`}
                  onMouseEnter={() => hasHover && setReputationMenuHover(true)}
                  onMouseLeave={() => hasHover && setReputationMenuHover(false)}
                  onClick={() => handleMenuSelect('reputation')}
                >
                  <img src={viewMode === 'reputation' || (hasHover && reputationMenuHover) ? goalNavIcon : goalIcon} alt="" />
                  <span>Репутация перед собой</span>
                </button>
              )}
              {!isBuiltinHidden('goal_plan') && (
                <button
                  type="button"
                  className={`dashboard-menu__item ${viewMode === 'goal_plan' ? 'dashboard-menu__item--active' : ''}`}
                  onMouseEnter={() => hasHover && setGoalPlanHover(true)}
                  onMouseLeave={() => hasHover && setGoalPlanHover(false)}
                  onClick={() => handleMenuSelect('goal_plan')}
                >
                  <img src={viewMode === 'goal_plan' || (hasHover && goalPlanHover) ? goalNavIcon : goalIcon} alt="" />
                  <span>Планы с целями</span>
                </button>
              )}
              {!isBuiltinHidden('no_date') && (
                <button
                  type="button"
                  className={`dashboard-menu__item ${viewMode === 'no_date' ? 'dashboard-menu__item--active' : ''}`}
                  onMouseEnter={() => hasHover && setNoDateHover(true)}
                  onMouseLeave={() => hasHover && setNoDateHover(false)}
                  onClick={() => handleMenuSelect('no_date')}
                >
                  <img src={viewMode === 'no_date' || (hasHover && noDateHover) ? layersNavIcon : layersIcon} alt="" />
                  <span>Задачи без даты</span>
                </button>
              )}
              {!isBuiltinHidden('someday') && (
                <button
                  type="button"
                  className={`dashboard-menu__item ${viewMode === 'someday' ? 'dashboard-menu__item--active' : ''}`}
                  onMouseEnter={() => hasHover && setSomedayHover(true)}
                  onMouseLeave={() => hasHover && setSomedayHover(false)}
                  onClick={() => handleMenuSelect('someday')}
                >
                  <img src={viewMode === 'someday' || (hasHover && somedayHover) ? archiveNavIcon : archiveIcon} alt="" />
                  <span>Когда-нибудь</span>
                </button>
              )}
              {!isBuiltinHidden('habits') && (
                <button
                  type="button"
                  className={`dashboard-menu__item ${viewMode === 'habits' ? 'dashboard-menu__item--active' : ''}`}
                  onMouseEnter={() => hasHover && setHabitsHover(true)}
                  onMouseLeave={() => hasHover && setHabitsHover(false)}
                  onClick={() => handleMenuSelect('habits')}
                >
                  <img src={viewMode === 'habits' || (hasHover && habitsHover) ? privNavIcon : privIcon} alt="" />
                  <span>Привычки</span>
                </button>
              )}
              {!isBuiltinHidden('focus_analytics') && (
                <button
                  type="button"
                  className={`dashboard-menu__item ${viewMode === 'focus_analytics' ? 'dashboard-menu__item--active' : ''}`}
                  onMouseEnter={() => hasHover && setFocusHover(true)}
                  onMouseLeave={() => hasHover && setFocusHover(false)}
                  onClick={() => handleMenuSelect('focus_analytics')}
                >
                  <img src={viewMode === 'focus_analytics' || (hasHover && focusHover) ? focusNavIcon : focusIcon} alt="" />
                  <span>Фокус</span>
                </button>
              )}
              <SortableContext items={projects.map((p) => p.id)} strategy={verticalListSortingStrategy}>
                {projects.filter((p) => !isProjectHidden(p.id)).map((p) => {
                  const kind = p.kind || 'project';
                  const [iconDefault, iconHover] = projectIcons(kind);
                  const isActive = kind === 'board'
                    ? viewMode === 'board' && activeBoardId === p.id
                    : kind === 'kanban'
                      ? viewMode === 'kanban' && activeKanbanId === p.id
                      : viewMode === 'project' && activeProjectId === p.id;
                  return (
                    <SortableProjectItem
                      key={p.id}
                      project={p}
                      isActive={isActive}
                      isHover={hasHover && projectHoverId === p.id}
                      iconDefault={iconDefault}
                      iconHover={iconHover}
                      onClick={() => handleMenuSelect(p.id)}
                      onMouseEnter={() => setProjectHoverId(p.id)}
                      onMouseLeave={() => setProjectHoverId((cur) => (cur === p.id ? null : cur))}
                      dirty={kind === 'board' && boardDirtyIds.has(p.id)}
                    />
                  );
                })}
              </SortableContext>
            </div>
            <div className="dashboard-menu__bottom-tools">
              <button
                type="button"
                className="dashboard-menu__add-project dashboard-menu__add-project--in-bottom"
                onMouseEnter={() => hasHover && setAddProjectBtnHover(true)}
                onMouseLeave={() => hasHover && setAddProjectBtnHover(false)}
                onClick={() => setAddProjectModalOpen(true)}
                aria-label="Добавить проект"
              >
                <img src={hasHover && addProjectBtnHover ? plusNavIcon : plusIcon} alt="" />
              </button>
              {renderFontMenuButton()}
              <button
                type="button"
                className="dashboard-menu__order-btn"
                onMouseEnter={() => hasHover && setMenuOrderBtnHover(true)}
                onMouseLeave={() => hasHover && setMenuOrderBtnHover(false)}
                onClick={openMenuOrderModal}
                aria-label="Порядок и видимость пунктов меню"
              >
                <img src={hasHover && menuOrderBtnHover ? dragNavIcon : dragIcon} alt="" />
              </button>
              <button
                type="button"
                className="dashboard-menu__order-btn dashboard-menu__theme-btn"
                onMouseEnter={() => hasHover && setThemeBtnHover(true)}
                onMouseLeave={() => hasHover && setThemeBtnHover(false)}
                onClick={() => setTheme(settings.theme === 'light' ? 'dark' : 'light')}
                aria-label={settings.theme === 'light' ? 'Включить тёмную тему' : 'Включить светлую тему'}
                title={settings.theme === 'light' ? 'Тёмная тема' : 'Светлая тема'}
              >
                <img
                  src={
                    settings.theme === 'light'
                      ? (hasHover && themeBtnHover ? moonNavIcon : moonIcon)
                      : (hasHover && themeBtnHover ? sunNavIcon : sunIcon)
                  }
                  alt=""
                />
              </button>
            </div>
          </nav>
        ) : (
          <div className={`dashboard-menu-overlay ${mobileMenuClosing ? 'dashboard-menu-overlay--closing' : ''}`} onClick={closeMenu}>
            <nav
              className={`dashboard-menu dashboard-menu--mobile ${mobileMenuClosing ? 'dashboard-menu--closing' : ''}`}
              style={{ width: '100%' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="dashboard-menu__mobile-top">
                {!isBuiltinHidden('today') ? (
                  <button
                    type="button"
                    className={`dashboard-menu__item ${viewMode === 'today' ? 'dashboard-menu__item--active' : ''}`}
                    onMouseEnter={() => hasHover && setTodayHover(true)}
                    onMouseLeave={() => hasHover && setTodayHover(false)}
                    onClick={() => handleMenuSelect('today')}
                  >
                    <img src={viewMode === 'today' || (hasHover && todayHover) ? starNavIcon : starIcon} alt="" />
                    <span>Сегодня</span>
                  </button>
                ) : <span />}
                <button
                  type="button"
                  className="dashboard-menu__close"
                  onClick={closeMenu}
                  aria-label="Закрыть меню"
                >
                  ×
                </button>
              </div>
              {!isBuiltinHidden('plans') && (
                <button
                  type="button"
                  className={`dashboard-menu__item ${viewMode === 'plans' ? 'dashboard-menu__item--active' : ''}`}
                  onMouseEnter={() => hasHover && setPlansHover(true)}
                  onMouseLeave={() => hasHover && setPlansHover(false)}
                  onClick={() => handleMenuSelect('plans')}
                >
                  <img src={viewMode === 'plans' || (hasHover && plansHover) ? plansNavIcon : plansIcon} alt="" />
                  <span>Планы</span>
                </button>
              )}
              {!isBuiltinHidden('calendar') && (
                <button
                  type="button"
                  className={`dashboard-menu__item ${viewMode === 'calendar' ? 'dashboard-menu__item--active' : ''}`}
                  onMouseEnter={() => hasHover && setCalendarMenuHover(true)}
                  onMouseLeave={() => hasHover && setCalendarMenuHover(false)}
                  onClick={() => handleMenuSelect('calendar')}
                >
                  <img src={viewMode === 'calendar' || (hasHover && calendarMenuHover) ? calendarNavIcon : calendarIcon} alt="" />
                  <span>Календарь</span>
                </button>
              )}
              {!isBuiltinHidden('reputation') && (
                <button
                  type="button"
                  className={`dashboard-menu__item ${viewMode === 'reputation' ? 'dashboard-menu__item--active' : ''}`}
                  onMouseEnter={() => hasHover && setReputationMenuHover(true)}
                  onMouseLeave={() => hasHover && setReputationMenuHover(false)}
                  onClick={() => handleMenuSelect('reputation')}
                >
                  <img src={viewMode === 'reputation' || (hasHover && reputationMenuHover) ? goalNavIcon : goalIcon} alt="" />
                  <span>Репутация перед собой</span>
                </button>
              )}
              {!isBuiltinHidden('goal_plan') && (
                <button
                  type="button"
                  className={`dashboard-menu__item ${viewMode === 'goal_plan' ? 'dashboard-menu__item--active' : ''}`}
                  onMouseEnter={() => hasHover && setGoalPlanHover(true)}
                  onMouseLeave={() => hasHover && setGoalPlanHover(false)}
                  onClick={() => handleMenuSelect('goal_plan')}
                >
                  <img src={viewMode === 'goal_plan' || (hasHover && goalPlanHover) ? goalNavIcon : goalIcon} alt="" />
                  <span>Планы с целями</span>
                </button>
              )}
              {!isBuiltinHidden('no_date') && (
                <button
                  type="button"
                  className={`dashboard-menu__item ${viewMode === 'no_date' ? 'dashboard-menu__item--active' : ''}`}
                  onMouseEnter={() => hasHover && setNoDateHover(true)}
                  onMouseLeave={() => hasHover && setNoDateHover(false)}
                  onClick={() => handleMenuSelect('no_date')}
                >
                  <img src={viewMode === 'no_date' || (hasHover && noDateHover) ? layersNavIcon : layersIcon} alt="" />
                  <span>Задачи без даты</span>
                </button>
              )}
              {!isBuiltinHidden('someday') && (
                <button
                  type="button"
                  className={`dashboard-menu__item ${viewMode === 'someday' ? 'dashboard-menu__item--active' : ''}`}
                  onMouseEnter={() => hasHover && setSomedayHover(true)}
                  onMouseLeave={() => hasHover && setSomedayHover(false)}
                  onClick={() => handleMenuSelect('someday')}
                >
                  <img src={viewMode === 'someday' || (hasHover && somedayHover) ? archiveNavIcon : archiveIcon} alt="" />
                  <span>Когда-нибудь</span>
                </button>
              )}
              {!isBuiltinHidden('habits') && (
                <button
                  type="button"
                  className={`dashboard-menu__item ${viewMode === 'habits' ? 'dashboard-menu__item--active' : ''}`}
                  onMouseEnter={() => hasHover && setHabitsHover(true)}
                  onMouseLeave={() => hasHover && setHabitsHover(false)}
                  onClick={() => handleMenuSelect('habits')}
                >
                  <img src={viewMode === 'habits' || (hasHover && habitsHover) ? privNavIcon : privIcon} alt="" />
                  <span>Привычки</span>
                </button>
              )}
              {!isBuiltinHidden('focus_analytics') && (
                <button
                  type="button"
                  className={`dashboard-menu__item ${viewMode === 'focus_analytics' ? 'dashboard-menu__item--active' : ''}`}
                  onMouseEnter={() => hasHover && setFocusHover(true)}
                  onMouseLeave={() => hasHover && setFocusHover(false)}
                  onClick={() => handleMenuSelect('focus_analytics')}
                >
                  <img src={viewMode === 'focus_analytics' || (hasHover && focusHover) ? focusNavIcon : focusIcon} alt="" />
                  <span>Фокус</span>
                </button>
              )}
              <SortableContext items={projects.map((p) => p.id)} strategy={verticalListSortingStrategy}>
                {projects.filter((p) => !isProjectHidden(p.id)).map((p) => {
                  const kind = p.kind || 'project';
                  const [iconDefault, iconHover] = projectIcons(kind);
                  const isActive = kind === 'board'
                    ? viewMode === 'board' && activeBoardId === p.id
                    : kind === 'kanban'
                      ? viewMode === 'kanban' && activeKanbanId === p.id
                      : viewMode === 'project' && activeProjectId === p.id;
                  return (
                    <SortableProjectItem
                      key={p.id}
                      project={p}
                      isActive={isActive}
                      isHover={hasHover && projectHoverId === p.id}
                      iconDefault={iconDefault}
                      iconHover={iconHover}
                      onClick={() => handleMenuSelect(p.id)}
                      onMouseEnter={() => setProjectHoverId(p.id)}
                      onMouseLeave={() => setProjectHoverId((cur) => (cur === p.id ? null : cur))}
                      dirty={kind === 'board' && boardDirtyIds.has(p.id)}
                    />
                  );
                })}
              </SortableContext>
              <button
                type="button"
                className="dashboard-menu__add-project"
                onClick={() => { setAddProjectModalOpen(true); closeMenu(); }}
                aria-label="Добавить проект"
              >
                +
                <span className="dashboard-menu__add-project-text">Добавить проект</span>
              </button>
              <div className="dashboard-menu__mobile-font-row">
                {renderFontMenuButton()}
                <button
                  type="button"
                  className="dashboard-menu__order-btn"
                  onMouseEnter={() => hasHover && setMenuOrderBtnHover(true)}
                  onMouseLeave={() => hasHover && setMenuOrderBtnHover(false)}
                  onClick={openMenuOrderModal}
                  aria-label="Порядок и видимость пунктов меню"
                >
                  <img src={hasHover && menuOrderBtnHover ? dragNavIcon : dragIcon} alt="" />
                </button>
                <button
                  type="button"
                  className="dashboard-menu__order-btn dashboard-menu__theme-btn"
                  onMouseEnter={() => hasHover && setThemeBtnHover(true)}
                  onMouseLeave={() => hasHover && setThemeBtnHover(false)}
                  onClick={() => setTheme(settings.theme === 'light' ? 'dark' : 'light')}
                  aria-label={settings.theme === 'light' ? 'Включить тёмную тему' : 'Включить светлую тему'}
                  title={settings.theme === 'light' ? 'Тёмная тема' : 'Светлая тема'}
                >
                  <img
                    src={
                      settings.theme === 'light'
                        ? (hasHover && themeBtnHover ? moonNavIcon : moonIcon)
                        : (hasHover && themeBtnHover ? sunNavIcon : sunIcon)
                    }
                    alt=""
                  />
                </button>
              </div>
            </nav>
          </div>
        )
      )}

      {addProjectModalOpen && (
        <div className="dashboard__settings-overlay" onClick={() => { setAddProjectModalOpen(false); setAddProjectKind('project'); }}>
          <div className="dashboard__settings-popup dashboard__settings-popup--new-project" onClick={(e) => e.stopPropagation()}>
            <div className="dashboard__settings-title">{kindWords(addProjectKind).createTitle}</div>
            <div
              className={`dashboard__kind-toggle dashboard__kind-toggle--${addProjectKind}`}
              role="tablist"
              aria-label="Тип нового элемента"
            >
              <span className="dashboard__kind-toggle-indicator" aria-hidden="true" />
              {['project', 'board', 'kanban'].map((kind) => (
                <button
                  key={kind}
                  type="button"
                  role="tab"
                  aria-selected={addProjectKind === kind}
                  className={`dashboard__kind-toggle-option ${addProjectKind === kind ? 'dashboard__kind-toggle-option--active' : ''}`}
                  onClick={() => setAddProjectKind(kind)}
                >
                  <img src={projectIcons(kind)[0]} alt="" className="dashboard__kind-toggle-icon" />
                  <span>{kindWords(kind).tab}</span>
                </button>
              ))}
            </div>
            <input
              type="text"
              className="dashboard__settings-input"
              value={addProjectTitle}
              onChange={(e) => setAddProjectTitle(e.target.value)}
              placeholder={kindWords(addProjectKind).namePlaceholder}
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') handleAddProjectSubmit(); }}
            />
            <button type="button" className="dashboard__settings-submit" onClick={handleAddProjectSubmit}>
              {kindWords(addProjectKind).createButton}
            </button>
          </div>
        </div>
      )}

      {editProjectOpen && (
        <div className="dashboard__settings-overlay" onClick={() => { setEditProjectOpen(false); setEditProjectId(null); setEditProjectTitle(''); }}>
          <div className="dashboard__settings-popup dashboard__settings-popup--edit-project" onClick={(e) => e.stopPropagation()}>
            <div className="dashboard__settings-title">{kindWords(editProjectKind).editTitle}</div>
            <input
              type="text"
              className="dashboard__settings-input"
              value={editProjectTitle}
              onChange={(e) => setEditProjectTitle(e.target.value)}
              placeholder={kindWords(editProjectKind).namePlaceholder}
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') handleEditProjectSave(); }}
            />
            {editProjectIsOwner && (
              <div className="dashboard__share">
                <div className="dashboard__share-label">Совместный доступ</div>
                <div className="dashboard__share-row">
                  <input
                    type="email"
                    className="dashboard__settings-input dashboard__share-input"
                    value={shareEmail}
                    onChange={(e) => { setShareEmail(e.target.value); setShareMessage(null); }}
                    placeholder="email пользователя"
                    autoComplete="off"
                    onKeyDown={(e) => { if (e.key === 'Enter') handleShareProject(); }}
                  />
                  <button
                    type="button"
                    className="dashboard__share-btn"
                    onClick={handleShareProject}
                    disabled={shareBusy || !shareEmail.trim()}
                  >
                    {shareBusy ? '...' : 'Поделиться'}
                  </button>
                </div>
                {shareMessage && (
                  <p className={`dashboard__share-msg dashboard__share-msg--${shareMessage.type}`}>{shareMessage.text}</p>
                )}
                {shareMembers.length > 0 && (
                  <ul className="dashboard__share-members">
                    {shareMembers.map((m) => (
                      <li key={m.user_id} className="dashboard__share-member">
                        <span className="dashboard__share-member-email">{m.email}</span>
                        <button
                          type="button"
                          className="dashboard__share-member-remove"
                          onClick={() => handleRemoveShareMember(m.user_id)}
                          aria-label="Убрать доступ"
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            <div className="dashboard__settings-edit-actions">
              <button type="button" className="dashboard__settings-submit" onClick={handleEditProjectSave}>
                Сохранить
              </button>
              {editProjectIsOwner && (
                <button type="button" className="dashboard__settings-delete" onClick={handleEditProjectDeleteClick}>
                  {kindWords(editProjectKind).deleteButton}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {deleteProjectConfirmOpen && (
        <div className="dashboard__settings-overlay" onClick={handleCancelDeleteProject}>
          <div className="dashboard__settings-popup" onClick={(e) => e.stopPropagation()}>
            <div className="dashboard__settings-title">{kindWords(editProjectKind).deleteTitle}</div>
            <p className="dashboard__confirm-text">{kindWords(editProjectKind).deleteText}</p>
            <div className="dashboard__settings-edit-actions">
              <button type="button" className="dashboard__settings-submit" onClick={handleCancelDeleteProject}>
                Отмена
              </button>
              <button type="button" className="dashboard__settings-delete" onClick={handleConfirmDeleteProject}>
                {editProjectKind === 'board' ? 'Да, удалить доску' : 'Да, удалить проект'}
              </button>
            </div>
          </div>
        </div>
      )}

      {contextMenu && (
        <>
          <div className="dashboard__context-menu-backdrop" aria-hidden onClick={() => setContextMenu(null)} />
          <div
            ref={contextMenuRef}
            className="dashboard__context-menu"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="dashboard__context-menu-colors">
              {[
                '#ffffff',
                '#f33737',
                '#666666',
                '#5a86ee',
                '#15c466',
              ].map((c) => {
                const cur = (contextMenu.task.text_color || '#ffffff').toLowerCase();
                const selected = cur === c.toLowerCase();
                return (
                  <span
                    key={c}
                    className={`dashboard__context-menu-color-wrap${selected ? ' dashboard__context-menu-color-wrap--selected' : ''}`}
                    style={{ '--swatch-color': c }}
                  >
                    <button
                      type="button"
                      className="dashboard__context-menu-color"
                      style={{ background: c }}
                      onClick={() => handleContextMenuColor(c)}
                      aria-label={`Цвет ${c}`}
                    />
                  </span>
                );
              })}
            </div>
            <button type="button" className="dashboard__context-menu-item" onClick={handleContextMenuFocus}>
              <img src={focusIcon} alt="" className="dashboard__context-menu-item-icon" />
              <span>Сфокусироваться</span>
            </button>
            <div className="dashboard__context-menu-separator" aria-hidden />
            <button type="button" className="dashboard__context-menu-item" onClick={() => handleMoveTaskToDestination({ type: 'today' })}>
              <img src={starIcon} alt="" className="dashboard__context-menu-item-icon" />
              <span>Сегодня</span>
            </button>
            <button type="button" className="dashboard__context-menu-item" onClick={() => handleMoveTaskToDestination({ type: 'tomorrow' })}>
              <img src={zavtraIcon} alt="" className="dashboard__context-menu-item-icon" />
              <span>Завтра</span>
            </button>
            <button type="button" className="dashboard__context-menu-item" onClick={() => handleMoveTaskToDestination({ type: 'day_after_tomorrow' })}>
              <img src={poslezavtraIcon} alt="" className="dashboard__context-menu-item-icon" />
              <span>Послезавтра</span>
            </button>
            <div className="dashboard__context-menu-separator" aria-hidden />
            <button type="button" className="dashboard__context-menu-item" onClick={() => handleMoveTaskToDestination({ type: 'no_date' })}>
              <img src={layersIcon} alt="" className="dashboard__context-menu-item-icon" />
              <span>Задачи без даты</span>
            </button>
            <button type="button" className="dashboard__context-menu-item" onClick={() => handleMoveTaskToDestination({ type: 'someday' })}>
              <img src={archiveIcon} alt="" className="dashboard__context-menu-item-icon" />
              <span>Когда-нибудь</span>
            </button>
            {projects.filter((p) => (p.kind || 'project') === 'project').map((p) => (
              <button
                key={p.id}
                type="button"
                className="dashboard__context-menu-item"
                onClick={() => handleMoveTaskToDestination({ type: 'project', projectId: p.id })}
              >
                <img src={folderIcon} alt="" className="dashboard__context-menu-item-icon" />
                <span>{p.title}</span>
              </button>
            ))}
            <button type="button" className="dashboard__context-menu-item dashboard__context-menu-item--danger" onClick={handleContextMenuDelete}>
              <img src={deleteNavIcon} alt="" className="dashboard__context-menu-item-icon" />
              <span>Удалить</span>
            </button>
          </div>
        </>
      )}

      {settingsOpen && (
        <div className="dashboard__settings-overlay" onClick={() => setSettingsOpen(false)}>
          <div
            className="dashboard__settings-popup dashboard__settings-popup--main"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="dashboard__settings-head">
              <span className="dashboard__settings-heading">Настройки</span>
              <button
                type="button"
                className="dashboard__settings-close"
                onClick={() => setSettingsOpen(false)}
                aria-label="Закрыть"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
                  <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <div className="dashboard__settings-group">
              <div className="dashboard__settings-title">Новые задачи</div>
              <button type="button" className={`dashboard__settings-option ${settings.new_tasks_position === 'start' ? 'dashboard__settings-option--active' : ''}`} onClick={() => setNewTasksPosition('start')}>
                В начало списка
              </button>
              <button type="button" className={`dashboard__settings-option ${settings.new_tasks_position === 'end' ? 'dashboard__settings-option--active' : ''}`} onClick={() => setNewTasksPosition('end')}>
                В конец списка
              </button>
            </div>

            <div className="dashboard__settings-group">
              <div className="dashboard__settings-title">Календарь</div>
              <label className="dashboard__settings-check">
                <input
                  type="checkbox"
                  checked={settings.calendar_show_checkboxes}
                  onChange={(e) => setCalendarShowCheckboxes(e.target.checked)}
                />
                <span>Показывать чекбоксы на таймлайне</span>
              </label>
              <label className="dashboard__settings-check">
                <input
                  type="checkbox"
                  checked={settings.calendar_two_columns}
                  onChange={(e) => setCalendarTwoColumns(e.target.checked)}
                />
                <span>Таймлайн вторым столбцом (на ПК)</span>
              </label>
              <label className="dashboard__settings-check">
                <input
                  type="checkbox"
                  checked={settings.calendar_focus_scale}
                  onChange={(e) => setCalendarFocusScale(e.target.checked)}
                />
                <span>Отображать шкалу фокус-сессий</span>
              </label>
              {settings.calendar_focus_scale && (
                <div className="dashboard__settings-row">
                  <span className="dashboard__settings-row-label">Цвет шкалы</span>
                  <div className="dashboard__settings-colors">
                    {FOCUS_SCALE_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        className={`dashboard__settings-color${settings.calendar_focus_color === c ? ' dashboard__settings-color--active' : ''}`}
                        style={{ background: c }}
                        onClick={() => setCalendarFocusColor(c)}
                        aria-label={`Цвет шкалы ${c}`}
                        title={c}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="dashboard__settings-group">
              <div className="dashboard__settings-title">Списки</div>
              <label className="dashboard__settings-check">
                <input
                  type="checkbox"
                  checked={settings.show_reputation_in_lists}
                  onChange={(e) => setShowReputationInLists(e.target.checked)}
                />
                <span>Отображать список «Репутация перед собой»</span>
              </label>
              {settings.show_reputation_in_lists && (
                <label className="dashboard__settings-check">
                  <input
                    type="checkbox"
                    checked={settings.reputation_in_completed}
                    onChange={(e) => setReputationInCompleted(e.target.checked)}
                  />
                  <span>Отображать задачи из списка «Репутация перед собой» в списке выполненных задач</span>
                </label>
              )}
            </div>

            <div className="dashboard__settings-group">
              <div className="dashboard__settings-title">Свёрнутый таймер фокуса</div>
              <button
                type="button"
                className={`dashboard__settings-option ${!settings.focus_timer_show_total ? 'dashboard__settings-option--active' : ''}`}
                onClick={() => setFocusTimerShowTotal(false)}
              >
                Время текущей сессии
              </button>
              <button
                type="button"
                className={`dashboard__settings-option ${settings.focus_timer_show_total ? 'dashboard__settings-option--active' : ''}`}
                onClick={() => setFocusTimerShowTotal(true)}
              >
                Всего за сегодня
              </button>
            </div>
          </div>
        </div>
      )}

      {menuOrderModalOpen && (
        <div className="dashboard__settings-overlay" onClick={() => setMenuOrderModalOpen(false)}>
          <div
            className="dashboard__settings-popup dashboard-menu__order-popup"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="dashboard__settings-title">Порядок пунктов меню</div>
            <div className="dashboard-menu__order-list">
              {BUILTIN_MENU_ITEMS.map((item) => {
                const visKey = menuHiddenKey('builtin', item.key);
                const hidden = !!menuVisDraft[visKey];
                const icon = (() => {
                  switch (item.key) {
                    case 'today': return starIcon;
                    case 'plans': return plansIcon;
                    case 'calendar': return calendarIcon;
                    case 'goal_plan': return goalIcon;
                    case 'reputation': return goalIcon;
                    case 'no_date': return layersIcon;
                    case 'someday': return archiveIcon;
                    case 'habits': return privIcon;
                    case 'focus_analytics': return focusIcon;
                    default: return folderIcon;
                  }
                })();
                return (
                  <BuiltinMenuOrderRow
                    key={item.key}
                    item={item}
                    icon={icon}
                    hidden={hidden}
                    onToggleHidden={() => toggleMenuVisDraft(visKey)}
                  />
                );
              })}
              {projects.length > 0 && (
                <div className="dashboard-menu__order-divider" aria-hidden />
              )}
              <DndContext
                sensors={menuOrderSensors}
                collisionDetection={closestCenter}
                onDragStart={handleMenuOrderDragStart}
                onDragEnd={handleMenuOrderDragEnd}
              >
                <SortableContext items={menuOrderDraft} strategy={verticalListSortingStrategy}>
                  {menuOrderDraft.map((id) => {
                    const p = projects.find((proj) => proj.id === id);
                    if (!p) return null;
                    const visKey = menuHiddenKey('project', p.id);
                    const hidden = !!menuVisDraft[visKey];
                    return (
                      <SortableMenuOrderRow
                        key={id}
                        project={p}
                        hidden={hidden}
                        onToggleHidden={() => toggleMenuVisDraft(visKey)}
                      />
                    );
                  })}
                </SortableContext>
                <DragOverlay>
                  {activeMenuOrderProject ? (
                    <div className="dashboard-menu__order-row dashboard-menu__order-row--overlay">
                      <img
                        src={projectIcons(activeMenuOrderProject.kind || 'project')[0]}
                        alt=""
                        className="dashboard-menu__order-icon"
                      />
                      <span className="dashboard-menu__order-title">{activeMenuOrderProject.title}</span>
                      <span className="dashboard-menu__order-handle" aria-hidden>
                        <img src={dragIcon} alt="" />
                      </span>
                    </div>
                  ) : null}
                </DragOverlay>
              </DndContext>
            </div>
            <div className="dashboard__settings-edit-actions">
              <button type="button" className="dashboard__settings-submit" onClick={() => setMenuOrderModalOpen(false)}>
                Отмена
              </button>
              <button type="button" className="dashboard__settings-submit" onClick={saveMenuOrder}>
                Сохранить
              </button>
            </div>
          </div>
        </div>
      )}

      {fontModalOpen && (
        <div className="dashboard__settings-overlay" onClick={() => setFontModalOpen(false)}>
          <div className="dashboard__settings-popup dashboard__font-popup" onClick={(e) => e.stopPropagation()}>
            <div className="dashboard__settings-title">Толщина шрифта</div>
            <div className="dashboard__font-options">
              {TASK_FONT_WEIGHT_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className={`dashboard__font-chip ${normalizeTaskFontWeight(fontWeightDraft) === opt.id ? 'dashboard__font-chip--active' : ''}`}
                  onClick={() => setFontWeightDraft(opt.id)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <div className="dashboard__settings-title dashboard__font-popup__subtitle">Размер шрифта</div>
            <div className="dashboard__font-options">
              {TASK_FONT_SCALE_OPTIONS.map((sc) => (
                <button
                  key={sc}
                  type="button"
                  className={`dashboard__font-chip ${Math.abs(normalizeTaskFontScale(fontScaleDraft) - sc) < 0.051 ? 'dashboard__font-chip--active' : ''}`}
                  onClick={() => setFontScaleDraft(sc)}
                >
                  {formatTaskScaleLabel(sc)}
                </button>
              ))}
            </div>
            <div className="dashboard__settings-edit-actions">
              <button type="button" className="dashboard__settings-submit" onClick={() => setFontModalOpen(false)}>
                Отмена
              </button>
              <button type="button" className="dashboard__settings-submit" onClick={saveFontModal}>
                Сохранить
              </button>
            </div>
          </div>
        </div>
      )}

      {boardPdfModalOpen && viewMode === 'board' && (
        <BoardPdfExportModal
          open
          onClose={() => {
            if (!boardPdfExporting) setBoardPdfModalOpen(false);
          }}
          worldRef={boardWorldRef}
          items={boardItems.filter((it) => (it.board_id ?? null) === (activeBoardId ?? null))}
          fileBaseName={projects.find((p) => p.id === activeBoardId)?.title ?? 'Доска'}
          variant={boardPdfVariant}
          onVariantChange={setBoardPdfVariant}
          exporting={boardPdfExporting}
          setExporting={setBoardPdfExporting}
          onSuccess={() => setBoardPdfModalOpen(false)}
        />
      )}

      {(viewMode === 'plans' || viewMode === 'today') && (
        <div className="dashboard__days">
          {days.map((date) => (
            <DayCard
              key={date.toISOString().slice(0, 10)}
              date={date}
              tasks={inboxTasks}
              onToggle={handleToggle}
              onUpdate={updateTask}
              onDelete={deleteTask}
              onAddTask={handleAddTask}
              onAddSubtask={handleAddSubtask}
              onAddAtStart={handleAddTaskAt}
              onTaskContextMenu={handleTaskContextMenu}
              editingTaskId={editingTaskId}
              onEditingTaskConsumed={() => setEditingTaskId(null)}
              onCreateSiblingTask={handleCreateSiblingTask}
              onCreateSiblingSubtask={handleCreateSiblingSubtask}
              onCreateSubtaskAndEdit={handleCreateSubtaskAndEdit}
              recentCompletedIds={recentCompletedIds}
              completedVisible={completedVisible}
              getListCollapsed={getListCollapsed}
              setListCollapsed={setListCollapsed}
              allowListCollapse={viewMode === 'plans'}
              reputationPromises={reputationByDate?.get(toLocalDateString(date))}
              reputationInCompleted={settings.reputation_in_completed}
              onUpdateReputation={updateReputationPromise}
              onDeleteReputation={deleteReputationPromise}
            />
          ))}
        </div>
      )}

      {viewMode === 'calendar' && (
        <CalendarView
          days={days}
          tasks={inboxTasks}
          scale={settings.calendar_scale}
          showCheckboxes={settings.calendar_show_checkboxes}
          twoColumns={settings.calendar_two_columns}
          focusScale={settings.calendar_focus_scale}
          focusColor={settings.calendar_focus_color}
          dayHours={dayHours}
          setDayHours={setDayHours}
          resetDayHours={resetDayHours}
          reputationByDate={reputationByDate}
          reputationInCompleted={settings.reputation_in_completed}
          onUpdateReputation={updateReputationPromise}
          onDeleteReputation={deleteReputationPromise}
          completedVisible={completedVisible}
          recentCompletedIds={recentCompletedIds}
          getListCollapsed={getListCollapsed}
          setListCollapsed={setListCollapsed}
          addTask={addTask}
          updateTask={updateTask}
          deleteTask={deleteTask}
          onToggle={handleToggle}
          onAddTaskAt={handleAddTaskAt}
          onAddSubtask={handleAddSubtask}
          onTaskContextMenu={handleTaskContextMenu}
          editingTaskId={editingTaskId}
          onEditingTaskConsumed={() => setEditingTaskId(null)}
          onCreateSiblingTask={handleCreateSiblingTask}
          onCreateSiblingSubtask={handleCreateSiblingSubtask}
          onCreateSubtaskAndEdit={handleCreateSubtaskAndEdit}
        />
      )}

      {viewMode === 'reputation' && (
        <ReputationView headerSlot={repHeaderSlot} daysCount={settings.days_count} setDaysCount={setDaysCount} />
      )}

      {viewMode === 'goal_plan' && (
        <GoalPlanView
          days={days}
          itemsByKind={goalPlanItemsByKind}
          notes={goalPlanNotes}
          addItem={addGoalPlanItem}
          addItemAfter={addGoalPlanItemAfter}
          updateItem={updateGoalPlanItem}
          toggleComplete={toggleGoalPlanItem}
          deleteItem={deleteGoalPlanItem}
          reorderItems={reorderGoalPlanItems}
          moveDayItem={moveGoalPlanDayItem}
          bulkMoveToDate={bulkMoveGoalPlanToDate}
          setDayNote={setGoalPlanDayNote}
          getListCollapsed={getListCollapsed}
          setListCollapsed={setListCollapsed}
        />
      )}

      {viewMode === 'no_date' && (
        <NoDateList
          tasks={inboxTasks}
          onToggle={handleToggle}
          onUpdate={updateTask}
          onDelete={deleteTask}
          onAddSubtask={handleAddSubtask}
          onAddAtStart={handleAddTaskAt}
          onTaskContextMenu={handleTaskContextMenu}
          editingTaskId={editingTaskId}
          onEditingTaskConsumed={() => setEditingTaskId(null)}
          onCreateSiblingTask={handleCreateSiblingTask}
          onCreateSiblingSubtask={handleCreateSiblingSubtask}
          onCreateSubtaskAndEdit={handleCreateSubtaskAndEdit}
          visible
          completedVisible={completedVisible}
          getListCollapsed={getListCollapsed}
          setListCollapsed={setListCollapsed}
        />
      )}

      {viewMode === 'someday' && (
        <SomedayList
          tasks={tasks}
          onToggle={handleToggle}
          onUpdate={updateTask}
          onDelete={deleteTask}
          onAddSubtask={handleAddSubtask}
          onAddAtStart={handleAddTaskAt}
          onTaskContextMenu={handleTaskContextMenu}
          editingTaskId={editingTaskId}
          onEditingTaskConsumed={() => setEditingTaskId(null)}
          onCreateSiblingTask={handleCreateSiblingTask}
          onCreateSiblingSubtask={handleCreateSiblingSubtask}
          onCreateSubtaskAndEdit={handleCreateSubtaskAndEdit}
          completedVisible={completedVisible}
          getListCollapsed={getListCollapsed}
          setListCollapsed={setListCollapsed}
        />
      )}

      {viewMode === 'habits' && (
        <HabitsView
          habits={habits}
          entries={habitEntries}
          addHabit={addHabit}
          updateHabit={updateHabit}
          deleteHabit={deleteHabit}
          reorderHabits={reorderHabits}
          setEntry={setHabitEntry}
          hasHover={hasHover}
          habitsSidebarWidthPx={settings.habits_sidebar_width_px ?? 220}
          setHabitsSidebarWidthPx={setHabitsSidebarWidthPx}
        />
      )}

      {viewMode === 'focus_analytics' && <FocusAnalytics />}

      {viewMode === 'board' && (
        <BoardView
          key={activeBoardId ?? 'default'}
          items={boardItems.filter((it) => (it.board_id ?? null) === (activeBoardId ?? null))}
          addItem={(patch = {}) => addBoardItem({ ...patch, board_id: activeBoardId ?? null })}
          updateItem={updateBoardItem}
          updateItemLocal={updateBoardItemLocal}
          deleteItem={deleteBoardItem}
          cloneItems={cloneBoardItems}
          restoreItem={restoreBoardItem}
          headerLeftSlot={boardHeaderLeftSlot}
          headerRightSlot={boardHeaderRightSlot}
          zoom={settings.board_zoom ?? 100}
          setZoom={setBoardZoom}
          hasHover={hasHover}
          offline={boardOffline}
          setOffline={setBoardOffline}
          hasPending={boardHasPending}
          onSync={syncBoardItems}
          exportWorldRef={boardWorldRef}
        />
      )}

      {viewMode === 'kanban' && activeKanbanBoard && (
        <KanbanView
          key={activeKanbanBoard.id}
          board={activeKanbanBoard}
          columns={kanbanColumns}
          cards={kanbanCards}
          archived={kanbanArchive}
          labels={kanbanLabels}
          tasks={tasks}
          getSubtasks={getSubtasksOf}
          addColumn={addKanbanColumn}
          updateColumn={updateKanbanColumn}
          deleteColumn={deleteKanbanColumn}
          reorderColumns={reorderKanbanColumns}
          addCard={addKanbanCard}
          updateCard={updateKanbanCard}
          deleteCard={deleteKanbanCard}
          restoreCard={restoreKanbanCard}
          purgeCard={purgeKanbanCard}
          purgeArchive={purgeKanbanArchive}
          duplicateCard={handleDuplicateKanbanCard}
          moveCard={moveKanbanCard}
          planDay={planKanbanDay}
          dateFilter={settings.kanban_date_filters?.[activeKanbanBoard.id] ?? null}
          onDateFilterChange={setKanbanDateFilter}
          onToggleTask={handleToggle}
          onOpenCard={setOpenCardId}
          onUpdateBoard={updateProjectSettings}
        />
      )}

      {openCard && (
        <KanbanCardPanel
          key={openCard.id}
          card={openCard}
          tasks={tasks}
          getSubtasks={getSubtasksOf}
          completedVisible={completedVisible}
          boardLabels={openCardLabels}
          onAddLabel={addKanbanLabel}
          onUpdateLabel={updateKanbanLabel}
          onDeleteLabel={deleteKanbanLabel}
          onUpdateCard={updateKanbanCard}
          onDeleteCard={deleteKanbanCard}
          onClose={() => setOpenCardId(null)}
          onToggle={handleToggle}
          onUpdate={updateTask}
          onDelete={deleteTask}
          onAddSubtask={handleAddSubtask}
          onAddTask={handleAddTaskAt}
          onTaskContextMenu={handleTaskContextMenu}
          editingTaskId={editingTaskId}
          onEditingTaskConsumed={() => setEditingTaskId(null)}
          onCreateSiblingTask={handleCreateSiblingTask}
          onCreateSiblingSubtask={handleCreateSiblingSubtask}
          onCreateSubtaskAndEdit={handleCreateSubtaskAndEdit}
        />
      )}

      {viewMode === 'project' && activeProjectId && (
        <ProjectList
          projectId={activeProjectId}
          projectTitle={projects.find((p) => p.id === activeProjectId)?.title ?? 'Проект'}
          tasks={tasks}
          onToggle={handleToggle}
          onUpdate={updateTask}
          onDelete={deleteTask}
          onAddSubtask={handleAddSubtask}
          onAddAtStart={handleAddTaskAt}
          onTaskContextMenu={handleTaskContextMenu}
          editingTaskId={editingTaskId}
          onEditingTaskConsumed={() => setEditingTaskId(null)}
          onCreateSiblingTask={handleCreateSiblingTask}
          onCreateSiblingSubtask={handleCreateSiblingSubtask}
          onCreateSubtaskAndEdit={handleCreateSubtaskAndEdit}
          completedVisible={completedVisible}
          getListCollapsed={getListCollapsed}
          setListCollapsed={setListCollapsed}
        />
      )}

      {viewMode === 'board' && (
        <button
          type="button"
          className="dashboard__board-pdf-fab"
          onMouseEnter={() => hasHover && setBoardPdfFabHover(true)}
          onMouseLeave={() => hasHover && setBoardPdfFabHover(false)}
          onClick={() => setBoardPdfModalOpen(true)}
          aria-label="Экспорт в PDF"
        >
          <img src={hasHover && boardPdfFabHover ? pdfNavIcon : pdfIcon} alt="" />
        </button>
      )}

      {((viewMode === 'project' && activeProjectId) || (viewMode === 'board' && activeBoardId) || (viewMode === 'kanban' && activeKanbanId)) && (
        <button
          type="button"
          className="dashboard__edit-project-fab"
          onMouseEnter={() => hasHover && setEditProjectFabHover(true)}
          onMouseLeave={() => hasHover && setEditProjectFabHover(false)}
          onClick={() => {
            const id = viewMode === 'board' ? activeBoardId : viewMode === 'kanban' ? activeKanbanId : activeProjectId;
            const entry = projects.find((p) => p.id === id);
            handleOpenEditProject(id, entry?.title ?? '', entry?.kind ?? 'project');
          }}
          aria-label={kindWords(viewMode === 'board' ? 'board' : viewMode === 'kanban' ? 'kanban' : 'project').editTitle}
        >
          <img src={hasHover && editProjectFabHover ? editNavIcon : editIcon} alt="" />
        </button>
      )}

      {viewMode === 'goal_plan' && (
        <button
          type="button"
          className="dashboard__goal-plan-vis-fab"
          onMouseEnter={() => hasHover && setGoalPlanVisFabHover(true)}
          onMouseLeave={() => hasHover && setGoalPlanVisFabHover(false)}
          onClick={() => setGoalPlanVisModalOpen(true)}
          aria-label="Отображение"
        >
          <img src={hasHover && goalPlanVisFabHover ? eyeNavIcon : eyeIcon} alt="" />
        </button>
      )}

      <button type="button" className="dashboard__refresh" onMouseEnter={() => hasHover && setRefreshHover(true)} onMouseLeave={() => hasHover && setRefreshHover(false)} onClick={() => window.location.reload()} aria-label="Обновить">
        <img src={hasHover && refreshHover ? refreshNavIcon : refreshIcon} alt="" />
      </button>

      {goalPlanVisModalOpen && (
        <GoalPlanVisibilityModal
          open
          onClose={() => setGoalPlanVisModalOpen(false)}
          getListCollapsed={getListCollapsed}
          setListCollapsed={setListCollapsed}
        />
      )}

      {notice && <div className="dashboard__notice" role="status">{notice}</div>}

      <FocusTimer showTodayTotal={settings.focus_timer_show_total} />

      <DragOverlay
        dropAnimation={{
          duration: 280,
          easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
        }}
      >
        {activeTask ? (
          <div className="draggable-task draggable-task--overlay" style={{ cursor: 'grabbing', pointerEvents: 'none' }}>
            <div className="task-item task-item--overlay">
              <div className="task-item__row">
                <span className="task-item__checkbox task-item__checkbox--placeholder" aria-hidden />
                <span className="task-item__title" style={{ color: activeTask.text_color || '#e0e0e0' }}>{activeTask.title}</span>
              </div>
            </div>
          </div>
        ) : activeDragPromise ? (
          <div className="draggable-task draggable-task--overlay" style={{ cursor: 'grabbing', pointerEvents: 'none' }}>
            <ReputationTaskRow promise={activeDragPromise} overlay />
          </div>
        ) : activeProjectDrag ? (
          <div className="dashboard-menu__project-drag-overlay" style={{ cursor: 'grabbing', pointerEvents: 'none' }}>
            <img src={projectIcons(activeProjectDrag.kind || 'project')[0]} alt="" />
            <span>{activeProjectDrag.title}</span>
          </div>
        ) : activeHabitDrag ? (
          <div className="habits-view__drag-overlay" style={{ cursor: 'grabbing', pointerEvents: 'none' }}>
            <span>{activeHabitDrag.title}</span>
          </div>
        ) : null}
      </DragOverlay>
    </div>
    </DndContext>
  );
}
