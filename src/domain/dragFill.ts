import { isValidBranchShift } from './branches';
import { slotKey, type WeekBlock } from './calendar';
import type { Branch, ShiftNumber, ShiftSlot } from './types';

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
