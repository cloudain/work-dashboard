import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface TimeRange {
  start: string;
  end: string;
}

interface BranchRow {
  code: string;
  address: string;
  hours: {
    weekday: { ca1: TimeRange | null; ca2: TimeRange | null; ca3: TimeRange | null };
    weekend: { ca1: TimeRange | null; ca2: TimeRange | null; ca3: TimeRange | null };
  };
}

interface ShiftSlotRow {
  shift_date: string;
  shift_number: 1 | 2 | 3;
  branch_code: string | null;
  procedure_count: number;
  note: string;
}

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function isWeekend(dateStr: string): boolean {
  const [y, m, d] = dateStr.split('-').map(Number);
  const utcDay = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return utcDay === 0 || utcDay === 6;
}

function getRange(branch: BranchRow, dateStr: string, shiftNumber: 1 | 2 | 3): TimeRange | null {
  const set = isWeekend(dateStr) ? branch.hours.weekend : branch.hours.weekday;
  if (shiftNumber === 1) return set.ca1;
  if (shiftNumber === 2) return set.ca2;
  return set.ca3;
}

function toIcsDateTime(dateStr: string, hhmm: string): string {
  return `${dateStr.replace(/-/g, '')}T${hhmm.replace(':', '')}00`;
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const token = url.searchParams.get('token')?.trim();
  if (!token) {
    return new Response('Missing calendar token', { status: 400 });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return new Response('Server misconfigured', { status: 500 });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const { data: settings, error: settingsErr } = await admin
    .from('app_settings')
    .select('user_id')
    .eq('calendar_token', token)
    .maybeSingle();

  if (settingsErr || !settings) {
    return new Response('Invalid calendar token', { status: 404 });
  }

  const userId = settings.user_id as string;

  const [{ data: branches }, { data: slots }] = await Promise.all([
    admin.from('branches').select('code, address, hours').eq('user_id', userId),
    admin
      .from('shift_slots')
      .select('shift_date, shift_number, branch_code, procedure_count, note')
      .eq('user_id', userId)
      .eq('status', 'KFC')
      .order('shift_date', { ascending: true })
      .order('shift_number', { ascending: true }),
  ]);

  const branchMap = new Map<string, BranchRow>(
    ((branches ?? []) as BranchRow[]).map((b) => [b.code, b]),
  );

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

  for (const slot of (slots ?? []) as ShiftSlotRow[]) {
    if (!slot.branch_code) continue;
    const branch = branchMap.get(slot.branch_code);
    if (!branch) continue;
    const range = getRange(branch, slot.shift_date, slot.shift_number);
    if (!range) continue;

    const uid = `kfc-${slot.shift_date.replace(/-/g, '')}-ca${slot.shift_number}@work-dashboard`;
    const summary = `Khám KFC - ${branch.code} (Ca ${slot.shift_number})`;
    const descParts: string[] = [];
    if (slot.procedure_count > 0) descParts.push(`Thủ thuật: ${slot.procedure_count} ca`);
    if (slot.note?.trim()) descParts.push(slot.note.trim());

    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${uid}`);
    lines.push(`DTSTAMP:${dtStamp}`);
    lines.push(`DTSTART;TZID=Asia/Ho_Chi_Minh:${toIcsDateTime(slot.shift_date, range.start)}`);
    lines.push(`DTEND;TZID=Asia/Ho_Chi_Minh:${toIcsDateTime(slot.shift_date, range.end)}`);
    lines.push(`SUMMARY:${escapeIcsText(summary)}`);
    lines.push(`LOCATION:${escapeIcsText(branch.address)}`);
    if (descParts.length > 0) {
      lines.push(`DESCRIPTION:${escapeIcsText(descParts.join(' | '))}`);
    }
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR', '');

  return new Response(lines.join('\r\n'), {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="kfc-schedule.ics"',
      'Cache-Control': 'no-cache, max-age=0',
    },
  });
});
