import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { CalendarDays, Settings, Wallet } from 'lucide-react';
import { AuthGate } from './components/AuthGate';
import { FinanceView } from './components/FinanceView';
import { ScheduleView } from './components/ScheduleView';
import { SettingsView } from './components/SettingsView';
import { slotKey } from './domain/calendar';
import type {
  AhTask,
  AppSettings,
  BackupPayload,
  Branch,
  MonthConfig,
  ShiftNumber,
  ShiftSlot,
  ShiftSlotTarget,
} from './domain/types';
import { LocalRepository } from './lib/repository/localRepository';
import { SupabaseRepository } from './lib/repository/supabaseRepository';
import type { DataRepository, WorkspaceData } from './lib/repository/types';
import { isSupabaseConfigured, supabase } from './lib/supabase';

type TabId = 'schedule' | 'finance' | 'settings';

function readHashTab(): TabId {
  const hash = window.location.hash.replace('#', '');
  if (hash === 'finance' || hash === 'settings') return hash;
  return 'schedule';
}

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(!isSupabaseConfigured);
  const [tab, setTab] = useState<TabId>(readHashTab);
  const [data, setData] = useState<WorkspaceData | null>(null);
  const [loadingData, setLoadingData] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  useEffect(() => {
    const onHash = () => setTab(readHashTab());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const switchTab = (next: TabId) => {
    window.location.hash = next;
    setTab(next);
  };

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data: res }) => {
      setSession(res.session);
      setAuthReady(true);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthReady(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  const repo: DataRepository | null = useMemo(() => {
    if (!isSupabaseConfigured) return new LocalRepository();
    if (supabase && session?.user) return new SupabaseRepository(supabase, session.user.id);
    return null;
  }, [session]);

  const reload = useCallback(async () => {
    if (!repo) return;
    setLoadingData(true);
    setErrorBanner(null);
    try {
      const loaded = await repo.loadAll();
      setData(loaded);
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Không thể tải dữ liệu.');
    } finally {
      setLoadingData(false);
    }
  }, [repo]);

  useEffect(() => {
    if (repo) {
      void reload();
    } else {
      setData(null);
    }
  }, [repo, reload]);

  if (!authReady) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-slate-500">
        Đang kiểm tra phiên đăng nhập...
      </div>
    );
  }

  if (isSupabaseConfigured && !session) {
    return <AuthGate />;
  }

  const handleSaveSettings = async (settings: AppSettings) => {
    if (!repo || !data) return;
    setData({ ...data, settings });
    await repo.saveSettings(settings);
  };

  const handleUpsertBranch = async (branch: Branch) => {
    if (!repo || !data) return;
    const exists = data.branches.some((b) => b.id === branch.id);
    const nextBranches = exists
      ? data.branches.map((b) => (b.id === branch.id ? branch : b))
      : [...data.branches, branch];
    setData({ ...data, branches: nextBranches });
    await repo.upsertBranch(branch);
  };

  const handleUpsertSlot = async (slot: ShiftSlot) => {
    if (!repo || !data) return;
    const k = slotKey(slot.shiftDate, slot.shiftNumber);
    const map = new Map(data.slots.map((s) => [slotKey(s.shiftDate, s.shiftNumber), s]));
    map.set(k, slot);
    setData({ ...data, slots: Array.from(map.values()) });
    await repo.upsertShiftSlot(slot);
  };

  const handleDeleteSlot = async (shiftDate: string, shiftNumber: ShiftNumber) => {
    if (!repo || !data) return;
    setData({
      ...data,
      slots: data.slots.filter(
        (s) => !(s.shiftDate === shiftDate && s.shiftNumber === shiftNumber),
      ),
    });
    await repo.deleteShiftSlot(shiftDate, shiftNumber);
  };

  const handleBulkUpsertSlots = async (slots: ShiftSlot[]) => {
    if (!repo || !data) return;
    const map = new Map(data.slots.map((s) => [slotKey(s.shiftDate, s.shiftNumber), s]));
    for (const s of slots) map.set(slotKey(s.shiftDate, s.shiftNumber), s);
    setData({ ...data, slots: Array.from(map.values()) });
    await repo.bulkUpsertShiftSlots(slots);
  };

  const handleBulkDeleteSlots = async (targets: ShiftSlotTarget[]) => {
    if (!repo || !data || targets.length === 0) return;
    const targetKeys = new Set(targets.map((t) => slotKey(t.shiftDate, t.shiftNumber)));
    setData({
      ...data,
      slots: data.slots.filter((s) => !targetKeys.has(slotKey(s.shiftDate, s.shiftNumber))),
    });
    await repo.bulkDeleteShiftSlots(targets);
  };

  const handleBulkDeleteDay = async (shiftDate: string) => {
    if (!data) return;
    const dayTargets: ShiftSlotTarget[] = data.slots
      .filter((s) => s.shiftDate === shiftDate)
      .map((s) => ({ shiftDate: s.shiftDate, shiftNumber: s.shiftNumber }));
    await handleBulkDeleteSlots(dayTargets);
  };

  const handleUpsertMonthConfig = async (cfg: MonthConfig) => {
    if (!repo || !data) return;
    const map = new Map(data.monthConfigs.map((c) => [c.yearMonth, c]));
    map.set(cfg.yearMonth, cfg);
    setData({ ...data, monthConfigs: Array.from(map.values()) });
    await repo.upsertMonthConfig(cfg);
  };

  const handleBulkUpsertMonthConfigs = async (configs: MonthConfig[]) => {
    if (!repo || !data) return;
    const map = new Map(data.monthConfigs.map((c) => [c.yearMonth, c]));
    for (const c of configs) map.set(c.yearMonth, c);
    setData({ ...data, monthConfigs: Array.from(map.values()) });
    await repo.bulkUpsertMonthConfigs(configs);
  };

  const handleUpsertAhTask = async (task: AhTask) => {
    if (!repo || !data) return;
    const exists = data.ahTasks.some((t) => t.id === task.id);
    const next = exists
      ? data.ahTasks.map((t) => (t.id === task.id ? task : t))
      : [task, ...data.ahTasks];
    setData({ ...data, ahTasks: next });
    await repo.upsertAhTask(task);
  };

  const handleDeleteAhTask = async (taskId: string) => {
    if (!repo || !data) return;
    setData({ ...data, ahTasks: data.ahTasks.filter((t) => t.id !== taskId) });
    await repo.deleteAhTask(taskId);
  };

  const handleRestoreBackup = async (payload: BackupPayload) => {
    if (!repo) return;
    await repo.restoreBackup(payload);
    await reload();
  };

  const handleSignOut = async () => {
    if (supabase) await supabase.auth.signOut();
  };

  const navItems: { id: TabId; label: string; icon: typeof CalendarDays }[] = [
    { id: 'schedule', label: 'Lịch', icon: CalendarDays },
    { id: 'finance', label: 'Tài chính', icon: Wallet },
    { id: 'settings', label: 'Cài đặt', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-slate-50 pb-[calc(5.25rem+env(safe-area-inset-bottom))] md:pb-6 md:pl-60">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex md:flex-col md:fixed md:inset-y-0 md:left-0 md:w-60 bg-white border-r border-slate-200 p-4">
        <div className="flex items-center gap-2.5 px-2 py-2 mb-6">
          <img
            src={`${import.meta.env.BASE_URL}pwa-192x192.png`}
            alt="Work Dashboard"
            className="h-9 w-9 rounded-xl shadow-xs object-cover shrink-0"
          />
          <div>
            <div className="text-sm font-bold text-slate-900">Work Dashboard</div>
            <div className="text-[11px] text-slate-500">KFC & AH Tracker</div>
          </div>
        </div>

        <nav className="space-y-1 flex-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => switchTab(item.id)}
                className={`w-full flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition cursor-pointer ${
                  active
                    ? 'bg-teal-50 text-teal-800'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200/70 text-[11px] text-slate-500">
          {isSupabaseConfigured ? '☁️ Đồng bộ Supabase' : '💾 Local Preview Mode'}
        </div>
      </aside>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto p-3 sm:p-6 space-y-4">
        {errorBanner && (
          <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-2.5 text-xs text-rose-700">
            {errorBanner}
          </div>
        )}

        {loadingData || !data ? (
          <div className="rounded-2xl bg-white border border-slate-200 p-10 text-center text-sm text-slate-500">
            Đang tải dữ liệu...
          </div>
        ) : (
          <>
            {tab === 'schedule' && (
              <ScheduleView
                settings={data.settings}
                branches={data.branches}
                slots={data.slots}
                monthConfigs={data.monthConfigs}
                ahTasks={data.ahTasks}
                onUpsertSlot={handleUpsertSlot}
                onDeleteSlot={handleDeleteSlot}
                onBulkUpsertSlots={handleBulkUpsertSlots}
                onBulkDeleteSlots={handleBulkDeleteSlots}
                onBulkDeleteDay={handleBulkDeleteDay}
              />
            )}
            {tab === 'finance' && (
              <FinanceView
                settings={data.settings}
                slots={data.slots}
                monthConfigs={data.monthConfigs}
                ahTasks={data.ahTasks}
                onSaveSettings={handleSaveSettings}
                onUpsertMonthConfig={handleUpsertMonthConfig}
                onUpsertAhTask={handleUpsertAhTask}
                onDeleteAhTask={handleDeleteAhTask}
              />
            )}
            {tab === 'settings' && (
              <SettingsView
                settings={data.settings}
                branches={data.branches}
                slots={data.slots}
                monthConfigs={data.monthConfigs}
                ahTasks={data.ahTasks}
                isCloudMode={isSupabaseConfigured}
                userEmail={session?.user?.email ?? null}
                onSaveSettings={handleSaveSettings}
                onUpsertBranch={handleUpsertBranch}
                onBulkUpsertMonthConfigs={handleBulkUpsertMonthConfigs}
                onRestoreBackup={handleRestoreBackup}
                onSignOut={handleSignOut}
              />
            )}
          </>
        )}
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-sm border-t border-slate-200 grid grid-cols-3 pb-[env(safe-area-inset-bottom)] shadow-[0_-1px_8px_rgba(15,23,42,0.06)]">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => switchTab(item.id)}
              className={`flex flex-col items-center justify-center py-2.5 text-[11px] font-semibold cursor-pointer ${
                active ? 'text-teal-700' : 'text-slate-500'
              }`}
            >
              <Icon className="h-5 w-5 mb-0.5" />
              {item.label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

export default App;
