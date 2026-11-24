import { useState } from 'react';
import { Minus, Plus, Trash2, X } from 'lucide-react';
import { getBranchShiftTime, isValidBranchShift } from '../domain/branches';
import { formatDateVN } from '../domain/calendar';
import { formatVND } from '../domain/finance';
import type { Branch, ShiftNumber, ShiftSlot, ShiftStatus } from '../domain/types';

interface ShiftEditorModalProps {
  shiftDate: string;
  shiftNumber: ShiftNumber;
  existingSlot: ShiftSlot | undefined;
  branches: Branch[];
  procedureRate: number;
  onSave: (slot: ShiftSlot) => Promise<void>;
  onDelete: () => Promise<void>;
  onClose: () => void;
}

export function ShiftEditorModal({
  shiftDate,
  shiftNumber,
  existingSlot,
  branches,
  procedureRate,
  onSave,
  onDelete,
  onClose,
}: ShiftEditorModalProps) {
  const activeBranches = branches.filter((b) => b.isActive);
  const defaultBranch =
    existingSlot?.branchCode ??
    activeBranches.find((b) => isValidBranchShift(b, shiftDate, shiftNumber))?.code ??
    activeBranches[0]?.code ??
    'CN1';

  const [status, setStatus] = useState<ShiftStatus>(existingSlot?.status ?? 'KFC');
  const [branchCode, setBranchCode] = useState<string>(defaultBranch);
  const [procedureCount, setProcedureCount] = useState<number>(
    existingSlot?.procedureCount ?? 0,
  );
  const [note, setNote] = useState<string>(existingSlot?.note ?? '');
  const [saving, setSaving] = useState(false);

  const selectedBranch = branches.find((b) => b.code === branchCode);
  const selectedRange =
    status === 'KFC' && selectedBranch
      ? getBranchShiftTime(selectedBranch, shiftDate, shiftNumber)
      : null;

  const canSave = status !== 'KFC' || (selectedBranch && selectedRange !== null);

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await onSave({
        shiftDate,
        shiftNumber,
        status,
        branchCode: status === 'KFC' ? branchCode : null,
        procedureCount: status === 'KFC' ? Math.max(0, procedureCount) : 0,
        note: note.trim(),
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setSaving(true);
    try {
      await onDelete();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-[1px] p-0 sm:p-4">
      <div className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              {formatDateVN(shiftDate)} — Ca {shiftNumber}
            </h3>
            <p className="text-xs text-slate-500">
              {shiftNumber === 1 ? 'Buổi sáng' : shiftNumber === 2 ? 'Chiều (4 tiếng đầu)' : 'Chiều tối'}
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

        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
              Trạng thái Ô ca
            </label>
            <div className="grid grid-cols-4 gap-2">
              {(
                [
                  { id: 'BV', label: 'BV', cls: 'border-rose-300 bg-rose-50 text-rose-700' },
                  { id: 'NGHI', label: 'Nghỉ', cls: 'border-amber-300 bg-amber-50 text-amber-800' },
                  { id: 'RANH', label: 'Rảnh', cls: 'border-lime-400 bg-lime-50 text-lime-800' },
                  { id: 'KFC', label: 'KFC', cls: 'border-emerald-500 bg-emerald-50 text-emerald-800' },
                ] as const
              ).map((opt) => {
                const active = status === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setStatus(opt.id)}
                    className={`rounded-xl border-2 py-2.5 text-sm font-bold transition cursor-pointer ${
                      active
                        ? `${opt.cls} ring-2 ring-offset-1 ring-slate-900/15`
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {status === 'KFC' && (
            <>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                  Chi nhánh KFC
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {activeBranches.map((b) => {
                    const range = getBranchShiftTime(b, shiftDate, shiftNumber);
                    const disabled = range === null;
                    const active = branchCode === b.code;
                    return (
                      <button
                        key={b.id}
                        type="button"
                        disabled={disabled}
                        onClick={() => setBranchCode(b.code)}
                        className={`rounded-xl border px-3 py-2 text-left transition ${
                          disabled
                            ? 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed opacity-70'
                            : active
                              ? 'border-teal-600 bg-teal-50 text-teal-900 ring-2 ring-teal-600/20 cursor-pointer'
                              : 'border-slate-200 bg-white hover:bg-slate-50 cursor-pointer'
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          <span
                            className="h-2.5 w-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: b.color }}
                          />
                          <span className="text-sm font-bold">{b.code}</span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {range ? `${range.start}–${range.end}` : 'Không mở ca'}
                        </div>
                      </button>
                    );
                  })}
                </div>
                {selectedBranch && selectedRange && (
                  <p className="mt-2 text-xs text-slate-500">
                    📍 {selectedBranch.address}
                  </p>
                )}
              </div>

              <div className="rounded-xl bg-slate-50 border border-slate-200 p-3.5 flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-slate-800">Số ca thủ thuật (Com KFC)</div>
                  <div className="text-xs text-slate-500">
                    {formatVND(procedureRate)}/ca →{' '}
                    <span className="font-semibold text-teal-700">
                      {formatVND(procedureCount * procedureRate)}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setProcedureCount((c) => Math.max(0, c - 1))}
                    className="h-9 w-9 rounded-lg border border-slate-300 bg-white flex items-center justify-center text-slate-700 hover:bg-slate-100 cursor-pointer"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <span className="w-8 text-center text-base font-bold text-slate-900">
                    {procedureCount}
                  </span>
                  <button
                    type="button"
                    onClick={() => setProcedureCount((c) => c + 1)}
                    className="h-9 w-9 rounded-lg border border-slate-300 bg-white flex items-center justify-center text-slate-700 hover:bg-slate-100 cursor-pointer"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </>
          )}

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">
              Ghi chú (tuỳ chọn)
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ví dụ: Đổi ca với BS..., trực cọc..."
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-teal-600 focus:outline-none"
            />
          </div>
        </div>

        <div className="px-5 py-3.5 border-t border-slate-100 bg-slate-50 flex items-center justify-between gap-2">
          {existingSlot ? (
            <button
              type="button"
              disabled={saving}
              onClick={handleDelete}
              className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 cursor-pointer"
            >
              <Trash2 className="h-4 w-4" />
              Xoá ô ca
            </button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200/70 cursor-pointer"
            >
              Huỷ
            </button>
            <button
              type="button"
              disabled={!canSave || saving}
              onClick={handleSave}
              className="rounded-xl bg-teal-700 hover:bg-teal-800 disabled:opacity-50 px-5 py-2 text-sm font-semibold text-white cursor-pointer"
            >
              {saving ? 'Đang lưu...' : 'Lưu'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
