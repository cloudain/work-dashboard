import { describe, expect, it } from 'vitest';
import { cloneDefaultBranches } from '../branches';
import { getWeekBlock, slotKey } from '../calendar';
import {
  MAX_UNDO_HISTORY,
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
  computeDragFillCoords,
  computeQuickDayPopoverPosition,
  countValidBranchShiftsForDate,
  createUndoEntry,
  parseSelectedSlotKeys,
  popUndoEntry,
  pushUndoEntry,
  type UndoEntry,
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

describe('week copy & paste helpers', () => {
  const targetWeek = getWeekBlock('2026-11-02', '2026-11');

  it('captures filled slots of source week and pastes in merge mode', () => {
    const srcSlots: ShiftSlot[] = [
      {
        shiftDate: '2026-10-26', // T2
        shiftNumber: 1,
        status: 'BV',
        branchCode: null,
        procedureCount: 0,
        note: 'Trực',
      },
      {
        shiftDate: '2026-10-28', // T4
        shiftNumber: 2,
        status: 'KFC',
        branchCode: 'CN1',
        procedureCount: 4,
        note: 'Đông',
      },
    ];
    const srcMap = new Map(srcSlots.map((s) => [slotKey(s.shiftDate, s.shiftNumber), s]));

    const snapshot = captureWeekSnapshot(week, srcMap, '26/10 – 01/11');
    expect(snapshot.sourceMondayStr).toBe('2026-10-26');
    expect(snapshot.slots).toEqual([
      { dayIndex: 0, shiftNumber: 1, status: 'BV', branchCode: null },
      { dayIndex: 2, shiftNumber: 2, status: 'KFC', branchCode: 'CN1' },
    ]);

    const existingTargetSlots: ShiftSlot[] = [
      {
        shiftDate: '2026-11-06', // T6
        shiftNumber: 3,
        status: 'NGHI',
        branchCode: null,
        procedureCount: 0,
        note: '',
      },
    ];
    const targetMap = new Map(
      existingTargetSlots.map((s) => [slotKey(s.shiftDate, s.shiftNumber), s]),
    );

    const mergePlan = buildPasteWeekPlan(targetWeek, snapshot, targetMap, branchMap, false);
    expect(mergePlan.skippedCount).toBe(0);
    expect(mergePlan.targetsToDelete).toEqual([]);
    expect(mergePlan.slotsToUpsert).toEqual([
      {
        shiftDate: '2026-11-02',
        shiftNumber: 1,
        status: 'BV',
        branchCode: null,
        procedureCount: 0,
        note: '',
      },
      {
        shiftDate: '2026-11-04',
        shiftNumber: 2,
        status: 'KFC',
        branchCode: 'CN1',
        procedureCount: 0,
        note: '',
      },
    ]);

    const replacePlan = buildPasteWeekPlan(targetWeek, snapshot, targetMap, branchMap, true);
    expect(replacePlan.targetsToDelete).toEqual([
      { shiftDate: '2026-11-06', shiftNumber: 3 },
    ]);
  });

  it('skips invalid KFC branch shifts when pasting', () => {
    const snapshot = {
      sourceMondayStr: '2026-10-26',
      sourceLabel: '26/10 – 01/11',
      slots: [
        { dayIndex: 0, shiftNumber: 2 as const, status: 'KFC' as const, branchCode: 'CN4' },
        { dayIndex: 0, shiftNumber: 1 as const, status: 'KFC' as const, branchCode: 'CN4' },
      ],
    };

    const plan = buildPasteWeekPlan(targetWeek, snapshot, new Map(), branchMap, false);
    expect(plan.skippedCount).toBe(1);
    expect(plan.slotsToUpsert).toHaveLength(1);
    expect(plan.slotsToUpsert[0].shiftNumber).toBe(1);
  });
});

describe('buildDragFillPlan matching KFC branch preservation', () => {
  it('preserves existing KFC slot with same branchCode while overwriting different status or branch', () => {
    const sourceCn1: ShiftSlot = {
      shiftDate: '2026-10-26', // dayIndex 0
      shiftNumber: 1,
      status: 'KFC',
      branchCode: 'CN1',
      procedureCount: 1,
      note: '',
    };

    const existingSameBranch: ShiftSlot = {
      shiftDate: '2026-10-27', // dayIndex 1 - same CN1, must preserve
      shiftNumber: 1,
      status: 'KFC',
      branchCode: 'CN1',
      procedureCount: 7,
      note: 'Ca nhiều thủ thuật',
    };
    const existingOtherBranch: ShiftSlot = {
      shiftDate: '2026-10-28', // dayIndex 2 - CN2, must overwrite
      shiftNumber: 1,
      status: 'KFC',
      branchCode: 'CN2',
      procedureCount: 3,
      note: 'Khác chi nhánh',
    };
    const existingBv: ShiftSlot = {
      shiftDate: '2026-10-29', // dayIndex 3 - BV, must overwrite
      shiftNumber: 1,
      status: 'BV',
      branchCode: null,
      procedureCount: 0,
      note: 'Trực',
    };

    const existingMap = new Map<string, ShiftSlot>([
      [slotKey(existingSameBranch.shiftDate, 1), existingSameBranch],
      [slotKey(existingOtherBranch.shiftDate, 1), existingOtherBranch],
      [slotKey(existingBv.shiftDate, 1), existingBv],
    ]);

    const plan = buildDragFillPlan(
      week,
      sourceCn1,
      { dayIndex: 0, shiftNumber: 1 },
      { dayIndex: 3, shiftNumber: 1 },
      branchMap,
      existingMap,
    );

    expect(plan.preservedKeys.has(slotKey('2026-10-27', 1))).toBe(true);
    expect(plan.skippedKeys.size).toBe(0);
    expect(plan.slotsToUpsert).toEqual([
      {
        shiftDate: '2026-10-28',
        shiftNumber: 1,
        status: 'KFC',
        branchCode: 'CN1',
        procedureCount: 0,
        note: '',
      },
      {
        shiftDate: '2026-10-29',
        shiftNumber: 1,
        status: 'KFC',
        branchCode: 'CN1',
        procedureCount: 0,
        note: '',
      },
    ]);
  });

  it('still skips invalid CN4 Ca 2 while preserving existing CN4 Ca 3', () => {
    const sourceCn4: ShiftSlot = {
      shiftDate: '2026-10-26',
      shiftNumber: 1,
      status: 'KFC',
      branchCode: 'CN4',
      procedureCount: 0,
      note: '',
    };
    const existingCn4Ca3: ShiftSlot = {
      shiftDate: '2026-10-26',
      shiftNumber: 3,
      status: 'KFC',
      branchCode: 'CN4',
      procedureCount: 4,
      note: 'Giữ nguyên',
    };
    const existingMap = new Map([[slotKey('2026-10-26', 3), existingCn4Ca3]]);

    const plan = buildDragFillPlan(
      week,
      sourceCn4,
      { dayIndex: 0, shiftNumber: 1 },
      { dayIndex: 0, shiftNumber: 3 },
      branchMap,
      existingMap,
    );

    expect(plan.skippedKeys.has(slotKey('2026-10-26', 2))).toBe(true);
    expect(plan.preservedKeys.has(slotKey('2026-10-26', 3))).toBe(true);
    expect(plan.slotsToUpsert).toHaveLength(0);
  });
});

describe('Undo history helpers', () => {
  const existingKfc: ShiftSlot = {
    shiftDate: '2026-10-26',
    shiftNumber: 1,
    status: 'KFC',
    branchCode: 'CN1',
    procedureCount: 5,
    note: 'Ghi chú cũ',
  };
  const existingBv: ShiftSlot = {
    shiftDate: '2026-10-27',
    shiftNumber: 2,
    status: 'BV',
    branchCode: null,
    procedureCount: 0,
    note: 'Trực chính',
  };
  const existingMap = new Map<string, ShiftSlot>([
    [slotKey(existingKfc.shiftDate, 1), existingKfc],
    [slotKey(existingBv.shiftDate, 2), existingBv],
  ]);

  it('records restoreDeletes for empty slots and lossless restoreUpserts for overwritten/deleted slots', () => {
    const entry = createUndoEntry(
      'dán tuần',
      existingMap,
      [
        {
          shiftDate: '2026-10-26',
          shiftNumber: 1,
          status: 'NGHI',
          branchCode: null,
          procedureCount: 0,
          note: '',
        },
        {
          shiftDate: '2026-10-28', // previously empty
          shiftNumber: 1,
          status: 'RANH',
          branchCode: null,
          procedureCount: 0,
          note: '',
        },
      ],
      [
        { shiftDate: '2026-10-27', shiftNumber: 2 },
        { shiftDate: '2026-10-29', shiftNumber: 3 }, // not in existingMap
      ],
    );

    expect(entry).not.toBeNull();
    expect(entry!.label).toBe('dán tuần');
    expect(entry!.restoreDeletes).toEqual([{ shiftDate: '2026-10-28', shiftNumber: 1 }]);
    expect(entry!.restoreUpserts).toEqual([existingKfc, existingBv]);
  });

  it('returns null when upsert makes no actual change', () => {
    const noopEntry = createUndoEntry('no-op', existingMap, [{ ...existingKfc }]);
    expect(noopEntry).toBeNull();
  });

  it('caps stack at MAX_UNDO_HISTORY (10) and pops in LIFO order', () => {
    expect(MAX_UNDO_HISTORY).toBe(10);
    let stack: UndoEntry[] = [];
    for (let i = 1; i <= 12; i += 1) {
      stack = pushUndoEntry(stack, {
        label: `step-${i}`,
        restoreUpserts: [],
        restoreDeletes: [{ shiftDate: '2026-10-26', shiftNumber: 1 }],
      });
    }
    expect(stack).toHaveLength(10);
    expect(stack[0].label).toBe('step-3');
    expect(stack[9].label).toBe('step-12');

    // Pushing null is a no-op
    expect(pushUndoEntry(stack, null)).toBe(stack);

    const firstPop = popUndoEntry(stack);
    expect(firstPop.entry?.label).toBe('step-12');
    expect(firstPop.rest).toHaveLength(9);

    const emptyPop = popUndoEntry([]);
    expect(emptyPop).toEqual({ entry: null, rest: [] });
  });
});

describe('Paint/Brush mode planners', () => {
  const existingCn1: ShiftSlot = {
    shiftDate: '2026-10-26',
    shiftNumber: 1,
    status: 'KFC',
    branchCode: 'CN1',
    procedureCount: 6,
    note: 'Giữ thủ thuật',
  };
  const existingBv: ShiftSlot = {
    shiftDate: '2026-10-26',
    shiftNumber: 3,
    status: 'BV',
    branchCode: null,
    procedureCount: 0,
    note: '',
  };
  const existingMap = new Map<string, ShiftSlot>([
    [slotKey('2026-10-26', 1), existingCn1],
    [slotKey('2026-10-26', 3), existingBv],
  ]);

  it('single-tap paints empty cell, toggles off matching cell, overwrites different cell, and handles erase', () => {
    // Empty cell with RANH
    const paintEmpty = buildPaintSingleTapPlan(
      '2026-10-27',
      1,
      { kind: 'status', status: 'RANH' },
      existingMap,
      branchMap,
    );
    expect(paintEmpty.slotsToUpsert).toEqual([
      { shiftDate: '2026-10-27', shiftNumber: 1, status: 'RANH', branchCode: null, procedureCount: 0, note: '' },
    ]);
    expect(paintEmpty.targetsToDelete).toEqual([]);

    // Tap matching status -> toggle off
    const toggleStatusOff = buildPaintSingleTapPlan(
      '2026-10-26',
      3,
      { kind: 'status', status: 'BV' },
      existingMap,
      branchMap,
    );
    expect(toggleStatusOff.targetsToDelete).toEqual([{ shiftDate: '2026-10-26', shiftNumber: 3 }]);
    expect(toggleStatusOff.slotsToUpsert).toEqual([]);

    // Tap matching KFC branch -> toggle off
    const toggleKfcOff = buildPaintSingleTapPlan(
      '2026-10-26',
      1,
      { kind: 'kfc', branchCode: 'CN1' },
      existingMap,
      branchMap,
    );
    expect(toggleKfcOff.targetsToDelete).toEqual([{ shiftDate: '2026-10-26', shiftNumber: 1 }]);

    // Tap different branch -> overwrite
    const overwriteBranch = buildPaintSingleTapPlan(
      '2026-10-26',
      1,
      { kind: 'kfc', branchCode: 'CN2' },
      existingMap,
      branchMap,
    );
    expect(overwriteBranch.slotsToUpsert[0]).toMatchObject({ status: 'KFC', branchCode: 'CN2' });

    // Invalid CN4 Ca 2 -> skipped
    const invalidCn4 = buildPaintSingleTapPlan(
      '2026-10-26',
      2,
      { kind: 'kfc', branchCode: 'CN4' },
      existingMap,
      branchMap,
    );
    expect(invalidCn4.skippedKeys.has(slotKey('2026-10-26', 2))).toBe(true);
    expect(invalidCn4.slotsToUpsert).toEqual([]);

    // Erase filled vs empty
    const eraseFilled = buildPaintSingleTapPlan(
      '2026-10-26',
      1,
      { kind: 'erase' },
      existingMap,
      branchMap,
    );
    expect(eraseFilled.targetsToDelete).toEqual([{ shiftDate: '2026-10-26', shiftNumber: 1 }]);

    const eraseEmpty = buildPaintSingleTapPlan(
      '2026-10-27',
      2,
      { kind: 'erase' },
      existingMap,
      branchMap,
    );
    expect(eraseEmpty.targetsToDelete).toEqual([]);
  });

  it('freehand stroke supports overnight shifts, deduplicates cells, skips invalid CN4 Ca 2, and preserves matching KFC', () => {
    const strokePlan = buildPaintStrokePlan(
      [
        { dateStr: '2026-10-26', shiftNumber: 1 }, // already CN1 -> preserve
        { dateStr: '2026-10-26', shiftNumber: 3 }, // was BV -> overwrite CN1
        { dateStr: '2026-10-27', shiftNumber: 1 }, // empty -> upsert CN1
        { dateStr: '2026-10-27', shiftNumber: 1 }, // duplicate revisit
        { dateStr: '2026-10-27', shiftNumber: 2 }, // empty -> upsert CN1
      ],
      { kind: 'kfc', branchCode: 'CN1' },
      existingMap,
      branchMap,
    );

    expect(strokePlan.preservedKeys.has(slotKey('2026-10-26', 1))).toBe(true);
    expect(strokePlan.slotsToUpsert.map((s) => `${s.shiftDate}|${s.shiftNumber}`)).toEqual([
      '2026-10-26|3',
      '2026-10-27|1',
      '2026-10-27|2',
    ]);

    const cn4Stroke = buildPaintStrokePlan(
      [
        { dateStr: '2026-10-27', shiftNumber: 1 },
        { dateStr: '2026-10-27', shiftNumber: 2 }, // invalid for CN4
        { dateStr: '2026-10-27', shiftNumber: 3 },
      ],
      { kind: 'kfc', branchCode: 'CN4' },
      existingMap,
      branchMap,
    );
    expect(cn4Stroke.skippedKeys.has(slotKey('2026-10-27', 2))).toBe(true);
    expect(cn4Stroke.slotsToUpsert).toHaveLength(2);

    const eraseStroke = buildPaintStrokePlan(
      [
        { dateStr: '2026-10-26', shiftNumber: 1 },
        { dateStr: '2026-10-26', shiftNumber: 2 }, // empty
        { dateStr: '2026-10-26', shiftNumber: 3 },
      ],
      { kind: 'erase' },
      existingMap,
      branchMap,
    );
    expect(eraseStroke.targetsToDelete).toEqual([
      { shiftDate: '2026-10-26', shiftNumber: 1 },
      { shiftDate: '2026-10-26', shiftNumber: 3 },
    ]);
  });

  it('buildFillDayPlan supports branches (filtering CN4 Ca 2) and countValidBranchShiftsForDate', () => {
    const cn1 = branchMap.get('CN1')!;
    const cn4 = branchMap.get('CN4')!;
    expect(countValidBranchShiftsForDate(cn1, '2026-10-26')).toBe(3);
    expect(countValidBranchShiftsForDate(cn4, '2026-10-26')).toBe(2);

    const cn4Map = new Map<string, ShiftSlot>([
      [
        slotKey('2026-10-26', 1),
        {
          shiftDate: '2026-10-26',
          shiftNumber: 1,
          status: 'KFC',
          branchCode: 'CN4',
          procedureCount: 3,
          note: 'Giữ',
        },
      ],
    ]);
    const dayPlan = buildFillDayPlan(
      '2026-10-26',
      { kind: 'kfc', branchCode: 'CN4' },
      cn4Map,
      branchMap,
    );
    expect(dayPlan.preservedKeys.has(slotKey('2026-10-26', 1))).toBe(true);
    expect(dayPlan.skippedKeys.has(slotKey('2026-10-26', 2))).toBe(true);
    expect(dayPlan.slotsToUpsert).toEqual([
      { shiftDate: '2026-10-26', shiftNumber: 3, status: 'KFC', branchCode: 'CN4', procedureCount: 0, note: '' },
    ]);
  });

  it('collectFilledTargetsFromCells deduplicates and filters empty cells across days', () => {
    const targets = collectFilledTargetsFromCells(
      [
        { dateStr: '2026-10-26', shiftNumber: 1 },
        { dateStr: '2026-10-26', shiftNumber: 2 }, // empty
        { dateStr: '2026-10-26', shiftNumber: 1 }, // duplicate
        { dateStr: '2026-10-26', shiftNumber: 3 },
      ],
      existingMap,
    );
    expect(targets).toEqual([
      { shiftDate: '2026-10-26', shiftNumber: 1 },
      { shiftDate: '2026-10-26', shiftNumber: 3 },
    ]);
  });
});
