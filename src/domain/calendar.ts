export const DAY_LABELS_VN = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'] as const;

export interface WeekDay {
  dateStr: string; // YYYY-MM-DD
  dayIndex: number; // 0 (Mon) .. 6 (Sun)
  dayLabel: string; // T2 .. CN
  inTargetMonth: boolean;
}

export interface WeekBlock {
  mondayStr: string;
  days: WeekDay[];
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function formatUtcDate(date: Date): string {
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

export function parseIsoDate(dateStr: string): { year: number; month: number; day: number } {
  const [year, month, day] = dateStr.split('-').map(Number);
  return { year, month, day };
}

export function todayIsoLocal(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

export function currentYearMonth(): string {
  return todayIsoLocal().slice(0, 7);
}

export function shiftYearMonth(ym: string, deltaMonths: number): string {
  const [y, m] = ym.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + deltaMonths, 1));
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}`;
}

export function addDays(dateStr: string, days: number): string {
  const { year, month, day } = parseIsoDate(dateStr);
  const dt = new Date(Date.UTC(year, month - 1, day + days));
  return formatUtcDate(dt);
}

export function getMondayOfWeek(dateStr: string): string {
  const { year, month, day } = parseIsoDate(dateStr);
  const dt = new Date(Date.UTC(year, month - 1, day));
  const utcDay = dt.getUTCDay(); // 0 = Sun, 1 = Mon .. 6 = Sat
  const diffToMon = utcDay === 0 ? -6 : 1 - utcDay;
  dt.setUTCDate(dt.getUTCDate() + diffToMon);
  return formatUtcDate(dt);
}

export function getWeekBlock(mondayStr: string, targetYearMonth?: string): WeekBlock {
  const days: WeekDay[] = [];
  for (let i = 0; i < 7; i += 1) {
    const dateStr = addDays(mondayStr, i);
    days.push({
      dateStr,
      dayIndex: i,
      dayLabel: DAY_LABELS_VN[i],
      inTargetMonth: targetYearMonth ? dateStr.startsWith(targetYearMonth) : true,
    });
  }
  return { mondayStr, days };
}

export function getWeeksForMonth(yearMonth: string): WeekBlock[] {
  const [year, month] = yearMonth.split('-').map(Number);
  const firstOfMonth = `${year}-${pad2(month)}-01`;
  const lastDayDate = new Date(Date.UTC(year, month, 0));
  const lastOfMonth = formatUtcDate(lastDayDate);

  const weeks: WeekBlock[] = [];
  let cursorMon = getMondayOfWeek(firstOfMonth);
  while (cursorMon <= lastOfMonth) {
    weeks.push(getWeekBlock(cursorMon, yearMonth));
    cursorMon = addDays(cursorMon, 7);
  }
  return weeks;
}

export function getUpcomingWeeks(fromDateStr: string, count = 3): WeekBlock[] {
  const currentMon = getMondayOfWeek(fromDateStr);
  const nextMon = addDays(currentMon, 7);
  const weeks: WeekBlock[] = [];
  for (let i = 0; i < count; i += 1) {
    weeks.push(getWeekBlock(addDays(nextMon, i * 7)));
  }
  return weeks;
}

export function formatDateVN(dateStr: string): string {
  const { year, month, day } = parseIsoDate(dateStr);
  return `${pad2(day)}/${pad2(month)}/${year}`;
}

export function formatShortDateVN(dateStr: string): string {
  const { month, day } = parseIsoDate(dateStr);
  return `${pad2(day)}/${pad2(month)}`;
}

export function formatMonthVN(yearMonth: string): string {
  const [year, month] = yearMonth.split('-');
  return `Tháng ${month}/${year}`;
}

export function slotKey(shiftDate: string, shiftNumber: number): string {
  return `${shiftDate}|${shiftNumber}`;
}
