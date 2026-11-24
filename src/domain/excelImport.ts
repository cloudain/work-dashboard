import * as XLSX from 'xlsx';
import { createDefaultMonthConfig } from './finance';
import type { AppSettings, BackupPayload, MonthConfig } from './types';

function toNumber(val: unknown): number {
  if (typeof val === 'number' && Number.isFinite(val)) return Math.round(val);
  if (typeof val === 'string') {
    const cleaned = val.replace(/[,\s]/g, '');
    const num = Number(cleaned);
    return Number.isFinite(num) ? Math.round(num) : 0;
  }
  return 0;
}

function normalizeText(val: unknown): string {
  return String(val ?? '')
    .trim()
    .toLowerCase();
}

export function parseHistoricalExcelBuffer(
  buffer: ArrayBuffer,
  settings: AppSettings,
): { months: MonthConfig[]; warnings: string[] } {
  const wb = XLSX.read(buffer, { type: 'array' });
  const months: MonthConfig[] = [];
  const warnings: string[] = [];

  for (const sheetName of wb.SheetNames) {
    const yearMatch = sheetName.match(/th[oố]ng\s*k[eê].*?(20\d{2})/i);
    if (!yearMatch) continue;
    const year = Number(yearMatch[1]);
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null });

    let headerIdx = -1;
    let shiftCol = -1;
    let comCol = -1;
    let ahCol = -1;
    let bonusCol = -1;
    let clinicLabel = 'KFC';

    for (let r = 0; r < Math.min(rows.length, 10); r += 1) {
      const row = rows[r] ?? [];
      const labels = row.map(normalizeText);
      const kfcIdx = labels.findIndex((c) => c === 'kfc' || c.startsWith('kfc ') || c.startsWith('kfc('));
      const fhIdx = labels.findIndex((c) => c === 'fh' || c.startsWith('fh '));
      const ahIdx = labels.findIndex((c) => c === 'ah' || c.startsWith('ah ') || c.startsWith('ah('));
      if ((kfcIdx !== -1 || fhIdx !== -1) && ahIdx !== -1) {
        headerIdx = r;
        shiftCol = kfcIdx !== -1 ? kfcIdx : fhIdx;
        clinicLabel = kfcIdx !== -1 ? 'KFC' : 'FH';
        comCol = labels.findIndex((c) => c.startsWith('com '));
        ahCol = ahIdx;
        bonusCol = labels.findIndex((c) => c.includes('thưởng') || c.includes('thuong'));
        break;
      }
    }

    if (headerIdx === -1) {
      warnings.push(`Không tìm thấy dòng tiêu đề chuẩn trong sheet "${sheetName}".`);
      continue;
    }

    for (let r = headerIdx + 1; r < rows.length; r += 1) {
      const row = rows[r] ?? [];
      const firstCell = String(row[0] ?? '').trim();
      const monthMatch = firstCell.match(/^T(\d{1,2})$/i);
      if (!monthMatch) continue;

      const monthNum = Number(monthMatch[1]);
      if (monthNum < 1 || monthNum > 12) continue;

      const shiftIncome = shiftCol >= 0 ? toNumber(row[shiftCol]) : 0;
      const comIncome = comCol >= 0 ? toNumber(row[comCol]) : 0;
      const ahIncome = ahCol >= 0 ? toNumber(row[ahCol]) : 0;
      const bonusAmount = bonusCol >= 0 ? toNumber(row[bonusCol]) : 0;

      if (shiftIncome === 0 && comIncome === 0 && ahIncome === 0 && bonusAmount === 0) {
        continue;
      }

      const yearMonth = `${year}-${String(monthNum).padStart(2, '0')}`;
      const base = createDefaultMonthConfig(yearMonth, settings);
      months.push({
        ...base,
        isHistorical: true,
        clinicLabel,
        historicalShiftIncome: shiftIncome,
        historicalComIncome: comIncome,
        historicalAhIncome: ahIncome,
        bonusAmount,
        bonusNote: bonusAmount > 0 ? `Import từ ${sheetName}` : '',
      });
    }
  }

  if (months.length === 0) {
    warnings.push('Không tìm thấy sheet "Thống kê thu nhập YYYY" hợp lệ trong file Excel.');
  }

  months.sort((a, b) => a.yearMonth.localeCompare(b.yearMonth));
  return { months, warnings };
}

export function createBackupPayload(data: Omit<BackupPayload, 'version' | 'exportedAt'>): BackupPayload {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    ...data,
  };
}

export function parseBackupJson(rawText: string): BackupPayload {
  const parsed = JSON.parse(rawText) as Partial<BackupPayload>;
  if (
    parsed.version !== 1 ||
    !parsed.settings ||
    !Array.isArray(parsed.branches) ||
    !Array.isArray(parsed.slots) ||
    !Array.isArray(parsed.monthConfigs) ||
    !Array.isArray(parsed.ahTasks)
  ) {
    throw new Error('File backup JSON không đúng định dạng Work Dashboard v1.');
  }
  return parsed as BackupPayload;
}
