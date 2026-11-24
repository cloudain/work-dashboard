import { describe, expect, it } from 'vitest';
import { projectCellForManager } from '../managerExport';
import type { ShiftSlot } from '../types';

describe('manager red/green export projection', () => {
  const mkSlot = (status: ShiftSlot['status'], branchCode: string | null = null): ShiftSlot => ({
    shiftDate: '2026-12-01',
    shiftNumber: 1,
    status,
    branchCode,
    procedureCount: 0,
    note: '',
  });

  it('projects both BV and NGHI to plain red without exposing personal reason', () => {
    expect(projectCellForManager(mkSlot('BV'), false)).toEqual({
      fill: '#E06666',
      text: '',
      textColor: '#FFFFFF',
    });
    expect(projectCellForManager(mkSlot('NGHI'), false)).toEqual({
      fill: '#E06666',
      text: '',
      textColor: '#FFFFFF',
    });
  });

  it('projects RANH to plain green and KFC to darker green with optional label hiding', () => {
    expect(projectCellForManager(mkSlot('RANH'), false).fill).toBe('#B6D7A8');

    expect(projectCellForManager(mkSlot('KFC', 'CN2'), false)).toEqual({
      fill: '#6AA84F',
      text: 'CN2',
      textColor: '#FFFFFF',
    });
    expect(projectCellForManager(mkSlot('KFC', 'CN2'), true)).toEqual({
      fill: '#B6D7A8',
      text: '',
      textColor: '#1E293B',
    });
  });
});
