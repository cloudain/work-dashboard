import { useMemo, useState, type FormEvent } from 'react';
import { CheckCircle2, Clock, FileText, Plus, Trash2 } from 'lucide-react';
import { currentYearMonth } from '../domain/calendar';
import { computeReceivables, formatVND } from '../domain/finance';
import type { AhTask, AhTaskStatus } from '../domain/types';

interface AhTasksPanelProps {
  tasks: AhTask[];
  defaultMonth: string;
  onUpsertTask: (task: AhTask) => Promise<void>;
  onDeleteTask: (taskId: string) => Promise<void>;
}

const STATUS_META: Record<AhTaskStatus, { label: string; cls: string }> = {
  DANG_LAM: { label: 'Đang làm', cls: 'bg-slate-100 text-slate-700' },
  CHO_THANH_TOAN: { label: 'Chờ thanh toán', cls: 'bg-amber-100 text-amber-800' },
  DA_NHAN: { label: 'Đã nhận', cls: 'bg-emerald-100 text-emerald-800' },
};

export function AhTasksPanel({
  tasks,
  defaultMonth,
  onUpsertTask,
  onDeleteTask,
}: AhTasksPanelProps) {
  const [filter, setFilter] = useState<'ALL' | AhTaskStatus>('ALL');
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState<AhTaskStatus>('DANG_LAM');
  const [receivedMonth, setReceivedMonth] = useState(defaultMonth || currentYearMonth());
  const [note, setNote] = useState('');

  const receivables = useMemo(() => computeReceivables(tasks), [tasks]);

  const filtered = useMemo(
    () => (filter === 'ALL' ? tasks : tasks.filter((t) => t.status === filter)),
    [tasks, filter],
  );

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    const newTask: AhTask = {
      id:
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `ah-${Date.now()}`,
      title: title.trim(),
      amount: Math.max(0, Number(amount) || 0),
      status,
      receivedMonth: status === 'DA_NHAN' ? receivedMonth : null,
      note: note.trim(),
      createdAt: new Date().toISOString(),
    };
    await onUpsertTask(newTask);
    setTitle('');
    setAmount('');
    setNote('');
    setStatus('DANG_LAM');
    setShowForm(false);
  };

  const cycleStatus = async (task: AhTask) => {
    const nextStatus: AhTaskStatus =
      task.status === 'DANG_LAM'
        ? 'CHO_THANH_TOAN'
        : task.status === 'CHO_THANH_TOAN'
          ? 'DA_NHAN'
          : 'DANG_LAM';
    await onUpsertTask({
      ...task,
      status: nextStatus,
      receivedMonth: nextStatus === 'DA_NHAN' ? task.receivedMonth || defaultMonth : null,
    });
  };

  return (
    <div className="rounded-2xl bg-white border border-slate-200 p-4 sm:p-5 shadow-sm space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <FileText className="h-4 w-4 text-teal-700" />
            Quản lý Task AH (Viết báo khoa học)
          </h3>
          <p className="text-xs text-slate-500">
            Doanh thu AH được tính vào tháng thực nhận tiền (Cash basis).
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-xl bg-teal-700 hover:bg-teal-800 px-3.5 py-2 text-xs font-semibold text-white cursor-pointer self-start sm:self-auto"
        >
          <Plus className="h-4 w-4" />
          Thêm Task AH
        </button>
      </div>

      {receivables.count > 0 && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 px-3.5 py-2.5 flex items-center justify-between text-xs">
          <span className="font-semibold text-amber-900 flex items-center gap-1.5">
            <Clock className="h-4 w-4 text-amber-700" />
            Công nợ đang chờ thanh toán ({receivables.count} bài):
          </span>
          <span className="font-bold text-amber-900 text-sm">
            {formatVND(receivables.totalAmount)}
          </span>
        </div>
      )}

      {showForm && (
        <form
          onSubmit={handleAdd}
          className="rounded-xl bg-slate-50 border border-slate-200 p-4 grid grid-cols-1 sm:grid-cols-2 gap-3"
        >
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Tên bài / đầu việc AH
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ví dụ: Systematic Review Viêm mũi dị ứng..."
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Số tiền (VNĐ)</label>
            <input
              type="number"
              min={0}
              step={50000}
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="1500000"
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Trạng thái</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as AhTaskStatus)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option value="DANG_LAM">Đang làm</option>
              <option value="CHO_THANH_TOAN">Chờ thanh toán</option>
              <option value="DA_NHAN">Đã nhận</option>
            </select>
          </div>
          {status === 'DA_NHAN' && (
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Tháng thực nhận
              </label>
              <input
                type="month"
                value={receivedMonth}
                onChange={(e) => setReceivedMonth(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
              />
            </div>
          )}
          <div className={status === 'DA_NHAN' ? '' : 'sm:col-span-2'}>
            <label className="block text-xs font-medium text-slate-600 mb-1">Ghi chú</label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ghi chú thêm..."
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
            />
          </div>
          <div className="sm:col-span-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-xl px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200 cursor-pointer"
            >
              Huỷ
            </button>
            <button
              type="submit"
              className="rounded-xl bg-teal-700 hover:bg-teal-800 px-4 py-2 text-xs font-semibold text-white cursor-pointer"
            >
              Lưu Task AH
            </button>
          </div>
        </form>
      )}

      <div className="flex flex-wrap gap-1.5">
        {(
          [
            { id: 'ALL', label: `Tất cả (${tasks.length})` },
            { id: 'DANG_LAM', label: 'Đang làm' },
            { id: 'CHO_THANH_TOAN', label: 'Chờ thanh toán' },
            { id: 'DA_NHAN', label: 'Đã nhận' },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setFilter(tab.id)}
            className={`rounded-lg px-3 py-1 text-xs font-semibold transition cursor-pointer ${
              filter === tab.id
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-6 text-xs text-slate-400">
          Chưa có Task AH nào trong mục này.
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {filtered.map((task) => {
            const meta = STATUS_META[task.status];
            return (
              <div
                key={task.id}
                className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-900 truncate">{task.title}</div>
                  <div className="text-xs text-slate-500 flex flex-wrap items-center gap-2 mt-0.5">
                    <span className="font-bold text-teal-700">{formatVND(task.amount)}</span>
                    {task.receivedMonth && (
                      <span>• Nhận tháng {task.receivedMonth}</span>
                    )}
                    {task.note && <span>• {task.note}</span>}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => cycleStatus(task)}
                    title="Chạm để chuyển trạng thái tiếp theo"
                    className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold cursor-pointer ${meta.cls}`}
                  >
                    {task.status === 'DA_NHAN' && <CheckCircle2 className="h-3.5 w-3.5" />}
                    {meta.label}
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteTask(task.id)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                    title="Xoá Task AH"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
