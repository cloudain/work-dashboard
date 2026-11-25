import { isValidBranchShift } from './branches';
import { slotKey, type WeekBlock } from './calendar';
import type { Branch, ShiftNumber, ShiftSlot, ShiftSlotTarget } from './types';

export interface GridCoord {
  dayIndex: number; // 0..6
  shiftNumber: ShiftNumber; // 1..3
}

export interface DragFillPlan {
  selectedKeys: Set<string>;
  skippedKeys: Set<string>;
  slotsToUpsert: ShiftSlot[];
}

export interface AnchorRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
}

export interface MenuSize {
  width: number;
  height: number;
}

export interface ViewportSize {
  width: number;
  height: number;
}

export interface PopoverPosition {
  left: number;
  top: number;
}

/**
 * Returns every grid coordinate in the inclusive rectangle defined by `start` and `end`.
 */
export function computeDragFillCoords(start: GridCoord, end: GridCoord): GridCoord[] {
  const minDay = Math.min(start.dayIndex, end.dayIndex);
  const maxDay = Math.max(start.dayIndex, end.dayIndex);
  const minShift = Math.min(start.shiftNumber, end.shiftNumber);
  const maxShift = Math.max(start.shiftNumber, end.shiftNumber);

  const coords: GridCoord[] = [];
  for (let dayIndex = minDay; dayIndex <= maxDay; dayIndex += 1) {
    for (let s = minShift; s <= maxShift; s += 1) {
      coords.push({ dayIndex, shiftNumber: s as ShiftNumber });
    }
  }
  return coords;
}

/**
 * Computes the preview selection, skipped invalid branch shifts, and slots to upsert
 * when dragging from `start` to `end` within `week`.
 */
export function buildDragFillPlan(
  week: WeekBlock,
  sourceSlot: ShiftSlot,
  start: GridCoord,
  end: GridCoord,
  branchMap: Map<string, Branch>,
): DragFillPlan {
  const selectedKeys = new Set<string>();
  const skippedKeys = new Set<string>();
  const slotsToUpsert: ShiftSlot[] = [];

  const coords = computeDragFillCoords(start, end);
  for (const coord of coords) {
    const day = week.days[coord.dayIndex];
    if (!day) continue;

    const key = slotKey(day.dateStr, coord.shiftNumber);
    selectedKeys.add(key);

    if (coord.dayIndex === start.dayIndex && coord.shiftNumber === start.shiftNumber) {
      continue;
    }

    if (sourceSlot.status === 'KFC') {
      const branch = sourceSlot.branchCode ? branchMap.get(sourceSlot.branchCode) : undefined;
      if (!branch || !isValidBranchShift(branch, day.dateStr, coord.shiftNumber)) {
        skippedKeys.add(key);
        continue;
      }
    }

    slotsToUpsert.push({
      shiftDate: day.dateStr,
      shiftNumber: coord.shiftNumber,
      status: sourceSlot.status,
      branchCode: sourceSlot.status === 'KFC' ? sourceSlot.branchCode : null,
      procedureCount: 0,
      note: '',
    });
  }

  return { selectedKeys, skippedKeys, slotsToUpsert };
}

/**
 * Computes a viewport-clamped fixed position for the quick-day popover menu.
 */
export function computeQuickDayPopoverPosition(
  anchor: AnchorRect,
  menu: MenuSize,
  viewport: ViewportSize,
  margin = 8,
  gap = 6,
): PopoverPosition {
  const rawLeft = anchor.left + anchor.width / 2 - menu.width / 2;
  const maxLeft = Math.max(margin, viewport.width - menu.width - margin);
  const left = Math.min(Math.max(rawLeft, margin), maxLeft);

  const belowTop = anchor.bottom + gap;
  const aboveTop = anchor.top - menu.height - gap;
  const maxTop = Math.max(margin, viewport.height - menu.height - margin);

  if (belowTop + menu.height > viewport.height - margin && aboveTop >= margin) {
    return { left, top: aboveTop };
  }

  const top = Math.min(Math.max(belowTop, margin), maxTop);
  return { left, top };
}

/**
 * Collects all existing (filled) shift targets within the inclusive rectangle from `start` to `end`.
 */
export function collectFilledTargetsInRect(
  week: WeekBlock,
  start: GridCoord,
  end: GridCoord,
  slotsByKey: Map<string, ShiftSlot>,
): ShiftSlotTarget[] {
  const targets: ShiftSlotTarget[] = [];
  for (const coord of computeDragFillCoords(start, end)) {
    const day = week.days[coord.dayIndex];
    if (!day) continue;
    if (slotsByKey.has(slotKey(day.dateStr, coord.shiftNumber))) {
      targets.push({ shiftDate: day.dateStr, shiftNumber: coord.shiftNumber });
    }
  }
  return targets;
}

/**
 * Collects all filled shift targets on a given date (`YYYY-MM-DD`).
 */
export function collectFilledTargetsForDate(
  dateStr: string,
  slotsByKey: Map<string, ShiftSlot>,
): ShiftSlotTarget[] {
  const targets: ShiftSlotTarget[] = [];
  for (const shiftNumber of [1, 2, 3] as const) {
    if (slotsByKey.has(slotKey(dateStr, shiftNumber))) {
      targets.push({ shiftDate: dateStr, shiftNumber });
    }
  }
  return targets;
}

/**
 * Collects all filled shift targets within a week block.
 */
export function collectFilledTargetsForWeek(
  week: WeekBlock,
  slotsByKey: Map<string, ShiftSlot>,
): ShiftSlotTarget[] {
  const targets: ShiftSlotTarget[] = [];
  for (const day of week.days) {
    for (const shiftNumber of [1, 2, 3] as const) {
      if (slotsByKey.has(slotKey(day.dateStr, shiftNumber))) {
        targets.push({ shiftDate: day.dateStr, shiftNumber });
      }
    }
  }
  return targets;
}

/**
 * Collects all filled shift targets belonging to `yearMonth` (`YYYY-MM`).
 */
export function collectFilledTargetsForMonth(
  yearMonth: string,
  slots: ShiftSlot[],
): ShiftSlotTarget[] {
  return slots
    .filter((s) => s.shiftDate.startsWith(yearMonth))
    .map((s) => ({ shiftDate: s.shiftDate, shiftNumber: s.shiftNumber }));
}

/**
 * Returns a new Set of slot keys after applying `targets` with `add`, `remove`, or `toggle` semantics.
 */
export function applySelectionTargets(
  current: Set<string>,
  targets: ShiftSlotTarget[],
  mode: 'add' | 'remove' | 'toggle',
): Set<string> {
  const next = new Set(current);
  if (targets.length === 0) return next;

  const keys = targets.map((t) => slotKey(t.shiftDate, t.shiftNumber));
  if (mode === 'add') {
    for (const k of keys) next.add(k);
    return next;
  }
  if (mode === 'remove') {
    for (const k of keys) next.delete(k);
    return next;
  }

  const allSelected = keys.every((k) => next.has(k));
  if (allSelected) {
    for (const k of keys) next.delete(k);
  } else {
    for (const k of keys) next.add(k);
  }
  return next;
}

/**
 * Parses `"YYYY-MM-DD|N"` slot keys back into `ShiftSlotTarget` objects.
 */
export function parseSelectedSlotKeys(keys: Iterable<string>): ShiftSlotTarget[] {
  const targets: ShiftSlotTarget[] = [];
  for (const key of keys) {
    const [shiftDate, rawNum] = key.split('|');
    const num = Number(rawNum);
    if (shiftDate && (num === 1 || num === 2 || num === 3)) {
      targets.push({ shiftDate, shiftNumber: num });
    }
  }
  return targets;
}

export interface CopiedWeekSlot {
  dayIndex: number; // 0 (T2) .. 6 (CN)
  shiftNumber: ShiftNumber;
  status: ShiftSlot['status'];
  branchCode: string | null;
}

export interface CopiedWeekSnapshot {
  sourceMondayStr: string;
  sourceLabel: string;
  slots: CopiedWeekSlot[];
}

export interface PasteWeekPlan {
  slotsToUpsert: ShiftSlot[];
  targetsToDelete: ShiftSlotTarget[];
  skippedCount: number;
}

/**
 * Captures all filled shift slots of `week` relative to their weekday index (0..6).
 */
export function captureWeekSnapshot(
  week: WeekBlock,
  slotsByKey: Map<string, ShiftSlot>,
  sourceLabel: string,
): CopiedWeekSnapshot {
  const slots: CopiedWeekSlot[] = [];
  for (const day of week.days) {
    for (const shiftNumber of [1, 2, 3] as const) {
      const slot = slotsByKey.get(slotKey(day.dateStr, shiftNumber));
      if (!slot) continue;
      slots.push({
        dayIndex: day.dayIndex,
        shiftNumber,
        status: slot.status,
        branchCode: slot.status === 'KFC' ? slot.branchCode : null,
      });
    }
  }
  return {
    sourceMondayStr: week.mondayStr,
    sourceLabel,
    slots,
  };
}

/**
 * Builds the upsert and optional delete plan when pasting a copied week snapshot onto `targetWeek`.
 */
export function buildPasteWeekPlan(
  targetWeek: WeekBlock,
  snapshot: CopiedWeekSnapshot,
  existingSlotsByKey: Map<string, ShiftSlot>,
  branchMap: Map<string, Branch>,
  replaceTargetWeek: boolean,
): PasteWeekPlan {
  const slotsToUpsert: ShiftSlot[] = [];
  const upsertedKeys = new Set<string>();
  let skippedCount = 0;

  for (const item of snapshot.slots) {
    const day = targetWeek.days[item.dayIndex];
    if (!day) continue;

    if (item.status === 'KFC') {
      const branch = item.branchCode ? branchMap.get(item.branchCode) : undefined;
      if (!branch || !isValidBranchShift(branch, day.dateStr, item.shiftNumber)) {
        skippedCount += 1;
        continue;
      }
    }

    const key = slotKey(day.dateStr, item.shiftNumber);
    upsertedKeys.add(key);
    slotsToUpsert.push({
      shiftDate: day.dateStr,
      shiftNumber: item.shiftNumber,
      status: item.status,
      branchCode: item.status === 'KFC' ? item.branchCode : null,
      procedureCount: 0,
      note: '',
    });
  }

  let targetsToDelete: ShiftSlotTarget[] = [];
  if (replaceTargetWeek) {
    const existing = collectFilledTargetsForWeek(targetWeek, existingSlotsByKey);
    targetsToDelete = existing.filter((t) => !upsertedKeys.has(slotKey(t.shiftDate, t.shiftNumber)));
  }

  return { slotsToUpsert, targetsToDelete, skippedCount };
}
