import type {
  AhTask,
  AnnualStats,
  AppSettings,
  MonthConfig,
  MonthlyFinancialSummary,
  ShiftSlot,
} from './types';

export function generateCalendarToken(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replace(/-/g, '');
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 14)}`;
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  defaultShiftRate: 500_000,
  defaultProcedureRate: 40_000,
  defaultPayoutRatio: 1,
  monthlyIncomeGoal: null,
  showHospitalSalary: false,
  calendarToken: generateCalendarToken(),
};

export function createDefaultMonthConfig(
  yearMonth: string,
  settings: AppSettings,
): MonthConfig {
  return {
    yearMonth,
    shiftRate: settings.defaultShiftRate,
    procedureRate: settings.defaultProcedureRate,
    payoutRatio: settings.defaultPayoutRatio,
    procedureAdjustment: 0,
    procedureAdjustmentNote: '',
    bonusAmount: 0,
    bonusNote: '',
    hospitalSalary: null,
    isHistorical: false,
    clinicLabel: 'KFC',
    historicalShiftIncome: null,
    historicalComIncome: null,
    historicalAhIncome: null,
  };
}

export function computeMonthlySummary(
  yearMonth: string,
  slots: ShiftSlot[],
  monthConfig: MonthConfig | undefined,
  ahTasks: AhTask[],
  settings: AppSettings,
): MonthlyFinancialSummary {
  const cfg = monthConfig ?? createDefaultMonthConfig(yearMonth, settings);
  const monthIndex = Number(yearMonth.split('-')[1]);

  let kfcShiftsTotal = 0;
  const kfcShiftsByBranch: Record<string, number> = {};
  let bvShifts = 0;
  let nghiShifts = 0;
  let ranhUnscheduledShifts = 0;
  let totalProcedures = 0;

  for (const slot of slots) {
    if (!slot.shiftDate.startsWith(yearMonth)) continue;
    if (slot.status === 'KFC') {
      kfcShiftsTotal += 1;
      const code = slot.branchCode ?? 'KFC';
      kfcShiftsByBranch[code] = (kfcShiftsByBranch[code] ?? 0) + 1;
      totalProcedures += Math.max(0, slot.procedureCount);
    } else if (slot.status === 'BV') {
      bvShifts += 1;
    } else if (slot.status === 'NGHI') {
      nghiShifts += 1;
    } else if (slot.status === 'RANH') {
      ranhUnscheduledShifts += 1;
    }
  }

  let liveAhIncome = 0;
  for (const task of ahTasks) {
    if (task.status === 'DA_NHAN' && task.receivedMonth === yearMonth) {
      liveAhIncome += task.amount;
    }
  }

  const shiftIncome = cfg.isHistorical
    ? (cfg.historicalShiftIncome ?? 0)
    : Math.round(kfcShiftsTotal * cfg.shiftRate * cfg.payoutRatio);

  const comIncome = cfg.isHistorical
    ? (cfg.historicalComIncome ?? 0)
    : totalProcedures * cfg.procedureRate + cfg.procedureAdjustment;

  const ahIncome = cfg.isHistorical
    ? (cfg.historicalAhIncome ?? 0) + liveAhIncome
    : liveAhIncome;

  const bonusIncome = cfg.bonusAmount;
  const sideTotal = shiftIncome + comIncome + ahIncome + bonusIncome;
  const grandTotal = sideTotal + (cfg.hospitalSalary ?? 0);

  return {
    yearMonth,
    monthIndex,
    label: `T${monthIndex}`,
    isHistorical: cfg.isHistorical,
    clinicLabel: cfg.clinicLabel || 'KFC',
    kfcShiftsTotal,
    kfcShiftsByBranch,
    bvShifts,
    nghiShifts,
    ranhUnscheduledShifts,
    totalProcedures,
    shiftRate: cfg.shiftRate,
    procedureRate: cfg.procedureRate,
    payoutRatio: cfg.payoutRatio,
    shiftIncome,
    comIncome,
    ahIncome,
    bonusIncome,
    sideTotal,
    hospitalSalary: cfg.hospitalSalary,
    grandTotal,
  };
}

export function computeYearSummaries(
  year: number,
  slots: ShiftSlot[],
  monthConfigsByYm: Map<string, MonthConfig>,
  ahTasks: AhTask[],
  settings: AppSettings,
): MonthlyFinancialSummary[] {
  const list: MonthlyFinancialSummary[] = [];
  for (let m = 1; m <= 12; m += 1) {
    const ym = `${year}-${String(m).padStart(2, '0')}`;
    list.push(
      computeMonthlySummary(ym, slots, monthConfigsByYm.get(ym), ahTasks, settings),
    );
  }
  return list;
}

export function computeReceivables(ahTasks: AhTask[]): {
  count: number;
  totalAmount: number;
  tasks: AhTask[];
} {
  const tasks = ahTasks.filter((t) => t.status === 'CHO_THANH_TOAN');
  const totalAmount = tasks.reduce((sum, t) => sum + t.amount, 0);
  return { count: tasks.length, totalAmount, tasks };
}

function avgPositive(values: number[]): number {
  const positive = values.filter((v) => v > 0);
  if (positive.length === 0) return 0;
  return Math.round(positive.reduce((a, b) => a + b, 0) / positive.length);
}

export function computeAnnualStats(
  summaries: MonthlyFinancialSummary[],
  includeHospitalSalary: boolean,
): AnnualStats {
  const totalShiftIncome = summaries.reduce((s, x) => s + x.shiftIncome, 0);
  const totalComIncome = summaries.reduce((s, x) => s + x.comIncome, 0);
  const totalAhIncome = summaries.reduce((s, x) => s + x.ahIncome, 0);
  const totalBonusIncome = summaries.reduce((s, x) => s + x.bonusIncome, 0);
  const totalSideIncome = summaries.reduce((s, x) => s + x.sideTotal, 0);
  const totalHospitalSalary = summaries.reduce((s, x) => s + (x.hospitalSalary ?? 0), 0);
  const totalGrandIncome = totalSideIncome + totalHospitalSalary;

  const denom = includeHospitalSalary ? totalGrandIncome : totalSideIncome;

  return {
    totalShiftIncome,
    totalComIncome,
    totalAhIncome,
    totalBonusIncome,
    totalSideIncome,
    totalHospitalSalary,
    totalGrandIncome,
    avgShiftIncome: avgPositive(summaries.map((x) => x.shiftIncome)),
    avgComIncome: avgPositive(summaries.map((x) => x.comIncome)),
    avgAhIncome: avgPositive(summaries.map((x) => x.ahIncome)),
    avgBonusIncome: avgPositive(summaries.map((x) => x.bonusIncome)),
    avgSideIncome: avgPositive(summaries.map((x) => x.sideTotal)),
    avgGrandIncome: avgPositive(summaries.map((x) => x.grandTotal)),
    shareShiftPct: denom > 0 ? (totalShiftIncome / denom) * 100 : 0,
    shareComPct: denom > 0 ? (totalComIncome / denom) * 100 : 0,
    shareAhPct: denom > 0 ? (totalAhIncome / denom) * 100 : 0,
    shareBonusPct: denom > 0 ? (totalBonusIncome / denom) * 100 : 0,
  };
}

export function formatVND(amount: number): string {
  return `${new Intl.NumberFormat('vi-VN').format(Math.round(amount))}đ`;
}

export function formatCompactVND(amount: number): string {
  const abs = Math.abs(amount);
  if (abs >= 1_000_000) {
    const tr = amount / 1_000_000;
    return `${Number.isInteger(tr) ? tr : tr.toFixed(1)}tr`;
  }
  if (abs >= 1_000) {
    return `${Math.round(amount / 1_000)}k`;
  }
  return `${Math.round(amount)}đ`;
}
