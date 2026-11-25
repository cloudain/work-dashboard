import type {
  AhTask,
  AppSettings,
  BackupPayload,
  Branch,
  MonthConfig,
  ShiftNumber,
  ShiftSlot,
  ShiftSlotTarget,
} from '../../domain/types';

export interface WorkspaceData {
  settings: AppSettings;
  branches: Branch[];
  slots: ShiftSlot[];
  monthConfigs: MonthConfig[];
  ahTasks: AhTask[];
}

export interface DataRepository {
  loadAll(): Promise<WorkspaceData>;
  saveSettings(settings: AppSettings): Promise<void>;
  upsertBranch(branch: Branch): Promise<void>;
  deleteBranch(branchId: string): Promise<void>;
  upsertShiftSlot(slot: ShiftSlot): Promise<void>;
  deleteShiftSlot(shiftDate: string, shiftNumber: ShiftNumber): Promise<void>;
  bulkUpsertShiftSlots(slots: ShiftSlot[]): Promise<void>;
  bulkDeleteShiftSlots(targets: ShiftSlotTarget[]): Promise<void>;
  upsertMonthConfig(config: MonthConfig): Promise<void>;
  bulkUpsertMonthConfigs(configs: MonthConfig[]): Promise<void>;
  upsertAhTask(task: AhTask): Promise<void>;
  deleteAhTask(taskId: string): Promise<void>;
  restoreBackup(payload: BackupPayload): Promise<void>;
}
