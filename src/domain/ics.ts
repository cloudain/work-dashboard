import { getBranchShiftTime } from './branches';
import type { Branch, ShiftSlot } from './types';

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function toIcsDateTime(dateStr: string, hhmm: string): string {
  const compactDate = dateStr.replace(/-/g, '');
  const compactTime = `${hhmm.replace(':', '')}00`;
  return `${compactDate}T${compactTime}`;
}

export function generateIcsContent(slots: ShiftSlot[], branches: Branch[]): string {
  const branchMap = new Map(branches.map((b) => [b.code, b]));

  const confirmedSlots = slots
    .filter((s) => s.status === 'KFC' && Boolean(s.branchCode))
    .slice()
    .sort((a, b) => {
      if (a.shiftDate !== b.shiftDate) return a.shiftDate.localeCompare(b.shiftDate);
      return a.shiftNumber - b.shiftNumber;
    });

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//WorkDashboard//KFC Schedule//VI',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Lịch khám KFC',
    'X-WR-TIMEZONE:Asia/Ho_Chi_Minh',
    'BEGIN:VTIMEZONE',
    'TZID:Asia/Ho_Chi_Minh',
    'BEGIN:STANDARD',
    'DTSTART:19700101T000000',
    'TZOFFSETFROM:+0700',
    'TZOFFSETTO:+0700',
    'TZNAME:+07',
    'END:STANDARD',
    'END:VTIMEZONE',
  ];

  const dtStamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

  for (const slot of confirmedSlots) {
    const branch = branchMap.get(slot.branchCode!);
    if (!branch) continue;
    const range = getBranchShiftTime(branch, slot.shiftDate, slot.shiftNumber);
    if (!range) continue;

    const uid = `kfc-${slot.shiftDate.replace(/-/g, '')}-ca${slot.shiftNumber}@work-dashboard`;
    const summary = `Khám KFC - ${branch.code} (Ca ${slot.shiftNumber})`;
    const descParts: string[] = [];
    if (slot.procedureCount > 0) {
      descParts.push(`Thủ thuật: ${slot.procedureCount} ca`);
    }
    if (slot.note.trim()) {
      descParts.push(slot.note.trim());
    }

    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${uid}`);
    lines.push(`DTSTAMP:${dtStamp}`);
    lines.push(`DTSTART;TZID=Asia/Ho_Chi_Minh:${toIcsDateTime(slot.shiftDate, range.start)}`);
    lines.push(`DTEND;TZID=Asia/Ho_Chi_Minh:${toIcsDateTime(slot.shiftDate, range.end)}`);
    lines.push(`SUMMARY:${escapeIcsText(summary)}`);
    lines.push(`LOCATION:${escapeIcsText(branch.address)}`);
    if (descParts.length > 0) {
      lines.push(`DESCRIPTION:${escapeIcsText(descParts.join(' | '))}`);
    }
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR', '');
  return lines.join('\r\n');
}
