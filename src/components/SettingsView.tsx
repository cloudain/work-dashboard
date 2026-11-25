import { useState, type ChangeEvent } from 'react';
import {
  Building2,
  CalendarSync,
  Check,
  Copy,
  Download,
  FileSpreadsheet,
  LogOut,
  Plus,
  RefreshCw,
  Save,
  Upload,
} from 'lucide-react';
import { createBackupPayload, parseBackupJson, parseHistoricalExcelBuffer } from '../domain/excelImport';
import { formatVND, generateCalendarToken } from '../domain/finance';
import { generateIcsContent } from '../domain/ics';
import type {
  AhTask,
  AppSettings,
  BackupPayload,
  Branch,
  MonthConfig,
  ShiftHoursSet,
  ShiftSlot,
  TimeRange,
} from '../domain/types';
import { getCalendarFeedUrl } from '../lib/supabase';

interface SettingsViewProps {
  settings: AppSettings;
  branches: Branch[];
  slots: ShiftSlot[];
  monthConfigs: MonthConfig[];
  ahTasks: AhTask[];
  isCloudMode: boolean;
  userEmail: string | null;
  onSaveSettings: (settings: AppSettings) => Promise<void>;
  onUpsertBranch: (branch: Branch) => Promise<void>;
  onBulkUpsertMonthConfigs: (configs: MonthConfig[]) => Promise<void>;
  onRestoreBackup: (payload: BackupPayload) => Promise<void>;
  onSignOut: () => Promise<void>;
}

function ShiftTimeEditor({
  label,
  value,
  onChange,
}: {
  label: string;
  value: TimeRange | null;
  onChange: (next: TimeRange | null) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="font-medium text-slate-600 w-10 shrink-0">{label}</span>
      {value ? (
        <div className="flex flex-wrap items-center gap-1.5 flex-1">
          <input
            type="time"
            value={value.start}
            onChange={(e) => onChange({ ...value, start: e.target.value })}
            className="rounded-lg border border-slate-300 px-2 py-1 text-xs"
          />
          <span>–</span>
          <input
            type="time"
            value={value.end}
            onChange={(e) => onChange({ ...value, end: e.target.value })}
            className="rounded-lg border border-slate-300 px-2 py-1 text-xs"
          />
          <button
            type="button"
            onClick={() => onChange(null)}
            className="ml-auto text-[11px] text-rose-600 hover:underline cursor-pointer"
          >
            Tắt ca
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between flex-1">
          <span className="text-slate-400 italic">Không hoạt động</span>
          <button
            type="button"
            onClick={() => onChange({ start: '13:00', end: '17:00' })}
            className="text-[11px] font-semibold text-teal-700 hover:underline cursor-pointer"
          >
            Bật ca
          </button>
        </div>
      )}
    </div>
  );
}

export function SettingsView({
  settings,
  branches,
  slots,
  monthConfigs,
  ahTasks,
  isCloudMode,
  userEmail,
  onSaveSettings,
  onUpsertBranch,
  onBulkUpsertMonthConfigs,
  onRestoreBackup,
  onSignOut,
}: SettingsViewProps) {
  const [draftSettings, setDraftSettings] = useState<AppSettings>(settings);
  const [savingSettings, setSavingSettings] = useState(false);
  const [copiedFeed, setCopiedFeed] = useState(false);

  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);

  const [excelPreview, setExcelPreview] = useState<MonthConfig[] | null>(null);
  const [excelWarnings, setExcelWarnings] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const feedUrl = getCalendarFeedUrl(settings.calendarToken);

  const handleSaveDefaults = async () => {
    setSavingSettings(true);
    try {
      await onSaveSettings(draftSettings);
      setStatusMessage('Đã lưu cấu hình đơn giá & mục tiêu.');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleRegenerateToken = async () => {
    const next = { ...settings, calendarToken: generateCalendarToken() };
    setDraftSettings(next);
    await onSaveSettings(next);
    setStatusMessage('Đã tạo mới token Calendar feed.');
  };

  const handleCopyFeed = async () => {
    if (!feedUrl) return;
    await navigator.clipboard.writeText(feedUrl);
    setCopiedFeed(true);
    setTimeout(() => setCopiedFeed(false), 2000);
  };

  const handleDownloadFullIcs = () => {
    const content = generateIcsContent(slots, branches);
    const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'kfc-all-shifts.ics';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExcelFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const buffer = await file.arrayBuffer();
    const { months, warnings } = parseHistoricalExcelBuffer(buffer, settings);
    setExcelPreview(months);
    setExcelWarnings(warnings);
    e.target.value = '';
  };

  const handleConfirmExcelImport = async () => {
    if (!excelPreview || excelPreview.length === 0) return;
    setImporting(true);
    try {
      await onBulkUpsertMonthConfigs(excelPreview);
      setStatusMessage(`Đã import thành công ${excelPreview.length} tháng lịch sử!`);
      setExcelPreview(null);
      setExcelWarnings([]);
    } finally {
      setImporting(false);
    }
  };

  const handleExportJson = () => {
    const payload = createBackupPayload({
      settings,
      branches,
      slots,
      monthConfigs,
      ahTasks,
    });
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `work-dashboard-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleRestoreJson = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const payload = parseBackupJson(text);
      await onRestoreBackup(payload);
      setStatusMessage('Đã khôi phục toàn bộ dữ liệu từ file backup JSON.');
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : 'Lỗi đọc file JSON.');
    } finally {
      e.target.value = '';
    }
  };

  const updateBranchHours = (
    branch: Branch,
    dayType: 'weekday' | 'weekend',
    shiftKey: keyof ShiftHoursSet,
    range: TimeRange | null,
  ): Branch => ({
    ...branch,
    hours: {
      ...branch.hours,
      [dayType]: {
        ...branch.hours[dayType],
        [shiftKey]: range,
      },
    },
  });

  return (
    <div className="space-y-5">
      {statusMessage && (
        <div className="rounded-xl bg-teal-50 border border-teal-200 px-4 py-2.5 text-xs font-semibold text-teal-900 flex items-center justify-between">
          <span>{statusMessage}</span>
          <button
            type="button"
            onClick={() => setStatusMessage(null)}
            className="text-teal-700 underline cursor-pointer"
          >
            Đóng
          </button>
        </div>
      )}

      {/* 1. Default Rates & Goal */}
      <div className="rounded-2xl bg-white border border-slate-200 p-4 sm:p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
          <div>
            <h3 className="text-base font-bold text-slate-900">Đơn giá mặc định & Mục tiêu</h3>
            <p className="text-xs text-slate-500">
              Áp dụng cho các tháng mới tạo; các tháng cũ giữ nguyên snapshot đã chốt.
            </p>
          </div>
          <button
            type="button"
            disabled={savingSettings}
            onClick={handleSaveDefaults}
            className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl bg-teal-700 hover:bg-teal-800 px-4 py-2 text-xs font-semibold text-white cursor-pointer self-start sm:self-auto"
          >
            <Save className="h-3.5 w-3.5" />
            Lưu cài đặt
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Đơn giá 1 ca KFC (VNĐ)
            </label>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              step={10000}
              value={draftSettings.defaultShiftRate}
              onChange={(e) =>
                setDraftSettings({
                  ...draftSettings,
                  defaultShiftRate: Number(e.target.value) || 0,
                })
              }
              className="min-h-[40px] w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Com KFC / thủ thuật (VNĐ)
            </label>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              step={5000}
              value={draftSettings.defaultProcedureRate}
              onChange={(e) =>
                setDraftSettings({
                  ...draftSettings,
                  defaultProcedureRate: Number(e.target.value) || 0,
                })
              }
              className="min-h-[40px] w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Tỷ lệ thực nhận mặc định
            </label>
            <select
              value={String(draftSettings.defaultPayoutRatio)}
              onChange={(e) =>
                setDraftSettings({
                  ...draftSettings,
                  defaultPayoutRatio: Number(e.target.value),
                })
              }
              className="min-h-[40px] w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="1">100%</option>
              <option value="0.9">90%</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Mục tiêu ngoài giờ / tháng (VNĐ)
            </label>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              step={500000}
              value={draftSettings.monthlyIncomeGoal ?? ''}
              onChange={(e) =>
                setDraftSettings({
                  ...draftSettings,
                  monthlyIncomeGoal:
                    e.target.value.trim() === '' ? null : Number(e.target.value) || 0,
                })
              }
              placeholder="Ví dụ: 10000000"
              className="min-h-[40px] w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
        </div>
      </div>

      {/* 2. Branches & Operating Hours */}
      <div className="rounded-2xl bg-white border border-slate-200 p-4 sm:p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Building2 className="h-4 w-4 text-teal-700" />
              Chi nhánh & Khung giờ hoạt động
            </h3>
            <p className="text-xs text-slate-500">
              Dùng để đối chiếu giờ hợp lệ và đồng bộ địa chỉ sang Google/Apple Calendar.
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              setEditingBranch({
                id: `branch-${Date.now()}`,
                code: `CN${branches.length + 1}`,
                name: `Chi nhánh ${branches.length + 1}`,
                address: '',
                color: '#0d9488',
                isActive: true,
                sortOrder: branches.length + 1,
                hours: {
                  weekday: {
                    ca1: { start: '08:00', end: '11:30' },
                    ca2: { start: '13:00', end: '17:00' },
                    ca3: { start: '17:00', end: '21:00' },
                  },
                  weekend: {
                    ca1: { start: '08:00', end: '11:30' },
                    ca2: { start: '13:00', end: '17:00' },
                    ca3: { start: '17:00', end: '20:30' },
                  },
                },
              })
            }
            className="min-h-[40px] inline-flex items-center gap-1 rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer self-start sm:self-auto"
          >
            <Plus className="h-3.5 w-3.5" />
            Thêm chi nhánh
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {branches.map((b) => (
            <div
              key={b.id}
              className="rounded-xl border border-slate-200 p-3.5 flex flex-col justify-between gap-2"
            >
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: b.color }}
                    />
                    <span className="font-bold text-sm text-slate-900">
                      {b.code} — {b.name}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditingBranch(b)}
                    className="min-h-[36px] px-2 text-xs font-semibold text-teal-700 hover:underline cursor-pointer"
                  >
                    Chỉnh sửa
                  </button>
                </div>
                <p className="text-xs text-slate-500 mt-1">{b.address || 'Chưa có địa chỉ'}</p>
              </div>
              <div className="text-[11px] text-slate-600 bg-slate-50 rounded-lg p-2 space-y-0.5">
                <div>
                  <span className="font-semibold">T2–T6:</span> Ca1{' '}
                  {b.hours.weekday.ca1 ? `${b.hours.weekday.ca1.start}-${b.hours.weekday.ca1.end}` : 'Nghỉ'} • Ca2{' '}
                  {b.hours.weekday.ca2 ? `${b.hours.weekday.ca2.start}-${b.hours.weekday.ca2.end}` : 'Nghỉ'} • Ca3{' '}
                  {b.hours.weekday.ca3 ? `${b.hours.weekday.ca3.start}-${b.hours.weekday.ca3.end}` : 'Nghỉ'}
                </div>
                <div>
                  <span className="font-semibold">T7–CN:</span> Ca1{' '}
                  {b.hours.weekend.ca1 ? `${b.hours.weekend.ca1.start}-${b.hours.weekend.ca1.end}` : 'Nghỉ'} • Ca2{' '}
                  {b.hours.weekend.ca2 ? `${b.hours.weekend.ca2.start}-${b.hours.weekend.ca2.end}` : 'Nghỉ'} • Ca3{' '}
                  {b.hours.weekend.ca3 ? `${b.hours.weekend.ca3.start}-${b.hours.weekend.ca3.end}` : 'Nghỉ'}
                </div>
              </div>
            </div>
          ))}
        </div>

        {editingBranch && (
          <div className="rounded-xl bg-slate-50 border border-slate-300 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-slate-900">
                Chỉnh sửa {editingBranch.code}
              </span>
              <button
                type="button"
                onClick={() => setEditingBranch(null)}
                className="text-xs text-slate-500 hover:underline cursor-pointer"
              >
                Đóng
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input
                type="text"
                value={editingBranch.code}
                onChange={(e) => setEditingBranch({ ...editingBranch, code: e.target.value })}
                placeholder="Mã (CN1)"
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
              />
              <input
                type="text"
                value={editingBranch.name}
                onChange={(e) => setEditingBranch({ ...editingBranch, name: e.target.value })}
                placeholder="Tên chi nhánh"
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
              />
              <input
                type="color"
                value={editingBranch.color}
                onChange={(e) => setEditingBranch({ ...editingBranch, color: e.target.value })}
                className="h-9 w-16 rounded-lg border border-slate-300 bg-white p-1"
              />
              <input
                type="text"
                value={editingBranch.address}
                onChange={(e) => setEditingBranch({ ...editingBranch, address: e.target.value })}
                placeholder="Địa chỉ đầy đủ"
                className="sm:col-span-3 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
              <div className="space-y-2 rounded-xl bg-white p-3 border border-slate-200">
                <div className="text-xs font-bold text-slate-700">Thứ 2 – Thứ 6</div>
                <ShiftTimeEditor
                  label="Ca 1"
                  value={editingBranch.hours.weekday.ca1}
                  onChange={(r) => setEditingBranch(updateBranchHours(editingBranch, 'weekday', 'ca1', r))}
                />
                <ShiftTimeEditor
                  label="Ca 2"
                  value={editingBranch.hours.weekday.ca2}
                  onChange={(r) => setEditingBranch(updateBranchHours(editingBranch, 'weekday', 'ca2', r))}
                />
                <ShiftTimeEditor
                  label="Ca 3"
                  value={editingBranch.hours.weekday.ca3}
                  onChange={(r) => setEditingBranch(updateBranchHours(editingBranch, 'weekday', 'ca3', r))}
                />
              </div>

              <div className="space-y-2 rounded-xl bg-white p-3 border border-slate-200">
                <div className="text-xs font-bold text-slate-700">Thứ 7 – Chủ nhật</div>
                <ShiftTimeEditor
                  label="Ca 1"
                  value={editingBranch.hours.weekend.ca1}
                  onChange={(r) => setEditingBranch(updateBranchHours(editingBranch, 'weekend', 'ca1', r))}
                />
                <ShiftTimeEditor
                  label="Ca 2"
                  value={editingBranch.hours.weekend.ca2}
                  onChange={(r) => setEditingBranch(updateBranchHours(editingBranch, 'weekend', 'ca2', r))}
                />
                <ShiftTimeEditor
                  label="Ca 3"
                  value={editingBranch.hours.weekend.ca3}
                  onChange={(r) => setEditingBranch(updateBranchHours(editingBranch, 'weekend', 'ca3', r))}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={async () => {
                  await onUpsertBranch(editingBranch);
                  setEditingBranch(null);
                  setStatusMessage(`Đã cập nhật chi nhánh ${editingBranch.code}.`);
                }}
                className="rounded-xl bg-teal-700 hover:bg-teal-800 px-4 py-2 text-xs font-semibold text-white cursor-pointer"
              >
                Lưu chi nhánh
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 3. Calendar .ics Feed */}
      <div className="rounded-2xl bg-white border border-slate-200 p-4 sm:p-5 shadow-sm space-y-3">
        <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <CalendarSync className="h-4 w-4 text-teal-700" />
          Đồng bộ Google Calendar / Apple Calendar (.ics)
        </h3>
        {feedUrl ? (
          <div className="space-y-2">
            <p className="text-xs text-slate-500">
              Dán link dưới đây vào mục &quot;From URL / Đăng ký lịch&quot; trên Google hoặc Apple Calendar:
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                readOnly
                value={feedUrl}
                className="flex-1 rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-mono text-slate-700"
              />
              <button
                type="button"
                onClick={handleCopyFeed}
                className="min-h-[40px] inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                {copiedFeed ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                {copiedFeed ? 'Đã copy' : 'Copy link'}
              </button>
              <button
                type="button"
                onClick={handleRegenerateToken}
                className="min-h-[40px] inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Đổi token
              </button>
            </div>
          </div>
        ) : (
          <p className="text-xs text-slate-500">
            Link subscription tự động khả dụng khi kết nối Supabase Edge Function. Bạn vẫn có thể tải file `.ics` thủ công bên dưới:
          </p>
        )}
        <div>
          <button
            type="button"
            onClick={handleDownloadFullIcs}
            className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl border border-slate-300 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            <Download className="h-4 w-4" />
            Tải toàn bộ lịch KFC (.ics)
          </button>
        </div>
      </div>

      {/* 4. Historical Excel Import & JSON Backup */}
      <div className="rounded-2xl bg-white border border-slate-200 p-4 sm:p-5 shadow-sm space-y-4">
        <div>
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-teal-700" />
            Import lịch sử Excel (2025–2026) & Sao lưu JSON
          </h3>
          <p className="text-xs text-slate-500">
            Chọn file `[Gốc] Lịch làm việc hàng tuần .xlsx` để nạp toàn bộ số liệu tổng kết tháng 2025 (FH) & 2026 (KFC) vào tài khoản của bạn.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <label className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl bg-teal-700 hover:bg-teal-800 px-4 py-2 text-xs font-semibold text-white cursor-pointer">
            <Upload className="h-4 w-4" />
            Chọn file Excel lịch sử (.xlsx)
            <input type="file" accept=".xlsx,.xls" onChange={handleExcelFile} className="hidden" />
          </label>

          <button
            type="button"
            onClick={handleExportJson}
            className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            <Download className="h-4 w-4" />
            Xuất Backup JSON
          </button>

          <label className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer">
            <Upload className="h-4 w-4" />
            Khôi phục từ JSON
            <input type="file" accept=".json" onChange={handleRestoreJson} className="hidden" />
          </label>
        </div>

        {excelWarnings.length > 0 && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
            {excelWarnings.map((w, i) => (
              <div key={i}>• {w}</div>
            ))}
          </div>
        )}

        {excelPreview && excelPreview.length > 0 && (
          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-3.5 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800">
                Xem trước {excelPreview.length} tháng sẽ import
              </span>
              <button
                type="button"
                disabled={importing}
                onClick={handleConfirmExcelImport}
                className="rounded-lg bg-teal-700 hover:bg-teal-800 px-3 py-1.5 text-xs font-semibold text-white cursor-pointer"
              >
                {importing ? 'Đang nạp...' : 'Xác nhận Import'}
              </button>
            </div>
            <div className="max-h-56 overflow-y-auto overflow-x-auto">
              <table className="w-full min-w-[460px] text-xs text-right">
                <thead className="bg-slate-50 text-slate-500 border-b">
                  <tr>
                    <th className="text-left px-3 py-1.5">Tháng</th>
                    <th className="px-3 py-1.5">Nguồn</th>
                    <th className="px-3 py-1.5">Lương ca</th>
                    <th className="px-3 py-1.5">Com</th>
                    <th className="px-3 py-1.5">AH</th>
                    <th className="px-3 py-1.5">Thưởng</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {excelPreview.map((m) => (
                    <tr key={m.yearMonth}>
                      <td className="text-left px-3 py-1.5 font-semibold">{m.yearMonth}</td>
                      <td className="px-3 py-1.5">{m.clinicLabel}</td>
                      <td className="px-3 py-1.5">{formatVND(m.historicalShiftIncome ?? 0)}</td>
                      <td className="px-3 py-1.5">{formatVND(m.historicalComIncome ?? 0)}</td>
                      <td className="px-3 py-1.5">{formatVND(m.historicalAhIncome ?? 0)}</td>
                      <td className="px-3 py-1.5">{formatVND(m.bonusAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* 5. Account */}
      <div className="rounded-2xl bg-white border border-slate-200 p-4 sm:p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="text-sm font-bold text-slate-900">
            {isCloudMode ? 'Tài khoản Cloud Supabase' : 'Chế độ lưu trữ cục bộ (Local Mode)'}
          </div>
          <div className="text-xs text-slate-500">
            {isCloudMode
              ? `Đang đăng nhập: ${userEmail ?? ''}`
              : 'Chưa cấu hình Supabase env — dữ liệu đang lưu tạm trên trình duyệt này.'}
          </div>
        </div>
        {isCloudMode && (
          <button
            type="button"
            onClick={onSignOut}
            className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 px-4 py-2 text-xs font-semibold text-rose-700 cursor-pointer self-start sm:self-auto"
          >
            <LogOut className="h-4 w-4" />
            Đăng xuất
          </button>
        )}
      </div>
    </div>
  );
}
