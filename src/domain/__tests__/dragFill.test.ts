import { describe, expect, it } from 'vitest';
import { cloneDefaultBranches } from '../branches';
import { getWeekBlock, slotKey } from '../calendar';
import {
  applySelectionTargets,
  buildDragFillPlan,
  collectFilledTargetsForDate,
  collectFilledTargetsForMonth,
  collectFilledTargetsForWeek,
  collectFilledTargetsInRect,
  computeDragFillCoords,
  computeQuickDayPopoverPosition,
  parseSelectedSlotKeys,
} from '../dragFill';
import type { ShiftSlot } from '../types';

const week = getWeekBlock('2026-10-26', '2026-11');
const branches = cloneDefaultBranches();
const branchMap = new Map(branches.map((b) => [b.code, b]));

describe('computeDragFillCoords', () => {
  it('returns inclusive rectangle regardless of drag direction', () => {
    const rightDown = computeDragFillCoords(
      { dayIndex: 1, shiftNumber: 1 },
      { dayIndex: 2, shiftNumber: 3 },
    );
    const leftUp = computeDragFillCoords(
      { dayIndex: 2, shiftNumber: 3 },
      { dayIndex: 1, shiftNumber: 1 },
    );
    expect(rightDown).toEqual(leftUp);
    expect(rightDown).toHaveLength(6);
  });
});

describe('buildDragFillPlan', () => {
  it('fills horizontally right and left with BV while excluding origin', () => {
    const bvSlot: ShiftSlot = {
      shiftDate: '2026-10-26',
      shiftNumber: 1,
      status: 'BV',
      branchCode: null,
      procedureCount: 0,
      note: 'Trực chính',
    };

    const rightPlan = buildDragFillPlan(
      week,
      bvSlot,
      { dayIndex: 0, shiftNumber: 1 },
      { dayIndex: 3, shiftNumber: 1 },
      branchMap,
    );
    expect(rightPlan.selectedKeys.size).toBe(4);
    expect(rightPlan.skippedKeys.size).toBe(0);
    expect(rightPlan.slotsToUpsert).toHaveLength(3);
    expect(rightPlan.slotsToUpsert.map((s) => s.shiftDate)).toEqual([
      '2026-10-27',
      '2026-10-28',
      '2026-10-29',
    ]);
    expect(rightPlan.slotsToUpsert.every((s) => s.status === 'BV' && s.note === '' && s.procedureCount === 0)).toBe(true);

    const leftPlan = buildDragFillPlan(
      week,
      { ...bvSlot, shiftDate: '2026-10-29' },
      { dayIndex: 3, shiftNumber: 1 },
      { dayIndex: 0, shiftNumber: 1 },
      branchMap,
    );
    expect(leftPlan.selectedKeys.size).toBe(4);
    expect(leftPlan.slotsToUpsert.map((s) => s.shiftDate)).toEqual([
      '2026-10-26',
      '2026-10-27',
      '2026-10-28',
    ]);
  });

  it('fills vertically down and up with NGHI and RANH', () => {
    const nghiSlot: ShiftSlot = {
      shiftDate: '2026-10-27',
      shiftNumber: 1,
      status: 'NGHI',
      branchCode: null,
      procedureCount: 0,
      note: '',
    };
    const downPlan = buildDragFillPlan(
      week,
      nghiSlot,
      { dayIndex: 1, shiftNumber: 1 },
      { dayIndex: 1, shiftNumber: 3 },
      branchMap,
    );
    expect(downPlan.selectedKeys.size).toBe(3);
    expect(downPlan.slotsToUpsert.map((s) => s.shiftNumber)).toEqual([2, 3]);

    const ranhSlot: ShiftSlot = {
      shiftDate: '2026-10-27',
      shiftNumber: 3,
      status: 'RANH',
      branchCode: null,
      procedureCount: 0,
      note: '',
    };
    const upPlan = buildDragFillPlan(
      week,
      ranhSlot,
      { dayIndex: 1, shiftNumber: 3 },
      { dayIndex: 1, shiftNumber: 1 },
      branchMap,
    );
    expect(upPlan.selectedKeys.size).toBe(3);
    expect(upPlan.slotsToUpsert.map((s) => s.shiftNumber)).toEqual([1, 2]);
  });

  it('supports 2D rectangular drag and single-cell no-op', () => {
    const bvSlot: ShiftSlot = {
      shiftDate: '2026-10-26',
      shiftNumber: 1,
      status: 'BV',
      branchCode: null,
      procedureCount: 0,
      note: '',
    };

    const rectPlan = buildDragFillPlan(
      week,
      bvSlot,
      { dayIndex: 0, shiftNumber: 1 },
      { dayIndex: 2, shiftNumber: 2 },
      branchMap,
    );
    expect(rectPlan.selectedKeys.size).toBe(6);
    expect(rectPlan.slotsToUpsert).toHaveLength(5);

    const singlePlan = buildDragFillPlan(
      week,
      bvSlot,
      { dayIndex: 0, shiftNumber: 1 },
      { dayIndex: 0, shiftNumber: 1 },
      branchMap,
    );
    expect(singlePlan.selectedKeys.size).toBe(1);
    expect(singlePlan.slotsToUpsert).toHaveLength(0);
  });

  it('resets procedureCount and note on KFC CN1 drag', () => {
    const kfcSlot: ShiftSlot = {
      shiftDate: '2026-10-26',
      shiftNumber: 1,
      status: 'KFC',
      branchCode: 'CN1',
      procedureCount: 5,
      note: 'Ca đông',
    };

    const plan = buildDragFillPlan(
      week,
      kfcSlot,
      { dayIndex: 0, shiftNumber: 1 },
      { dayIndex: 1, shiftNumber: 1 },
      branchMap,
    );
    expect(plan.skippedKeys.size).toBe(0);
    expect(plan.slotsToUpsert).toEqual([
      {
        shiftDate: '2026-10-27',
        shiftNumber: 1,
        status: 'KFC',
        branchCode: 'CN1',
        procedureCount: 0,
        note: '',
      },
    ]);
  });

  it('skips invalid Ca 2 when dragging KFC CN4 vertically', () => {
    const cn4Slot: ShiftSlot = {
      shiftDate: '2026-10-26',
      shiftNumber: 1,
      status: 'KFC',
      branchCode: 'CN4',
      procedureCount: 2,
      note: '',
    };

    const plan = buildDragFillPlan(
      week,
      cn4Slot,
      { dayIndex: 0, shiftNumber: 1 },
      { dayIndex: 0, shiftNumber: 3 },
      branchMap,
    );
    expect(plan.selectedKeys.size).toBe(3);
    expect(plan.skippedKeys.has(slotKey('2026-10-26', 2))).toBe(true);
    expect(plan.slotsToUpsert).toEqual([
      {
        shiftDate: '2026-10-26',
        shiftNumber: 3,
        status: 'KFC',
        branchCode: 'CN4',
        procedureCount: 0,
        note: '',
      },
    ]);
  });
});

describe('computeQuickDayPopoverPosition', () => {
  const menu = { width: 160, height: 188 };
  const viewport = { width: 1000, height: 800 };

  it('centers below anchor when there is plenty of room', () => {
    const pos = computeQuickDayPopoverPosition(
      { left: 400, right: 500, top: 200, bottom: 250, width: 100, height: 50 },
      menu,
      viewport,
    );
    expect(pos).toEqual({ left: 370, top: 256 });
  });

  it('clamps horizontally near left and right viewport edges', () => {
    const leftPos = computeQuickDayPopoverPosition(
      { left: 4, right: 64, top: 100, bottom: 140, width: 60, height: 40 },
      menu,
      viewport,
    );
    expect(leftPos.left).toBe(8);

    const rightPos = computeQuickDayPopoverPosition(
      { left: 940, right: 996, top: 100, bottom: 140, width: 56, height: 40 },
      menu,
      viewport,
    );
    expect(rightPos.left).toBe(1000 - 160 - 8);
  });

  it('flips above anchor when near bottom of viewport', () => {
    const pos = computeQuickDayPopoverPosition(
      { left: 400, right: 500, top: 680, bottom: 730, width: 100, height: 50 },
      menu,
      viewport,
    );
    expect(pos).toEqual({ left: 370, top: 680 - 188 - 6 });
  });
});

describe('bulk-delete selection helpers', () => {
  const sampleSlots: ShiftSlot[] = [
    {
      shiftDate: '2026-10-26',
      shiftNumber: 1,
      status: 'BV',
      branchCode: null,
      procedureCount: 0,
      note: '',
    },
    {
      shiftDate: '2026-10-26',
      shiftNumber: 2,
      status: 'NGHI',
      branchCode: null,
      procedureCount: 0,
      note: '',
    },
    {
      shiftDate: '2026-10-28',
      shiftNumber: 1,
      status: 'KFC',
      branchCode: 'CN1',
      procedureCount: 1,
      note: '',
    },
    {
      shiftDate: '2026-11-02',
      shiftNumber: 3,
      status: 'RANH',
      branchCode: null,
      procedureCount: 0,
      note: '',
    },
  ];
  const sampleMap = new Map(sampleSlots.map((s) => [slotKey(s.shiftDate, s.shiftNumber), s]));

  it('collects only filled targets in rect, date, week, and month', () => {
    const rectTargets = collectFilledTargetsInRect(
      week,
      { dayIndex: 0, shiftNumber: 1 },
      { dayIndex: 2, shiftNumber: 2 },
      sampleMap,
    );
    expect(rectTargets).toEqual([
      { shiftDate: '2026-10-26', shiftNumber: 1 },
      { shiftDate: '2026-10-26', shiftNumber: 2 },
      { shiftDate: '2026-10-28', shiftNumber: 1 },
    ]);

    expect(collectFilledTargetsForDate('2026-10-26', sampleMap)).toEqual([
      { shiftDate: '2026-10-26', shiftNumber: 1 },
      { shiftDate: '2026-10-26', shiftNumber: 2 },
    ]);

    expect(collectFilledTargetsForWeek(week, sampleMap)).toHaveLength(3);

    expect(collectFilledTargetsForMonth('2026-11', sampleSlots)).toEqual([
      { shiftDate: '2026-11-02', shiftNumber: 3 },
    ]);
  });

  it('applies add, remove, and toggle selection modes and parses keys', () => {
    const dayTargets = collectFilledTargetsForDate('2026-10-26', sampleMap);
    const added = applySelectionTargets(new Set(), dayTargets, 'add');
    expect(added.size).toBe(2);

    // Toggle when all selected -> removes all
    const toggledOff = applySelectionTargets(added, dayTargets, 'toggle');
    expect(toggledOff.size).toBe(0);

    // Toggle when partially selected -> adds remaining
    const partial = new Set([slotKey('2026-10-26', 1)]);
    const toggledOn = applySelectionTargets(partial, dayTargets, 'toggle');
    expect(toggledOn.size).toBe(2);

    // Remove mode
    const removed = applySelectionTargets(toggledOn, [dayTargets[0]], 'remove');
    expect(parseSelectedSlotKeys(removed)).toEqual([
      { shiftDate: '2026-10-26', shiftNumber: 2 },
    ]);
  });
});
