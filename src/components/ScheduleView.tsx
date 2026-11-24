import { useMemo, useState } from 'react';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Download,
  Image as ImageIcon,
  Minus,
  Plus,
} from 'lucide-react';
import {
  currentYearMonth,
  formatDateVN,
  formatMonthVN,
  formatShortDateVN,
  getWeeksForMonth,
  shiftYearMonth,
  slotKey,
  todayIsoLocal,
} from '../domain/calendar';
import { computeMonthlySummary, formatVND } from '../domain/finance';
import { generateIcsContent } from '../domain/ics';
import type {
  AhTask,
  AppSettings,
  Branch,
  MonthConfig,
  ShiftNumber,
  ShiftSlot,
  ShiftStatus,
} from '../domain/types';
import { ManagerExportModal } from './ManagerExportModal';
import { ShiftEditorModal } from './ShiftEditorModal';

interface ScheduleViewProps {
  settings: AppSettings;
  branches: Branch[];
  slots: ShiftSlot[];
  monthConfigs: MonthConfig[];
  ahTasks: AhTask[];
  onUpsertSlot: (slot: ShiftSlot) => Promise<void>;
  onDeleteSlot: (shiftDate: string, shiftNumber: ShiftNumber) => Promise<void>;
  onBulkUpsertSlots: (slots: ShiftSlot[]) => Promise<void>;
  onBulkDeleteDay: (shiftDate: string) => Promise<void>;
}

const STATUS_STYLE: Record<ShiftStatus, string> = {
  BV: 'bg-rose-100 border-rose-300 text-rose-800',
  NGHI: 'bg-amber-50 border-amber-300 text-amber-800',
  RANH: 'bg-lime-100 border-lime-400 text-lime-900',
  KFC: 'bg-emerald-50 border-emerald-400 text-emerald-950',
};

export function ScheduleView({
  settings,
  branches,
  slots,
  monthConfigs,
  ahTasks,
  onUpsertSlot,
  onDeleteSlot,
  onBulkUpsertSlots,
  onBulkDeleteDay,
}: ScheduleViewProps) {
  const [activeMonth, setActiveMonth] = useState<string>(currentYearMonth());
  const [editingCell, setEditingCell] = useState<{ dateStr: string; shiftNumber: ShiftNumber } | null>(
    null,
  );
  const [quickDay, setQuickDay] = useState<string | null>(null);
  const [showManagerExport, setShowManagerExport] = useState(false);

  const today = todayIsoLocal();
  const weeks = useMemo(() => getWeeksForMonth(activeMonth), [activeMonth]);
  const slotsByKey = useMemo(
    () => new Map(slots.map((s) => [slotKey(s.shiftDate, s.shiftNumber), s])),
    [slots],
  );
  const branchMap = useMemo(() => new Map(branches.map((b) => [b.code, b])), [branches]);
  const monthConfig = useMemo(
    () => monthConfigs.find((c) => c.yearMonth === activeMonth),
    [monthConfigs, activeMonth],
  );

  const summary = useMemo(
    () => computeMonthlySummary(activeMonth, slots, monthConfig, ahTasks, settings),
    [activeMonth, slots, monthConfig, ahTasks, settings],
  );

  const handleQuickProcedure = async (slot: ShiftSlot, delta: number) => {
    const next = Math.max(0, slot.procedureCount + delta);
    if (next === slot.procedureCount) return;
    await onUpsertSlot({ ...slot, procedureCount: next });
  };

  const handleFillDay = async (dateStr: string, status: 'BV' | 'NGHI' | 'RANH') => {
    const daySlots: ShiftSlot[] = ([1, 2, 3] as const).map((shiftNumber) => ({
      shiftDate: dateStr,
      shiftNumber,
      status,
      branchCode: null,
      procedureCount: 0,
      note: '',
    }));
    await onBulkUpsertSlots(daySlots);
    setQuickDay(null);
  };

  const handleDownloadIcs = () => {
    const content = generateIcsContent(slots, branches);
    const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kfc-lich-${activeMonth}.ics`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* Header Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveMonth((m) => shiftYearMonth(m, -1))}
            className="p-2 rounded-xl border border-slate-200 hover:bg-slate-100 cursor-pointer"
            aria-label="Tháng trước"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="min-w-[140px] text-center">
            <div className="text-base font-bold text-slate-900">{formatMonthVN(activeMonth)}</div>
            <div className="text-[11px] text-slate-500">Kỳ chốt theo ngày dương lịch</div>
          </div>
          <button
            type="button"
            onClick={() => setActiveMonth((m) => shiftYearMonth(m, 1))}
            className="p-2 rounded-xl border border-slate-200 hover:bg-slate-100 cursor-pointer"
            aria-label="Tháng sau"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setActiveMonth(currentYearMonth())}
            className="ml-1 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer"
          >
            Hôm nay
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowManagerExport(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-teal-700 hover:bg-teal-800 px-3.5 py-2 text-xs sm:text-sm font-semibold text-white cursor-pointer shadow-sm"
          >
            <ImageIcon className="h-4 w-4" />
            Xuất ảnh gửi sếp
          </button>
          <button
            type="button"
            onClick={handleDownloadIcs}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 px-3 py-2 text-xs sm:text-sm font-semibold text-slate-700 cursor-pointer"
          >
            <Download className="h-4 w-4" />
            Tải .ics
          </button>
        </div>
      </div>

      {/* Month Quick Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-2xl bg-white border border-slate-200 p-3.5 shadow-sm">
          <div className="text-xs text-slate-500">Tổng ca KFC ({formatMonthVN(activeMonth)})</div>
          <div className="mt-1 text-xl font-bold text-slate-900">{summary.kfcShiftsTotal} ca</div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {branches
              .filter((b) => b.isActive)
              .map((b) => (
                <span
                  key={b.code}
                  className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-700"
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: b.color }}
                  />
                  {b.code}: {summary.kfcShiftsByBranch[b.code] ?? 0}
                </span>
              ))}
          </div>
        </div>

        <div className="rounded-2xl bg-white border border-slate-200 p-3.5 shadow-sm">
          <div className="text-xs text-slate-500">Thủ thuật (Com KFC)</div>
          <div className="mt-1 text-xl font-bold text-slate-900">{summary.totalProcedures} ca</div>
          <div className="mt-1 text-xs font-medium text-teal-700">
            {formatVND(summary.comIncome)}
          </div>
        </div>

        <div className="rounded-2xl bg-white border border-slate-200 p-3.5 shadow-sm">
          <div className="text-xs text-slate-500">Tạm tính KFC tháng</div>
          <div className="mt-1 text-xl font-bold text-teal-700">
            {formatVND(summary.shiftIncome + summary.comIncome)}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            Thực nhận {Math.round(summary.payoutRatio * 100)}% lương ca
          </div>
        </div>

        <div className="rounded-2xl bg-white border border-slate-200 p-3.5 shadow-sm">
          <div className="text-xs text-slate-500">Trạng thái khác</div>
          <div className="mt-1.5 flex flex-wrap gap-1.5 text-xs font-semibold">
            <span className="rounded-lg bg-rose-50 text-rose-700 px-2 py-0.5">
              BV: {summary.bvShifts}
            </span>
            <span className="rounded-lg bg-amber-50 text-amber-800 px-2 py-0.5">
              Nghỉ: {summary.nghiShifts}
            </span>
            <span className="rounded-lg bg-lime-50 text-lime-800 px-2 py-0.5">
              Rảnh chưa xếp: {summary.ranhUnscheduledShifts}
            </span>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 px-1">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded bg-rose-200 border border-rose-400" /> BV
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded bg-amber-100 border border-amber-400" /> Nghỉ
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded bg-lime-200 border border-lime-500" /> Rảnh (ĐK làm thêm)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded bg-emerald-200 border border-emerald-500" /> Chốt KFC (CN1–CN4)
          </span>
        </div>
        <span className="text-[11px] text-slate-400">
          Mẹo: Chạm tiêu đề ngày để tô nhanh cả ngày
        </span>
      </div>

      {/* Weekly Grids */}
      <div className="space-y-4">
        {weeks.map((week, idx) => (
          <div
            key={week.mondayStr}
            className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden"
          >
            <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <CalendarIcon className="h-3.5 w-3.5 text-teal-700" />
                Tuần {idx + 1}: {formatShortDateVN(week.mondayStr)} –{' '}
                {formatShortDateVN(week.days[6].dateStr)}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] border-collapse table-fixed">
                <thead>
                  <tr>
                    <th className="w-16 bg-amber-50 border-b border-r border-slate-200 py-2 text-xs font-bold text-slate-700">
                      Ca
                    </th>
                    {week.days.map((day) => {
                      const isToday = day.dateStr === today;
                      return (
                        <th
                          key={day.dateStr}
                          className={`border-b border-r last:border-r-0 border-slate-200 p-1.5 text-center relative ${
                            !day.inTargetMonth ? 'bg-slate-100/70 opacity-60' : 'bg-sky-50/70'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() =>
                              setQuickDay((cur) => (cur === day.dateStr ? null : day.dateStr))
                            }
                            className={`w-full rounded-lg py-1 px-1 hover:bg-sky-100/80 transition cursor-pointer ${
                              isToday ? 'ring-2 ring-teal-600 bg-teal-50' : ''
                            }`}
                          >
                            <div className="text-xs font-bold text-slate-800">{day.dayLabel}</div>
                            <div className="text-[11px] font-medium text-slate-500">
                              {formatShortDateVN(day.dateStr)}
                            </div>
                          </button>

                          {quickDay === day.dateStr && (
                            <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1 z-30 w-36 rounded-xl bg-white shadow-xl border border-slate-200 p-1.5 space-y-1 text-left">
                              <div className="px-2 py-0.5 text-[10px] font-bold text-slate-400 uppercase">
                                Tô cả ngày {formatShortDateVN(day.dateStr)}
                              </div>
                              <button
                                type="button"
                                onClick={() => handleFillDay(day.dateStr, 'BV')}
                                className="w-full text-left rounded-lg px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50 cursor-pointer"
                              >
                                Tất cả: BV
                              </button>
                              <button
                                type="button"
                                onClick={() => handleFillDay(day.dateStr, 'NGHI')}
                                className="w-full text-left rounded-lg px-2 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-50 cursor-pointer"
                              >
                                Tất cả: Nghỉ
                              </button>
                              <button
                                type="button"
                                onClick={() => handleFillDay(day.dateStr, 'RANH')}
                                className="w-full text-left rounded-lg px-2 py-1 text-xs font-semibold text-lime-800 hover:bg-lime-50 cursor-pointer"
                              >
                                Tất cả: Rảnh
                              </button>
                              <button
                                type="button"
                                onClick={async () => {
                                  await onBulkDeleteDay(day.dateStr);
                                  setQuickDay(null);
                                }}
                                className="w-full text-left rounded-lg px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100 cursor-pointer"
                              >
                                Xoá cả ngày
                              </button>
                            </div>
                          )}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {([1, 2, 3] as const).map((shiftNumber) => (
                    <tr key={shiftNumber}>
                      <td className="bg-amber-50/70 border-b last:border-b-0 border-r border-slate-200 text-center text-xs font-bold text-slate-700 py-3">
                        Ca {shiftNumber}
                      </td>
                      {week.days.map((day) => {
                        const slot = slotsByKey.get(slotKey(day.dateStr, shiftNumber));
                        const branch = slot?.branchCode ? branchMap.get(slot.branchCode) : undefined;
                        return (
                          <td
                            key={day.dateStr}
                            className={`border-b last:border-b-0 border-r last:border-r-0 border-slate-200 p-1 align-top h-[74px] ${
                              !day.inTargetMonth ? 'bg-slate-50/80 opacity-60' : ''
                            }`}
                          >
                            {!slot ? (
                              <button
                                type="button"
                                onClick={() =>
                                  setEditingCell({ dateStr: day.dateStr, shiftNumber })
                                }
                                className="w-full h-full min-h-[64px] rounded-xl border border-dashed border-slate-200 hover:border-teal-400 hover:bg-teal-50/40 flex items-center justify-center text-slate-300 hover:text-teal-600 transition cursor-pointer"
                                title={`Chọn ${formatDateVN(day.dateStr)} Ca ${shiftNumber}`}
                              >
                                <Plus className="h-4 w-4" />
                              </button>
                            ) : (
                              <div
                                className={`w-full h-full min-h-[64px] rounded-xl border p-1.5 flex flex-col justify-between transition ${
                                  STATUS_STYLE[slot.status]
                                }`}
                              >
                                <button
                                  type="button"
                                  onClick={() =>
                                    setEditingCell({ dateStr: day.dateStr, shiftNumber })
                                  }
                                  className="w-full text-left flex items-center justify-between gap-1 cursor-pointer"
                                >
                                  <span className="text-xs font-bold flex items-center gap-1 truncate">
                                    {slot.status === 'KFC' && branch && (
                                      <span
                                        className="h-2 w-2 rounded-full shrink-0"
                                        style={{ backgroundColor: branch.color }}
                                      />
                                    )}
                                    {slot.status === 'KFC'
                                      ? slot.branchCode
                                      : slot.status === 'BV'
                                        ? 'BV'
                                        : slot.status === 'NGHI'
                                          ? 'Nghỉ'
                                          : 'Rảnh'}
                                  </span>
                                  {slot.note && (
                                    <span className="h-1.5 w-1.5 rounded-full bg-slate-500 shrink-0" />
                                  )}
                                </button>

                                {slot.status === 'KFC' && (
                                  <div className="flex items-center justify-between bg-white/80 rounded-lg px-1 py-0.5 border border-emerald-200">
                                    <button
                                      type="button"
                                      onClick={() => handleQuickProcedure(slot, -1)}
                                      className="p-0.5 text-slate-600 hover:text-slate-900 cursor-pointer"
                                      title="Giảm 1 thủ thuật"
                                    >
                                      <Minus className="h-3 w-3" />
                                    </button>
                                    <span className="text-[11px] font-bold text-slate-800">
                                      TT: {slot.procedureCount}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => handleQuickProcedure(slot, 1)}
                                      className="p-0.5 text-slate-600 hover:text-slate-900 cursor-pointer"
                                      title="Thêm 1 thủ thuật"
                                    >
                                      <Plus className="h-3 w-3" />
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>

      {editingCell && (
        <ShiftEditorModal
          shiftDate={editingCell.dateStr}
          shiftNumber={editingCell.shiftNumber}
          existingSlot={slotsByKey.get(slotKey(editingCell.dateStr, editingCell.shiftNumber))}
          branches={branches}
          procedureRate={monthConfig?.procedureRate ?? settings.defaultProcedureRate}
          onSave={onUpsertSlot}
          onDelete={() => onDeleteSlot(editingCell.dateStr, editingCell.shiftNumber)}
          onClose={() => setEditingCell(null)}
        />
      )}

      {showManagerExport && (
        <ManagerExportModal
          activeYearMonth={activeMonth}
          slotsByKey={slotsByKey}
          onClose={() => setShowManagerExport(false)}
        />
      )}
    </div>
  );
}
