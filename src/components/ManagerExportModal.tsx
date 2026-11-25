import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy, Download, X } from 'lucide-react';
import {
  formatShortDateVN,
  getUpcomingWeeks,
  getWeeksForMonth,
  shiftYearMonth,
  todayIsoLocal,
  type WeekBlock,
} from '../domain/calendar';
import { renderManagerGridToCanvas } from '../domain/managerExport';
import type { ShiftSlot } from '../domain/types';

interface ManagerExportModalProps {
  activeYearMonth: string;
  slotsByKey: Map<string, ShiftSlot>;
  onClose: () => void;
}

export function ManagerExportModal({
  activeYearMonth,
  slotsByKey,
  onClose,
}: ManagerExportModalProps) {
  const candidateWeeks = useMemo(() => {
    const map = new Map<string, WeekBlock>();
    for (const w of getWeeksForMonth(activeYearMonth)) map.set(w.mondayStr, w);
    for (const w of getWeeksForMonth(shiftYearMonth(activeYearMonth, 1))) map.set(w.mondayStr, w);
    for (const w of getUpcomingWeeks(todayIsoLocal(), 3)) map.set(w.mondayStr, w);
    return Array.from(map.values()).sort((a, b) => a.mondayStr.localeCompare(b.mondayStr));
  }, [activeYearMonth]);

  const defaultSelected = useMemo(
    () => getUpcomingWeeks(todayIsoLocal(), 3).map((w) => w.mondayStr),
    [],
  );

  const [selectedMondays, setSelectedMondays] = useState<string[]>(defaultSelected);
  const [hideBranchLabels, setHideBranchLabels] = useState(false);
  const [copied, setCopied] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const selectedWeeks = useMemo(
    () => candidateWeeks.filter((w) => selectedMondays.includes(w.mondayStr)),
    [candidateWeeks, selectedMondays],
  );

  useEffect(() => {
    if (!canvasRef.current || selectedWeeks.length === 0) return;
    renderManagerGridToCanvas(canvasRef.current, selectedWeeks, slotsByKey, {
      hideBranchLabels,
    });
  }, [selectedWeeks, slotsByKey, hideBranchLabels]);

  const toggleWeek = (mondayStr: string) => {
    setSelectedMondays((prev) => {
      if (prev.includes(mondayStr)) {
        if (prev.length === 1) return prev;
        return prev.filter((m) => m !== mondayStr);
      }
      if (prev.length >= 3) {
        return [...prev.slice(1), mondayStr].sort();
      }
      return [...prev, mondayStr].sort();
    });
  };

  const handleDownload = () => {
    if (!canvasRef.current) return;
    const url = canvasRef.current.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `lich-xanh-do-${selectedWeeks[0]?.mondayStr ?? 'export'}.png`;
    a.click();
  };

  const handleCopy = async () => {
    if (!canvasRef.current) return;
    canvasRef.current.toBlob(async (blob) => {
      if (!blob) return;
      try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        handleDownload();
      }
    }, 'image/png');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/55 p-0 sm:p-4">
      <div className="w-full max-w-4xl rounded-t-2xl sm:rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92dvh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h3 className="text-base font-bold text-slate-900">Xuất ảnh Lịch Xanh/Đỏ gửi quản lý</h3>
            <p className="text-xs text-slate-500">
              Chọn 1–3 tuần. Ô BV & Nghỉ gộp thành màu Đỏ, Rảnh là màu Xanh lá.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          <div className="flex flex-wrap gap-2">
            {candidateWeeks.map((w) => {
              const active = selectedMondays.includes(w.mondayStr);
              const sun = w.days[6].dateStr;
              return (
                <button
                  key={w.mondayStr}
                  type="button"
                  onClick={() => toggleWeek(w.mondayStr)}
                  className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                    active
                      ? 'border-teal-600 bg-teal-50 text-teal-800'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {formatShortDateVN(w.mondayStr)} – {formatShortDateVN(sun)}
                </button>
              );
            })}
          </div>

          <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={hideBranchLabels}
              onChange={(e) => setHideBranchLabels(e.target.checked)}
              className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
            />
            Ẩn nhãn chi nhánh (ô đã chốt CN1–CN4 cũng chỉ hiện Xanh trơn)
          </label>

          <div className="rounded-xl border border-slate-200 bg-slate-100 p-3 overflow-x-auto flex justify-center">
            <canvas ref={canvasRef} className="max-w-full h-auto shadow-sm rounded" />
          </div>
        </div>

        <div className="px-4 sm:px-5 py-3.5 pb-[calc(0.875rem+env(safe-area-inset-bottom))] sm:pb-3.5 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={handleCopy}
            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 cursor-pointer"
          >
            {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
            {copied ? 'Đã copy ảnh' : 'Copy ảnh'}
          </button>
          <button
            type="button"
            onClick={handleDownload}
            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 rounded-xl bg-teal-700 hover:bg-teal-800 px-4 py-2 text-sm font-semibold text-white cursor-pointer"
          >
            <Download className="h-4 w-4" />
            Tải PNG
          </button>
        </div>
      </div>
    </div>
  );
}
