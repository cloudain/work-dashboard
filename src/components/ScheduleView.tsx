import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Calendar as CalendarIcon,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Image as ImageIcon,
  LayoutGrid,
  List,
  Minus,
  Plus,
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
} from '../domain/calendar';
import {
  applySelectionTargets,
  buildDragFillPlan,
  collectFilledTargetsForDate,
  collectFilledTargetsForMonth,
  collectFilledTargetsForWeek,
  collectFilledTargetsInRect,
  computeQuickDayPopoverPosition,
  parseSelectedSlotKeys,
  type AnchorRect,
  type GridCoord,
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

const QUICK_DAY_MENU_SIZE = { width: 160, height: 188 };

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
  const [mobileLayout, setMobileLayout] = useState<'days' | 'grid'>('days');

  const [deleteMode, setDeleteMode] = useState(false);
  const [selectedDeleteKeys, setSelectedDeleteKeys] = useState<Set<string>>(() => new Set());
  const [deletingBulk, setDeletingBulk] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [drag, setDrag] = useState<ActiveDrag | null>(null);
  const dragRef = useRef<ActiveDrag | null>(null);
  const [deleteDrag, setDeleteDrag] = useState<DeleteDrag | null>(null);
  const deleteDragRef = useRef<DeleteDrag | null>(null);
  const suppressClickRef = useRef(false);

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
  useEffect(() => {
    weeksRef.current = weeks;
    branchMapRef.current = branchMap;
    slotsByKeyRef.current = slotsByKey;
    onBulkUpsertSlotsRef.current = onBulkUpsertSlots;
  });

  useEffect(() => {
    if (!toastMessage) return;
    const timer = window.setTimeout(() => setToastMessage(null), 3000);
    return () => window.clearTimeout(timer);
  }, [toastMessage]);

  const dragPlan = useMemo(() => {
    if (!drag?.isDragging) return null;
    const week = weeks[drag.weekIdx];
    if (!week) return null;
    return buildDragFillPlan(week, drag.sourceSlot, drag.start, drag.end, branchMap);
  }, [drag, weeks, branchMap]);

  const deleteDragPreviewKeys = useMemo(() => {
    if (!deleteDrag?.isDragging) return null;
    const week = weeks[deleteDrag.weekIdx];
    if (!week) return null;
    const targets = collectFilledTargetsInRect(week, deleteDrag.start, deleteDrag.end, slotsByKey);
    return new Set(targets.map((t) => slotKey(t.shiftDate, t.shiftNumber)));
  }, [deleteDrag, weeks, slotsByKey]);

  useEffect(() => {
    if (!quickDay) return;
    const close = () => setQuickDay(null);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', close, true);
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

    const onPointerMove = (e: PointerEvent) => {
      const cur = dragRef.current;
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
        const updated: ActiveDrag = {
          ...cur,
          isDragging: nextIsDragging,
          end: nextEnd,
        };
        dragRef.current = updated;
        setDrag(updated);
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
        );
        if (plan.slotsToUpsert.length > 0) {
          void onBulkUpsertSlotsRef.current(plan.slotsToUpsert);
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
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerCancel);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
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
    if (deleteMode) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if ((e.target as HTMLElement).closest('[data-no-drag="true"]')) return;
    if (e.pointerType === 'touch' && !fromHandle) return;

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
    if (e.pointerType === 'touch') return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    const coord: GridCoord = { dayIndex, shiftNumber };
    const key = slotKey(dateStr, shiftNumber);
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

  const changeMonth = (nextMonth: string) => {
    setActiveMonth(nextMonth);
    setQuickDay(null);
    setDeleteMode(false);
    setSelectedDeleteKeys(new Set());
    dragRef.current = null;
    setDrag(null);
    deleteDragRef.current = null;
    setDeleteDrag(null);
  };

  const toggleDeleteMode = () => {
    setQuickDay(null);
    dragRef.current = null;
    setDrag(null);
    deleteDragRef.current = null;
    setDeleteDrag(null);
    setDeleteMode((cur) => {
      if (cur) {
        setSelectedDeleteKeys(new Set());
      }
      return !cur;
    });
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
    setDeletingBulk(true);
    try {
      await onBulkDeleteSlots(targets);
      setSelectedDeleteKeys(new Set());
      setDeleteMode(false);
      setToastMessage(`Đã xoá ${targets.length} ô lịch.`);
    } finally {
      setDeletingBulk(false);
    }
  };

  const handleQuickProcedure = async (slot: ShiftSlot, delta: number) => {
    const next = Math.max(0, slot.procedureCount + delta);
    if (next === slot.procedureCount) return;
    await onUpsertSlot({ ...slot, procedureCount: next });
  };

  const handleFillDay = async (dateStr: string, status: 'BV' | 'NGHI' | 'RANH') => {
    const daySlots: ShiftSlot[] = ([1, 2, 3] as const).map((shiftNumber) => ({
      shiftDate: dateStr,
      shiftNumber,
      status,
      branchCode: null,
      procedureCount: 0,
      note: '',
    }));
    await onBulkUpsertSlots(daySlots);
    setQuickDay(null);
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

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Header Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 sm:gap-3 bg-white rounded-2xl border border-slate-200 p-3 sm:p-4 shadow-sm">
        <div className="flex items-center justify-between sm:justify-start gap-1.5 sm:gap-2">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={() => changeMonth(shiftYearMonth(activeMonth, -1))}
              className="p-2 rounded-xl border border-slate-200 hover:bg-slate-100 cursor-pointer"
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
              className="p-2 rounded-xl border border-slate-200 hover:bg-slate-100 cursor-pointer"
              aria-label="Tháng sau"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <button
            type="button"
            onClick={() => changeMonth(currentYearMonth())}
            className="rounded-xl border border-slate-200 px-2.5 sm:px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer shrink-0"
          >
            Hôm nay
          </button>
        </div>

        <div className="grid grid-cols-3 sm:flex sm:flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={toggleDeleteMode}
            className={`inline-flex items-center justify-center gap-1.5 rounded-xl border px-2.5 sm:px-3 py-2 text-xs sm:text-sm font-semibold cursor-pointer transition ${
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
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-teal-700 hover:bg-teal-800 px-2.5 sm:px-3.5 py-2 text-xs sm:text-sm font-semibold text-white cursor-pointer shadow-sm"
          >
            <ImageIcon className="h-4 w-4 shrink-0" />
            <span className="sm:hidden">Xuất ảnh</span>
            <span className="hidden sm:inline">Xuất ảnh gửi sếp</span>
          </button>
          <button
            type="button"
            onClick={handleDownloadIcs}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 px-2.5 sm:px-3 py-2 text-xs sm:text-sm font-semibold text-slate-700 cursor-pointer"
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

      {toastMessage && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-3.5 py-2 text-xs font-semibold text-emerald-900 flex items-center justify-between gap-2">
          <span>{toastMessage}</span>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            className="p-0.5 rounded text-emerald-700 hover:bg-emerald-100 cursor-pointer"
            aria-label="Đóng thông báo"
          >
            <X className="h-3.5 w-3.5" />
          </button>
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

          return (
            <div
              key={week.mondayStr}
              className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden"
            >
              <div className="px-3.5 sm:px-4 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2">
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
                    className={`rounded-lg px-2 py-1 text-[11px] font-semibold cursor-pointer transition ${
                      allWeekSelected
                        ? 'bg-rose-600 text-white'
                        : 'bg-white border border-rose-200 text-rose-700 hover:bg-rose-50'
                    }`}
                  >
                    {allWeekSelected ? 'Bỏ chọn tuần' : 'Chọn tuần'}
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
                          className={`w-[58px] shrink-0 rounded-xl p-1.5 flex flex-col items-center justify-center text-center cursor-pointer transition ${
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
                            const isSelectedForDelete = deleteMode && selectedDeleteKeys.has(key);

                            if (!slot) {
                              return (
                                <button
                                  key={shiftNumber}
                                  type="button"
                                  disabled={deleteMode}
                                  onClick={() => {
                                    if (deleteMode) return;
                                    setEditingCell({ dateStr: day.dateStr, shiftNumber });
                                  }}
                                  className={`min-h-[58px] rounded-xl border border-dashed flex flex-col items-center justify-center gap-0.5 transition ${
                                    deleteMode
                                      ? 'border-slate-200 bg-slate-50/50 text-slate-300 cursor-default'
                                      : 'border-slate-200 hover:border-teal-400 hover:bg-teal-50/40 text-slate-400 cursor-pointer'
                                  }`}
                                >
                                  <span className="text-[10px] font-medium text-slate-400">
                                    Ca {shiftNumber}
                                  </span>
                                  <Plus className="h-3.5 w-3.5" />
                                </button>
                              );
                            }

                            return (
                              <div
                                key={shiftNumber}
                                onClick={() => {
                                  if (deleteMode) {
                                    toggleDeleteSingleCell(day.dateStr, shiftNumber);
                                    return;
                                  }
                                  setEditingCell({ dateStr: day.dateStr, shiftNumber });
                                }}
                                className={`relative min-h-[58px] rounded-xl border p-1.5 flex flex-col justify-between cursor-pointer transition ${
                                  STATUS_STYLE[slot.status]
                                } ${
                                  isSelectedForDelete
                                    ? 'ring-2 ring-rose-500 ring-offset-1'
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

                                {slot.status === 'KFC' && !deleteMode && (
                                  <div
                                    onClick={(e) => e.stopPropagation()}
                                    className="mt-0.5 flex items-center justify-between bg-white/80 rounded-md px-1 py-0.5 border border-emerald-200"
                                  >
                                    <button
                                      type="button"
                                      onClick={() => handleQuickProcedure(slot, -1)}
                                      className="p-0.5 text-slate-600 cursor-pointer"
                                      title="Giảm 1 thủ thuật"
                                    >
                                      <Minus className="h-2.5 w-2.5" />
                                    </button>
                                    <span className="text-[10px] font-bold text-slate-800">
                                      {slot.procedureCount}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => handleQuickProcedure(slot, 1)}
                                      className="p-0.5 text-slate-600 cursor-pointer"
                                      title="Thêm 1 thủ thuật"
                                    >
                                      <Plus className="h-2.5 w-2.5" />
                                    </button>
                                  </div>
                                )}

                                {isSelectedForDelete && (
                                  <span className="pointer-events-none absolute -top-1 -right-1 h-4 w-4 rounded-full bg-rose-600 text-white flex items-center justify-center shadow-xs">
                                    <Check className="h-2.5 w-2.5" />
                                  </span>
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
                  className={`w-full min-w-[540px] sm:min-w-[680px] border-collapse table-fixed ${
                    (drag?.isDragging && drag.weekIdx === idx) ||
                    (deleteDrag?.isDragging && deleteDrag.weekIdx === idx)
                      ? 'select-none cursor-crosshair'
                      : ''
                  }`}
                >
                  <thead>
                    <tr>
                      <th className="sticky left-0 z-10 w-11 sm:w-16 bg-amber-50 border-b border-r border-slate-200 py-2 text-xs font-bold text-slate-700 shadow-[1px_0_0_rgba(226,232,240,1)]">
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
                            className={`border-b border-r last:border-r-0 border-slate-200 p-1 sm:p-1.5 text-center ${
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
                              className={`w-full rounded-lg py-1 px-1 transition cursor-pointer ${
                                !day.inTargetMonth ? 'opacity-60' : ''
                              } ${
                                allDaySelected
                                  ? 'ring-2 ring-rose-500 bg-rose-100'
                                  : isToday
                                    ? 'ring-2 ring-teal-600 bg-teal-50 hover:bg-sky-100/80'
                                    : 'hover:bg-sky-100/80'
                              }`}
                            >
                              <div className="text-xs font-bold text-slate-800">{day.dayLabel}</div>
                              <div className="text-[11px] font-medium text-slate-500">
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
                        <td className="sticky left-0 z-10 bg-amber-50 border-b last:border-b-0 border-r border-slate-200 text-center text-xs font-bold text-slate-700 py-3 shadow-[1px_0_0_rgba(226,232,240,1)]">
                          Ca {shiftNumber}
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
                            !dragPlan?.skippedKeys.has(key);
                          const isSkippedTarget =
                            inActiveWeekDrag && Boolean(dragPlan?.skippedKeys.has(key));
                          const sourceSlot = inActiveWeekDrag ? drag.sourceSlot : null;
                          const sourceBranch = sourceSlot?.branchCode
                            ? branchMap.get(sourceSlot.branchCode)
                            : undefined;

                          const inDeleteDrag =
                            deleteMode && deleteDrag?.isDragging && deleteDrag.weekIdx === idx;
                          const inDeletePreview =
                            inDeleteDrag && Boolean(deleteDragPreviewKeys?.has(key));
                          const isSelectedForDelete =
                            deleteMode &&
                            Boolean(slot) &&
                            (inDeletePreview
                              ? deleteDrag?.mode === 'add'
                              : selectedDeleteKeys.has(key));

                          return (
                            <td
                              key={day.dateStr}
                              data-grid-week={idx}
                              data-grid-day={day.dayIndex}
                              data-grid-shift={shiftNumber}
                              onPointerDown={(e) =>
                                startDeletePointerDown(e, idx, day.dayIndex, shiftNumber, day.dateStr)
                              }
                              className={`relative border-b last:border-b-0 border-r last:border-r-0 border-slate-200 p-1 align-top h-[74px] ${
                                !day.inTargetMonth ? 'bg-slate-50/80' : ''
                              }`}
                            >
                              <div className={`w-full h-full ${!day.inTargetMonth ? 'opacity-60' : ''}`}>
                                {!slot ? (
                                  <button
                                    type="button"
                                    disabled={deleteMode}
                                    onClick={() => {
                                      if (deleteMode) return;
                                      setEditingCell({ dateStr: day.dateStr, shiftNumber });
                                    }}
                                    className={`w-full h-full min-h-[64px] rounded-xl border border-dashed flex items-center justify-center transition ${
                                      deleteMode
                                        ? 'border-slate-200 bg-slate-50/40 text-slate-200 cursor-default'
                                        : isPreviewTarget
                                          ? 'border-teal-500 bg-teal-50/70 ring-2 ring-teal-500 text-teal-700 cursor-pointer'
                                          : isSkippedTarget
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
                                      <span className="inline-flex items-center gap-1 rounded-md bg-white/90 px-1.5 py-0.5 text-[11px] font-bold text-teal-800 shadow-xs">
                                        {sourceSlot.status === 'KFC' && sourceBranch && (
                                          <span
                                            className="h-2 w-2 rounded-full shrink-0"
                                            style={{ backgroundColor: sourceBranch.color }}
                                          />
                                        )}
                                        + {statusLabel(sourceSlot)}
                                      </span>
                                    ) : isSkippedTarget ? (
                                      <span className="text-[10px] font-semibold text-rose-600">
                                        Không mở ca
                                      </span>
                                    ) : (
                                      <Plus className="h-4 w-4" />
                                    )}
                                  </button>
                                ) : (
                                  <div
                                    onPointerDown={(e) =>
                                      startCellPointerDown(
                                        e,
                                        idx,
                                        day.dayIndex,
                                        shiftNumber,
                                        slot,
                                        false,
                                      )
                                    }
                                    onClick={(e) => {
                                      if (suppressClickRef.current) return;
                                      if (deleteMode) {
                                        toggleDeleteSingleCell(day.dateStr, shiftNumber);
                                        return;
                                      }
                                      if ((e.target as HTMLElement).closest('[data-no-drag="true"]')) {
                                        return;
                                      }
                                      setEditingCell({ dateStr: day.dateStr, shiftNumber });
                                    }}
                                    className={`group relative w-full h-full min-h-[64px] rounded-xl border p-1.5 flex flex-col justify-between transition cursor-pointer ${
                                      STATUS_STYLE[slot.status]
                                    } ${
                                      isSelectedForDelete
                                        ? 'ring-2 ring-rose-500 ring-offset-1'
                                        : isOrigin
                                          ? 'ring-2 ring-teal-600 ring-offset-1'
                                          : isPreviewTarget
                                            ? 'ring-2 ring-teal-500'
                                            : isSkippedTarget
                                              ? 'ring-2 ring-rose-300'
                                              : ''
                                    }`}
                                  >
                                    <button
                                      type="button"
                                      className="w-full text-left flex items-center justify-between gap-1 cursor-pointer"
                                    >
                                      <span className="text-xs font-bold flex items-center gap-1 truncate">
                                        {slot.status === 'KFC' && branch && (
                                          <span
                                            className="h-2 w-2 rounded-full shrink-0"
                                            style={{ backgroundColor: branch.color }}
                                          />
                                        )}
                                        {statusLabel(slot)}
                                      </span>
                                      {slot.note && !isSelectedForDelete && (
                                        <span className="h-1.5 w-1.5 rounded-full bg-slate-500 shrink-0" />
                                      )}
                                    </button>

                                    {slot.status === 'KFC' && !deleteMode && (
                                      <div
                                        data-no-drag="true"
                                        onClick={(e) => e.stopPropagation()}
                                        className="flex items-center justify-between bg-white/80 rounded-lg px-1 py-0.5 border border-emerald-200"
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
                                    )}

                                    {!deleteMode && !inActiveWeekDrag && (
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
                                        className="touch-none cursor-crosshair absolute bottom-1 right-1 h-3 w-3 rounded-sm bg-teal-600/80 border border-white shadow-xs opacity-60 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                                      />
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
                                          <span className="text-[10px] font-semibold text-rose-600">
                                            Không mở ca
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
            const pos = computeQuickDayPopoverPosition(quickDay.rect, QUICK_DAY_MENU_SIZE, {
              width: window.innerWidth,
              height: window.innerHeight,
            });
            return (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setQuickDay(null)} />
                <div
                  role="menu"
                  style={{ left: pos.left, top: pos.top }}
                  className="fixed z-50 w-40 rounded-xl bg-white shadow-xl border border-slate-200 p-1.5 space-y-1 text-left"
                >
                  <div className="px-2 py-0.5 text-[10px] font-bold text-slate-400 uppercase">
                    Tô cả ngày {formatShortDateVN(quickDay.dateStr)}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleFillDay(quickDay.dateStr, 'BV')}
                    className="w-full text-left rounded-lg px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50 cursor-pointer"
                  >
                    Tất cả: BV
                  </button>
                  <button
                    type="button"
                    onClick={() => handleFillDay(quickDay.dateStr, 'NGHI')}
                    className="w-full text-left rounded-lg px-2 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-50 cursor-pointer"
                  >
                    Tất cả: Nghỉ
                  </button>
                  <button
                    type="button"
                    onClick={() => handleFillDay(quickDay.dateStr, 'RANH')}
                    className="w-full text-left rounded-lg px-2 py-1 text-xs font-semibold text-lime-800 hover:bg-lime-50 cursor-pointer"
                  >
                    Tất cả: Rảnh
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await onBulkDeleteDay(quickDay.dateStr);
                      setQuickDay(null);
                    }}
                    className="w-full text-left rounded-lg px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100 cursor-pointer"
                  >
                    Xoá cả ngày
                  </button>
                </div>
              </>
            );
          })(),
          document.body,
        )}
    </div>
  );
}
