import { describe, expect, it } from 'vitest';
import {
  computeAnnualStats,
  computeMonthlySummary,
  computeReceivables,
  DEFAULT_APP_SETTINGS,
} from '../finance';
import type { AhTask, MonthConfig, ShiftSlot } from '../types';

describe('finance calculations', () => {
  const slots: ShiftSlot[] = [
    // Week spanning Nov/Dec 2026: 2026-11-30 (Mon) vs 2026-12-01 (Tue)
    { shiftDate: '2026-11-30', shiftNumber: 1, status: 'KFC', branchCode: 'CN1', procedureCount: 2, note: '' },
    { shiftDate: '2026-12-01', shiftNumber: 1, status: 'KFC', branchCode: 'CN1', procedureCount: 3, note: '' },
    { shiftDate: '2026-12-05', shiftNumber: 3, status: 'KFC', branchCode: 'CN4', procedureCount: 1, note: '' },
    { shiftDate: '2026-12-06', shiftNumber: 1, status: 'BV', branchCode: null, procedureCount: 0, note: '' },
    { shiftDate: '2026-12-06', shiftNumber: 2, status: 'RANH', branchCode: null, procedureCount: 0, note: '' },
    { shiftDate: '2026-12-07', shiftNumber: 1, status: 'NGHI', branchCode: null, procedureCount: 0, note: '' },
  ];

  const ahTasks: AhTask[] = [
    {
      id: 't1',
      title: 'Paper 1',
      amount: 1_500_000,
      status: 'DA_NHAN',
      receivedMonth: '2026-12',
      note: '',
      createdAt: '2026-11-01T00:00:00Z',
    },
    {
      id: 't2',
      title: 'Paper 2',
      amount: 2_000_000,
      status: 'CHO_THANH_TOAN',
      receivedMonth: null,
      note: '',
      createdAt: '2026-11-15T00:00:00Z',
    },
  ];

  it('partitions month-spanning weeks strictly by exact calendar date', () => {
    const nov = computeMonthlySummary('2026-11', slots, undefined, ahTasks, DEFAULT_APP_SETTINGS);
    const dec = computeMonthlySummary('2026-12', slots, undefined, ahTasks, DEFAULT_APP_SETTINGS);

    expect(nov.kfcShiftsTotal).toBe(1);
    expect(nov.shiftIncome).toBe(500_000);
    expect(nov.comIncome).toBe(80_000);

    expect(dec.kfcShiftsTotal).toBe(2);
    expect(dec.kfcShiftsByBranch).toEqual({ CN1: 1, CN4: 1 });
    expect(dec.bvShifts).toBe(1);
    expect(dec.ranhUnscheduledShifts).toBe(1);
    expect(dec.nghiShifts).toBe(1);
    expect(dec.totalProcedures).toBe(4);
    expect(dec.shiftIncome).toBe(1_000_000);
    expect(dec.comIncome).toBe(160_000);
    expect(dec.ahIncome).toBe(1_500_000);
    expect(dec.sideTotal).toBe(2_660_000);
  });

  it('applies 90% payout ratio, procedure adjustment, bonus, and BV salary correctly', () => {
    const cfg: MonthConfig = {
      yearMonth: '2026-12',
      shiftRate: 500_000,
      procedureRate: 40_000,
      payoutRatio: 0.9,
      procedureAdjustment: 40_000,
      procedureAdjustmentNote: 'Thêm 1 ca',
      bonusAmount: 300_000,
      bonusNote: 'Thưởng',
      hospitalSalary: 12_000_000,
      isHistorical: false,
      clinicLabel: 'KFC',
      historicalShiftIncome: null,
      historicalComIncome: null,
      historicalAhIncome: null,
    };

    const dec = computeMonthlySummary('2026-12', slots, cfg, ahTasks, DEFAULT_APP_SETTINGS);
    expect(dec.shiftIncome).toBe(900_000);
    expect(dec.comIncome).toBe(200_000);
    expect(dec.sideTotal).toBe(2_900_000);
    expect(dec.grandTotal).toBe(14_900_000);
  });

  it('computes AH receivables and non-zero annual averages', () => {
    const rec = computeReceivables(ahTasks);
    expect(rec.count).toBe(1);
    expect(rec.totalAmount).toBe(2_000_000);

    const jan = computeMonthlySummary('2026-01', [], {
      yearMonth: '2026-01',
      shiftRate: 500_000,
      procedureRate: 40_000,
      payoutRatio: 1,
      procedureAdjustment: 0,
      procedureAdjustmentNote: '',
      bonusAmount: 0,
      bonusNote: '',
      hospitalSalary: null,
      isHistorical: true,
      clinicLabel: 'KFC',
      historicalShiftIncome: 3_400_000,
      historicalComIncome: 0,
      historicalAhIncome: 600_000,
    }, [], DEFAULT_APP_SETTINGS);

    const feb = computeMonthlySummary('2026-02', [], {
      yearMonth: '2026-02',
      shiftRate: 500_000,
      procedureRate: 40_000,
      payoutRatio: 1,
      procedureAdjustment: 0,
      procedureAdjustmentNote: '',
      bonusAmount: 0,
      bonusNote: '',
      hospitalSalary: null,
      isHistorical: true,
      clinicLabel: 'KFC',
      historicalShiftIncome: 4_900_000,
      historicalComIncome: 160_000,
      historicalAhIncome: 600_000,
    }, [], DEFAULT_APP_SETTINGS);

    const stats = computeAnnualStats([jan, feb], false);
    expect(stats.totalSideIncome).toBe(9_660_000);
    expect(stats.avgComIncome).toBe(160_000); // divides only by months > 0
  });
});
