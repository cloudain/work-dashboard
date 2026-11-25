import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Calendar as CalendarIcon,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardPaste,
  Copy,
  Download,
  Eraser,
  Image as ImageIcon,
  LayoutGrid,
  List,
  Minus,
  Paintbrush,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import {
  currentYearMonth,
  formatDateVN,
  formatMonthVN,
  formatShortDateVN,
  getWeeksForMonth,
  shiftYearMonth,
  slotKey,
  todayIsoLocal,
  type WeekBlock,
} from '../domain/calendar';
import {
  applySelectionTargets,
  buildDragFillPlan,
  buildFillDayPlan,
  buildPaintSingleTapPlan,
  buildPaintStrokePlan,
  buildPasteWeekPlan,
  captureWeekSnapshot,
  collectFilledTargetsForDate,
  collectFilledTargetsForMonth,
  collectFilledTargetsForWeek,
  collectFilledTargetsFromCells,
  collectFilledTargetsInRect,
  computeQuickDayPopoverPosition,
  countValidBranchShiftsForDate,
  createUndoEntry,
  parseSelectedSlotKeys,
  popUndoEntry,
  pushUndoEntry,
  type AnchorRect,
  type CopiedWeekSnapshot,
  type GridCoord,
  type PaintBrush,
  type PaintPlan,
  type SlotCellCoord,
  type UndoEntry,
} from '../domain/dragFill';
import { computeMonthlySummary, formatVND } from '../domain/finance';
import { generateIcsContent } from '../domain/ics';
import type {
  AhTask,
  AppSettings,
  Branch,
  MonthConfig,
  ShiftNumber,
  ShiftSlot,
  ShiftSlotTarget,
  ShiftStatus,
} from '../domain/types';
import { ManagerExportModal } from './ManagerExportModal';
import { ShiftEditorModal } from './ShiftEditorModal';

interface ScheduleViewProps {
  settings: AppSettings;
  branches: Branch[];
  slots: ShiftSlot[];
  monthConfigs: MonthConfig[];
  ahTasks: AhTask[];
  onUpsertSlot: (slot: ShiftSlot) => Promise<void>;
  onDeleteSlot: (shiftDate: string, shiftNumber: ShiftNumber) => Promise<void>;
  onBulkUpsertSlots: (slots: ShiftSlot[]) => Promise<void>;
  onBulkDeleteSlots: (targets: ShiftSlotTarget[]) => Promise<void>;
  onBulkDeleteDay: (shiftDate: string) => Promise<void>;
}

const STATUS_STYLE: Record<ShiftStatus, string> = {
  BV: 'bg-rose-100 border-rose-300 text-rose-800',
  NGHI: 'bg-amber-50 border-amber-300 text-amber-800',
  RANH: 'bg-lime-100 border-lime-400 text-lime-900',
  KFC: 'bg-emerald-50 border-emerald-400 text-emerald-950',
};

interface ActiveDrag {
  weekIdx: number;
  start: GridCoord;
  end: GridCoord;
  sourceSlot: ShiftSlot;
  startX: number;
  startY: number;
  pointerId: number;
  isDragging: boolean;
}

interface DeleteDrag {
  weekIdx: number;
  start: GridCoord;
  end: GridCoord;
  startX: number;
  startY: number;
  pointerId: number;
  isDragging: boolean;
  mode: 'add' | 'remove';
}

interface PaintStrokeState {
  pointerId: number;
  cells: SlotCellCoord[];
  hasMoved: boolean;
  startX: number;
  startY: number;
}

interface DeleteSwipeState {
  pointerId: number;
  mode: 'add' | 'remove';
  cells: SlotCellCoord[];
  hasMoved: boolean;
  startX: number;
  startY: number;
}

const MOBILE_LAYOUT_STORAGE_KEY = 'work-dashboard:mobile-layout';

function readStoredMobileLayout(): 'days' | 'grid' {
  try {
    const saved = window.localStorage.getItem(MOBILE_LAYOUT_STORAGE_KEY);
    if (saved === 'days' || saved === 'grid') return saved;
  } catch {
    // Ignore storage access errors in restricted contexts.
  }
  return 'days';
}

function formatBrushLabel(brush: PaintBrush): string {
  if (brush.kind === 'erase') return 'Tẩy';
  if (brush.kind === 'kfc') return brush.branchCode;
  if (brush.status === 'BV') return 'BV';
  if (brush.status === 'NGHI') return 'Nghỉ';
  return 'Rảnh';
}

function isSameBrush(a: PaintBrush, b: PaintBrush): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'status' && b.kind === 'status') return a.status === b.status;
  if (a.kind === 'kfc' && b.kind === 'kfc') return a.branchCode === b.branchCode;
  return true;
}

function statusLabel(slot: ShiftSlot): string {
  if (slot.status === 'KFC') return slot.branchCode ?? 'KFC';
  if (slot.status === 'BV') return 'BV';
  if (slot.status === 'NGHI') return 'Nghỉ';
  return 'Rảnh';
}

export function ScheduleView({
  settings,
  branches,
  slots,
  monthConfigs,
  ahTasks,
  onUpsertSlot,
  onDeleteSlot,
  onBulkUpsertSlots,
  onBulkDeleteSlots,
  onBulkDeleteDay,
}: ScheduleViewProps) {
  const [activeMonth, setActiveMonth] = useState<string>(currentYearMonth());
  const [editingCell, setEditingCell] = useState<{ dateStr: string; shiftNumber: ShiftNumber } | null>(
    null,
  );
  const [quickDay, setQuickDay] = useState<{ dateStr: string; rect: AnchorRect } | null>(null);
  const [showManagerExport, setShowManagerExport] = useState(false);
  const [mobileLayout, setMobileLayout] = useState<'days' | 'grid'>(readStoredMobileLayout);

  const [paintMode, setPaintMode] = useState(false);
  const [activeBrush, setActiveBrush] = useState<PaintBrush>({ kind: 'status', status: 'BV' });
  const [paintStroke, setPaintStroke] = useState<PaintStrokeState | null>(null);
  const paintStrokeRef = useRef<PaintStrokeState | null>(null);

  const [deleteMode, setDeleteMode] = useState(false);
  const [selectedDeleteKeys, setSelectedDeleteKeys] = useState<Set<string>>(() => new Set());
  const [deletingBulk, setDeletingBulk] = useState(false);
  const [copiedWeek, setCopiedWeek] = useState<CopiedWeekSnapshot | null>(null);
  const [replaceOnPaste, setReplaceOnPaste] = useState(false);
  const [pastingMonday, setPastingMonday] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; canUndo: boolean } | null>(null);
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);
  const [undoing, setUndoing] = useState(false);
  const [highlightedWeekMonday, setHighlightedWeekMonday] = useState<string | null>(null);

  const [drag, setDrag] = useState<ActiveDrag | null>(null);
  const dragRef = useRef<ActiveDrag | null>(null);
  const [deleteDrag, setDeleteDrag] = useState<DeleteDrag | null>(null);
  const deleteDragRef = useRef<DeleteDrag | null>(null);
  const [deleteSwipe, setDeleteSwipe] = useState<DeleteSwipeState | null>(null);
  const deleteSwipeRef = useRef<DeleteSwipeState | null>(null);
  const longPressCleanupRef = useRef<(() => void) | null>(null);
  const suppressClickRef = useRef(false);
  const undoStackRef = useRef<UndoEntry[]>(undoStack);
  const weekCardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const pendingScrollToTodayRef = useRef(false);

  const today = todayIsoLocal();
  const weeks = useMemo(() => getWeeksForMonth(activeMonth), [activeMonth]);
  const slotsByKey = useMemo(
    () => new Map(slots.map((s) => [slotKey(s.shiftDate, s.shiftNumber), s])),
    [slots],
  );
  const branchMap = useMemo(() => new Map(branches.map((b) => [b.code, b])), [branches]);
  const monthConfig = useMemo(
    () => monthConfigs.find((c) => c.yearMonth === activeMonth),
    [monthConfigs, activeMonth],
  );

  const summary = useMemo(
    () => computeMonthlySummary(activeMonth, slots, monthConfig, ahTasks, settings),
    [activeMonth, slots, monthConfig, ahTasks, settings],
  );

  const monthTargets = useMemo(
    () => collectFilledTargetsForMonth(activeMonth, slots),
    [activeMonth, slots],
  );

  const weeksRef = useRef(weeks);
  const branchMapRef = useRef(branchMap);
  const slotsByKeyRef = useRef(slotsByKey);
  const onBulkUpsertSlotsRef = useRef(onBulkUpsertSlots);
  const onBulkDeleteSlotsRef = useRef(onBulkDeleteSlots);
  const activeBrushRef = useRef(activeBrush);
  const recordUndoAndToastRef = useRef<(entry: UndoEntry | null, message: string) => void>(() => {});

  const recordUndoAndToast = (entry: UndoEntry | null, message: string) => {
    if (entry) {
      const next = pushUndoEntry(undoStackRef.current, entry);
      undoStackRef.current = next;
      setUndoStack(next);
      setToast({ message, canUndo: true });
      return;
    }
    setToast({ message, canUndo: false });
  };

  useEffect(() => {
    weeksRef.current = weeks;
    branchMapRef.current = branchMap;
    slotsByKeyRef.current = slotsByKey;
    onBulkUpsertSlotsRef.current = onBulkUpsertSlots;
    onBulkDeleteSlotsRef.current = onBulkDeleteSlots;
    activeBrushRef.current = activeBrush;
    undoStackRef.current = undoStack;
    recordUndoAndToastRef.current = recordUndoAndToast;
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(MOBILE_LAYOUT_STORAGE_KEY, mobileLayout);
    } catch {
      // Ignore storage access errors.
    }
  }, [mobileLayout]);

  useEffect(() => {
    if (!highlightedWeekMonday) return;
    const timer = window.setTimeout(() => setHighlightedWeekMonday(null), 1800);
    return () => window.clearTimeout(timer);
  }, [highlightedWeekMonday]);

  const scrollToTodayWeek = useCallback(
    (targetWeeks: WeekBlock[]) => {
      const target = targetWeeks.find((w) => w.days.some((d) => d.dateStr === today));
      if (!target) return;
      const el = weekCardRefs.current.get(target.mondayStr);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setHighlightedWeekMonday(target.mondayStr);
      }
    },
    [today],
  );

  useEffect(() => {
    if (!pendingScrollToTodayRef.current) return;
    pendingScrollToTodayRef.current = false;
    requestAnimationFrame(() => {
      scrollToTodayWeek(weeks);
    });
  }, [activeMonth, weeks, scrollToTodayWeek]);

  useEffect(() => () => {
    longPressCleanupRef.current?.();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const duration = toast.canUndo ? 6000 : 3500;
    const timer = window.setTimeout(() => setToast(null), duration);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const handleUndo = async () => {
    if (undoing) return;
    const { entry, rest } = popUndoEntry(undoStackRef.current);
    if (!entry) return;

    undoStackRef.current = rest;
    setUndoStack(rest);
    setUndoing(true);
    try {
      if (entry.restoreDeletes.length > 0) {
        await onBulkDeleteSlots(entry.restoreDeletes);
      }
      if (entry.restoreUpserts.length > 0) {
        await onBulkUpsertSlots(entry.restoreUpserts);
      }
      setToast({
        message: `Đã hoàn tác: ${entry.label}`,
        canUndo: rest.length > 0,
      });
    } catch (err) {
      const reverted = pushUndoEntry(rest, entry);
      undoStackRef.current = reverted;
      setUndoStack(reverted);
      throw err;
    } finally {
      setUndoing(false);
    }
  };

  const dragPlan = useMemo(() => {
    if (!drag?.isDragging) return null;
    const week = weeks[drag.weekIdx];
    if (!week) return null;
    return buildDragFillPlan(week, drag.sourceSlot, drag.start, drag.end, branchMap, slotsByKey);
  }, [drag, weeks, branchMap, slotsByKey]);

  const deleteDragPreviewKeys = useMemo(() => {
    if (!deleteDrag?.isDragging) return null;
    const week = weeks[deleteDrag.weekIdx];
    if (!week) return null;
    const targets = collectFilledTargetsInRect(week, deleteDrag.start, deleteDrag.end, slotsByKey);
    return new Set(targets.map((t) => slotKey(t.shiftDate, t.shiftNumber)));
  }, [deleteDrag, weeks, slotsByKey]);

  const deleteSwipePreviewKeys = useMemo(() => {
    if (!deleteSwipe) return null;
    const targets = collectFilledTargetsFromCells(deleteSwipe.cells, slotsByKey);
    return new Set(targets.map((t) => slotKey(t.shiftDate, t.shiftNumber)));
  }, [deleteSwipe, slotsByKey]);

  const activeDeletePreviewKeys = deleteSwipePreviewKeys ?? deleteDragPreviewKeys;

  const paintPreviewPlan: PaintPlan | null = useMemo(() => {
    if (!paintMode || !paintStroke || paintStroke.cells.length === 0) return null;
    if (!paintStroke.hasMoved && paintStroke.cells.length === 1) {
      const only = paintStroke.cells[0];
      return buildPaintSingleTapPlan(only.dateStr, only.shiftNumber, activeBrush, slotsByKey, branchMap);
    }
    return buildPaintStrokePlan(paintStroke.cells, activeBrush, slotsByKey, branchMap);
  }, [paintMode, paintStroke, activeBrush, slotsByKey, branchMap]);

  useEffect(() => {
    if (!quickDay) return;
    const close = () => setQuickDay(null);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    const onScroll = () => {
      if (window.innerWidth >= 640) close();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', close);
    };
  }, [quickDay]);

  const activeDragPointerId = drag?.pointerId ?? null;
  useEffect(() => {
    if (activeDragPointerId === null) return;

    const clearDrag = () => {
      dragRef.current = null;
      setDrag(null);
    };

    const updateEndFromPoint = (clientX: number, clientY: number) => {
      const cur = dragRef.current;
      if (!cur) return;

      const hitCell = document
        .elementFromPoint(clientX, clientY)
        ?.closest<HTMLElement>('[data-grid-week]');
      let nextEnd = cur.end;
      if (hitCell) {
        const hitWeek = Number(hitCell.dataset.gridWeek);
        const hitDay = Number(hitCell.dataset.gridDay);
        const hitShift = Number(hitCell.dataset.gridShift);
        if (
          hitWeek === cur.weekIdx &&
          Number.isInteger(hitDay) &&
          hitDay >= 0 &&
          hitDay <= 6 &&
          (hitShift === 1 || hitShift === 2 || hitShift === 3)
        ) {
          nextEnd = { dayIndex: hitDay, shiftNumber: hitShift };
        }
      }

      const movedEnough = Math.hypot(clientX - cur.startX, clientY - cur.startY) >= 6;
      const enteredOtherCell =
        nextEnd.dayIndex !== cur.start.dayIndex || nextEnd.shiftNumber !== cur.start.shiftNumber;
      const nextIsDragging = cur.isDragging || movedEnough || enteredOtherCell;

      if (
        nextIsDragging !== cur.isDragging ||
        nextEnd.dayIndex !== cur.end.dayIndex ||
        nextEnd.shiftNumber !== cur.end.shiftNumber
      ) {
        const updated: ActiveDrag = {
          ...cur,
          isDragging: nextIsDragging,
          end: nextEnd,
        };
        dragRef.current = updated;
        setDrag(updated);
      }
      return nextIsDragging;
    };

    const onPointerMove = (e: PointerEvent) => {
      const cur = dragRef.current;
      if (!cur || e.pointerId !== cur.pointerId) return;
      const draggingNow = updateEndFromPoint(e.clientX, e.clientY);
      if (draggingNow) {
        e.preventDefault();
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      const cur = dragRef.current;
      if (!cur?.isDragging) return;
      e.preventDefault();
      const touch = e.touches[0];
      if (touch) {
        updateEndFromPoint(touch.clientX, touch.clientY);
      }
    };

    const onContextMenu = (e: Event) => {
      if (dragRef.current?.isDragging) {
        e.preventDefault();
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      const cur = dragRef.current;
      if (!cur || e.pointerId !== cur.pointerId) return;
      clearDrag();

      if (cur.isDragging) {
        suppressClickRef.current = true;
        requestAnimationFrame(() => {
          suppressClickRef.current = false;
        });
        const week = weeksRef.current[cur.weekIdx];
        if (!week) return;
        const plan = buildDragFillPlan(
          week,
          cur.sourceSlot,
          cur.start,
          cur.end,
          branchMapRef.current,
          slotsByKeyRef.current,
        );
        if (plan.slotsToUpsert.length > 0) {
          const entry = createUndoEntry('kéo-tô lịch', slotsByKeyRef.current, plan.slotsToUpsert);
          void onBulkUpsertSlotsRef.current(plan.slotsToUpsert).then(() => {
            recordUndoAndToastRef.current(entry, `Đã tô ${plan.slotsToUpsert.length} ô lịch.`);
          });
        }
      }
    };

    const onPointerCancel = (e: PointerEvent) => {
      const cur = dragRef.current;
      if (cur && e.pointerId === cur.pointerId) {
        clearDrag();
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        clearDrag();
      }
    };

    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerCancel);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerCancel);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [activeDragPointerId]);

  const startCellPointerDown = (
    e: React.PointerEvent<HTMLElement>,
    weekIdx: number,
    dayIndex: number,
    shiftNumber: ShiftNumber,
    slot: ShiftSlot,
    fromHandle: boolean,
  ) => {
    if (deleteMode || paintMode) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if ((e.target as HTMLElement).closest('[data-no-drag="true"]')) return;

    if (e.pointerType === 'touch') {
      if (fromHandle) return;
      longPressCleanupRef.current?.();
      const pointerId = e.pointerId;
      const startX = e.clientX;
      const startY = e.clientY;
      const coord: GridCoord = { dayIndex, shiftNumber };

      let cleaned = false;
      const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        window.clearTimeout(timerId);
        window.removeEventListener('pointermove', onPreMove);
        window.removeEventListener('pointerup', onPreEnd);
        window.removeEventListener('pointercancel', onPreEnd);
        if (longPressCleanupRef.current === cleanup) {
          longPressCleanupRef.current = null;
        }
      };

      const onPreMove = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return;
        if (Math.hypot(ev.clientX - startX, ev.clientY - startY) > 8) {
          cleanup();
        }
      };

      const onPreEnd = (ev: PointerEvent) => {
        if (ev.pointerId === pointerId) {
          cleanup();
        }
      };

      const timerId = window.setTimeout(() => {
        cleanup();
        if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
          navigator.vibrate(15);
        }
        setQuickDay(null);
        const next: ActiveDrag = {
          weekIdx,
          start: coord,
          end: coord,
          sourceSlot: slot,
          startX,
          startY,
          pointerId,
          isDragging: true,
        };
        dragRef.current = next;
        setDrag(next);
      }, 300);

      longPressCleanupRef.current = cleanup;
      window.addEventListener('pointermove', onPreMove);
      window.addEventListener('pointerup', onPreEnd);
      window.addEventListener('pointercancel', onPreEnd);
      return;
    }

    if (fromHandle) {
      e.preventDefault();
    }

    setQuickDay(null);
    const coord: GridCoord = { dayIndex, shiftNumber };
    const next: ActiveDrag = {
      weekIdx,
      start: coord,
      end: coord,
      sourceSlot: slot,
      startX: e.clientX,
      startY: e.clientY,
      pointerId: e.pointerId,
      isDragging: fromHandle,
    };
    dragRef.current = next;
    setDrag(next);
  };

  const activeDeleteDragPointerId = deleteDrag?.pointerId ?? null;
  useEffect(() => {
    if (activeDeleteDragPointerId === null) return;

    const clearDeleteDrag = () => {
      deleteDragRef.current = null;
      setDeleteDrag(null);
    };

    const onPointerMove = (e: PointerEvent) => {
      const cur = deleteDragRef.current;
      if (!cur || e.pointerId !== cur.pointerId) return;

      const hitCell = document
        .elementFromPoint(e.clientX, e.clientY)
        ?.closest<HTMLElement>('[data-grid-week]');
      let nextEnd = cur.end;
      if (hitCell) {
        const hitWeek = Number(hitCell.dataset.gridWeek);
        const hitDay = Number(hitCell.dataset.gridDay);
        const hitShift = Number(hitCell.dataset.gridShift);
        if (
          hitWeek === cur.weekIdx &&
          Number.isInteger(hitDay) &&
          hitDay >= 0 &&
          hitDay <= 6 &&
          (hitShift === 1 || hitShift === 2 || hitShift === 3)
        ) {
          nextEnd = { dayIndex: hitDay, shiftNumber: hitShift };
        }
      }

      const movedEnough = Math.hypot(e.clientX - cur.startX, e.clientY - cur.startY) >= 6;
      const enteredOtherCell =
        nextEnd.dayIndex !== cur.start.dayIndex || nextEnd.shiftNumber !== cur.start.shiftNumber;
      const nextIsDragging = cur.isDragging || movedEnough || enteredOtherCell;

      if (nextIsDragging) {
        e.preventDefault();
      }

      if (
        nextIsDragging !== cur.isDragging ||
        nextEnd.dayIndex !== cur.end.dayIndex ||
        nextEnd.shiftNumber !== cur.end.shiftNumber
      ) {
        const updated: DeleteDrag = {
          ...cur,
          isDragging: nextIsDragging,
          end: nextEnd,
        };
        deleteDragRef.current = updated;
        setDeleteDrag(updated);
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      const cur = deleteDragRef.current;
      if (!cur || e.pointerId !== cur.pointerId) return;
      clearDeleteDrag();

      if (cur.isDragging) {
        suppressClickRef.current = true;
        requestAnimationFrame(() => {
          suppressClickRef.current = false;
        });
        const week = weeksRef.current[cur.weekIdx];
        if (!week) return;
        const targets = collectFilledTargetsInRect(
          week,
          cur.start,
          cur.end,
          slotsByKeyRef.current,
        );
        if (targets.length > 0) {
          setSelectedDeleteKeys((prev) => applySelectionTargets(prev, targets, cur.mode));
        }
      }
    };

    const onPointerCancel = (e: PointerEvent) => {
      const cur = deleteDragRef.current;
      if (cur && e.pointerId === cur.pointerId) {
        clearDeleteDrag();
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        clearDeleteDrag();
      }
    };

    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerCancel);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerCancel);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [activeDeleteDragPointerId]);

  useEffect(() => {
    if (!deleteMode) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !deleteDragRef.current) {
        setDeleteMode(false);
        setSelectedDeleteKeys(new Set());
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [deleteMode]);

  const startDeletePointerDown = (
    e: React.PointerEvent<HTMLElement>,
    weekIdx: number,
    dayIndex: number,
    shiftNumber: ShiftNumber,
    dateStr: string,
  ) => {
    if (!deleteMode) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    const key = slotKey(dateStr, shiftNumber);
    if (e.pointerType === 'touch' || mobileLayout === 'days') {
      e.preventDefault();
      const next: DeleteSwipeState = {
        pointerId: e.pointerId,
        mode: selectedDeleteKeys.has(key) ? 'remove' : 'add',
        cells: [{ dateStr, shiftNumber }],
        hasMoved: false,
        startX: e.clientX,
        startY: e.clientY,
      };
      deleteSwipeRef.current = next;
      setDeleteSwipe(next);
      return;
    }

    const coord: GridCoord = { dayIndex, shiftNumber };
    const next: DeleteDrag = {
      weekIdx,
      start: coord,
      end: coord,
      startX: e.clientX,
      startY: e.clientY,
      pointerId: e.pointerId,
      isDragging: false,
      mode: selectedDeleteKeys.has(key) ? 'remove' : 'add',
    };
    deleteDragRef.current = next;
    setDeleteDrag(next);
  };

  const activeDeleteSwipePointerId = deleteSwipe?.pointerId ?? null;
  useEffect(() => {
    if (activeDeleteSwipePointerId === null) return;

    const clearSwipe = () => {
      deleteSwipeRef.current = null;
      setDeleteSwipe(null);
    };

    const appendCellFromPoint = (clientX: number, clientY: number) => {
      const cur = deleteSwipeRef.current;
      if (!cur) return;
      const movedEnough = Math.hypot(clientX - cur.startX, clientY - cur.startY) >= 6;
      const hitCell = document
        .elementFromPoint(clientX, clientY)
        ?.closest<HTMLElement>('[data-grid-date]');
      let nextCells = cur.cells;
      let addedNew = false;
      if (hitCell) {
        const hitDate = hitCell.dataset.gridDate;
        const hitShift = Number(hitCell.dataset.gridShift);
        if (hitDate && (hitShift === 1 || hitShift === 2 || hitShift === 3)) {
          const already = cur.cells.some(
            (c) => c.dateStr === hitDate && c.shiftNumber === hitShift,
          );
          if (!already) {
            nextCells = [...cur.cells, { dateStr: hitDate, shiftNumber: hitShift }];
            addedNew = true;
          }
        }
      }
      const nextMoved = cur.hasMoved || movedEnough || addedNew;
      if (addedNew || nextMoved !== cur.hasMoved) {
        const updated: DeleteSwipeState = {
          ...cur,
          cells: nextCells,
          hasMoved: nextMoved,
        };
        deleteSwipeRef.current = updated;
        setDeleteSwipe(updated);
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      const cur = deleteSwipeRef.current;
      if (!cur || e.pointerId !== cur.pointerId) return;
      e.preventDefault();
      appendCellFromPoint(e.clientX, e.clientY);
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!deleteSwipeRef.current) return;
      e.preventDefault();
      const t = e.touches[0];
      if (t) appendCellFromPoint(t.clientX, t.clientY);
    };

    const onPointerUp = (e: PointerEvent) => {
      const cur = deleteSwipeRef.current;
      if (!cur || e.pointerId !== cur.pointerId) return;
      clearSwipe();

      if (cur.hasMoved) {
        suppressClickRef.current = true;
        requestAnimationFrame(() => {
          suppressClickRef.current = false;
        });
        const targets = collectFilledTargetsFromCells(cur.cells, slotsByKeyRef.current);
        if (targets.length > 0) {
          setSelectedDeleteKeys((prev) => applySelectionTargets(prev, targets, cur.mode));
        }
      }
    };

    const onPointerCancel = (e: PointerEvent) => {
      const cur = deleteSwipeRef.current;
      if (cur && e.pointerId === cur.pointerId) clearSwipe();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') clearSwipe();
    };

    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerCancel);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerCancel);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [activeDeleteSwipePointerId]);

  const activePaintPointerId = paintStroke?.pointerId ?? null;
  useEffect(() => {
    if (activePaintPointerId === null) return;

    const clearStroke = () => {
      paintStrokeRef.current = null;
      setPaintStroke(null);
    };

    const appendCellFromPoint = (clientX: number, clientY: number) => {
      const cur = paintStrokeRef.current;
      if (!cur) return;
      const movedEnough = Math.hypot(clientX - cur.startX, clientY - cur.startY) >= 6;
      const hitCell = document
        .elementFromPoint(clientX, clientY)
        ?.closest<HTMLElement>('[data-grid-date]');
      let nextCells = cur.cells;
      let addedNew = false;
      if (hitCell) {
        const hitDate = hitCell.dataset.gridDate;
        const hitShift = Number(hitCell.dataset.gridShift);
        if (hitDate && (hitShift === 1 || hitShift === 2 || hitShift === 3)) {
          const already = cur.cells.some(
            (c) => c.dateStr === hitDate && c.shiftNumber === hitShift,
          );
          if (!already) {
            nextCells = [...cur.cells, { dateStr: hitDate, shiftNumber: hitShift }];
            addedNew = true;
          }
        }
      }
      const nextMoved = cur.hasMoved || movedEnough || addedNew;
      if (addedNew || nextMoved !== cur.hasMoved) {
        const updated: PaintStrokeState = {
          ...cur,
          cells: nextCells,
          hasMoved: nextMoved,
        };
        paintStrokeRef.current = updated;
        setPaintStroke(updated);
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      const cur = paintStrokeRef.current;
      if (!cur || e.pointerId !== cur.pointerId) return;
      e.preventDefault();
      appendCellFromPoint(e.clientX, e.clientY);
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!paintStrokeRef.current) return;
      e.preventDefault();
      const t = e.touches[0];
      if (t) appendCellFromPoint(t.clientX, t.clientY);
    };

    const onPointerUp = (e: PointerEvent) => {
      const cur = paintStrokeRef.current;
      if (!cur || e.pointerId !== cur.pointerId) return;
      clearStroke();

      suppressClickRef.current = true;
      requestAnimationFrame(() => {
        suppressClickRef.current = false;
      });

      const brush = activeBrushRef.current;
      const isSingleTap = !cur.hasMoved && cur.cells.length === 1;
      const plan = isSingleTap
        ? buildPaintSingleTapPlan(
            cur.cells[0].dateStr,
            cur.cells[0].shiftNumber,
            brush,
            slotsByKeyRef.current,
            branchMapRef.current,
          )
        : buildPaintStrokePlan(cur.cells, brush, slotsByKeyRef.current, branchMapRef.current);

      if (plan.targetsToDelete.length === 0 && plan.slotsToUpsert.length === 0) {
        if (plan.skippedKeys.size > 0) {
          recordUndoAndToastRef.current(
            null,
            `${formatBrushLabel(brush)} không mở ở ca đã chọn.`,
          );
        }
        return;
      }

      const label = brush.kind === 'erase' ? 'tẩy nhanh' : `tô nhanh ${formatBrushLabel(brush)}`;
      const entry = createUndoEntry(
        label,
        slotsByKeyRef.current,
        plan.slotsToUpsert,
        plan.targetsToDelete,
      );

      void (async () => {
        if (plan.targetsToDelete.length > 0) {
          await onBulkDeleteSlotsRef.current(plan.targetsToDelete);
        }
        if (plan.slotsToUpsert.length > 0) {
          await onBulkUpsertSlotsRef.current(plan.slotsToUpsert);
        }
        const msg =
          plan.targetsToDelete.length > 0 && plan.slotsToUpsert.length === 0
            ? `Đã xoá ${plan.targetsToDelete.length} ô lịch.`
            : `Đã tô ${plan.slotsToUpsert.length} ô (${formatBrushLabel(brush)})${
                plan.skippedKeys.size > 0 ? ` · bỏ qua ${plan.skippedKeys.size} ca không mở` : ''
              }.`;
        recordUndoAndToastRef.current(entry, msg);
      })();
    };

    const onPointerCancel = (e: PointerEvent) => {
      const cur = paintStrokeRef.current;
      if (cur && e.pointerId === cur.pointerId) clearStroke();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') clearStroke();
    };

    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerCancel);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerCancel);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [activePaintPointerId]);

  useEffect(() => {
    if (!paintMode) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !paintStrokeRef.current) {
        setPaintMode(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [paintMode]);

  const startPaintPointerDown = (
    e: React.PointerEvent<HTMLElement>,
    dateStr: string,
    shiftNumber: ShiftNumber,
  ) => {
    if (!paintMode) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    setQuickDay(null);
    const next: PaintStrokeState = {
      pointerId: e.pointerId,
      cells: [{ dateStr, shiftNumber }],
      hasMoved: false,
      startX: e.clientX,
      startY: e.clientY,
    };
    paintStrokeRef.current = next;
    setPaintStroke(next);
  };

  const changeMonth = (nextMonth: string) => {
    longPressCleanupRef.current?.();
    setActiveMonth(nextMonth);
    setQuickDay(null);
    setPaintMode(false);
    paintStrokeRef.current = null;
    setPaintStroke(null);
    setDeleteMode(false);
    setSelectedDeleteKeys(new Set());
    dragRef.current = null;
    setDrag(null);
    deleteDragRef.current = null;
    setDeleteDrag(null);
    deleteSwipeRef.current = null;
    setDeleteSwipe(null);
  };

  const togglePaintMode = () => {
    longPressCleanupRef.current?.();
    setQuickDay(null);
    setCopiedWeek(null);
    setDeleteMode(false);
    setSelectedDeleteKeys(new Set());
    dragRef.current = null;
    setDrag(null);
    deleteDragRef.current = null;
    setDeleteDrag(null);
    deleteSwipeRef.current = null;
    setDeleteSwipe(null);
    paintStrokeRef.current = null;
    setPaintStroke(null);
    setPaintMode((cur) => !cur);
  };

  const toggleDeleteMode = () => {
    longPressCleanupRef.current?.();
    setQuickDay(null);
    setCopiedWeek(null);
    setPaintMode(false);
    paintStrokeRef.current = null;
    setPaintStroke(null);
    dragRef.current = null;
    setDrag(null);
    deleteDragRef.current = null;
    setDeleteDrag(null);
    deleteSwipeRef.current = null;
    setDeleteSwipe(null);
    setDeleteMode((cur) => {
      if (cur) {
        setSelectedDeleteKeys(new Set());
      }
      return !cur;
    });
  };

  useEffect(() => {
    if (!copiedWeek || deleteMode) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !quickDay && !editingCell) {
        setCopiedWeek(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [copiedWeek, deleteMode, quickDay, editingCell]);

  const handleCopyWeek = (week: WeekBlock) => {
    const label = `${formatShortDateVN(week.mondayStr)} – ${formatShortDateVN(week.days[6].dateStr)}`;
    const snapshot = captureWeekSnapshot(week, slotsByKey, label);
    if (snapshot.slots.length === 0) return;
    setQuickDay(null);
    setPaintMode(false);
    paintStrokeRef.current = null;
    setPaintStroke(null);
    setCopiedWeek(snapshot);
  };

  const handlePasteWeek = async (targetWeek: WeekBlock) => {
    if (!copiedWeek || pastingMonday) return;
    const plan = buildPasteWeekPlan(targetWeek, copiedWeek, slotsByKey, branchMap, replaceOnPaste);
    const targetLabel = `${formatShortDateVN(targetWeek.mondayStr)} – ${formatShortDateVN(targetWeek.days[6].dateStr)}`;
    const entry = createUndoEntry(
      `dán tuần ${targetLabel}`,
      slotsByKey,
      plan.slotsToUpsert,
      plan.targetsToDelete,
    );
    setPastingMonday(targetWeek.mondayStr);
    try {
      if (plan.targetsToDelete.length > 0) {
        await onBulkDeleteSlots(plan.targetsToDelete);
      }
      if (plan.slotsToUpsert.length > 0) {
        await onBulkUpsertSlots(plan.slotsToUpsert);
      }
      const skippedNote =
        plan.skippedCount > 0 ? ` (bỏ qua ${plan.skippedCount} ca không mở)` : '';
      recordUndoAndToast(
        entry,
        `Đã dán ${plan.slotsToUpsert.length} ô vào tuần ${targetLabel}${skippedNote}.`,
      );
    } finally {
      setPastingMonday(null);
    }
  };

  const toggleDeleteSingleCell = (dateStr: string, shiftNumber: ShiftNumber) => {
    const key = slotKey(dateStr, shiftNumber);
    if (!slotsByKey.has(key)) return;
    setSelectedDeleteKeys((prev) =>
      applySelectionTargets(prev, [{ shiftDate: dateStr, shiftNumber }], 'toggle'),
    );
  };

  const handleConfirmBulkDelete = async () => {
    const targets = parseSelectedSlotKeys(selectedDeleteKeys);
    if (targets.length === 0) return;
    const entry = createUndoEntry(`xoá ${targets.length} ô lịch`, slotsByKey, [], targets);
    setDeletingBulk(true);
    try {
      await onBulkDeleteSlots(targets);
      setSelectedDeleteKeys(new Set());
      setDeleteMode(false);
      recordUndoAndToast(entry, `Đã xoá ${targets.length} ô lịch.`);
    } finally {
      setDeletingBulk(false);
    }
  };

  const handleQuickProcedure = async (slot: ShiftSlot, delta: number) => {
    const next = Math.max(0, slot.procedureCount + delta);
    if (next === slot.procedureCount) return;
    await onUpsertSlot({ ...slot, procedureCount: next });
  };

  const handleFillDayBrush = async (dateStr: string, brush: PaintBrush) => {
    const plan = buildFillDayPlan(dateStr, brush, slotsByKey, branchMap);
    setQuickDay(null);
    if (plan.targetsToDelete.length === 0 && plan.slotsToUpsert.length === 0) {
      if (plan.skippedKeys.size > 0) {
        recordUndoAndToast(null, `${formatBrushLabel(brush)} không mở ca nào trong ngày này.`);
      }
      return;
    }

    const shortDate = formatShortDateVN(dateStr);
    const label =
      brush.kind === 'erase'
        ? `xoá ngày ${shortDate}`
        : `tô ngày ${shortDate} (${formatBrushLabel(brush)})`;
    const entry = createUndoEntry(label, slotsByKey, plan.slotsToUpsert, plan.targetsToDelete);

    if (brush.kind === 'erase') {
      await onBulkDeleteDay(dateStr);
    } else if (plan.slotsToUpsert.length > 0) {
      await onBulkUpsertSlots(plan.slotsToUpsert);
    }

    const msg =
      brush.kind === 'erase'
        ? `Đã xoá lịch ngày ${shortDate}.`
        : `Đã tô ngày ${shortDate}: ${formatBrushLabel(brush)}${
            plan.skippedKeys.size > 0 ? ` (bỏ qua ${plan.skippedKeys.size} ca không mở)` : ''
          }.`;
    recordUndoAndToast(entry, msg);
  };

  const handleDownloadIcs = () => {
    const content = generateIcsContent(slots, branches);
    const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kfc-lich-${activeMonth}.ics`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const activeBranches = useMemo(() => branches.filter((b) => b.isActive), [branches]);

  return (
    <div className={`space-y-3 sm:space-y-4 ${paintMode ? 'pb-36 md:pb-24' : ''}`}>
      {/* Header Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 sm:gap-3 bg-white rounded-2xl border border-slate-200 p-3 sm:p-4 shadow-sm">
        <div className="flex items-center justify-between sm:justify-start gap-1.5 sm:gap-2">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={() => changeMonth(shiftYearMonth(activeMonth, -1))}
              className="h-10 w-10 flex items-center justify-center rounded-xl border border-slate-200 hover:bg-slate-100 cursor-pointer"
              aria-label="Tháng trước"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="min-w-[120px] sm:min-w-[140px] text-center">
              <div className="text-sm sm:text-base font-bold text-slate-900">
                {formatMonthVN(activeMonth)}
              </div>
              <div className="text-[11px] text-slate-500">Kỳ chốt theo ngày dương lịch</div>
            </div>
            <button
              type="button"
              onClick={() => changeMonth(shiftYearMonth(activeMonth, 1))}
              className="h-10 w-10 flex items-center justify-center rounded-xl border border-slate-200 hover:bg-slate-100 cursor-pointer"
              aria-label="Tháng sau"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <button
            type="button"
            onClick={() => {
              const targetMonth = currentYearMonth();
              pendingScrollToTodayRef.current = true;
              if (activeMonth === targetMonth) {
                pendingScrollToTodayRef.current = false;
                scrollToTodayWeek(weeks);
              } else {
                changeMonth(targetMonth);
              }
            }}
            className="min-h-[40px] rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer shrink-0"
          >
            Hôm nay
          </button>
        </div>

        <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={togglePaintMode}
            className={`min-h-[42px] inline-flex items-center justify-center gap-1.5 rounded-xl border px-2.5 sm:px-3 py-2 text-xs sm:text-sm font-semibold cursor-pointer transition ${
              paintMode
                ? 'border-teal-700 bg-teal-700 text-white shadow-sm'
                : 'border-slate-300 bg-white hover:bg-teal-50 hover:border-teal-300 text-slate-700 hover:text-teal-800'
            }`}
          >
            <Paintbrush className="h-4 w-4 shrink-0" />
            <span>{paintMode ? 'Đang tô nhanh' : 'Tô nhanh'}</span>
          </button>
          <button
            type="button"
            onClick={toggleDeleteMode}
            className={`min-h-[42px] inline-flex items-center justify-center gap-1.5 rounded-xl border px-2.5 sm:px-3 py-2 text-xs sm:text-sm font-semibold cursor-pointer transition ${
              deleteMode
                ? 'border-rose-600 bg-rose-600 text-white shadow-sm'
                : 'border-slate-300 bg-white hover:bg-rose-50 hover:border-rose-300 text-slate-700 hover:text-rose-700'
            }`}
          >
            <Trash2 className="h-4 w-4 shrink-0" />
            <span className="sm:hidden">{deleteMode ? 'Đang xoá' : 'Xoá nhiều'}</span>
            <span className="hidden sm:inline">Xoá nhiều ô</span>
          </button>
          <button
            type="button"
            onClick={() => setShowManagerExport(true)}
            className="min-h-[42px] inline-flex items-center justify-center gap-1.5 rounded-xl bg-teal-700 hover:bg-teal-800 px-2.5 sm:px-3.5 py-2 text-xs sm:text-sm font-semibold text-white cursor-pointer shadow-sm"
          >
            <ImageIcon className="h-4 w-4 shrink-0" />
            <span className="sm:hidden">Xuất ảnh</span>
            <span className="hidden sm:inline">Xuất ảnh gửi sếp</span>
          </button>
          <button
            type="button"
            onClick={handleDownloadIcs}
            className="min-h-[42px] inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 px-2.5 sm:px-3 py-2 text-xs sm:text-sm font-semibold text-slate-700 cursor-pointer"
          >
            <Download className="h-4 w-4 shrink-0" />
            <span>Tải .ics</span>
          </button>
        </div>
      </div>

      {/* Sticky Multi-Delete Action Bar */}
      {deleteMode && (
        <div className="sticky top-2 z-30 rounded-2xl bg-rose-50/95 backdrop-blur-sm border border-rose-300 px-3.5 py-2.5 shadow-md flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="flex items-start sm:items-center gap-2">
            <Trash2 className="h-4 w-4 text-rose-600 shrink-0 mt-0.5 sm:mt-0" />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs sm:text-sm font-bold text-rose-950">Chế độ xoá nhanh</span>
                <span className="rounded-full bg-rose-600 text-white px-2 py-0.5 text-[11px] font-bold tabular-nums">
                  Đã chọn {selectedDeleteKeys.size} ô
                </span>
              </div>
              <p className="text-[11px] text-rose-800/80">
                Chạm ô, tiêu đề ngày hoặc kéo chọn để đánh dấu xoá
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              disabled={monthTargets.length === 0}
              onClick={() =>
                setSelectedDeleteKeys((prev) => applySelectionTargets(prev, monthTargets, 'toggle'))
              }
              className="rounded-xl border border-rose-300 bg-white hover:bg-rose-100 disabled:opacity-50 px-2.5 py-1.5 text-xs font-semibold text-rose-800 cursor-pointer"
            >
              Chọn cả tháng ({monthTargets.length})
            </button>
            {selectedDeleteKeys.size > 0 && (
              <button
                type="button"
                onClick={() => setSelectedDeleteKeys(new Set())}
                className="rounded-xl border border-slate-300 bg-white hover:bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-700 cursor-pointer"
              >
                Bỏ chọn
              </button>
            )}
            <button
              type="button"
              disabled={selectedDeleteKeys.size === 0 || deletingBulk}
              onClick={handleConfirmBulkDelete}
              className="rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 px-3 py-1.5 text-xs font-bold text-white cursor-pointer"
            >
              {deletingBulk ? 'Đang xoá...' : `Xoá (${selectedDeleteKeys.size})`}
            </button>
            <button
              type="button"
              onClick={toggleDeleteMode}
              className="rounded-xl border border-slate-300 bg-white hover:bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-700 cursor-pointer"
            >
              Xong
            </button>
          </div>
        </div>
      )}

      {/* Sticky Copied-Week Paste Banner */}
      {copiedWeek && !deleteMode && (
        <div className="sticky top-2 z-30 rounded-2xl bg-teal-50/95 backdrop-blur-sm border border-teal-300 px-3.5 py-2.5 shadow-md flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="flex items-start sm:items-center gap-2">
            <Copy className="h-4 w-4 text-teal-700 shrink-0 mt-0.5 sm:mt-0" />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs sm:text-sm font-bold text-teal-950">
                  Đã copy tuần {copiedWeek.sourceLabel}
                </span>
                <span className="rounded-full bg-teal-700 text-white px-2 py-0.5 text-[11px] font-bold tabular-nums">
                  {copiedWeek.slots.length} ô
                </span>
              </div>
              <p className="text-[11px] text-teal-800/80">
                Bấm &quot;Dán tuần&quot; ở tuần cần áp dụng (có thể chuyển tháng)
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between sm:justify-end gap-2">
            <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-900 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={replaceOnPaste}
                onChange={(e) => setReplaceOnPaste(e.target.checked)}
                className="rounded border-teal-400 text-teal-700 focus:ring-teal-600"
              />
              Thay thế toàn bộ tuần đích
            </label>
            <button
              type="button"
              onClick={() => setCopiedWeek(null)}
              className="rounded-xl border border-teal-300 bg-white hover:bg-teal-100 px-3 py-1.5 text-xs font-semibold text-teal-900 cursor-pointer"
            >
              Xong
            </button>
          </div>
        </div>
      )}

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed ${
            paintMode
              ? 'bottom-[calc(11.25rem+env(safe-area-inset-bottom))] md:bottom-28'
              : 'bottom-[calc(4.75rem+env(safe-area-inset-bottom))] md:bottom-5'
          } left-1/2 -translate-x-1/2 z-40 w-[calc(100%-1.5rem)] max-w-md rounded-2xl bg-slate-900/95 backdrop-blur-sm text-white px-4 py-3 text-xs sm:text-sm font-medium shadow-xl border border-slate-700/70 flex items-center justify-between gap-2.5`}
        >
          <span className="min-w-0 truncate">{toast.message}</span>
          <div className="flex items-center gap-1.5 shrink-0">
            {toast.canUndo && undoStack.length > 0 && (
              <button
                type="button"
                disabled={undoing}
                onClick={handleUndo}
                className="inline-flex items-center gap-1 rounded-xl bg-teal-500 hover:bg-teal-400 disabled:opacity-50 px-3 py-1.5 text-xs font-bold text-slate-950 cursor-pointer transition"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                {undoing ? 'Đang hoàn tác...' : 'Hoàn tác'}
              </button>
            )}
            <button
              type="button"
              onClick={() => setToast(null)}
              className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 cursor-pointer"
              aria-label="Đóng thông báo"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Floating Paint/Brush Dock */}
      {paintMode && !deleteMode && (
        <div className="fixed bottom-[calc(4.25rem+env(safe-area-inset-bottom))] md:bottom-4 left-1/2 -translate-x-1/2 z-40 w-[calc(100%-1rem)] max-w-2xl rounded-2xl bg-white/95 backdrop-blur-md border border-teal-300 shadow-xl p-2.5 space-y-2">
          <div className="flex items-center justify-between gap-2 px-0.5">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-xs font-bold text-teal-950">
                <Paintbrush className="h-3.5 w-3.5 text-teal-700 shrink-0" />
                <span>Tô nhanh: {formatBrushLabel(activeBrush)}</span>
              </div>
              <p className="text-[10px] sm:text-[11px] text-slate-500 truncate">
                Chạm hoặc quét ô · Vuốt tiêu đề để cuộn · Chạm tiêu đề ngày để tô cả ngày
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                disabled={undoStack.length === 0 || undoing}
                onClick={handleUndo}
                className="min-h-[34px] inline-flex items-center gap-1 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 px-2.5 py-1 text-xs font-semibold text-slate-700 cursor-pointer"
                title="Hoàn tác thao tác gần nhất"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Hoàn tác</span>
              </button>
              <button
                type="button"
                onClick={togglePaintMode}
                className="min-h-[34px] rounded-xl bg-teal-700 hover:bg-teal-800 px-3 py-1 text-xs font-bold text-white cursor-pointer"
              >
                Xong
              </button>
            </div>
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
            {(
              [
                {
                  brush: { kind: 'status', status: 'BV' } as PaintBrush,
                  label: 'BV',
                  activeCls: 'border-rose-500 bg-rose-600 text-white shadow-xs',
                  idleCls: 'border-rose-200 bg-rose-50 text-rose-800',
                },
                {
                  brush: { kind: 'status', status: 'NGHI' } as PaintBrush,
                  label: 'Nghỉ',
                  activeCls: 'border-amber-500 bg-amber-500 text-white shadow-xs',
                  idleCls: 'border-amber-200 bg-amber-50 text-amber-800',
                },
                {
                  brush: { kind: 'status', status: 'RANH' } as PaintBrush,
                  label: 'Rảnh',
                  activeCls: 'border-lime-600 bg-lime-600 text-white shadow-xs',
                  idleCls: 'border-lime-300 bg-lime-50 text-lime-900',
                },
              ] as const
            ).map((item) => {
              const selected = isSameBrush(activeBrush, item.brush);
              return (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => setActiveBrush(item.brush)}
                  className={`min-h-[38px] shrink-0 rounded-xl border px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                    selected ? item.activeCls : item.idleCls
                  }`}
                >
                  {item.label}
                </button>
              );
            })}

            {activeBranches.map((b) => {
              const brush: PaintBrush = { kind: 'kfc', branchCode: b.code };
              const selected = isSameBrush(activeBrush, brush);
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setActiveBrush(brush)}
                  className={`min-h-[38px] shrink-0 inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                    selected
                      ? 'border-teal-700 bg-teal-700 text-white shadow-xs'
                      : 'border-emerald-300 bg-emerald-50 text-emerald-950'
                  }`}
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full shrink-0 border border-white/60"
                    style={{ backgroundColor: b.color }}
                  />
                  {b.code}
                </button>
              );
            })}

            <button
              type="button"
              onClick={() => setActiveBrush({ kind: 'erase' })}
              className={`min-h-[38px] shrink-0 inline-flex items-center gap-1 rounded-xl border px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                activeBrush.kind === 'erase'
                  ? 'border-slate-800 bg-slate-800 text-white shadow-xs'
                  : 'border-slate-300 bg-slate-100 text-slate-700'
              }`}
            >
              <Eraser className="h-3.5 w-3.5" />
              Tẩy
            </button>
          </div>
        </div>
      )}

      {/* Month Quick Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        <div className="rounded-2xl bg-white border border-slate-200 p-2.5 sm:p-3.5 shadow-sm">
          <div className="text-[11px] sm:text-xs text-slate-500">
            Tổng ca KFC ({formatMonthVN(activeMonth)})
          </div>
          <div className="mt-1 text-base sm:text-xl font-bold text-slate-900 tabular-nums">
            {summary.kfcShiftsTotal} ca
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1 sm:gap-1.5">
            {branches
              .filter((b) => b.isActive)
              .map((b) => (
                <span
                  key={b.code}
                  className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] sm:text-[11px] font-semibold text-slate-700"
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: b.color }}
                  />
                  {b.code}: {summary.kfcShiftsByBranch[b.code] ?? 0}
                </span>
              ))}
          </div>
        </div>

        <div className="rounded-2xl bg-white border border-slate-200 p-2.5 sm:p-3.5 shadow-sm">
          <div className="text-[11px] sm:text-xs text-slate-500">Thủ thuật (Com KFC)</div>
          <div className="mt-1 text-base sm:text-xl font-bold text-slate-900 tabular-nums">
            {summary.totalProcedures} ca
          </div>
          <div className="mt-1 text-[11px] sm:text-xs font-medium text-teal-700 tabular-nums">
            {formatVND(summary.comIncome)}
          </div>
        </div>

        <div className="rounded-2xl bg-white border border-slate-200 p-2.5 sm:p-3.5 shadow-sm">
          <div className="text-[11px] sm:text-xs text-slate-500">Tạm tính KFC tháng</div>
          <div className="mt-1 text-base sm:text-xl font-bold text-teal-700 tabular-nums">
            {formatVND(summary.shiftIncome + summary.comIncome)}
          </div>
          <div className="mt-1 text-[10px] sm:text-[11px] text-slate-500">
            Thực nhận {Math.round(summary.payoutRatio * 100)}% lương ca
          </div>
        </div>

        <div className="rounded-2xl bg-white border border-slate-200 p-2.5 sm:p-3.5 shadow-sm">
          <div className="text-[11px] sm:text-xs text-slate-500">Trạng thái khác</div>
          <div className="mt-1.5 flex flex-wrap gap-1 sm:gap-1.5 text-[11px] sm:text-xs font-semibold">
            <span className="rounded-lg bg-rose-50 text-rose-700 px-1.5 sm:px-2 py-0.5">
              BV: {summary.bvShifts}
            </span>
            <span className="rounded-lg bg-amber-50 text-amber-800 px-1.5 sm:px-2 py-0.5">
              Nghỉ: {summary.nghiShifts}
            </span>
            <span className="rounded-lg bg-lime-50 text-lime-800 px-1.5 sm:px-2 py-0.5">
              Rảnh chưa xếp: {summary.ranhUnscheduledShifts}
            </span>
          </div>
        </div>
      </div>

      {/* Legend + Mobile Layout Toggle */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 px-1">
        <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded bg-rose-200 border border-rose-400" /> BV
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded bg-amber-100 border border-amber-400" /> Nghỉ
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded bg-lime-200 border border-lime-500" /> Rảnh (ĐK làm thêm)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded bg-emerald-200 border border-emerald-500" /> Chốt KFC (CN1–CN4)
          </span>
        </div>

        <div className="sm:hidden inline-flex items-center rounded-xl bg-slate-200/70 p-0.5">
          <button
            type="button"
            onClick={() => setMobileLayout('days')}
            className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition cursor-pointer ${
              mobileLayout === 'days' ? 'bg-white text-teal-800 shadow-xs' : 'text-slate-600'
            }`}
          >
            <List className="h-3.5 w-3.5" />
            Theo ngày
          </button>
          <button
            type="button"
            onClick={() => setMobileLayout('grid')}
            className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition cursor-pointer ${
              mobileLayout === 'grid' ? 'bg-white text-teal-800 shadow-xs' : 'text-slate-600'
            }`}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            Bảng tuần
          </button>
        </div>

        <span className="hidden sm:inline text-[11px] text-slate-400">
          Mẹo: Chạm tiêu đề ngày để tô cả ngày · Kéo ngang/dọc từ ô đã chọn để sao chép nhanh
        </span>
      </div>

      {/* Weekly Grids */}
      <div className="space-y-4">
        {weeks.map((week, idx) => {
          const weekFilledTargets = collectFilledTargetsForWeek(week, slotsByKey);
          const allWeekSelected =
            weekFilledTargets.length > 0 &&
            weekFilledTargets.every((t) =>
              selectedDeleteKeys.has(slotKey(t.shiftDate, t.shiftNumber)),
            );
          const isHighlightedWeek = highlightedWeekMonday === week.mondayStr;

          return (
            <div
              key={week.mondayStr}
              ref={(el) => {
                if (el) {
                  weekCardRefs.current.set(week.mondayStr, el);
                } else {
                  weekCardRefs.current.delete(week.mondayStr);
                }
              }}
              className={`rounded-2xl bg-white border shadow-sm overflow-hidden transition-shadow ${
                isHighlightedWeek
                  ? 'border-teal-500 ring-2 ring-teal-500 ring-offset-2'
                  : 'border-slate-200'
              }`}
            >
              <div className="touch-pan-y px-3.5 sm:px-4 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <CalendarIcon className="h-3.5 w-3.5 text-teal-700" />
                  Tuần {idx + 1}: {formatShortDateVN(week.mondayStr)} –{' '}
                  {formatShortDateVN(week.days[6].dateStr)}
                </span>
                {deleteMode && weekFilledTargets.length > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedDeleteKeys((prev) =>
                        applySelectionTargets(prev, weekFilledTargets, 'toggle'),
                      )
                    }
                    className={`rounded-lg px-2 py-1 text-[11px] font-semibold cursor-pointer transition shrink-0 ${
                      allWeekSelected
                        ? 'bg-rose-600 text-white'
                        : 'bg-white border border-rose-200 text-rose-700 hover:bg-rose-50'
                    }`}
                  >
                    {allWeekSelected ? 'Bỏ chọn tuần' : 'Chọn tuần'}
                  </button>
                )}
                {!deleteMode && copiedWeek && (
                  copiedWeek.sourceMondayStr === week.mondayStr ? (
                    <span className="rounded-lg bg-teal-100 text-teal-800 px-2.5 py-1 text-[11px] font-bold shrink-0">
                      Đang copy
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={pastingMonday !== null}
                      onClick={() => handlePasteWeek(week)}
                      className="inline-flex items-center gap-1 rounded-lg bg-teal-700 hover:bg-teal-800 disabled:opacity-50 px-2.5 py-1 text-[11px] font-semibold text-white cursor-pointer transition shrink-0"
                    >
                      <ClipboardPaste className="h-3.5 w-3.5" />
                      {pastingMonday === week.mondayStr ? 'Đang dán...' : 'Dán tuần'}
                    </button>
                  )
                )}
                {!deleteMode && !copiedWeek && weekFilledTargets.length > 0 && (
                  <button
                    type="button"
                    onClick={() => handleCopyWeek(week)}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white hover:bg-teal-50 hover:border-teal-300 hover:text-teal-800 px-2.5 py-1 text-[11px] font-semibold text-slate-700 cursor-pointer transition shrink-0"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Copy tuần
                  </button>
                )}
              </div>

              {/* Mobile Day-by-Day View */}
              {mobileLayout === 'days' && (
                <div className="sm:hidden divide-y divide-slate-100">
                  {week.days.map((day) => {
                    const isToday = day.dateStr === today;
                    const dayFilledTargets = collectFilledTargetsForDate(day.dateStr, slotsByKey);
                    const allDaySelected =
                      deleteMode &&
                      dayFilledTargets.length > 0 &&
                      dayFilledTargets.every((t) =>
                        selectedDeleteKeys.has(slotKey(t.shiftDate, t.shiftNumber)),
                      );

                    return (
                      <div
                        key={day.dateStr}
                        className={`flex items-stretch gap-2 p-2 ${
                          !day.inTargetMonth ? 'bg-slate-50/70' : ''
                        }`}
                      >
                        <button
                          type="button"
                          onClick={(e) => {
                            if (deleteMode) {
                              if (dayFilledTargets.length > 0) {
                                setSelectedDeleteKeys((prev) =>
                                  applySelectionTargets(prev, dayFilledTargets, 'toggle'),
                                );
                              }
                              return;
                            }
                            if (paintMode) {
                              void handleFillDayBrush(day.dateStr, activeBrush);
                              return;
                            }
                            const r = e.currentTarget.getBoundingClientRect();
                            setQuickDay((cur) =>
                              cur?.dateStr === day.dateStr
                                ? null
                                : {
                                    dateStr: day.dateStr,
                                    rect: {
                                      left: r.left,
                                      right: r.right,
                                      top: r.top,
                                      bottom: r.bottom,
                                      width: r.width,
                                      height: r.height,
                                    },
                                  },
                            );
                          }}
                          className={`touch-pan-y w-[58px] shrink-0 rounded-xl p-1.5 flex flex-col items-center justify-center text-center cursor-pointer transition ${
                            !day.inTargetMonth ? 'opacity-60' : ''
                          } ${
                            allDaySelected
                              ? 'bg-rose-100 ring-2 ring-rose-500 text-rose-900'
                              : isToday
                                ? 'bg-teal-50 ring-2 ring-teal-600 text-teal-900'
                                : 'bg-sky-50/80 hover:bg-sky-100/80 text-slate-800'
                          }`}
                        >
                          <span className="text-xs font-bold">{day.dayLabel}</span>
                          <span className="text-[11px] font-medium text-slate-500">
                            {formatShortDateVN(day.dateStr)}
                          </span>
                        </button>

                        <div
                          className={`flex-1 grid grid-cols-3 gap-1.5 min-w-0 ${
                            !day.inTargetMonth ? 'opacity-60' : ''
                          }`}
                        >
                          {([1, 2, 3] as const).map((shiftNumber) => {
                            const slot = slotsByKey.get(slotKey(day.dateStr, shiftNumber));
                            const branch = slot?.branchCode
                              ? branchMap.get(slot.branchCode)
                              : undefined;
                            const key = slotKey(day.dateStr, shiftNumber);

                            const inActiveWeekDrag = drag?.isDragging && drag.weekIdx === idx;
                            const isOrigin =
                              inActiveWeekDrag &&
                              drag.start.dayIndex === day.dayIndex &&
                              drag.start.shiftNumber === shiftNumber;
                            const isPreviewTarget =
                              inActiveWeekDrag &&
                              Boolean(dragPlan?.selectedKeys.has(key)) &&
                              !isOrigin &&
                              !dragPlan?.skippedKeys.has(key) &&
                              !dragPlan?.preservedKeys.has(key);
                            const isSkippedTarget =
                              inActiveWeekDrag && Boolean(dragPlan?.skippedKeys.has(key));
                            const sourceSlot = inActiveWeekDrag ? drag.sourceSlot : null;
                            const sourceBranch = sourceSlot?.branchCode
                              ? branchMap.get(sourceSlot.branchCode)
                              : undefined;

                            const inDeletePreview =
                              deleteMode && Boolean(activeDeletePreviewKeys?.has(key));
                            const deletePreviewMode = deleteSwipe?.mode ?? deleteDrag?.mode ?? 'add';
                            const isSelectedForDelete =
                              deleteMode &&
                              Boolean(slot) &&
                              (inDeletePreview
                                ? deletePreviewMode === 'add'
                                : selectedDeleteKeys.has(key));

                            const inPaintTouched =
                              paintMode && Boolean(paintPreviewPlan?.touchedKeys.has(key));
                            const isPaintSkipped =
                              inPaintTouched && Boolean(paintPreviewPlan?.skippedKeys.has(key));
                            const isPaintPreserved =
                              inPaintTouched && Boolean(paintPreviewPlan?.preservedKeys.has(key));
                            const isPaintDelete =
                              inPaintTouched &&
                              Boolean(
                                paintPreviewPlan?.targetsToDelete.some(
                                  (t) => t.shiftDate === day.dateStr && t.shiftNumber === shiftNumber,
                                ),
                              );
                            const paintUpsert = inPaintTouched
                              ? paintPreviewPlan?.slotsToUpsert.find(
                                  (s) => s.shiftDate === day.dateStr && s.shiftNumber === shiftNumber,
                                )
                              : undefined;
                            const paintBranch = paintUpsert?.branchCode
                              ? branchMap.get(paintUpsert.branchCode)
                              : undefined;

                            const cellTouchClass =
                              paintMode || deleteMode
                                ? 'touch-none select-none no-callout'
                                : slot
                                  ? 'no-callout'
                                  : '';

                            if (!slot) {
                              return (
                                <button
                                  key={shiftNumber}
                                  type="button"
                                  data-grid-week={idx}
                                  data-grid-day={day.dayIndex}
                                  data-grid-shift={shiftNumber}
                                  data-grid-date={day.dateStr}
                                  disabled={deleteMode}
                                  onPointerDown={(e) => {
                                    if (paintMode) {
                                      startPaintPointerDown(e, day.dateStr, shiftNumber);
                                      return;
                                    }
                                    if (deleteMode) {
                                      startDeletePointerDown(
                                        e,
                                        idx,
                                        day.dayIndex,
                                        shiftNumber,
                                        day.dateStr,
                                      );
                                    }
                                  }}
                                  onClick={() => {
                                    if (suppressClickRef.current || deleteMode || paintMode) return;
                                    setEditingCell({ dateStr: day.dateStr, shiftNumber });
                                  }}
                                  className={`relative min-h-[72px] rounded-xl border border-dashed flex flex-col items-center justify-center gap-0.5 transition ${cellTouchClass} ${
                                    deleteMode
                                      ? 'border-slate-200 bg-slate-50/50 text-slate-300 cursor-default'
                                      : isPreviewTarget || paintUpsert
                                        ? 'border-teal-500 bg-teal-50/80 ring-2 ring-teal-500 text-teal-800 cursor-pointer'
                                        : isSkippedTarget || isPaintSkipped
                                          ? 'border-rose-300 bg-slate-100/90 ring-2 ring-rose-300 text-slate-500 cursor-pointer'
                                          : 'border-slate-200 hover:border-teal-400 hover:bg-teal-50/40 text-slate-400 cursor-pointer'
                                  }`}
                                >
                                  {isPreviewTarget && sourceSlot ? (
                                    <span className="inline-flex items-center gap-1 rounded-md bg-white/90 px-1.5 py-0.5 text-[11px] font-bold text-teal-800 shadow-xs">
                                      {sourceSlot.status === 'KFC' && sourceBranch && (
                                        <span
                                          className="h-2 w-2 rounded-full shrink-0"
                                          style={{ backgroundColor: sourceBranch.color }}
                                        />
                                      )}
                                      + {statusLabel(sourceSlot)}
                                    </span>
                                  ) : paintUpsert ? (
                                    <span className="inline-flex items-center gap-1 rounded-md bg-white/90 px-1.5 py-0.5 text-[11px] font-bold text-teal-800 shadow-xs">
                                      {paintUpsert.status === 'KFC' && paintBranch && (
                                        <span
                                          className="h-2 w-2 rounded-full shrink-0"
                                          style={{ backgroundColor: paintBranch.color }}
                                        />
                                      )}
                                      + {statusLabel(paintUpsert)}
                                    </span>
                                  ) : isSkippedTarget || isPaintSkipped ? (
                                    <span className="text-[10px] font-semibold text-rose-600 text-center px-1">
                                      Không mở ca
                                    </span>
                                  ) : (
                                    <>
                                      <span className="text-[10px] font-medium text-slate-400">
                                        Ca {shiftNumber}
                                      </span>
                                      <Plus className="h-3.5 w-3.5" />
                                    </>
                                  )}
                                </button>
                              );
                            }

                            return (
                              <div
                                key={shiftNumber}
                                data-grid-week={idx}
                                data-grid-day={day.dayIndex}
                                data-grid-shift={shiftNumber}
                                data-grid-date={day.dateStr}
                                onPointerDown={(e) => {
                                  if (paintMode) {
                                    startPaintPointerDown(e, day.dateStr, shiftNumber);
                                    return;
                                  }
                                  if (deleteMode) {
                                    startDeletePointerDown(
                                      e,
                                      idx,
                                      day.dayIndex,
                                      shiftNumber,
                                      day.dateStr,
                                    );
                                    return;
                                  }
                                  startCellPointerDown(
                                    e,
                                    idx,
                                    day.dayIndex,
                                    shiftNumber,
                                    slot,
                                    false,
                                  );
                                }}
                                onClick={(e) => {
                                  if (suppressClickRef.current) return;
                                  if (paintMode) return;
                                  if (deleteMode) {
                                    toggleDeleteSingleCell(day.dateStr, shiftNumber);
                                    return;
                                  }
                                  if ((e.target as HTMLElement).closest('[data-no-drag="true"]')) {
                                    return;
                                  }
                                  setEditingCell({ dateStr: day.dateStr, shiftNumber });
                                }}
                                className={`relative min-h-[72px] rounded-xl border p-1.5 flex flex-col justify-between cursor-pointer transition ${cellTouchClass} ${
                                  STATUS_STYLE[slot.status]
                                } ${
                                  isSelectedForDelete || isPaintDelete
                                    ? 'ring-2 ring-rose-500 ring-offset-1'
                                    : isOrigin
                                      ? 'ring-2 ring-teal-600 ring-offset-2 scale-[1.03] shadow-md z-10'
                                      : isPreviewTarget || paintUpsert
                                        ? 'ring-2 ring-teal-500'
                                        : isSkippedTarget || isPaintSkipped
                                          ? 'ring-2 ring-rose-300'
                                          : isPaintPreserved
                                            ? 'ring-2 ring-emerald-500/70'
                                            : ''
                                }`}
                              >
                                <div className="flex items-center justify-between gap-1">
                                  <span className="text-[10px] font-medium opacity-70">
                                    Ca {shiftNumber}
                                  </span>
                                  {slot.note && !isSelectedForDelete && (
                                    <span className="h-1.5 w-1.5 rounded-full bg-slate-500 shrink-0" />
                                  )}
                                </div>

                                <div className="flex items-center gap-1 truncate text-xs font-bold">
                                  {slot.status === 'KFC' && branch && (
                                    <span
                                      className="h-2 w-2 rounded-full shrink-0"
                                      style={{ backgroundColor: branch.color }}
                                    />
                                  )}
                                  <span className="truncate">{statusLabel(slot)}</span>
                                </div>

                                {slot.status === 'KFC' && !deleteMode && !paintMode && (
                                  <div
                                    data-no-drag="true"
                                    onPointerDown={(e) => e.stopPropagation()}
                                    onClick={(e) => e.stopPropagation()}
                                    className="mt-1 flex items-center justify-between bg-white/90 rounded-lg border border-emerald-200 overflow-hidden"
                                  >
                                    <button
                                      type="button"
                                      onClick={() => handleQuickProcedure(slot, -1)}
                                      className="min-w-[30px] h-7 flex items-center justify-center text-slate-700 hover:bg-emerald-50 cursor-pointer"
                                      title="Giảm 1 thủ thuật"
                                      aria-label="Giảm 1 thủ thuật"
                                    >
                                      <Minus className="h-3.5 w-3.5" />
                                    </button>
                                    <span className="text-[11px] font-bold text-slate-800 tabular-nums">
                                      {slot.procedureCount}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => handleQuickProcedure(slot, 1)}
                                      className="min-w-[30px] h-7 flex items-center justify-center text-slate-700 hover:bg-emerald-50 cursor-pointer"
                                      title="Thêm 1 thủ thuật"
                                      aria-label="Thêm 1 thủ thuật"
                                    >
                                      <Plus className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                )}

                                {isSelectedForDelete && (
                                  <span className="pointer-events-none absolute -top-1 -right-1 h-4 w-4 rounded-full bg-rose-600 text-white flex items-center justify-center shadow-xs">
                                    <Check className="h-2.5 w-2.5" />
                                  </span>
                                )}

                                {(isPreviewTarget || isSkippedTarget) && sourceSlot && (
                                  <div
                                    className={`pointer-events-none absolute inset-0 rounded-xl flex items-center justify-center ${
                                      isPreviewTarget ? 'bg-teal-50/85' : 'bg-slate-100/90'
                                    }`}
                                  >
                                    {isPreviewTarget ? (
                                      <span className="inline-flex items-center gap-1 rounded-md bg-white px-1.5 py-0.5 text-[11px] font-bold text-teal-800 shadow-xs border border-teal-200">
                                        {sourceSlot.status === 'KFC' && sourceBranch && (
                                          <span
                                            className="h-2 w-2 rounded-full shrink-0"
                                            style={{ backgroundColor: sourceBranch.color }}
                                          />
                                        )}
                                        + {statusLabel(sourceSlot)}
                                      </span>
                                    ) : (
                                      <span className="text-[10px] font-semibold text-rose-600 text-center px-1">
                                        Không mở ca
                                      </span>
                                    )}
                                  </div>
                                )}

                                {(paintUpsert || isPaintSkipped || isPaintDelete) && (
                                  <div
                                    className={`pointer-events-none absolute inset-0 rounded-xl flex items-center justify-center ${
                                      isPaintDelete
                                        ? 'bg-rose-50/90'
                                        : paintUpsert
                                          ? 'bg-teal-50/85'
                                          : 'bg-slate-100/90'
                                    }`}
                                  >
                                    {isPaintDelete ? (
                                      <span className="rounded-md bg-white px-1.5 py-0.5 text-[10px] font-bold text-rose-700 border border-rose-200 shadow-xs">
                                        Xoá
                                      </span>
                                    ) : paintUpsert ? (
                                      <span className="inline-flex items-center gap-1 rounded-md bg-white px-1.5 py-0.5 text-[11px] font-bold text-teal-800 shadow-xs border border-teal-200">
                                        {paintUpsert.status === 'KFC' && paintBranch && (
                                          <span
                                            className="h-2 w-2 rounded-full shrink-0"
                                            style={{ backgroundColor: paintBranch.color }}
                                          />
                                        )}
                                        + {statusLabel(paintUpsert)}
                                      </span>
                                    ) : (
                                      <span className="text-[10px] font-semibold text-rose-600 text-center px-1">
                                        Không mở ca
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Weekly Grid Table (Desktop always + Mobile when 'grid' selected) */}
              <div
                className={`overflow-x-auto ${mobileLayout === 'days' ? 'hidden sm:block' : 'block'}`}
              >
                <table
                  className={`w-full min-w-0 sm:min-w-[680px] border-collapse table-fixed ${
                    (drag?.isDragging && drag.weekIdx === idx) ||
                    (deleteDrag?.isDragging && deleteDrag.weekIdx === idx)
                      ? 'select-none cursor-crosshair'
                      : ''
                  }`}
                >
                  <thead>
                    <tr>
                      <th className="sticky left-0 z-10 w-7 sm:w-16 bg-amber-50 border-b border-r border-slate-200 py-1.5 sm:py-2 text-[10px] sm:text-xs font-bold text-slate-700 shadow-[1px_0_0_rgba(226,232,240,1)]">
                        Ca
                      </th>
                      {week.days.map((day) => {
                        const isToday = day.dateStr === today;
                        const dayFilledTargets = collectFilledTargetsForDate(
                          day.dateStr,
                          slotsByKey,
                        );
                        const allDaySelected =
                          deleteMode &&
                          dayFilledTargets.length > 0 &&
                          dayFilledTargets.every((t) =>
                            selectedDeleteKeys.has(slotKey(t.shiftDate, t.shiftNumber)),
                          );
                        return (
                          <th
                            key={day.dateStr}
                            className={`border-b border-r last:border-r-0 border-slate-200 p-0.5 sm:p-1.5 text-center ${
                              !day.inTargetMonth ? 'bg-slate-100/70' : 'bg-sky-50/70'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={(e) => {
                                if (deleteMode) {
                                  if (dayFilledTargets.length > 0) {
                                    setSelectedDeleteKeys((prev) =>
                                      applySelectionTargets(prev, dayFilledTargets, 'toggle'),
                                    );
                                  }
                                  return;
                                }
                                if (paintMode) {
                                  void handleFillDayBrush(day.dateStr, activeBrush);
                                  return;
                                }
                                const r = e.currentTarget.getBoundingClientRect();
                                setQuickDay((cur) =>
                                  cur?.dateStr === day.dateStr
                                    ? null
                                    : {
                                        dateStr: day.dateStr,
                                        rect: {
                                          left: r.left,
                                          right: r.right,
                                          top: r.top,
                                          bottom: r.bottom,
                                          width: r.width,
                                          height: r.height,
                                        },
                                      },
                                );
                              }}
                              className={`touch-pan-y w-full rounded-lg py-1 px-0.5 sm:px-1 transition cursor-pointer ${
                                !day.inTargetMonth ? 'opacity-60' : ''
                              } ${
                                allDaySelected
                                  ? 'ring-2 ring-rose-500 bg-rose-100'
                                  : isToday
                                    ? 'ring-2 ring-teal-600 bg-teal-50 hover:bg-sky-100/80'
                                    : 'hover:bg-sky-100/80'
                              }`}
                            >
                              <div className="text-[11px] sm:text-xs font-bold text-slate-800">
                                {day.dayLabel}
                              </div>
                              <div className="text-[10px] sm:text-[11px] font-medium text-slate-500">
                                {formatShortDateVN(day.dateStr)}
                              </div>
                            </button>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {([1, 2, 3] as const).map((shiftNumber) => (
                      <tr key={shiftNumber}>
                        <td className="sticky left-0 z-10 bg-amber-50 border-b last:border-b-0 border-r border-slate-200 text-center text-[10px] sm:text-xs font-bold text-slate-700 py-2 sm:py-3 shadow-[1px_0_0_rgba(226,232,240,1)]">
                          <span className="sm:hidden">C{shiftNumber}</span>
                          <span className="hidden sm:inline">Ca {shiftNumber}</span>
                        </td>
                        {week.days.map((day) => {
                          const slot = slotsByKey.get(slotKey(day.dateStr, shiftNumber));
                          const branch = slot?.branchCode
                            ? branchMap.get(slot.branchCode)
                            : undefined;
                          const key = slotKey(day.dateStr, shiftNumber);
                          const inActiveWeekDrag = drag?.isDragging && drag.weekIdx === idx;
                          const isOrigin =
                            inActiveWeekDrag &&
                            drag.start.dayIndex === day.dayIndex &&
                            drag.start.shiftNumber === shiftNumber;
                          const isPreviewTarget =
                            inActiveWeekDrag &&
                            Boolean(dragPlan?.selectedKeys.has(key)) &&
                            !isOrigin &&
                            !dragPlan?.skippedKeys.has(key) &&
                            !dragPlan?.preservedKeys.has(key);
                          const isSkippedTarget =
                            inActiveWeekDrag && Boolean(dragPlan?.skippedKeys.has(key));
                          const sourceSlot = inActiveWeekDrag ? drag.sourceSlot : null;
                          const sourceBranch = sourceSlot?.branchCode
                            ? branchMap.get(sourceSlot.branchCode)
                            : undefined;

                          const inDeletePreview =
                            deleteMode && Boolean(activeDeletePreviewKeys?.has(key));
                          const deletePreviewMode = deleteSwipe?.mode ?? deleteDrag?.mode ?? 'add';
                          const isSelectedForDelete =
                            deleteMode &&
                            Boolean(slot) &&
                            (inDeletePreview
                              ? deletePreviewMode === 'add'
                              : selectedDeleteKeys.has(key));

                          const inPaintTouched =
                            paintMode && Boolean(paintPreviewPlan?.touchedKeys.has(key));
                          const isPaintSkipped =
                            inPaintTouched && Boolean(paintPreviewPlan?.skippedKeys.has(key));
                          const isPaintPreserved =
                            inPaintTouched && Boolean(paintPreviewPlan?.preservedKeys.has(key));
                          const isPaintDelete =
                            inPaintTouched &&
                            Boolean(
                              paintPreviewPlan?.targetsToDelete.some(
                                (t) => t.shiftDate === day.dateStr && t.shiftNumber === shiftNumber,
                              ),
                            );
                          const paintUpsert = inPaintTouched
                            ? paintPreviewPlan?.slotsToUpsert.find(
                                (s) => s.shiftDate === day.dateStr && s.shiftNumber === shiftNumber,
                              )
                            : undefined;
                          const paintBranch = paintUpsert?.branchCode
                            ? branchMap.get(paintUpsert.branchCode)
                            : undefined;

                          const cellTouchClass =
                            paintMode || deleteMode
                              ? 'touch-none select-none no-callout'
                              : slot
                                ? 'no-callout'
                                : '';

                          return (
                            <td
                              key={day.dateStr}
                              data-grid-week={idx}
                              data-grid-day={day.dayIndex}
                              data-grid-shift={shiftNumber}
                              data-grid-date={day.dateStr}
                              onPointerDown={(e) => {
                                if (paintMode) {
                                  startPaintPointerDown(e, day.dateStr, shiftNumber);
                                  return;
                                }
                                if (deleteMode) {
                                  startDeletePointerDown(
                                    e,
                                    idx,
                                    day.dayIndex,
                                    shiftNumber,
                                    day.dateStr,
                                  );
                                }
                              }}
                              className={`relative border-b last:border-b-0 border-r last:border-r-0 border-slate-200 p-0.5 sm:p-1 align-top h-[58px] sm:h-[74px] ${
                                !day.inTargetMonth ? 'bg-slate-50/80' : ''
                              }`}
                            >
                              <div className={`w-full h-full ${!day.inTargetMonth ? 'opacity-60' : ''}`}>
                                {!slot ? (
                                  <button
                                    type="button"
                                    disabled={deleteMode}
                                    onClick={() => {
                                      if (suppressClickRef.current || deleteMode || paintMode) return;
                                      setEditingCell({ dateStr: day.dateStr, shiftNumber });
                                    }}
                                    className={`w-full h-full min-h-[50px] sm:min-h-[64px] rounded-lg sm:rounded-xl border border-dashed flex items-center justify-center transition ${cellTouchClass} ${
                                      deleteMode
                                        ? 'border-slate-200 bg-slate-50/40 text-slate-200 cursor-default'
                                        : isPreviewTarget || paintUpsert
                                          ? 'border-teal-500 bg-teal-50/80 ring-2 ring-teal-500 text-teal-700 cursor-pointer'
                                          : isSkippedTarget || isPaintSkipped
                                            ? 'border-rose-300 bg-slate-100/90 ring-2 ring-rose-300 text-slate-500 cursor-pointer'
                                            : 'border-slate-200 hover:border-teal-400 hover:bg-teal-50/40 text-slate-300 hover:text-teal-600 cursor-pointer'
                                    }`}
                                    title={
                                      deleteMode
                                        ? undefined
                                        : `Chọn ${formatDateVN(day.dateStr)} Ca ${shiftNumber}`
                                    }
                                  >
                                    {isPreviewTarget && sourceSlot ? (
                                      <span className="inline-flex items-center gap-0.5 sm:gap-1 rounded-md bg-white/90 px-1 sm:px-1.5 py-0.5 text-[10px] sm:text-[11px] font-bold text-teal-800 shadow-xs">
                                        {sourceSlot.status === 'KFC' && sourceBranch && (
                                          <span
                                            className="h-1.5 w-1.5 sm:h-2 sm:w-2 rounded-full shrink-0"
                                            style={{ backgroundColor: sourceBranch.color }}
                                          />
                                        )}
                                        +{statusLabel(sourceSlot)}
                                      </span>
                                    ) : paintUpsert ? (
                                      <span className="inline-flex items-center gap-0.5 sm:gap-1 rounded-md bg-white/90 px-1 sm:px-1.5 py-0.5 text-[10px] sm:text-[11px] font-bold text-teal-800 shadow-xs">
                                        {paintUpsert.status === 'KFC' && paintBranch && (
                                          <span
                                            className="h-1.5 w-1.5 sm:h-2 sm:w-2 rounded-full shrink-0"
                                            style={{ backgroundColor: paintBranch.color }}
                                          />
                                        )}
                                        +{statusLabel(paintUpsert)}
                                      </span>
                                    ) : isSkippedTarget || isPaintSkipped ? (
                                      <span className="text-[9px] sm:text-[10px] font-semibold text-rose-600 text-center leading-tight">
                                        Không mở
                                      </span>
                                    ) : (
                                      <Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                                    )}
                                  </button>
                                ) : (
                                  <div
                                    onPointerDown={(e) => {
                                      if (paintMode || deleteMode) return;
                                      startCellPointerDown(
                                        e,
                                        idx,
                                        day.dayIndex,
                                        shiftNumber,
                                        slot,
                                        false,
                                      );
                                    }}
                                    onClick={(e) => {
                                      if (suppressClickRef.current) return;
                                      if (paintMode) return;
                                      if (deleteMode) {
                                        toggleDeleteSingleCell(day.dateStr, shiftNumber);
                                        return;
                                      }
                                      if ((e.target as HTMLElement).closest('[data-no-drag="true"]')) {
                                        return;
                                      }
                                      setEditingCell({ dateStr: day.dateStr, shiftNumber });
                                    }}
                                    className={`group relative w-full h-full min-h-[50px] sm:min-h-[64px] rounded-lg sm:rounded-xl border p-1 sm:p-1.5 flex flex-col justify-between transition cursor-pointer ${cellTouchClass} ${
                                      STATUS_STYLE[slot.status]
                                    } ${
                                      isSelectedForDelete || isPaintDelete
                                        ? 'ring-2 ring-rose-500 ring-offset-1'
                                        : isOrigin
                                          ? 'ring-2 ring-teal-600 ring-offset-2 scale-[1.03] shadow-md z-10'
                                          : isPreviewTarget || paintUpsert
                                            ? 'ring-2 ring-teal-500'
                                            : isSkippedTarget || isPaintSkipped
                                              ? 'ring-2 ring-rose-300'
                                              : isPaintPreserved
                                                ? 'ring-2 ring-emerald-500/70'
                                                : ''
                                    }`}
                                  >
                                    <button
                                      type="button"
                                      className="w-full text-left flex items-center justify-between gap-0.5 sm:gap-1 cursor-pointer"
                                    >
                                      <span className="text-[11px] sm:text-xs font-bold flex items-center gap-0.5 sm:gap-1 truncate">
                                        {slot.status === 'KFC' && branch && (
                                          <span
                                            className="h-1.5 w-1.5 sm:h-2 sm:w-2 rounded-full shrink-0"
                                            style={{ backgroundColor: branch.color }}
                                          />
                                        )}
                                        <span className="truncate">{statusLabel(slot)}</span>
                                      </span>
                                      {slot.note && !isSelectedForDelete && (
                                        <span className="h-1.5 w-1.5 rounded-full bg-slate-500 shrink-0" />
                                      )}
                                    </button>

                                    {slot.status === 'KFC' && !deleteMode && !paintMode && (
                                      <>
                                        {/* Compact mobile badge */}
                                        <div className="sm:hidden flex items-center">
                                          <span
                                            className={`rounded px-1 py-0.5 text-[9px] font-bold tabular-nums leading-none ${
                                              slot.procedureCount > 0
                                                ? 'bg-emerald-600 text-white'
                                                : 'bg-white/75 text-slate-500 border border-emerald-200/80'
                                            }`}
                                          >
                                            {slot.procedureCount} TT
                                          </span>
                                        </div>

                                        {/* Desktop inline counter */}
                                        <div
                                          data-no-drag="true"
                                          onPointerDown={(e) => e.stopPropagation()}
                                          onClick={(e) => e.stopPropagation()}
                                          className="hidden sm:flex items-center justify-between bg-white/80 rounded-lg px-1 py-0.5 border border-emerald-200"
                                        >
                                          <button
                                            type="button"
                                            onClick={() => handleQuickProcedure(slot, -1)}
                                            className="p-0.5 text-slate-600 hover:text-slate-900 cursor-pointer"
                                            title="Giảm 1 thủ thuật"
                                          >
                                            <Minus className="h-3 w-3" />
                                          </button>
                                          <span className="text-[11px] font-bold text-slate-800">
                                            TT: {slot.procedureCount}
                                          </span>
                                          <button
                                            type="button"
                                            onClick={() => handleQuickProcedure(slot, 1)}
                                            className="p-0.5 text-slate-600 hover:text-slate-900 cursor-pointer"
                                            title="Thêm 1 thủ thuật"
                                          >
                                            <Plus className="h-3 w-3" />
                                          </button>
                                        </div>
                                      </>
                                    )}

                                    {!deleteMode && !paintMode && !inActiveWeekDrag && (
                                      <span
                                        data-drag-handle="true"
                                        role="presentation"
                                        onPointerDown={(e) => {
                                          e.stopPropagation();
                                          startCellPointerDown(
                                            e,
                                            idx,
                                            day.dayIndex,
                                            shiftNumber,
                                            slot,
                                            true,
                                          );
                                        }}
                                        onClick={(e) => e.stopPropagation()}
                                        title="Kéo ngang hoặc dọc để tô nhanh"
                                        className="hidden sm:block [@media(hover:none)]:hidden touch-none cursor-crosshair absolute bottom-1 right-1 h-3 w-3 rounded-sm bg-teal-600/80 border border-white shadow-xs opacity-0 group-hover:opacity-100 transition-opacity"
                                      />
                                    )}

                                    {isSelectedForDelete && (
                                      <span className="pointer-events-none absolute -top-1 -right-1 h-4 w-4 rounded-full bg-rose-600 text-white flex items-center justify-center shadow-xs">
                                        <Check className="h-2.5 w-2.5" />
                                      </span>
                                    )}

                                    {(isPreviewTarget || isSkippedTarget) && sourceSlot && (
                                      <div
                                        className={`pointer-events-none absolute inset-0 rounded-lg sm:rounded-xl flex items-center justify-center ${
                                          isPreviewTarget ? 'bg-teal-50/85' : 'bg-slate-100/90'
                                        }`}
                                      >
                                        {isPreviewTarget ? (
                                          <span className="inline-flex items-center gap-0.5 sm:gap-1 rounded-md bg-white px-1 sm:px-1.5 py-0.5 text-[10px] sm:text-[11px] font-bold text-teal-800 shadow-xs border border-teal-200">
                                            {sourceSlot.status === 'KFC' && sourceBranch && (
                                              <span
                                                className="h-1.5 w-1.5 sm:h-2 sm:w-2 rounded-full shrink-0"
                                                style={{ backgroundColor: sourceBranch.color }}
                                              />
                                            )}
                                            +{statusLabel(sourceSlot)}
                                          </span>
                                        ) : (
                                          <span className="text-[9px] sm:text-[10px] font-semibold text-rose-600 text-center leading-tight">
                                            Không mở
                                          </span>
                                        )}
                                      </div>
                                    )}

                                    {(paintUpsert || isPaintSkipped || isPaintDelete) && (
                                      <div
                                        className={`pointer-events-none absolute inset-0 rounded-lg sm:rounded-xl flex items-center justify-center ${
                                          isPaintDelete
                                            ? 'bg-rose-50/90'
                                            : paintUpsert
                                              ? 'bg-teal-50/85'
                                              : 'bg-slate-100/90'
                                        }`}
                                      >
                                        {isPaintDelete ? (
                                          <span className="rounded-md bg-white px-1 sm:px-1.5 py-0.5 text-[10px] font-bold text-rose-700 border border-rose-200 shadow-xs">
                                            Xoá
                                          </span>
                                        ) : paintUpsert ? (
                                          <span className="inline-flex items-center gap-0.5 sm:gap-1 rounded-md bg-white px-1 sm:px-1.5 py-0.5 text-[10px] sm:text-[11px] font-bold text-teal-800 shadow-xs border border-teal-200">
                                            {paintUpsert.status === 'KFC' && paintBranch && (
                                              <span
                                                className="h-1.5 w-1.5 sm:h-2 sm:w-2 rounded-full shrink-0"
                                                style={{ backgroundColor: paintBranch.color }}
                                              />
                                            )}
                                            +{statusLabel(paintUpsert)}
                                          </span>
                                        ) : (
                                          <span className="text-[9px] sm:text-[10px] font-semibold text-rose-600 text-center leading-tight">
                                            Không mở
                                          </span>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>

      {editingCell && (
        <ShiftEditorModal
          shiftDate={editingCell.dateStr}
          shiftNumber={editingCell.shiftNumber}
          existingSlot={slotsByKey.get(slotKey(editingCell.dateStr, editingCell.shiftNumber))}
          branches={branches}
          procedureRate={monthConfig?.procedureRate ?? settings.defaultProcedureRate}
          onSave={onUpsertSlot}
          onDelete={() => onDeleteSlot(editingCell.dateStr, editingCell.shiftNumber)}
          onClose={() => setEditingCell(null)}
        />
      )}

      {showManagerExport && (
        <ManagerExportModal
          activeYearMonth={activeMonth}
          slotsByKey={slotsByKey}
          onClose={() => setShowManagerExport(false)}
        />
      )}

      {quickDay &&
        createPortal(
          (() => {
            const dynamicMenuSize = {
              width: 192,
              height: 196 + activeBranches.length * 32,
            };
            const pos = computeQuickDayPopoverPosition(quickDay.rect, dynamicMenuSize, {
              width: window.innerWidth,
              height: window.innerHeight,
            });
            return (
              <>
                <div
                  className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-[1px] sm:bg-transparent sm:backdrop-blur-none"
                  onClick={() => setQuickDay(null)}
                />

                {/* Mobile Bottom Sheet */}
                <div className="sm:hidden fixed inset-x-0 bottom-0 z-50 rounded-t-2xl bg-white shadow-2xl border-t border-slate-200 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-bold text-slate-900">
                        Tô cả ngày {formatDateVN(quickDay.dateStr)}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Áp dụng nhanh cho các Ca hợp lệ trong ngày
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setQuickDay(null)}
                      aria-label="Đóng"
                      className="h-10 w-10 flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => handleFillDayBrush(quickDay.dateStr, { kind: 'status', status: 'BV' })}
                      className="min-h-[44px] rounded-xl border border-rose-300 bg-rose-50 text-xs font-bold text-rose-800 cursor-pointer"
                    >
                      Tất cả: BV
                    </button>
                    <button
                      type="button"
                      onClick={() => handleFillDayBrush(quickDay.dateStr, { kind: 'status', status: 'NGHI' })}
                      className="min-h-[44px] rounded-xl border border-amber-300 bg-amber-50 text-xs font-bold text-amber-800 cursor-pointer"
                    >
                      Tất cả: Nghỉ
                    </button>
                    <button
                      type="button"
                      onClick={() => handleFillDayBrush(quickDay.dateStr, { kind: 'status', status: 'RANH' })}
                      className="min-h-[44px] rounded-xl border border-lime-400 bg-lime-50 text-xs font-bold text-lime-900 cursor-pointer"
                    >
                      Tất cả: Rảnh
                    </button>
                  </div>

                  {activeBranches.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        Chốt Chi nhánh KFC
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {activeBranches.map((b) => {
                          const validCount = countValidBranchShiftsForDate(b, quickDay.dateStr);
                          return (
                            <button
                              key={b.id}
                              type="button"
                              disabled={validCount === 0}
                              onClick={() =>
                                handleFillDayBrush(quickDay.dateStr, {
                                  kind: 'kfc',
                                  branchCode: b.code,
                                })
                              }
                              className="min-h-[44px] rounded-xl border border-emerald-300 bg-emerald-50/80 disabled:opacity-50 px-3 py-2 flex items-center justify-between gap-2 text-xs font-bold text-emerald-950 cursor-pointer"
                            >
                              <span className="inline-flex items-center gap-1.5">
                                <span
                                  className="h-2.5 w-2.5 rounded-full shrink-0"
                                  style={{ backgroundColor: b.color }}
                                />
                                {b.code}
                              </span>
                              <span className="text-[11px] font-semibold text-emerald-800">
                                {validCount}/3 ca
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => handleFillDayBrush(quickDay.dateStr, { kind: 'erase' })}
                    className="min-h-[44px] w-full rounded-xl border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
                  >
                    Xoá cả ngày
                  </button>
                </div>

                {/* Desktop Popover */}
                <div
                  role="menu"
                  style={{ left: pos.left, top: pos.top }}
                  className="hidden sm:block fixed z-50 w-48 rounded-xl bg-white shadow-xl border border-slate-200 p-1.5 space-y-1 text-left"
                >
                  <div className="px-2 py-0.5 text-[10px] font-bold text-slate-400 uppercase">
                    Tô cả ngày {formatShortDateVN(quickDay.dateStr)}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleFillDayBrush(quickDay.dateStr, { kind: 'status', status: 'BV' })}
                    className="w-full text-left rounded-lg px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50 cursor-pointer"
                  >
                    Tất cả: BV
                  </button>
                  <button
                    type="button"
                    onClick={() => handleFillDayBrush(quickDay.dateStr, { kind: 'status', status: 'NGHI' })}
                    className="w-full text-left rounded-lg px-2 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-50 cursor-pointer"
                  >
                    Tất cả: Nghỉ
                  </button>
                  <button
                    type="button"
                    onClick={() => handleFillDayBrush(quickDay.dateStr, { kind: 'status', status: 'RANH' })}
                    className="w-full text-left rounded-lg px-2 py-1 text-xs font-semibold text-lime-800 hover:bg-lime-50 cursor-pointer"
                  >
                    Tất cả: Rảnh
                  </button>

                  {activeBranches.length > 0 && (
                    <div className="border-t border-slate-100 pt-1 mt-1 space-y-0.5">
                      {activeBranches.map((b) => {
                        const validCount = countValidBranchShiftsForDate(b, quickDay.dateStr);
                        return (
                          <button
                            key={b.id}
                            type="button"
                            disabled={validCount === 0}
                            onClick={() =>
                              handleFillDayBrush(quickDay.dateStr, {
                                kind: 'kfc',
                                branchCode: b.code,
                              })
                            }
                            className="w-full text-left rounded-lg px-2 py-1 text-xs font-semibold text-emerald-900 hover:bg-emerald-50 disabled:opacity-50 flex items-center justify-between cursor-pointer"
                          >
                            <span className="inline-flex items-center gap-1.5">
                              <span
                                className="h-2 w-2 rounded-full shrink-0"
                                style={{ backgroundColor: b.color }}
                              />
                              KFC: {b.code}
                            </span>
                            {validCount < 3 && (
                              <span className="text-[10px] text-slate-500">({validCount}/3 ca)</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  <div className="border-t border-slate-100 pt-1">
                    <button
                      type="button"
                      onClick={() => handleFillDayBrush(quickDay.dateStr, { kind: 'erase' })}
                      className="w-full text-left rounded-lg px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100 cursor-pointer"
                    >
                      Xoá cả ngày
                    </button>
                  </div>
                </div>
              </>
            );
          })(),
          document.body,
        )}
    </div>
  );
}
