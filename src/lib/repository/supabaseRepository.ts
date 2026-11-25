import type { SupabaseClient } from '@supabase/supabase-js';
import { cloneDefaultBranches } from '../../domain/branches';
import { DEFAULT_APP_SETTINGS, generateCalendarToken } from '../../domain/finance';
import type {
  AhTask,
  AppSettings,
  BackupPayload,
  Branch,
  BranchHours,
  MonthConfig,
  ShiftNumber,
  ShiftSlot,
  ShiftSlotTarget,
  ShiftStatus,
  AhTaskStatus,
} from '../../domain/types';
import type { DataRepository, WorkspaceData } from './types';

function assertNoError(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

export class SupabaseRepository implements DataRepository {
  constructor(
    private readonly client: SupabaseClient,
    private readonly userId: string,
  ) {}

  async loadAll(): Promise<WorkspaceData> {
    const [settingsRes, branchesRes, slotsRes, configsRes, tasksRes] = await Promise.all([
      this.client.from('app_settings').select('*').eq('user_id', this.userId).maybeSingle(),
      this.client
        .from('branches')
        .select('*')
        .eq('user_id', this.userId)
        .order('sort_order', { ascending: true }),
      this.client.from('shift_slots').select('*').eq('user_id', this.userId),
      this.client.from('month_configs').select('*').eq('user_id', this.userId),
      this.client
        .from('ah_tasks')
        .select('*')
        .eq('user_id', this.userId)
        .order('created_at', { ascending: false }),
    ]);

    assertNoError(settingsRes.error);
    assertNoError(branchesRes.error);
    assertNoError(slotsRes.error);
    assertNoError(configsRes.error);
    assertNoError(tasksRes.error);

    let settings: AppSettings;
    if (!settingsRes.data) {
      settings = { ...DEFAULT_APP_SETTINGS, calendarToken: generateCalendarToken() };
      await this.saveSettings(settings);
    } else {
      const row = settingsRes.data;
      settings = {
        defaultShiftRate: Number(row.default_shift_rate),
        defaultProcedureRate: Number(row.default_procedure_rate),
        defaultPayoutRatio: Number(row.default_payout_ratio),
        monthlyIncomeGoal:
          row.monthly_income_goal === null ? null : Number(row.monthly_income_goal),
        showHospitalSalary: Boolean(row.show_hospital_salary),
        calendarToken: String(row.calendar_token),
      };
    }

    let branches: Branch[];
    if (!branchesRes.data || branchesRes.data.length === 0) {
      branches = cloneDefaultBranches();
      const { error } = await this.client.from('branches').insert(
        branches.map((b) => ({
          id: b.id,
          user_id: this.userId,
          code: b.code,
          name: b.name,
          address: b.address,
          color: b.color,
          is_active: b.isActive,
          sort_order: b.sortOrder,
          hours: b.hours,
        })),
      );
      assertNoError(error);
    } else {
      branches = branchesRes.data.map((r) => ({
        id: String(r.id),
        code: String(r.code),
        name: String(r.name),
        address: String(r.address ?? ''),
        color: String(r.color ?? '#059669'),
        isActive: Boolean(r.is_active),
        sortOrder: Number(r.sort_order ?? 0),
        hours: r.hours as BranchHours,
      }));
    }

    const slots: ShiftSlot[] = (slotsRes.data ?? []).map((r) => ({
      shiftDate: String(r.shift_date),
      shiftNumber: Number(r.shift_number) as ShiftNumber,
      status: String(r.status) as ShiftStatus,
      branchCode: r.branch_code ? String(r.branch_code) : null,
      procedureCount: Number(r.procedure_count ?? 0),
      note: String(r.note ?? ''),
    }));

    const monthConfigs: MonthConfig[] = (configsRes.data ?? []).map((r) => ({
      yearMonth: String(r.year_month),
      shiftRate: Number(r.shift_rate),
      procedureRate: Number(r.procedure_rate),
      payoutRatio: Number(r.payout_ratio),
      procedureAdjustment: Number(r.procedure_adjustment ?? 0),
      procedureAdjustmentNote: String(r.procedure_adjustment_note ?? ''),
      bonusAmount: Number(r.bonus_amount ?? 0),
      bonusNote: String(r.bonus_note ?? ''),
      hospitalSalary: r.hospital_salary === null ? null : Number(r.hospital_salary),
      isHistorical: Boolean(r.is_historical),
      clinicLabel: String(r.clinic_label ?? 'KFC'),
      historicalShiftIncome:
        r.historical_shift_income === null ? null : Number(r.historical_shift_income),
      historicalComIncome:
        r.historical_com_income === null ? null : Number(r.historical_com_income),
      historicalAhIncome:
        r.historical_ah_income === null ? null : Number(r.historical_ah_income),
    }));

    const ahTasks: AhTask[] = (tasksRes.data ?? []).map((r) => ({
      id: String(r.id),
      title: String(r.title),
      amount: Number(r.amount),
      status: String(r.status) as AhTaskStatus,
      receivedMonth: r.received_month ? String(r.received_month) : null,
      note: String(r.note ?? ''),
      createdAt: String(r.created_at),
    }));

    return { settings, branches, slots, monthConfigs, ahTasks };
  }

  async saveSettings(settings: AppSettings): Promise<void> {
    const { error } = await this.client.from('app_settings').upsert(
      {
        user_id: this.userId,
        default_shift_rate: settings.defaultShiftRate,
        default_procedure_rate: settings.defaultProcedureRate,
        default_payout_ratio: settings.defaultPayoutRatio,
        monthly_income_goal: settings.monthlyIncomeGoal,
        show_hospital_salary: settings.showHospitalSalary,
        calendar_token: settings.calendarToken,
      },
      { onConflict: 'user_id' },
    );
    assertNoError(error);
  }

  async upsertBranch(branch: Branch): Promise<void> {
    const { error } = await this.client.from('branches').upsert(
      {
        id: branch.id,
        user_id: this.userId,
        code: branch.code,
        name: branch.name,
        address: branch.address,
        color: branch.color,
        is_active: branch.isActive,
        sort_order: branch.sortOrder,
        hours: branch.hours,
      },
      { onConflict: 'user_id,id' },
    );
    assertNoError(error);
  }

  async deleteBranch(branchId: string): Promise<void> {
    const { error } = await this.client
      .from('branches')
      .delete()
      .eq('user_id', this.userId)
      .eq('id', branchId);
    assertNoError(error);
  }

  private toSlotRow(slot: ShiftSlot) {
    return {
      user_id: this.userId,
      shift_date: slot.shiftDate,
      shift_number: slot.shiftNumber,
      status: slot.status,
      branch_code: slot.status === 'KFC' ? slot.branchCode : null,
      procedure_count: slot.status === 'KFC' ? slot.procedureCount : 0,
      note: slot.note,
    };
  }

  async upsertShiftSlot(slot: ShiftSlot): Promise<void> {
    const { error } = await this.client
      .from('shift_slots')
      .upsert(this.toSlotRow(slot), { onConflict: 'user_id,shift_date,shift_number' });
    assertNoError(error);
  }

  async deleteShiftSlot(shiftDate: string, shiftNumber: ShiftNumber): Promise<void> {
    const { error } = await this.client
      .from('shift_slots')
      .delete()
      .eq('user_id', this.userId)
      .eq('shift_date', shiftDate)
      .eq('shift_number', shiftNumber);
    assertNoError(error);
  }

  async bulkUpsertShiftSlots(slots: ShiftSlot[]): Promise<void> {
    if (slots.length === 0) return;
    const { error } = await this.client
      .from('shift_slots')
      .upsert(
        slots.map((s) => this.toSlotRow(s)),
        { onConflict: 'user_id,shift_date,shift_number' },
      );
    assertNoError(error);
  }

  async bulkDeleteShiftSlots(targets: ShiftSlotTarget[]): Promise<void> {
    if (targets.length === 0) return;
    const byDate = new Map<string, Set<ShiftNumber>>();
    for (const t of targets) {
      let set = byDate.get(t.shiftDate);
      if (!set) {
        set = new Set<ShiftNumber>();
        byDate.set(t.shiftDate, set);
      }
      set.add(t.shiftNumber);
    }
    await Promise.all(
      Array.from(byDate.entries()).map(async ([shiftDate, shiftNumbers]) => {
        const { error } = await this.client
          .from('shift_slots')
          .delete()
          .eq('user_id', this.userId)
          .eq('shift_date', shiftDate)
          .in('shift_number', Array.from(shiftNumbers));
        assertNoError(error);
      }),
    );
  }

  private toMonthConfigRow(c: MonthConfig) {
    return {
      user_id: this.userId,
      year_month: c.yearMonth,
      shift_rate: c.shiftRate,
      procedure_rate: c.procedureRate,
      payout_ratio: c.payoutRatio,
      procedure_adjustment: c.procedureAdjustment,
      procedure_adjustment_note: c.procedureAdjustmentNote,
      bonus_amount: c.bonusAmount,
      bonus_note: c.bonusNote,
      hospital_salary: c.hospitalSalary,
      is_historical: c.isHistorical,
      clinic_label: c.clinicLabel,
      historical_shift_income: c.historicalShiftIncome,
      historical_com_income: c.historicalComIncome,
      historical_ah_income: c.historicalAhIncome,
    };
  }

  async upsertMonthConfig(config: MonthConfig): Promise<void> {
    const { error } = await this.client
      .from('month_configs')
      .upsert(this.toMonthConfigRow(config), { onConflict: 'user_id,year_month' });
    assertNoError(error);
  }

  async bulkUpsertMonthConfigs(configs: MonthConfig[]): Promise<void> {
    if (configs.length === 0) return;
    const { error } = await this.client
      .from('month_configs')
      .upsert(
        configs.map((c) => this.toMonthConfigRow(c)),
        { onConflict: 'user_id,year_month' },
      );
    assertNoError(error);
  }

  async upsertAhTask(task: AhTask): Promise<void> {
    const { error } = await this.client.from('ah_tasks').upsert(
      {
        id: task.id,
        user_id: this.userId,
        title: task.title,
        amount: task.amount,
        status: task.status,
        received_month: task.receivedMonth,
        note: task.note,
        created_at: task.createdAt,
      },
      { onConflict: 'user_id,id' },
    );
    assertNoError(error);
  }

  async deleteAhTask(taskId: string): Promise<void> {
    const { error } = await this.client
      .from('ah_tasks')
      .delete()
      .eq('user_id', this.userId)
      .eq('id', taskId);
    assertNoError(error);
  }

  async restoreBackup(payload: BackupPayload): Promise<void> {
    await this.saveSettings(payload.settings);
    await Promise.all([
      this.client.from('branches').delete().eq('user_id', this.userId),
      this.client.from('shift_slots').delete().eq('user_id', this.userId),
      this.client.from('month_configs').delete().eq('user_id', this.userId),
      this.client.from('ah_tasks').delete().eq('user_id', this.userId),
    ]);

    if (payload.branches.length > 0) {
      const { error } = await this.client.from('branches').insert(
        payload.branches.map((b) => ({
          id: b.id,
          user_id: this.userId,
          code: b.code,
          name: b.name,
          address: b.address,
          color: b.color,
          is_active: b.isActive,
          sort_order: b.sortOrder,
          hours: b.hours,
        })),
      );
      assertNoError(error);
    }

    await this.bulkUpsertShiftSlots(payload.slots);
    await this.bulkUpsertMonthConfigs(payload.monthConfigs);

    if (payload.ahTasks.length > 0) {
      const { error } = await this.client.from('ah_tasks').insert(
        payload.ahTasks.map((t) => ({
          id: t.id,
          user_id: this.userId,
          title: t.title,
          amount: t.amount,
          status: t.status,
          received_month: t.receivedMonth,
          note: t.note,
          created_at: t.createdAt,
        })),
      );
      assertNoError(error);
    }
  }
}
