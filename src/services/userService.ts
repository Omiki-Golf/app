import { effectivePlan } from '../utils/effectivePlan';
import { getReadOnly } from './userRestriction';
import { supabase } from './supabaseClient';
import { UserProfile, GroupMember, GroupInvitation, QuickRoundInvitation, PlanType } from '../types';
import { normalizeAvatarUrl } from '../utils/avatarOptions';
import { clearExpressCredential, readExpressCredential } from '../utils/expressCredential';

export const userService = {
  async getProfile(userId: string): Promise<UserProfile | null> {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw error;
    return data as UserProfile | null;
  },

  async ensureProfileFromMetadata(userId: string, metadata: Record<string, unknown>): Promise<UserProfile | null> {
    const existing = await this.getProfile(userId);
    if (await getReadOnly()) return existing;
    if (existing || metadata.registration_pending !== true || typeof metadata.nick !== 'string') {
      return existing;
    }

    try {
      return await this.createProfile({
        user_id: userId,
        nick: metadata.nick,
        display_name: typeof metadata.display_name === 'string' ? metadata.display_name : undefined,
        avatar_url: normalizeAvatarUrl(typeof metadata.avatar_url === 'string' ? metadata.avatar_url : undefined),
        exact_handicap: typeof metadata.exact_handicap === 'number' ? metadata.exact_handicap : 0,
        default_tee: typeof metadata.default_tee === 'string' ? metadata.default_tee : 'amarillo',
        country: typeof metadata.country === 'string' ? metadata.country : undefined,
        postal_code: typeof metadata.postal_code === 'string' ? metadata.postal_code : undefined,
        age: typeof metadata.age === 'number' ? metadata.age : undefined,
        accepted_terms: metadata.accepted_terms === true,
      });
    } catch (error) {
      const profile = await this.getProfile(userId);
      if (profile) return profile;
      throw error;
    }
  },

  async checkNickAvailable(nick: string): Promise<boolean> {
    const { data, error } = await supabase.rpc('is_nick_available', {
      candidate: nick,
    });
    if (error) throw error;
    return Boolean(data);
  },

  async createProfile(profile: Omit<UserProfile, 'id' | 'created_at' | 'updated_at'>): Promise<UserProfile> {
    const { data, error } = await supabase
      .from('user_profiles')
      .insert(profile)
      .select()
      .single();
    if (error) throw error;
    return data as UserProfile;
  },

  async updateProfile(userId: string, updates: Partial<UserProfile>): Promise<UserProfile> {
    const { data, error } = await supabase
      .from('user_profiles')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .select()
      .single();
    if (error) throw error;
    return data as UserProfile;
  },

  async renameMyNick(nick: string): Promise<UserProfile> {
    const { data, error } = await supabase.rpc('rename_my_nick', { p_nick: nick });
    if (error) throw error;
    return data as UserProfile;
  },

  async searchByNick(nick: string): Promise<UserProfile[]> {
    const { data, error } = await supabase.rpc('search_user_profiles', {
      search_term: nick,
    });
    if (error) throw error;
    return (data || []) as UserProfile[];
  },

  async getQuickRoundInvitations(): Promise<QuickRoundInvitation[]> {
    const { data, error } = await supabase.rpc('list_my_quick_round_invitations');
    if (error) throw error;
    return (data || []) as QuickRoundInvitation[];
  },

  async getQuickRoundInvitationCount(): Promise<number> {
    const { data, error } = await supabase.rpc('count_my_quick_round_invitations');
    if (error) throw error;
    return Number(data || 0);
  },

  async respondToQuickRoundInvitation(id: string, status: 'accepted' | 'rejected'): Promise<void> {
    const { error } = await supabase.rpc('respond_quick_round_invitation', { p_invitation: id, p_status: status });
    if (error) throw error;
  },

  async getPlanType(userId: string): Promise<PlanType> {
    const { data, error } = await supabase
      .from('user_subscriptions')
      .select('plan_type, status, current_period_end, team_trial_ends_at')
      .eq('user_id', userId)
      .eq('status', 'active')
      .maybeSingle();
    if (error) throw error;
    return effectivePlan(data);
  },

  /** Pasa a la cuenta las partidas rápidas creadas en este dispositivo como Express. */
  async claimDeviceRounds(deviceId: string): Promise<number> {
    const credential = readExpressCredential();
    if (!credential || credential.ownerId !== deviceId) throw new Error('Las partidas Express antiguas requieren recuperación revisada.');
    const { data, error } = await supabase.rpc('claim_verified_express_rounds', { p_secret: credential.secret });
    if (error) throw new Error('No se han podido recuperar las partidas Express. Inténtalo de nuevo al iniciar sesión.');
    clearExpressCredential();
    return typeof data === 'number' ? data : 0;
  },

  async startTeamTrial(): Promise<string> {
    const { data, error } = await supabase.rpc('start_team_trial');
    if (error) throw new Error(error.message || 'No se ha podido activar la prueba Team.');
    if (typeof data !== 'string') throw new Error('No se ha podido confirmar la prueba Team.');
    return data;
  },

  async setPlanType(userId: string, planType: PlanType, paymentRef?: string): Promise<void> {
    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + 1);

    const { error } = await supabase
      .from('user_subscriptions')
      .upsert({
        user_id: userId,
        plan_type: planType,
        status: 'active',
        payment_hash: paymentRef,
        current_period_start: new Date().toISOString(),
        current_period_end: expiresAt.toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });
    if (error) throw error;
  },

  async getGroupMembers(groupId: string): Promise<GroupMember[]> {
    const { data, error } = await supabase.rpc('list_identified_group_members', { p_group: groupId });
    if (error) throw error;
    return data || [];
  },

  async manageGroupMember(member: GroupMember, action: 'handicap' | 'remove', handicap18?: number): Promise<void> {
    if (!member.user_id) {
      const { error } = await supabase.rpc('manage_group_guest_player', {
        p_group: member.group_id,
        p_player: member.player_id,
        p_player_revision: member.player_revision,
        p_action: action,
        p_handicap_18: handicap18 ?? null,
      });
      if (error) throw error;
      return;
    }
    const { error } = await supabase.rpc('manage_group_member', {
      p_group: member.group_id, p_user: member.user_id,
      p_member_revision: member.member_revision, p_player_revision: member.player_revision,
      p_action: action, p_handicap_18: handicap18 ?? null,
    });
    if (error) throw error;
  },

  async addGroupMember(groupId: string, userId: string, role: 'admin' | 'member' = 'member', invitedBy?: string): Promise<void> {
    const { error } = await supabase
      .from('group_members')
      .insert({
        group_id: groupId,
        user_id: userId,
        role,
        invited_by: invitedBy,
      });
    if (error) throw error;
  },

  async removeGroupMember(groupId: string, userId: string): Promise<void> {
    const { error } = await supabase
      .from('group_members')
      .delete()
      .eq('group_id', groupId)
      .eq('user_id', userId);
    if (error) throw error;
  },

  async updateMemberRole(groupId: string, userId: string, role: 'admin' | 'member'): Promise<void> {
    const { error } = await supabase
      .from('group_members')
      .update({ role })
      .eq('group_id', groupId)
      .eq('user_id', userId);
    if (error) throw error;
  },

  async getPendingInvitations(userId: string): Promise<GroupInvitation[]> {
    const { data, error } = await supabase
      .from('group_invitations')
      .select(`
        *,
        group:groups!inner(*)
      `)
      .eq('invited_user_id', userId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    if (error) throw error;
    const invitations = ((data || []) as unknown as GroupInvitation[]).filter(invitation => !invitation.group?.archived_at);
    if (!invitations.length) return invitations;
    // invited_by references Auth, not user_profiles. Fetch optional display
    // details separately so a missing/inaccessible profile cannot hide an invite.
    const { data: profiles, error: profileError } = await supabase
      .from('user_profiles')
      .select('user_id, nick, display_name, avatar_url')
      .in('user_id', [...new Set(invitations.map(inv => inv.invited_by))]);
    if (profileError) return invitations;
    return invitations.map(inv => ({
      ...inv,
      inviter_profile: profiles?.find(profile => profile.user_id === inv.invited_by),
    })) as GroupInvitation[];
  },

  async sendInvitation(groupId: string, invitedUserId: string, _invitedBy: string, message?: string): Promise<'pending' | 'accepted' | 'rejected'> {
    const { data, error } = await supabase.rpc('invite_group_user_once', {
      p_group: groupId,
      p_user: invitedUserId,
      p_message: message ?? null,
    });
    if (error) throw error;
    return data as 'pending' | 'accepted' | 'rejected';
  },

  async deleteRejectedInvitation(groupId: string, invitedUserId: string): Promise<void> {
    const { error } = await supabase.rpc('delete_rejected_group_invitation', {
      p_group: groupId,
      p_user: invitedUserId,
    });
    if (error) throw error;
  },

  async getGroupInvitationStatuses(groupId: string): Promise<Array<{ userId: string; status: 'pending' | 'accepted' | 'rejected'; profile?: UserProfile }>> {
    // user_profiles solo deja leer el perfil propio: el nick y el avatar de los invitados
    // llegan por la función, que solo responde a quien gestiona el grupo.
    const { data, error } = await supabase.rpc('list_group_invitations', { p_group: groupId });
    if (error) throw error;
    return ((data || []) as Array<{ invited_user_id: string; status: string; nick: string | null; display_name: string | null; avatar_url: string | null; exact_handicap: number | null }>).map(row => ({
      userId: row.invited_user_id,
      status: row.status as 'pending' | 'accepted' | 'rejected',
      profile: row.nick ? {
        user_id: row.invited_user_id,
        nick: row.nick,
        display_name: row.display_name,
        avatar_url: row.avatar_url ?? undefined,
        exact_handicap: Number(row.exact_handicap ?? 0),
      } as UserProfile : undefined,
    }));
  },

  async addGroupGuest(groupId: string, name: string, handicap18: number): Promise<void> {
    const { error } = await supabase.rpc('add_group_guest_player', {
      p_group: groupId,
      p_name: name,
      p_handicap_18: handicap18,
    });
    if (error) throw error;
  },

  async respondToInvitation(invitationId: string, status: 'accepted' | 'rejected'): Promise<void> {
    const { error } = await supabase.rpc('respond_to_group_invitation', {
      p_invitation: invitationId,
      p_status: status,
    });
    if (error) throw error;
  },

  async getInvitationCount(userId: string): Promise<number> {
    const { count, error } = await supabase
      .from('group_invitations')
      .select('*', { count: 'exact', head: true })
      .eq('invited_user_id', userId)
      .eq('status', 'pending');
    if (error) throw error;
    return count || 0;
  },
};
