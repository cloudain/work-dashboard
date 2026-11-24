import type { Branch, ShiftNumber, TimeRange } from './types';

export const DEFAULT_BRANCHES: Branch[] = [
  {
    id: 'branch-cn1',
    code: 'CN1',
    name: 'Chi nhánh 1',
    address: '43 Đại lộ 2, P. Phước Long, TP.HCM (Q9 cũ)',
    color: '#059669',
    isActive: true,
    sortOrder: 1,
    hours: {
      weekday: {
        ca1: { start: '07:30', end: '11:30' },
        ca2: { start: '13:00', end: '17:00' },
        ca3: { start: '17:00', end: '21:00' },
      },
      weekend: {
        ca1: { start: '07:30', end: '11:30' },
        ca2: { start: '13:00', end: '17:00' },
        ca3: { start: '17:00', end: '20:30' },
      },
    },
  },
  {
    id: 'branch-cn2',
    code: 'CN2',
    name: 'Chi nhánh 2',
    address: '30 đường D2A, Vinhomes Grand Park, P. Long Bình, TP.HCM (Q9 cũ)',
    color: '#2563eb',
    isActive: true,
    sortOrder: 2,
    hours: {
      weekday: {
        ca1: { start: '08:00', end: '11:30' },
        ca2: { start: '13:00', end: '17:00' },
        ca3: { start: '17:00', end: '21:00' },
      },
      weekend: {
        ca1: { start: '08:00', end: '11:30' },
        ca2: { start: '13:00', end: '17:00' },
        ca3: { start: '17:00', end: '20:30' },
      },
    },
  },
  {
    id: 'branch-cn3',
    code: 'CN3',
    name: 'Chi nhánh 3',
    address: '60 Nguyễn Tuyển, P. Bình Trưng, TP.HCM',
    color: '#4f46e5',
    isActive: true,
    sortOrder: 3,
    hours: {
      weekday: {
        ca1: { start: '08:00', end: '11:30' },
        ca2: { start: '13:00', end: '17:00' },
        ca3: { start: '17:00', end: '21:00' },
      },
      weekend: {
        ca1: { start: '08:00', end: '11:30' },
        ca2: { start: '13:00', end: '17:00' },
        ca3: { start: '17:00', end: '20:30' },
      },
    },
  },
  {
    id: 'branch-cn4',
    code: 'CN4',
    name: 'Chi nhánh 4',
    address: '262 Nguyễn Hoàng, P. Bình Trưng, TP.HCM (Quận 2 cũ)',
    color: '#7c3aed',
    isActive: true,
    sortOrder: 4,
    hours: {
      weekday: {
        ca1: { start: '08:00', end: '11:30' },
        ca2: null,
        ca3: { start: '17:00', end: '21:00' },
      },
      weekend: {
        ca1: { start: '08:00', end: '11:30' },
        ca2: null,
        ca3: { start: '16:30', end: '20:30' },
      },
    },
  },
];

export function isWeekend(dateStr: string): boolean {
  const [y, m, d] = dateStr.split('-').map(Number);
  const utcDay = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return utcDay === 0 || utcDay === 6;
}

export function getBranchShiftTime(
  branch: Branch,
  dateStr: string,
  shiftNumber: ShiftNumber,
): TimeRange | null {
  const set = isWeekend(dateStr) ? branch.hours.weekend : branch.hours.weekday;
  if (shiftNumber === 1) return set.ca1;
  if (shiftNumber === 2) return set.ca2;
  return set.ca3;
}

export function isValidBranchShift(
  branch: Branch,
  dateStr: string,
  shiftNumber: ShiftNumber,
): boolean {
  return getBranchShiftTime(branch, dateStr, shiftNumber) !== null;
}

export function cloneDefaultBranches(): Branch[] {
  return DEFAULT_BRANCHES.map((b) => ({
    ...b,
    hours: {
      weekday: {
        ca1: b.hours.weekday.ca1 ? { ...b.hours.weekday.ca1 } : null,
        ca2: b.hours.weekday.ca2 ? { ...b.hours.weekday.ca2 } : null,
        ca3: b.hours.weekday.ca3 ? { ...b.hours.weekday.ca3 } : null,
      },
      weekend: {
        ca1: b.hours.weekend.ca1 ? { ...b.hours.weekend.ca1 } : null,
        ca2: b.hours.weekend.ca2 ? { ...b.hours.weekend.ca2 } : null,
        ca3: b.hours.weekend.ca3 ? { ...b.hours.weekend.ca3 } : null,
      },
    },
  }));
}
