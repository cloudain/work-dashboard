import { cloneDefaultBranches } from '../../domain/branches';
import { DEFAULT_APP_SETTINGS, generateCalendarToken } from '../../domain/finance';
import type {
  AhTask,
  AppSettings,
  BackupPayload,
  Branch,
  MonthConfig,
  ShiftNumber,
  ShiftSlot,
} from '../../domain/types';
import type { DataRepository, WorkspaceData } from './types';

const STORAGE_KEY = 'work-dashboard-local-v1';

function readStore(): WorkspaceData {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    const initial: WorkspaceData = {
      settings: { ...DEFAULT_APP_SETTINGS, calendarToken: generateCalendarToken() },
      branches: cloneDefaultBranches(),
      slots: [],
      monthConfigs: [],
      ahTasks: [],
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
    return initial;
  }
  const parsed = JSON.parse(raw) as Partial<WorkspaceData>;
  return {
    settings: parsed.settings ?? { ...DEFAULT_APP_SETTINGS, calendarToken: generateCalendarToken() },
    branches: parsed.branches?.length ? parsed.branches : cloneDefaultBranches(),
    slots: parsed.slots ?? [],
    monthConfigs: parsed.monthConfigs ?? [],
    ahTasks: parsed.ahTasks ?? [],
  };
}

function writeStore(data: WorkspaceData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export class LocalRepository implements DataRepository {
  async loadAll(): Promise<WorkspaceData> {
    return readStore();
  }

  async saveSettings(settings: AppSettings): Promise<void> {
    const data = readStore();
    data.settings = settings;
    writeStore(data);
  }

  async upsertBranch(branch: Branch): Promise<void> {
    const data = readStore();
    const idx = data.branches.findIndex((b) => b.id === branch.id);
    if (idx >= 0) data.branches[idx] = branch;
    else data.branches.push(branch);
    writeStore(data);
  }

  async deleteBranch(branchId: string): Promise<void> {
    const data = readStore();
    data.branches = data.branches.filter((b) => b.id !== branchId);
    writeStore(data);
  }

  async upsertShiftSlot(slot: ShiftSlot): Promise<void> {
    const data = readStore();
    const idx = data.slots.findIndex(
      (s) => s.shiftDate === slot.shiftDate && s.shiftNumber === slot.shiftNumber,
    );
    if (idx >= 0) data.slots[idx] = slot;
    else data.slots.push(slot);
    writeStore(data);
  }

  async deleteShiftSlot(shiftDate: string, shiftNumber: ShiftNumber): Promise<void> {
    const data = readStore();
    data.slots = data.slots.filter(
      (s) => !(s.shiftDate === shiftDate && s.shiftNumber === shiftNumber),
    );
    writeStore(data);
  }

  async bulkUpsertShiftSlots(slots: ShiftSlot[]): Promise<void> {
    const data = readStore();
    const map = new Map(data.slots.map((s) => [`${s.shiftDate}|${s.shiftNumber}`, s]));
    for (const s of slots) {
      map.set(`${s.shiftDate}|${s.shiftNumber}`, s);
    }
    data.slots = Array.from(map.values());
    writeStore(data);
  }

  async upsertMonthConfig(config: MonthConfig): Promise<void> {
    const data = readStore();
    const idx = data.monthConfigs.findIndex((c) => c.yearMonth === config.yearMonth);
    if (idx >= 0) data.monthConfigs[idx] = config;
    else data.monthConfigs.push(config);
    writeStore(data);
  }

  async bulkUpsertMonthConfigs(configs: MonthConfig[]): Promise<void> {
    const data = readStore();
    const map = new Map(data.monthConfigs.map((c) => [c.yearMonth, c]));
    for (const c of configs) {
      map.set(c.yearMonth, c);
    }
    data.monthConfigs = Array.from(map.values());
    writeStore(data);
  }

  async upsertAhTask(task: AhTask): Promise<void> {
    const data = readStore();
    const idx = data.ahTasks.findIndex((t) => t.id === task.id);
    if (idx >= 0) data.ahTasks[idx] = task;
    else data.ahTasks.push(task);
    writeStore(data);
  }

  async deleteAhTask(taskId: string): Promise<void> {
    const data = readStore();
    data.ahTasks = data.ahTasks.filter((t) => t.id !== taskId);
    writeStore(data);
  }

  async restoreBackup(payload: BackupPayload): Promise<void> {
    writeStore({
      settings: payload.settings,
      branches: payload.branches,
      slots: payload.slots,
      monthConfigs: payload.monthConfigs,
      ahTasks: payload.ahTasks,
    });
  }
}
