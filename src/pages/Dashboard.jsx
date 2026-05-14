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
  };
}
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, closestCenter } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useAuth } from '../contexts/AuthContext';
import { useTasks } from '../hooks/useTasks';
import { useSettings } from '../hooks/useSettings';
import { useListCollapsed } from '../hooks/useListCollapsed';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { useProjects } from '../hooks/useProjects';
import { useHabits } from '../hooks/useHabits';
import { useBoardItems } from '../hooks/useBoardItems';
import { useGoalPlan } from '../hooks/useGoalPlan';
import { DayCard } from '../components/DayCard';
import { HabitsView } from '../components/HabitsView';
import { BoardView } from '../components/BoardView';
import { GoalPlanView } from '../components/GoalPlanView';
import { NoDateList } from '../components/NoDateList';
import { SomedayList } from '../components/SomedayList';
import { ProjectList } from '../components/ProjectList';
import { getContainerId, getContainerIdForBucket, getContainerIdFromTask, parseContainerId } from '../lib/dnd';
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
import spacingIcon from '../assets/spacing.svg';
import spacingNavIcon from '../assets/spacing-nav.svg';
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
import doskaIcon from '../assets/doska.svg';
import doskaNavIcon from '../assets/doska-nav.svg';
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

function SortableMenuOrderRow({ project }) {
  const { setNodeRef, transform, transition, isDragging, attributes, listeners } = useSortable({ id: project.id });
  const isBoard = (project.kind || 'project') === 'board';
  const icon = isBoard ? doskaIcon : folderIcon;
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
      {...attributes}
      {...listeners}
    >
      <img src={icon} alt="" className="dashboard-menu__order-icon" />
      <span className="dashboard-menu__order-title">{project.title}</span>
      <span className="dashboard-menu__order-handle" aria-hidden>
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
  } = useSettings();
  const { getCollapsed: getListCollapsed, setCollapsed: setListCollapsed } = useListCollapsed();
  const { projects, loading: projectsLoading, addProject, updateProject, deleteProject, reorderProjects } = useProjects();
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
      return ['today', 'plans', 'goal_plan', 'no_date', 'someday', 'habits', 'board', 'project'].includes(v) ? v : 'plans';
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
  const [completedVisibleByList, setCompletedVisibleByList] = useState(loadCompletedVisibleByList);
  const completedVisibleListKey = useMemo(() => {
    if (viewMode === 'today') return 'today';
    if (viewMode === 'plans') return 'plans';
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
  const [dateLeftHover, setDateLeftHover] = useState(false);
  const [dateRightHover, setDateRightHover] = useState(false);
  const [menuHover, setMenuHover] = useState(false);
  const [todayHover, setTodayHover] = useState(false);
  const [plansHover, setPlansHover] = useState(false);
  const [goalPlanHover, setGoalPlanHover] = useState(false);
  const [noDateHover, setNoDateHover] = useState(false);
  const [somedayHover, setSomedayHover] = useState(false);
  const [habitsHover, setHabitsHover] = useState(false);
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
  const [addProjectModalOpen, setAddProjectModalOpen] = useState(false);
  const [addProjectTitle, setAddProjectTitle] = useState('');
  const [addProjectKind, setAddProjectKind] = useState('project'); // 'project' | 'board'
  const [editProjectOpen, setEditProjectOpen] = useState(false);
  const [editProjectId, setEditProjectId] = useState(null);
  const [editProjectTitle, setEditProjectTitle] = useState('');
  const [editProjectKind, setEditProjectKind] = useState('project');
  const [activeDragId, setActiveDragId] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [activeProjectDragId, setActiveProjectDragId] = useState(null);
  const [activeHabitDragId, setActiveHabitDragId] = useState(null);
  const [menuWidthModalOpen, setMenuWidthModalOpen] = useState(false);
  const [menuWidthDraft, setMenuWidthDraft] = useState(220);
  const [spacingBtnHover, setSpacingBtnHover] = useState(false);
  const [fontModalOpen, setFontModalOpen] = useState(false);
  const [fontWeightDraft, setFontWeightDraft] = useState('medium');
  const [fontScaleDraft, setFontScaleDraft] = useState(1);
  const [textFontBtnHover, setTextFontBtnHover] = useState(false);
  const [menuOrderBtnHover, setMenuOrderBtnHover] = useState(false);
  const [menuOrderModalOpen, setMenuOrderModalOpen] = useState(false);
  const [menuOrderDraft, setMenuOrderDraft] = useState([]);
  const [menuOrderActiveId, setMenuOrderActiveId] = useState(null);
  const contextMenuRef = useRef(null);
  const hasHover = useMediaQuery('(hover: hover)');
  const isWideMenu = useMediaQuery('(min-width: 600px)');
  const sidebarWidthPx = useMemo(() => clampSidebarWidthPx(settings.sidebar_width_px), [settings.sidebar_width_px]);
  const liveMenuWidth = useMemo(
    () => (menuWidthModalOpen ? clampSidebarWidthPx(menuWidthDraft) : sidebarWidthPx),
    [menuWidthModalOpen, menuWidthDraft, sidebarWidthPx]
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
        JSON.stringify({ viewMode, activeProjectId, activeBoardId, menuOpen })
      );
    } catch {}
  }, [viewMode, activeProjectId, activeBoardId, menuOpen]);

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
    }
  }, [viewMode, activeProjectId, activeBoardId, projects, projectsLoading, boardItems, boardItemsLoading]);

  const handleMenuSelect = useCallback((target) => {
    const isBuiltinView = ['today', 'plans', 'goal_plan', 'no_date', 'someday', 'habits'].includes(target);
    if (isBuiltinView) {
      setViewMode(target);
      setActiveProjectId(null);
    } else {
      const project = projects.find((p) => p.id === target);
      if (project && project.kind === 'board') {
        setViewMode('board');
        setActiveBoardId(target);
        setActiveProjectId(null);
      } else {
        setViewMode('project');
        setActiveProjectId(target);
      }
    }
    if (!isWideMenu) closeMenu();
  }, [isWideMenu, closeMenu, projects]);

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
      } else {
        setViewMode('project');
        setActiveProjectId(created.id);
      }
    }
  }, [addProjectTitle, addProjectKind, addProject]);

  const handleOpenEditProject = useCallback((id, title, kind = 'project') => {
    setEditProjectId(id);
    setEditProjectTitle(title ?? '');
    setEditProjectKind(kind);
    setEditProjectOpen(true);
  }, []);

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


  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const baseDate = new Date(today);
  baseDate.setDate(baseDate.getDate() + dateOffset);
  const days =
    viewMode === 'today'
      ? [today]
      : getDays(baseDate, settings.days_count);

  const inboxTasks = useMemo(() => tasks.filter((t) => (t.list_type || 'inbox') === 'inbox'), [tasks]);

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
      if (payload.list_type === 'someday') {
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
        .filter((t) => !t.parent_id && (t.list_type || 'inbox') === (task.list_type || 'inbox') && (t.project_id ?? null) === (task.project_id ?? null) && normDate(t.scheduled_date) === normDate(task.scheduled_date))
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
        text_color: task.text_color || parent.text_color || '#ffffff',
        completed_at: null,
        position: insertPosition,
      });
      if (created?.id) setEditingTaskId(created.id);
    },
    [tasks, addTask, updateTask]
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
      let containerId;
      let index;
      const slot = parseSlotId(over.id);
      if (slot) {
        containerId = slot.containerId;
        index = slot.index;
      } else {
        const overTask = tasks.find((t) => t.id === over.id);
        if (!overTask) return;
        containerId = getContainerIdFromTask(overTask);
        const list = getTasksInContainer(tasks, containerId);
        const idx = list.findIndex((t) => t.id === over.id);
        if (idx < 0) return;
        const translated = active.rect.current.translated;
        const overMiddleY = over.rect.top + over.rect.height / 2;
        const pointerY = translated ? translated.top + translated.height / 2 : overMiddleY;
        index = idx + (pointerY > overMiddleY ? 1 : 0);
      }
      const movedTask = tasks.find((t) => t.id === active.id);
      if (!movedTask) return;
      const targetConfig = parseContainerId(containerId);
      if (!targetConfig) return;
      let scheduled_date = targetConfig.scheduled_date;
      let parent_id = targetConfig.parent_id ?? null;
      let list_type = targetConfig.list_type ?? 'inbox';
      let project_id = targetConfig.project_id ?? null;
      if (targetConfig.parent_id) {
        const parentTask = tasks.find((t) => t.id === targetConfig.parent_id);
        scheduled_date = parentTask?.scheduled_date ?? null;
        list_type = parentTask?.list_type ?? 'inbox';
        project_id = parentTask?.project_id ?? null;
      }
      const completed_at = targetConfig.completed ? new Date().toISOString() : null;

      const targetList = getTasksInContainer(tasks, containerId);
      const sourceContainerId = getContainerIdFromTask(movedTask);
      const targetIds = targetList.map((t) => t.id).filter((id) => id !== movedTask.id);
      targetIds.splice(index, 0, movedTask.id);
      const newOrderedIds = targetIds;

      const updates = [];
      updates.push({ id: movedTask.id, payload: { scheduled_date, parent_id, completed_at, position: index, list_type, project_id } });
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
    [tasks, projects, habits, moveTask, updateTask, reorderProjects, reorderHabits]
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

  const openMenuWidthModal = useCallback(() => {
    setMenuWidthDraft(sidebarWidthPx);
    setMenuWidthModalOpen(true);
  }, [sidebarWidthPx]);

  const applyMenuWidthStep = useCallback((delta) => {
    setMenuWidthDraft((w) => clampSidebarWidthPx(w + delta));
  }, []);

  const saveMenuWidth = useCallback(async () => {
    await setSidebarWidthPx(menuWidthDraft);
    setMenuWidthModalOpen(false);
  }, [menuWidthDraft, setSidebarWidthPx]);

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
    setMenuOrderModalOpen(true);
  }, [projects]);

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
    await reorderProjects(menuOrderDraft);
    setMenuOrderModalOpen(false);
  }, [menuOrderDraft, reorderProjects]);

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
      className={`dashboard ${menuOpen && isWideMenu ? 'dashboard--menu-open' : ''} ${viewMode === 'habits' ? 'dashboard--habits' : ''} ${viewMode === 'board' ? 'dashboard--board' : ''} ${viewMode === 'board' && !activeBoardId ? 'dashboard--board-pdf-only' : ''}`}
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
            {(viewMode === 'plans' || viewMode === 'goal_plan') && (
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
              </>
            )}
          </div>
          <div className="dashboard__header-actions">
            {viewMode === 'board' && (
              <div
                ref={setBoardHeaderRightSlot}
                className="dashboard__board-header-slot dashboard__board-header-slot--right"
              />
            )}
            {viewMode !== 'habits' && viewMode !== 'board' && viewMode !== 'goal_plan' && (
            <button type="button" className="dashboard__icon-btn" onMouseEnter={() => hasHover && setEyeHover(true)} onMouseLeave={() => hasHover && setEyeHover(false)} onClick={toggleCompletedVisibleForList} aria-label={completedVisible ? 'Скрыть выполненные' : 'Показать выполненные'}>
              <img src={completedVisible ? (hasHover && eyeHover ? eyeoffNavIcon : eyeoffIcon) : hasHover && eyeHover ? eyeNavIcon : eyeIcon} alt="" />
            </button>
            )}
            {viewMode !== 'board' && (
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
            <div className="dashboard-menu__body">
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
              <button
                type="button"
                className={`dashboard-menu__item ${viewMode === 'plans' ? 'dashboard-menu__item--active' : ''}`}
                onMouseEnter={() => hasHover && setPlansHover(true)}
                onMouseLeave={() => hasHover && setPlansHover(false)}
                onClick={() => handleMenuSelect('plans')}
              >
                <img src={viewMode === 'plans' || (hasHover && plansHover) ? calendarNavIcon : calendarIcon} alt="" />
                <span>Планы</span>
              </button>
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
              <SortableContext items={projects.map((p) => p.id)} strategy={verticalListSortingStrategy}>
                {projects.map((p) => {
                  const isBoard = p.kind === 'board';
                  const isActive = isBoard
                    ? viewMode === 'board' && activeBoardId === p.id
                    : viewMode === 'project' && activeProjectId === p.id;
                  return (
                    <SortableProjectItem
                      key={p.id}
                      project={p}
                      isActive={isActive}
                      isHover={hasHover && projectHoverId === p.id}
                      iconDefault={isBoard ? doskaIcon : folderIcon}
                      iconHover={isBoard ? doskaNavIcon : folderNavIcon}
                      onClick={() => handleMenuSelect(p.id)}
                      onMouseEnter={() => setProjectHoverId(p.id)}
                      onMouseLeave={() => setProjectHoverId((cur) => (cur === p.id ? null : cur))}
                      dirty={isBoard && boardDirtyIds.has(p.id)}
                    />
                  );
                })}
              </SortableContext>
            </div>
            <div className="dashboard-menu__bottom-tools">
              <button
                type="button"
                className="dashboard-menu__add-project dashboard-menu__add-project--in-bottom"
                onClick={() => setAddProjectModalOpen(true)}
                aria-label="Добавить проект"
              >
                +
              </button>
              <button
                type="button"
                className="dashboard-menu__width-btn"
                onMouseEnter={() => hasHover && setSpacingBtnHover(true)}
                onMouseLeave={() => hasHover && setSpacingBtnHover(false)}
                onClick={openMenuWidthModal}
                aria-label="Изменить ширину меню для ПК"
              >
                <img src={hasHover && spacingBtnHover ? spacingNavIcon : spacingIcon} alt="" />
              </button>
              {renderFontMenuButton()}
              {projects.length > 1 && (
                <button
                  type="button"
                  className="dashboard-menu__order-btn"
                  onMouseEnter={() => hasHover && setMenuOrderBtnHover(true)}
                  onMouseLeave={() => hasHover && setMenuOrderBtnHover(false)}
                  onClick={openMenuOrderModal}
                  aria-label="Изменить порядок пунктов в меню"
                >
                  <img src={hasHover && menuOrderBtnHover ? dragNavIcon : dragIcon} alt="" />
                </button>
              )}
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
                <button
                  type="button"
                  className="dashboard-menu__close"
                  onClick={closeMenu}
                  aria-label="Закрыть меню"
                >
                  ×
                </button>
              </div>
              <button
                type="button"
                className={`dashboard-menu__item ${viewMode === 'plans' ? 'dashboard-menu__item--active' : ''}`}
                onMouseEnter={() => hasHover && setPlansHover(true)}
                onMouseLeave={() => hasHover && setPlansHover(false)}
                onClick={() => handleMenuSelect('plans')}
              >
                <img src={viewMode === 'plans' || (hasHover && plansHover) ? calendarNavIcon : calendarIcon} alt="" />
                <span>Планы</span>
              </button>
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
              <SortableContext items={projects.map((p) => p.id)} strategy={verticalListSortingStrategy}>
                {projects.map((p) => {
                  const isBoard = p.kind === 'board';
                  const isActive = isBoard
                    ? viewMode === 'board' && activeBoardId === p.id
                    : viewMode === 'project' && activeProjectId === p.id;
                  return (
                    <SortableProjectItem
                      key={p.id}
                      project={p}
                      isActive={isActive}
                      isHover={hasHover && projectHoverId === p.id}
                      iconDefault={isBoard ? doskaIcon : folderIcon}
                      iconHover={isBoard ? doskaNavIcon : folderNavIcon}
                      onClick={() => handleMenuSelect(p.id)}
                      onMouseEnter={() => setProjectHoverId(p.id)}
                      onMouseLeave={() => setProjectHoverId((cur) => (cur === p.id ? null : cur))}
                      dirty={isBoard && boardDirtyIds.has(p.id)}
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
                {projects.length > 1 && (
                  <button
                    type="button"
                    className="dashboard-menu__order-btn"
                    onMouseEnter={() => hasHover && setMenuOrderBtnHover(true)}
                    onMouseLeave={() => hasHover && setMenuOrderBtnHover(false)}
                    onClick={openMenuOrderModal}
                    aria-label="Изменить порядок пунктов в меню"
                  >
                    <img src={hasHover && menuOrderBtnHover ? dragNavIcon : dragIcon} alt="" />
                  </button>
                )}
              </div>
            </nav>
          </div>
        )
      )}

      {addProjectModalOpen && (
        <div className="dashboard__settings-overlay" onClick={() => { setAddProjectModalOpen(false); setAddProjectKind('project'); }}>
          <div className="dashboard__settings-popup dashboard__settings-popup--new-project" onClick={(e) => e.stopPropagation()}>
            <div className="dashboard__settings-title">{addProjectKind === 'board' ? 'Новая доска' : 'Новый проект'}</div>
            <div className="dashboard__kind-toggle">
              <button
                type="button"
                className={`dashboard__kind-toggle-option ${addProjectKind === 'project' ? 'dashboard__kind-toggle-option--active' : ''}`}
                onClick={() => setAddProjectKind('project')}
              >
                Список задач
              </button>
              <button
                type="button"
                className={`dashboard__kind-toggle-option ${addProjectKind === 'board' ? 'dashboard__kind-toggle-option--active' : ''}`}
                onClick={() => setAddProjectKind('board')}
              >
                Доска
              </button>
            </div>
            <input
              type="text"
              className="dashboard__settings-input"
              value={addProjectTitle}
              onChange={(e) => setAddProjectTitle(e.target.value)}
              placeholder={addProjectKind === 'board' ? 'Название доски' : 'Название проекта'}
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') handleAddProjectSubmit(); }}
            />
            <button type="button" className="dashboard__settings-submit" onClick={handleAddProjectSubmit}>
              {addProjectKind === 'board' ? 'Добавить доску' : 'Добавить проект'}
            </button>
          </div>
        </div>
      )}

      {editProjectOpen && (
        <div className="dashboard__settings-overlay" onClick={() => { setEditProjectOpen(false); setEditProjectId(null); setEditProjectTitle(''); }}>
          <div className="dashboard__settings-popup dashboard__settings-popup--edit-project" onClick={(e) => e.stopPropagation()}>
            <div className="dashboard__settings-title">{editProjectKind === 'board' ? 'Редактировать доску' : 'Редактировать проект'}</div>
            <input
              type="text"
              className="dashboard__settings-input"
              value={editProjectTitle}
              onChange={(e) => setEditProjectTitle(e.target.value)}
              placeholder={editProjectKind === 'board' ? 'Название доски' : 'Название проекта'}
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') handleEditProjectSave(); }}
            />
            <div className="dashboard__settings-edit-actions">
              <button type="button" className="dashboard__settings-submit" onClick={handleEditProjectSave}>
                Сохранить
              </button>
              <button type="button" className="dashboard__settings-delete" onClick={handleEditProjectDeleteClick}>
                {editProjectKind === 'board' ? 'Удалить доску' : 'Удалить проект'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteProjectConfirmOpen && (
        <div className="dashboard__settings-overlay" onClick={handleCancelDeleteProject}>
          <div className="dashboard__settings-popup" onClick={(e) => e.stopPropagation()}>
            <div className="dashboard__settings-title">{editProjectKind === 'board' ? 'Удалить доску?' : 'Удалить проект?'}</div>
            <p className="dashboard__confirm-text">{editProjectKind === 'board' ? 'Все текстовые блоки на этой доске также будут удалены.' : 'Все задачи в этом проекте также будут удалены.'}</p>
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

      {menuOrderModalOpen && (
        <div className="dashboard__settings-overlay" onClick={() => setMenuOrderModalOpen(false)}>
          <div
            className="dashboard__settings-popup dashboard-menu__order-popup"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="dashboard__settings-title">Порядок пунктов меню</div>
            <DndContext
              sensors={menuOrderSensors}
              collisionDetection={closestCenter}
              onDragStart={handleMenuOrderDragStart}
              onDragEnd={handleMenuOrderDragEnd}
            >
              <SortableContext items={menuOrderDraft} strategy={verticalListSortingStrategy}>
                <div className="dashboard-menu__order-list">
                  {menuOrderDraft.map((id) => {
                    const p = projects.find((proj) => proj.id === id);
                    if (!p) return null;
                    return <SortableMenuOrderRow key={id} project={p} />;
                  })}
                </div>
              </SortableContext>
              <DragOverlay>
                {activeMenuOrderProject ? (
                  <div className="dashboard-menu__order-row dashboard-menu__order-row--overlay">
                    <img
                      src={(activeMenuOrderProject.kind || 'project') === 'board' ? doskaIcon : folderIcon}
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

      {menuWidthModalOpen && (
        <div className="dashboard__settings-overlay" onClick={() => setMenuWidthModalOpen(false)}>
          <div className="dashboard__settings-popup dashboard__menu-width-popup" onClick={(e) => e.stopPropagation()}>
            <div className="dashboard__settings-title">Ширина меню</div>
            <div className="dashboard__menu-width-controls">
              <button type="button" className="dashboard__menu-width-step" onClick={() => applyMenuWidthStep(-10)} aria-label="Уменьшить на 10 пикселей">
                <span className="dashboard__menu-width-step-inner">−</span>
              </button>
              <span className="dashboard__menu-width-value">{liveMenuWidth}px</span>
              <button type="button" className="dashboard__menu-width-step" onClick={() => applyMenuWidthStep(10)} aria-label="Увеличить на 10 пикселей">
                <span className="dashboard__menu-width-step-inner">+</span>
              </button>
            </div>
            <div className="dashboard__settings-edit-actions">
              <button type="button" className="dashboard__settings-submit" onClick={() => setMenuWidthModalOpen(false)}>
                Отмена
              </button>
              <button type="button" className="dashboard__settings-submit" onClick={saveMenuWidth}>
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
            />
          ))}
        </div>
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

      {((viewMode === 'project' && activeProjectId) || (viewMode === 'board' && activeBoardId)) && (
        <button
          type="button"
          className="dashboard__edit-project-fab"
          onMouseEnter={() => hasHover && setEditProjectFabHover(true)}
          onMouseLeave={() => hasHover && setEditProjectFabHover(false)}
          onClick={() => {
            const id = viewMode === 'board' ? activeBoardId : activeProjectId;
            const entry = projects.find((p) => p.id === id);
            handleOpenEditProject(id, entry?.title ?? '', entry?.kind ?? (viewMode === 'board' ? 'board' : 'project'));
          }}
          aria-label={viewMode === 'board' ? 'Редактировать доску' : 'Редактировать проект'}
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
        ) : activeProjectDrag ? (
          <div className="dashboard-menu__project-drag-overlay" style={{ cursor: 'grabbing', pointerEvents: 'none' }}>
            <img src={activeProjectDrag.kind === 'board' ? doskaIcon : folderIcon} alt="" />
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
