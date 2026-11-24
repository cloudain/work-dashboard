import { formatDateVN, slotKey, type WeekBlock } from './calendar';
import type { ShiftSlot } from './types';

export interface ManagerCellStyle {
  fill: string;
  text: string;
  textColor: string;
}

export function projectCellForManager(
  slot: ShiftSlot | undefined,
  hideBranchLabels: boolean,
): ManagerCellStyle {
  if (!slot) {
    return { fill: '#FFFFFF', text: '', textColor: '#1E293B' };
  }
  if (slot.status === 'BV' || slot.status === 'NGHI') {
    return { fill: '#E06666', text: '', textColor: '#FFFFFF' };
  }
  if (slot.status === 'RANH') {
    return { fill: '#B6D7A8', text: '', textColor: '#1E293B' };
  }
  // Confirmed KFC shift
  if (hideBranchLabels) {
    return { fill: '#B6D7A8', text: '', textColor: '#1E293B' };
  }
  return {
    fill: '#6AA84F',
    text: slot.branchCode ?? 'KFC',
    textColor: '#FFFFFF',
  };
}

export function renderManagerGridToCanvas(
  canvas: HTMLCanvasElement,
  weeks: WeekBlock[],
  slotsByKey: Map<string, ShiftSlot>,
  options: { hideBranchLabels: boolean },
): void {
  const dpr = 2;
  const labelColW = 86;
  const dayColW = 104;
  const dayHeaderH = 34;
  const dateHeaderH = 30;
  const shiftRowH = 38;
  const weekH = dayHeaderH + dateHeaderH + shiftRowH * 3;
  const padding = 12;

  const logicalW = padding * 2 + labelColW + dayColW * 7;
  const logicalH = padding * 2 + Math.max(1, weeks.length) * weekH;

  canvas.width = logicalW * dpr;
  canvas.height = logicalH * dpr;
  canvas.style.width = `${logicalW}px`;
  canvas.style.height = `${logicalH}px`;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.scale(dpr, dpr);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, logicalW, logicalH);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const drawBox = (
    x: number,
    y: number,
    w: number,
    h: number,
    fill: string,
    text: string,
    textColor = '#0F172A',
    font = '600 13px Inter, Arial, sans-serif',
  ) => {
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#1E293B';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w, h);
    if (text) {
      ctx.fillStyle = textColor;
      ctx.font = font;
      ctx.fillText(text, x + w / 2, y + h / 2);
    }
  };

  weeks.forEach((week, wIdx) => {
    const startY = padding + wIdx * weekH;
    const startX = padding;

    // Top-left blank cells for day/date rows
    drawBox(startX, startY, labelColW, dayHeaderH, '#F8FAFC', '');
    drawBox(startX, startY + dayHeaderH, labelColW, dateHeaderH, '#F8FAFC', '');

    // Day & Date headers
    week.days.forEach((day, dIdx) => {
      const cx = startX + labelColW + dIdx * dayColW;
      drawBox(
        cx,
        startY,
        dayColW,
        dayHeaderH,
        '#A4C2F4',
        day.dayLabel,
        '#0F172A',
        '700 14px Inter, Arial, sans-serif',
      );
      drawBox(
        cx,
        startY + dayHeaderH,
        dayColW,
        dateHeaderH,
        '#D9D2E9',
        formatDateVN(day.dateStr),
        '#0F172A',
        '600 12px Inter, Arial, sans-serif',
      );
    });

    // Shift rows (Ca 1, Ca 2, Ca 3)
    ([1, 2, 3] as const).forEach((shiftNum, sIdx) => {
      const ry = startY + dayHeaderH + dateHeaderH + sIdx * shiftRowH;
      drawBox(
        startX,
        ry,
        labelColW,
        shiftRowH,
        '#FFD966',
        `Ca ${shiftNum}`,
        '#0F172A',
        '700 13px Inter, Arial, sans-serif',
      );

      week.days.forEach((day, dIdx) => {
        const cx = startX + labelColW + dIdx * dayColW;
        const slot = slotsByKey.get(slotKey(day.dateStr, shiftNum));
        const cell = projectCellForManager(slot, options.hideBranchLabels);
        drawBox(
          cx,
          ry,
          dayColW,
          shiftRowH,
          cell.fill,
          cell.text,
          cell.textColor,
          '700 13px Inter, Arial, sans-serif',
        );
      });
    });
  });
}
