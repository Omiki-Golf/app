import type { GolfRound, RoundPlayer, RoundScore } from '../types';
import type { UserProfile, PlanType } from '../types';
import type { User } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';

export interface AdminAccount {
  user_id: string;
  alias: string;
  status: 'invited' | 'active' | 'disabled';
}

export interface AdminDirectoryEntry extends AdminAccount {
  email: string;
  created_by: string | null;
  created_at: string;
  activated_at: string | null;
}

export interface AdminAuditEntry {
  id: number;
  actor_user_id: string | null;
  actor_alias: string;
  action: string;
  target_user_id: string | null;
  details: { group_id?: string; message_id?: string; title?: string; recipient_count?: number; round_id?: string; alias?: string; before?: string; after?: string; reason?: string; activated?: boolean };
  created_at: string;
}

async function invoke<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    let message = 'El servicio administrativo no está disponible. Inténtalo de nuevo.';
    if (error.context instanceof Response) {
      try {
        const response = await error.context.json();
        if (typeof response.error === 'string') message = response.error;
      } catch { /* Keep a useful message if the gateway returns non-JSON. */ }
    }
    throw new Error(message);
  }
  return data as T;
}

export interface ManagedUser {
 user_id: string; email: string; created_at: string; nick?: string; display_name?: string;
 read_only: boolean; plan: PlanType;
 profile?: UserProfile | null;
 subscription?: {plan_type: PlanType; status: string; current_period_end: string | null} | null;
}
export interface ManagedRound extends Omit<GolfRound, 'status'> {
 status: string; admin_withdrawn_at: string | null; admin_previous_status: string | null;
 completed_at?: string | null; course_name?: string; players_count?: number; group_name?: string; group_code?: string;
}
export interface ManagedRoundDetail {round: ManagedRound; course_name: string; players: RoundPlayer[]; scores: RoundScore[];}
export interface ManagedUserRow extends ManagedUser {
 last_sign_in_at: string | null; rounds_played: number; last_round_at: string | null; groups_count: number;
}
export type MetricsPeriod = 7 | 30 | 90 | 365;
export interface CountBy {count: number}
export interface MetricsOverview {
 days: MetricsPeriod;
 users: {total: number; new: number; with_round: number; signed_in: number; plans: Record<PlanType, number>};
 rounds: {played: number; quick: number; group: number; nine_holes: number; in_progress: number};
 weekly: {week: string; quick: number; group: number}[];
 modes: (CountBy & {mode: string})[];
 courses: (CountBy & {course: string})[];
 frequency: {weekly: number; few_per_month: number; monthly: number; occasional: number};
 groups: {total: number; new: number; active: number; avg_members: number | null};
 invitations: {sent: number; accepted: number; pending_stale: number};
 attention: {inactive_60: number; never_played: number; expiring_7: number};
}
export interface UserInsights {
 last_sign_in_at: string | null;
 rounds: {played: number; quick: number; group: number; last_90: number; first_at: string | null; last_at: string | null};
 weekly: {week: string; count: number}[];
 courses: (CountBy & {course: string; tee: string | null; holes: string})[];
 modes: (CountBy & {mode: string})[];
 groups_created: number;
 groups: {id: string; name: string | null; group_code: string; role: string | null; joined_at: string | null; owner: boolean; members: number; rounds: number; last_round_at: string | null}[];
 invitations_sent: {total: number; accepted: number; pending: number};
}
export interface ManagedGroup {
 id: string; name: string | null; group_code: string; created_at: string | null; max_players: number | null; premium_branding: boolean;
 owner_nick: string | null; members: number; guests: number; rounds: number; rounds_30: number; last_round_at: string | null;
}
export interface ManagedGroupDetail {
 group: {id: string; name: string | null; group_code: string; created_at: string | null; max_players: number | null; premium_branding: boolean; weekend_mode_until: string | null; owner_id: string | null; owner_nick: string | null};
 members: {user_id: string; nick: string | null; display_name: string | null; role: string; joined_at: string | null; rounds: number}[];
 guests: number;
 rounds: {played: number; last_30: number; last_at: string | null};
 modes: (CountBy & {mode: string})[];
 courses: (CountBy & {course: string})[];
 invitations: {pending: number; accepted: number; rejected: number};
 purchases: {product_type: string; status: string; amount_paid: number; created_at: string; active_until: string | null}[];
}
export type AttentionSegment = 'inactive_60' | 'never_played' | 'expiring_7' | 'stale_invitations';
export interface SegmentRow {
 user_id: string; nick: string | null; email: string | null;
 display_name?: string | null; plan?: PlanType; created_at: string; last_sign_in_at?: string | null;
 last_round_at?: string | null; current_period_end?: string | null;
 group_id?: string; group_name?: string | null; group_code?: string; invited_by_nick?: string | null;
}
export const adminService = {
 async segment(segment: AttentionSegment): Promise<{total: number; rows: SegmentRow[]}> {
  const {data,error}=await supabase.rpc('admin_metric_segment',{p_segment:segment}); if(error) throw error; return data;
 },
 async overview(days: MetricsPeriod): Promise<MetricsOverview> {
  const {data,error}=await supabase.rpc('admin_metrics_overview',{p_days:days}); if(error) throw error; return data;
 },
 async userInsights(id: string): Promise<UserInsights> {
  const {data,error}=await supabase.rpc('admin_user_insights',{p_user_id:id}); if(error) throw error; return data;
 },
 async groups(search = '', page = 0): Promise<{groups: ManagedGroup[]; total: number}> {
  const {data,error}=await supabase.rpc('admin_list_groups',{p_search:search,p_page:page}); if(error) throw error; return data;
 },
 async group(id: string): Promise<ManagedGroupDetail> {
  const {data,error}=await supabase.rpc('admin_get_group',{p_group_id:id}); if(error) throw error; return data;
 },
 async rounds(search = '', status = '', kind = '', page = 0, mode = '', group = ''): Promise<{rounds: ManagedRound[]; total: number}> {
  const {data,error}=await supabase.rpc('admin_list_app_rounds_v2',{p_search:search,p_status:status,p_kind:kind,p_page:page,p_mode:mode,p_group:group}); if(error) throw error; return data;
 },
 async round(id: string): Promise<ManagedRoundDetail> {
  const {data,error}=await supabase.rpc('admin_get_app_round',{p_round_id:id}); if(error) throw error; return data;
 },
 async changeRound(round: ManagedRound, action: string, reason: string): Promise<ManagedRoundDetail> {
  const {data,error}=await supabase.rpc('admin_change_app_round',{p_round_id:round.id,p_action:action,p_reason:reason,p_expected:round.updated_at}); if(error) throw error; return data;
 },
 async users(search = '', plan = '', blocked: boolean | null = null, page = 0): Promise<{users: ManagedUserRow[]; total: number}> {
  const {data,error}=await supabase.rpc('admin_list_app_users',{p_search:search,p_plan:plan,p_blocked:blocked,p_page:page});
  if(error) throw error; return data;
 },
 async user(id: string): Promise<ManagedUser> {
  const {data,error}=await supabase.rpc('admin_get_app_user',{p_user_id:id}); if(error) throw error; return data;
 },
 async updateUser(user: ManagedUser, action: string, values: Record<string,unknown>, reason: string): Promise<ManagedUser> {
  const {data,error}=await supabase.rpc('admin_update_app_user',{p_user_id:user.user_id,p_action:action,p_values:values,p_reason:reason,p_expected:user});
  if(error) throw error; return data;
 },
  async getAccount(user: User): Promise<AdminAccount | null> {
    const { data, error } = await supabase.rpc('get_my_app_administrator');
    if (error) {
      // Deploy the frontend before the additive migration without breaking players.
      // Known administrative identities must NEVER fall through into the player app.
      if (error.code === 'PGRST202' && user.app_metadata?.app_account_type !== 'administrator') return null;
      throw new Error('No se han podido comprobar los permisos de esta cuenta.');
    }
    if (!data && user.app_metadata?.app_account_type === 'administrator') {
      throw new Error('La cuenta administrativa necesita completar su configuración.');
    }
    if (data && data.user_id !== user.id) throw new Error('La sesión ha cambiado. Vuelve a entrar.');
    return data as AdminAccount | null;
  },

  async login(alias: string, password: string) {
    const data = await invoke<{ session: { access_token: string; refresh_token: string } }>('admin-auth', { action: 'login', alias, password });
    const { data: session, error } = await supabase.auth.setSession(data.session);
    if (error || !session.user) throw error || new Error('No se ha podido iniciar sesión.');
    return session.user;
  },

  async recover(alias: string) {
    await invoke('admin-auth', { action: 'recover', alias });
  },

  async list(): Promise<AdminDirectoryEntry[]> {
    const { data, error } = await supabase.rpc('list_app_administrators');
    if (error) throw error;
    return data || [];
  },

  async audit(beforeId?: number): Promise<AdminAuditEntry[]> {
    const { data, error } = await supabase.rpc('list_app_admin_audit', { p_before_id: beforeId ?? null });
    if (error) throw error;
    return data || [];
  },

  async recordLogin() {
    const { error } = await supabase.rpc('record_app_admin_login');
    if (error) throw error;
  },

  async invite(alias: string, email: string) {
    return invoke<{ emailSent: boolean; message?: string }>('admin-management', { action: 'invite', alias, email });
  },

  async resend(userId: string) {
    return invoke<{ emailSent: boolean; message?: string }>('admin-management', { action: 'resend', userId });
  },

  async setActive(userId: string, active: boolean, reason: string) {
    const { error } = await supabase.rpc('set_app_administrator_active', { p_user_id: userId, p_active: active, p_reason: reason });
    if (error) throw error;
  },
};
