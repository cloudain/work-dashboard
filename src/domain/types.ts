export type ShiftNumber = 1 | 2 | 3;

export type ShiftStatus = 'BV' | 'NGHI' | 'RANH' | 'KFC';

export type AhTaskStatus = 'DANG_LAM' | 'CHO_THANH_TOAN' | 'DA_NHAN';

export interface TimeRange {
  start: string; // HH:mm
  end: string; // HH:mm
}

export interface ShiftHoursSet {
  ca1: TimeRange | null;
  ca2: TimeRange | null;
  ca3: TimeRange | null;
}

export interface BranchHours {
  weekday: ShiftHoursSet;
  weekend: ShiftHoursSet;
}

export interface Branch {
  id: string;
  code: string;
  name: string;
  address: string;
  color: string;
  isActive: boolean;
  sortOrder: number;
  hours: BranchHours;
}

export interface ShiftSlot {
  shiftDate: string; // YYYY-MM-DD
  shiftNumber: ShiftNumber;
  status: ShiftStatus;
  branchCode: string | null;
  procedureCount: number;
  note: string;
}

export interface MonthConfig {
  yearMonth: string; // YYYY-MM
  shiftRate: number;
  procedureRate: number;
  payoutRatio: number; // e.g., 1 or 0.9
  procedureAdjustment: number;
  procedureAdjustmentNote: string;
  bonusAmount: number;
  bonusNote: string;
  hospitalSalary: number | null;
  isHistorical: boolean;
  clinicLabel: string; // 'KFC' or 'FH'
  historicalShiftIncome: number | null;
  historicalComIncome: number | null;
  historicalAhIncome: number | null;
}

export interface AhTask {
  id: string;
  title: string;
  amount: number;
  status: AhTaskStatus;
  receivedMonth: string | null; // YYYY-MM
  note: string;
  createdAt: string;
}

export interface AppSettings {
  defaultShiftRate: number;
  defaultProcedureRate: number;
  defaultPayoutRatio: number;
  monthlyIncomeGoal: number | null;
  showHospitalSalary: boolean;
  calendarToken: string;
}

export interface MonthlyFinancialSummary {
  yearMonth: string;
  monthIndex: number; // 1..12
  label: string; // T1..T12
  isHistorical: boolean;
  clinicLabel: string;
  kfcShiftsTotal: number;
  kfcShiftsByBranch: Record<string, number>;
  bvShifts: number;
  nghiShifts: number;
  ranhUnscheduledShifts: number;
  totalProcedures: number;
  shiftRate: number;
  procedureRate: number;
  payoutRatio: number;
  shiftIncome: number;
  comIncome: number;
  ahIncome: number;
  bonusIncome: number;
  sideTotal: number;
  hospitalSalary: number | null;
  grandTotal: number;
}

export interface AnnualStats {
  totalShiftIncome: number;
  totalComIncome: number;
  totalAhIncome: number;
  totalBonusIncome: number;
  totalSideIncome: number;
  totalHospitalSalary: number;
  totalGrandIncome: number;
  avgShiftIncome: number;
  avgComIncome: number;
  avgAhIncome: number;
  avgBonusIncome: number;
  avgSideIncome: number;
  avgGrandIncome: number;
  shareShiftPct: number;
  shareComPct: number;
  shareAhPct: number;
  shareBonusPct: number;
}

export interface BackupPayload {
  version: 1;
  exportedAt: string;
  settings: AppSettings;
  branches: Branch[];
  slots: ShiftSlot[];
  monthConfigs: MonthConfig[];
  ahTasks: AhTask[];
}
