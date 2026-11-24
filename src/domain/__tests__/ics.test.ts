import { describe, expect, it } from 'vitest';
import { DEFAULT_BRANCHES } from '../branches';
import { generateIcsContent } from '../ics';
import type { ShiftSlot } from '../types';

describe('RFC 5545 ICS calendar generation', () => {
  it('generates valid CRLF VCALENDAR events with exact branch times and addresses', () => {
    const slots: ShiftSlot[] = [
      {
        shiftDate: '2026-12-06', // Sunday
        shiftNumber: 1,
        status: 'KFC',
        branchCode: 'CN2',
        procedureCount: 2,
        note: 'Ca sáng chủ nhật',
      },
      {
        shiftDate: '2026-12-06',
        shiftNumber: 3,
        status: 'KFC',
        branchCode: 'CN4',
        procedureCount: 0,
        note: '',
      },
      {
        shiftDate: '2026-12-07',
        shiftNumber: 1,
        status: 'BV',
        branchCode: null,
        procedureCount: 0,
        note: '',
      },
    ];

    const ics = generateIcsContent(slots, DEFAULT_BRANCHES);
    expect(ics.includes('\r\n')).toBe(true);
    expect(ics).toContain('SUMMARY:Khám KFC - CN2 (Ca 1)');
    expect(ics).toContain('DTSTART;TZID=Asia/Ho_Chi_Minh:20261206T080000');
    expect(ics).toContain('DTEND;TZID=Asia/Ho_Chi_Minh:20261206T113000');
    expect(ics).toContain('SUMMARY:Khám KFC - CN4 (Ca 3)');
    expect(ics).toContain('DTSTART;TZID=Asia/Ho_Chi_Minh:20261206T163000');
    expect(ics).toContain('DTEND;TZID=Asia/Ho_Chi_Minh:20261206T203000');
    expect(ics).not.toContain('20261207');
  });
});
