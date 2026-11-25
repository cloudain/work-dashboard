import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ChevronLeft, ChevronRight, Save, Target, TrendingUp } from 'lucide-react';
import { currentYearMonth, formatMonthVN } from '../domain/calendar';
import {
  computeAnnualStats,
  computeMonthlySummary,
  computeYearSummaries,
  createDefaultMonthConfig,
  formatCompactVND,
  formatVND,
} from '../domain/finance';
import type { AhTask, AppSettings, MonthConfig, ShiftSlot } from '../domain/types';
import { AhTasksPanel } from './AhTasksPanel';

interface FinanceViewProps {
  settings: AppSettings;
  slots: ShiftSlot[];
  monthConfigs: MonthConfig[];
  ahTasks: AhTask[];
  onSaveSettings: (settings: AppSettings) => Promise<void>;
  onUpsertMonthConfig: (config: MonthConfig) => Promise<void>;
  onUpsertAhTask: (task: AhTask) => Promise<void>;
  onDeleteAhTask: (taskId: string) => Promise<void>;
}

const PIE_COLORS = ['#0f766e', '#0284c7', '#7c3aed', '#f59e0b'];

export function FinanceView({
  settings,
  slots,
  monthConfigs,
  ahTasks,
  onSaveSettings,
  onUpsertMonthConfig,
  onUpsertAhTask,
  onDeleteAhTask,
}: FinanceViewProps) {
  const initialYm = currentYearMonth();
  const [selectedYear, setSelectedYear] = useState<number>(Number(initialYm.slice(0, 4)));
  const [selectedMonthIdx, setSelectedMonthIdx] = useState<number>(Number(initialYm.slice(5, 7)));

  const activeYm = `${selectedYear}-${String(selectedMonthIdx).padStart(2, '0')}`;

  const configMap = useMemo(
    () => new Map(monthConfigs.map((c) => [c.yearMonth, c])),
    [monthConfigs],
  );

  const activeConfig = useMemo(
    () => configMap.get(activeYm) ?? createDefaultMonthConfig(activeYm, settings),
    [configMap, activeYm, settings],
  );

  const [draftConfig, setDraftConfig] = useState<MonthConfig>(activeConfig);
  const [draftYm, setDraftYm] = useState<string>(activeYm);
  if (draftYm !== activeYm) {
    setDraftYm(activeYm);
    setDraftConfig(activeConfig);
  }

  const [savingMonth, setSavingMonth] = useState(false);

  const yearSummaries = useMemo(
    () => computeYearSummaries(selectedYear, slots, configMap, ahTasks, settings),
    [selectedYear, slots, configMap, ahTasks, settings],
  );
  const prevYearSummaries = useMemo(
    () => computeYearSummaries(selectedYear - 1, slots, configMap, ahTasks, settings),
    [selectedYear, slots, configMap, ahTasks, settings],
  );

  const activeSummary = useMemo(
    () => computeMonthlySummary(activeYm, slots, activeConfig, ahTasks, settings),
    [activeYm, slots, activeConfig, ahTasks, settings],
  );

  const annualStats = useMemo(
    () => computeAnnualStats(yearSummaries, settings.showHospitalSalary),
    [yearSummaries, settings.showHospitalSalary],
  );
  const prevAnnualStats = useMemo(
    () => computeAnnualStats(prevYearSummaries, settings.showHospitalSalary),
    [prevYearSummaries, settings.showHospitalSalary],
  );

  const pieData = useMemo(
    () =>
      [
        { name: 'Lương ca', value: annualStats.totalShiftIncome },
        { name: 'Com KFC', value: annualStats.totalComIncome },
        { name: 'AH (Viết báo)', value: annualStats.totalAhIncome },
        { name: 'Thưởng', value: annualStats.totalBonusIncome },
      ].filter((d) => d.value > 0),
    [annualStats],
  );

  const goalPct =
    settings.monthlyIncomeGoal && settings.monthlyIncomeGoal > 0
      ? Math.min(100, Math.round((activeSummary.sideTotal / settings.monthlyIncomeGoal) * 100))
      : null;

  const handleSaveMonthConfig = async () => {
    setSavingMonth(true);
    try {
      await onUpsertMonthConfig(draftConfig);
    } finally {
      setSavingMonth(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Top Bar: Year + Month Selector + BV Toggle */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setSelectedYear((y) => y - 1)}
              className="p-2 rounded-xl border border-slate-200 hover:bg-slate-100 cursor-pointer"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[84px] text-center text-base font-bold text-slate-900">
              Năm {selectedYear}
            </span>
            <button
              type="button"
              onClick={() => setSelectedYear((y) => y + 1)}
              className="p-2 rounded-xl border border-slate-200 hover:bg-slate-100 cursor-pointer"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <select
            value={selectedMonthIdx}
            onChange={(e) => setSelectedMonthIdx(Number(e.target.value))}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800"
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                Tháng {m}/{selectedYear}
              </option>
            ))}
          </select>
        </div>

        <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={settings.showHospitalSalary}
            onChange={(e) =>
              onSaveSettings({ ...settings, showHospitalSalary: e.target.checked })
            }
            className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
          />
          Gộp Lương chính thức (BV) vào biểu đồ tổng
        </label>
      </div>

      {/* Selected Month KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2.5 sm:gap-3">
        <div className="col-span-2 lg:col-span-1 rounded-2xl bg-teal-700 text-white p-3.5 sm:p-4 shadow-sm">
          <div className="text-xs text-teal-100">
            Ngoài giờ {formatMonthVN(activeYm)}
          </div>
          <div className="mt-1 text-xl sm:text-2xl font-bold tabular-nums">{formatVND(activeSummary.sideTotal)}</div>
          {goalPct !== null && settings.monthlyIncomeGoal && (
            <div className="mt-2">
              <div className="flex items-center justify-between text-[11px] text-teal-100 mb-1">
                <span className="inline-flex items-center gap-1">
                  <Target className="h-3 w-3" /> Mục tiêu
                </span>
                <span>{goalPct}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-teal-900/50 overflow-hidden">
                <div
                  className="h-full bg-emerald-300 rounded-full"
                  style={{ width: `${goalPct}%` }}
                />
              </div>
            </div>
          )}
        </div>

        <div className="rounded-2xl bg-white border border-slate-200 p-3.5 sm:p-4 shadow-sm">
          <div className="text-xs text-slate-500">
            Lương ca ({activeSummary.clinicLabel})
          </div>
          <div className="mt-1 text-base sm:text-lg font-bold text-slate-900 tabular-nums">
            {formatVND(activeSummary.shiftIncome)}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            {activeSummary.isHistorical
              ? 'Dữ liệu lịch sử'
              : `${activeSummary.kfcShiftsTotal} ca • ${Math.round(activeSummary.payoutRatio * 100)}%`}
          </div>
        </div>

        <div className="rounded-2xl bg-white border border-slate-200 p-3.5 sm:p-4 shadow-sm">
          <div className="text-xs text-slate-500">Com {activeSummary.clinicLabel}</div>
          <div className="mt-1 text-base sm:text-lg font-bold text-sky-700 tabular-nums">
            {formatVND(activeSummary.comIncome)}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            {activeSummary.isHistorical
              ? 'Dữ liệu lịch sử'
              : `${activeSummary.totalProcedures} thủ thuật`}
          </div>
        </div>

        <div className="rounded-2xl bg-white border border-slate-200 p-3.5 sm:p-4 shadow-sm">
          <div className="text-xs text-slate-500">AH (Viết báo)</div>
          <div className="mt-1 text-base sm:text-lg font-bold text-violet-700 tabular-nums">
            {formatVND(activeSummary.ahIncome)}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">Thực nhận trong tháng</div>
        </div>

        <div className="rounded-2xl bg-white border border-slate-200 p-3.5 sm:p-4 shadow-sm">
          <div className="text-xs text-slate-500">Thưởng / Điều chỉnh</div>
          <div className="mt-1 text-base sm:text-lg font-bold text-amber-600 tabular-nums">
            {formatVND(activeSummary.bonusIncome)}
          </div>
          {settings.showHospitalSalary && activeSummary.hospitalSalary !== null && (
            <div className="text-[11px] text-slate-600 mt-0.5 font-medium">
              + BV: {formatVND(activeSummary.hospitalSalary)}
            </div>
          )}
        </div>
      </div>

      {/* Month Reconciliation Panel */}
      <div className="rounded-2xl bg-white border border-slate-200 p-4 sm:p-5 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              Đối soát & Cấu hình {formatMonthVN(activeYm)}
            </h3>
            <p className="text-xs text-slate-500">
              Đơn giá snapshot tháng này: {formatVND(draftConfig.shiftRate)}/ca •{' '}
              {formatVND(draftConfig.procedureRate)}/thủ thuật
            </p>
          </div>
          <button
            type="button"
            disabled={savingMonth}
            onClick={handleSaveMonthConfig}
            className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-50 px-4 py-2 text-xs font-semibold text-white cursor-pointer"
          >
            <Save className="h-3.5 w-3.5" />
            {savingMonth ? 'Đang lưu...' : 'Lưu đối soát tháng'}
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Tỷ lệ thực nhận (%)
            </label>
            <select
              value={String(draftConfig.payoutRatio)}
              onChange={(e) =>
                setDraftConfig({ ...draftConfig, payoutRatio: Number(e.target.value) })
              }
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="1">100% (Nhận đủ)</option>
              <option value="0.9">90% (Khấu trừ 10%)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Điều chỉnh Com KFC (VNĐ)
            </label>
            <input
              type="number"
              step={10000}
              value={draftConfig.procedureAdjustment}
              onChange={(e) =>
                setDraftConfig({
                  ...draftConfig,
                  procedureAdjustment: Number(e.target.value) || 0,
                })
              }
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Thưởng / Điều chỉnh khác (VNĐ)
            </label>
            <input
              type="number"
              step={50000}
              value={draftConfig.bonusAmount}
              onChange={(e) =>
                setDraftConfig({
                  ...draftConfig,
                  bonusAmount: Number(e.target.value) || 0,
                })
              }
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Lương chính thức BV (VNĐ)
            </label>
            <input
              type="number"
              min={0}
              step={100000}
              value={draftConfig.hospitalSalary ?? ''}
              onChange={(e) =>
                setDraftConfig({
                  ...draftConfig,
                  hospitalSalary:
                    e.target.value.trim() === '' ? null : Math.max(0, Number(e.target.value) || 0),
                })
              }
              placeholder="Cập nhật sau..."
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Ghi chú đối soát Com KFC
            </label>
            <input
              type="text"
              value={draftConfig.procedureAdjustmentNote}
              onChange={(e) =>
                setDraftConfig({ ...draftConfig, procedureAdjustmentNote: e.target.value })
              }
              placeholder="Ví dụ: Bổ sung 2 ca thủ thuật quên nhập..."
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Ghi chú Thưởng / Điều chỉnh
            </label>
            <input
              type="text"
              value={draftConfig.bonusNote}
              onChange={(e) => setDraftConfig({ ...draftConfig, bonusNote: e.target.value })}
              placeholder="Ví dụ: Chị Thanh thưởng thêm..."
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
        </div>
      </div>

      {/* AH Tasks Panel */}
      <AhTasksPanel
        tasks={ahTasks}
        defaultMonth={activeYm}
        onUpsertTask={onUpsertAhTask}
        onDeleteTask={onDeleteAhTask}
      />

      {/* Annual Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-2xl bg-white border border-slate-200 p-4 sm:p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-teal-700" />
              Biểu đồ thu nhập năm {selectedYear}
            </h3>
            {prevAnnualStats.totalSideIncome > 0 && (
              <span className="text-xs text-slate-500">
                Năm {selectedYear - 1}: {formatCompactVND(prevAnnualStats.totalSideIncome)}
              </span>
            )}
          </div>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={yearSummaries}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis
                  tickFormatter={(v) => formatCompactVND(Number(v))}
                  tick={{ fontSize: 11 }}
                  width={56}
                />
                <Tooltip formatter={(value) => formatVND(Number(value))} />
                {settings.monthlyIncomeGoal && (
                  <ReferenceLine
                    y={settings.monthlyIncomeGoal}
                    stroke="#ef4444"
                    strokeDasharray="4 4"
                    label={{ value: 'Mục tiêu', fill: '#ef4444', fontSize: 11 }}
                  />
                )}
                <Bar dataKey="shiftIncome" name="Lương ca" stackId="a" fill="#0f766e" />
                <Bar dataKey="comIncome" name="Com KFC" stackId="a" fill="#0284c7" />
                <Bar dataKey="ahIncome" name="AH" stackId="a" fill="#7c3aed" />
                <Bar dataKey="bonusIncome" name="Thưởng" stackId="a" fill="#f59e0b" />
                {settings.showHospitalSalary && (
                  <Bar
                    dataKey="hospitalSalary"
                    name="Lương BV"
                    stackId="a"
                    fill="#64748b"
                  />
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl bg-white border border-slate-200 p-4 sm:p-5 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-900 mb-1">Cơ cấu nguồn thu {selectedYear}</h3>
            <p className="text-xs text-slate-500">
              Tổng ngoài giờ: <span className="font-bold text-slate-900">{formatVND(annualStats.totalSideIncome)}</span>
            </p>
          </div>

          <div className="h-48 w-full my-2">
            {pieData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">
                Chưa có dữ liệu năm {selectedYear}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={72}
                    paddingAngle={2}
                  >
                    {pieData.map((_, index) => (
                      <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => formatVND(Number(value))} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-600">Lương ca</span>
              <span className="font-bold">{annualStats.shareShiftPct.toFixed(1)}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Com KFC</span>
              <span className="font-bold">{annualStats.shareComPct.toFixed(1)}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">AH (Viết báo)</span>
              <span className="font-bold">{annualStats.shareAhPct.toFixed(1)}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Thưởng</span>
              <span className="font-bold">{annualStats.shareBonusPct.toFixed(1)}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Full Annual Table */}
      <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
          <h3 className="text-sm font-bold text-slate-900">
            Bảng tổng hợp thu nhập năm {selectedYear}
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-right min-w-[640px]">
            <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
              <tr>
                <th className="sticky left-0 z-10 bg-slate-50 text-left px-3 sm:px-4 py-2.5 font-semibold shadow-[1px_0_0_rgba(226,232,240,1)]">
                  Tháng
                </th>
                <th className="px-3 py-2.5 font-semibold">Lương ca</th>
                <th className="px-3 py-2.5 font-semibold">Com KFC</th>
                <th className="px-3 py-2.5 font-semibold">AH</th>
                <th className="px-3 py-2.5 font-semibold">Thưởng</th>
                <th className="px-4 py-2.5 font-semibold">Tổng ngoài giờ</th>
                {settings.showHospitalSalary && (
                  <th className="px-4 py-2.5 font-semibold">Tổng + BV</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {yearSummaries.map((row) => (
                <tr
                  key={row.yearMonth}
                  onClick={() => setSelectedMonthIdx(row.monthIndex)}
                  className={`cursor-pointer hover:bg-teal-50/40 ${
                    row.yearMonth === activeYm ? 'bg-teal-50/70 font-semibold' : ''
                  }`}
                >
                  <td
                    className={`sticky left-0 z-10 text-left px-3 sm:px-4 py-2 font-semibold text-slate-800 shadow-[1px_0_0_rgba(241,245,249,1)] ${
                      row.yearMonth === activeYm ? 'bg-teal-50' : 'bg-white'
                    }`}
                  >
                    {row.label}{' '}
                    {row.isHistorical && (
                      <span className="ml-1 text-[10px] rounded bg-slate-100 px-1.5 py-0.5 text-slate-500">
                        {row.clinicLabel}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">{formatVND(row.shiftIncome)}</td>
                  <td className="px-3 py-2">{formatVND(row.comIncome)}</td>
                  <td className="px-3 py-2">{formatVND(row.ahIncome)}</td>
                  <td className="px-3 py-2">{formatVND(row.bonusIncome)}</td>
                  <td className="px-4 py-2 font-bold text-teal-700">{formatVND(row.sideTotal)}</td>
                  {settings.showHospitalSalary && (
                    <td className="px-4 py-2 font-bold text-slate-800">
                      {formatVND(row.grandTotal)}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-slate-50 border-t-2 border-slate-200 font-bold text-slate-900">
              <tr>
                <td className="sticky left-0 z-10 bg-slate-50 text-left px-3 sm:px-4 py-2.5 shadow-[1px_0_0_rgba(226,232,240,1)]">
                  Tổng cộng
                </td>
                <td className="px-3 py-2.5">{formatVND(annualStats.totalShiftIncome)}</td>
                <td className="px-3 py-2.5">{formatVND(annualStats.totalComIncome)}</td>
                <td className="px-3 py-2.5">{formatVND(annualStats.totalAhIncome)}</td>
                <td className="px-3 py-2.5">{formatVND(annualStats.totalBonusIncome)}</td>
                <td className="px-4 py-2.5 text-teal-800">{formatVND(annualStats.totalSideIncome)}</td>
                {settings.showHospitalSalary && (
                  <td className="px-4 py-2.5">{formatVND(annualStats.totalGrandIncome)}</td>
                )}
              </tr>
              <tr className="text-slate-600 font-semibold">
                <td className="sticky left-0 z-10 bg-slate-50 text-left px-3 sm:px-4 py-2 shadow-[1px_0_0_rgba(226,232,240,1)]">
                  Trung bình (tháng &gt; 0)
                </td>
                <td className="px-3 py-2">{formatVND(annualStats.avgShiftIncome)}</td>
                <td className="px-3 py-2">{formatVND(annualStats.avgComIncome)}</td>
                <td className="px-3 py-2">{formatVND(annualStats.avgAhIncome)}</td>
                <td className="px-3 py-2">{formatVND(annualStats.avgBonusIncome)}</td>
                <td className="px-4 py-2">{formatVND(annualStats.avgSideIncome)}</td>
                {settings.showHospitalSalary && (
                  <td className="px-4 py-2">{formatVND(annualStats.avgGrandIncome)}</td>
                )}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
