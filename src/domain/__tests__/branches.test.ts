import { describe, expect, it } from 'vitest';
import { DEFAULT_BRANCHES, getBranchShiftTime, isValidBranchShift } from '../branches';

describe('branches & operating hours', () => {
  const cn1 = DEFAULT_BRANCHES.find((b) => b.code === 'CN1')!;
  const cn2 = DEFAULT_BRANCHES.find((b) => b.code === 'CN2')!;
  const cn4 = DEFAULT_BRANCHES.find((b) => b.code === 'CN4')!;

  it('fixes CN2 weekend Ca 1 to 08:00-11:30 per clinic poster', () => {
    // 2026-12-05 is Saturday, 2026-12-06 is Sunday
    expect(getBranchShiftTime(cn2, '2026-12-05', 1)).toEqual({ start: '08:00', end: '11:30' });
    expect(getBranchShiftTime(cn2, '2026-12-06', 1)).toEqual({ start: '08:00', end: '11:30' });
    expect(getBranchShiftTime(cn1, '2026-12-06', 1)).toEqual({ start: '07:30', end: '11:30' });
  });

  it('disallows CN4 Ca 2 on both weekdays and weekends', () => {
    expect(isValidBranchShift(cn4, '2026-12-02', 2)).toBe(false);
    expect(isValidBranchShift(cn4, '2026-12-05', 2)).toBe(false);
    expect(isValidBranchShift(cn4, '2026-12-05', 3)).toBe(true);
    expect(getBranchShiftTime(cn4, '2026-12-05', 3)).toEqual({ start: '16:30', end: '20:30' });
  });
});
