import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import { cloneDefaultBranches } from '../branches';
import { createBackupPayload, parseBackupJson, parseHistoricalExcelBuffer } from '../excelImport';
import { DEFAULT_APP_SETTINGS } from '../finance';

describe('historical Excel import & JSON backup', () => {
  it('parses both 2025 (FH) and 2026 (KFC) summary sheets cleanly', () => {
    const wb = XLSX.utils.book_new();
    const ws2025 = XLSX.utils.aoa_to_sheet([
      [null, 'FH', 'Com FH', 'AH', 'Tổng'],
      ['T10', 2_000_000, 340_000, 1_100_000, 3_440_000],
      ['T11', 4_500_000, 650_000, 600_000, 5_750_000],
      ['Tổng', 6_500_000, 990_000, 1_700_000, 9_190_000],
    ]);
    const ws2026 = XLSX.utils.aoa_to_sheet([
      [null, 'KFC', 'Com KFC', 'AH', 'Thưởng', 'Tổng'],
      ['T1', 3_400_000, 0, 600_000, 200_000, 4_200_000],
      ['T12', 0, 0, 0, 0, 0],
    ]);

    XLSX.utils.book_append_sheet(wb, ws2025, 'Thống kê thu nhập 2025');
    XLSX.utils.book_append_sheet(wb, ws2026, 'Thống kê thu nhập 2026');

    const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    const { months, warnings } = parseHistoricalExcelBuffer(out, DEFAULT_APP_SETTINGS);

    expect(warnings).toHaveLength(0);
    expect(months).toHaveLength(3);
    expect(months[0]).toMatchObject({
      yearMonth: '2025-10',
      clinicLabel: 'FH',
      isHistorical: true,
      historicalShiftIncome: 2_000_000,
      historicalComIncome: 340_000,
      historicalAhIncome: 1_100_000,
    });
    expect(months[2]).toMatchObject({
      yearMonth: '2026-01',
      clinicLabel: 'KFC',
      bonusAmount: 200_000,
    });
  });

  it('round-trips JSON backup payload', () => {
    const payload = createBackupPayload({
      settings: DEFAULT_APP_SETTINGS,
      branches: cloneDefaultBranches(),
      slots: [],
      monthConfigs: [],
      ahTasks: [],
    });
    const parsed = parseBackupJson(JSON.stringify(payload));
    expect(parsed.version).toBe(1);
    expect(parsed.branches).toHaveLength(4);
  });
});
