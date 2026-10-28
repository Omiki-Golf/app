import { NavigationButton } from './NavigationButton';
import React, { useState, useEffect, useCallback } from 'react';
import { Users, Target, TrendingUp, Calendar, MapPin, Activity, AlertCircle, Settings, Save, Eye, EyeOff } from 'lucide-react';
import { supabase } from '../services/supabaseClient';
import { getErrorMessage } from '../utils/errorMessage';

interface AdminStats {
  users: {
    total: number;
    active7Days: number;
    active30Days: number;
    newThisWeek: number;
    newThisMonth: number;
  };
  groups: {
    total: number;
    active: number;
    inactive: number;
    avgPlayersPerGroup: number;
    topGroups: Array<{ name: string; roundsCount: number }>;
  };
  rounds: {
    totalQuick: number;
    totalMultipartida: number;
    totalArchived: number;
    totalQuickCompleted: number;
    totalMultipartidaCompleted: number;
    total9Holes: number;
    total18Holes: number;
    slopeEnabled: number;
    slopeDisabled: number;
  };
  courses: {
    mostPlayed: Array<{ name: string; count: number }>;
  };
  activity: {
    roundsByDay: Array<{ date: string; count: number }>;
  };
}

interface AdminDashboardProps {
  onBack: () => void;
}

export default function AdminDashboard({ onBack }: AdminDashboardProps) {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'stats' | 'config'>('stats');

  const [currentEmail, setCurrentEmail] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const [configMessage, setConfigMessage] = useState('');
  const [configError, setConfigError] = useState('');

  const loadAdminConfig = useCallback(async () => {
    try {
      const { data: user } = await supabase.auth.getUser();
      if (user.user?.email) {
        setCurrentEmail(user.user.email);
      }

      const { data: config } = await supabase
        .from('admin_config')
        .select('admin_pin')
        .single();

      if (config) {
        setCurrentPin(config.admin_pin);
      }
    } catch (err) {
      console.error('Error loading admin config:', err);
    }
  }, []);

  const handleChangeEmail = async () => {
    try {
      setConfigMessage('');
      setConfigError('');

      if (!newEmail) {
        setConfigError('Ingresa el nuevo correo electrónico');
        return;
      }

      const { error } = await supabase.auth.updateUser({ email: newEmail });

      if (error) throw error;

      await supabase
        .from('admin_config')
        .update({ admin_email: newEmail, updated_at: new Date().toISOString() })
        .eq('id', (await supabase.from('admin_config').select('id').single()).data?.id);

      setConfigMessage('Correo actualizado correctamente. Revisa tu nuevo correo para confirmar el cambio.');
      setNewEmail('');
      setCurrentEmail(newEmail);
    } catch (err: unknown) {
      console.error('Error changing email:', err);
      setConfigError(getErrorMessage(err, 'Error al cambiar el correo'));
    }
  };

  const handleChangePassword = async () => {
    try {
      setConfigMessage('');
      setConfigError('');

      if (!newPassword) {
        setConfigError('Ingresa la nueva contraseña');
        return;
      }

      if (newPassword !== confirmPassword) {
        setConfigError('Las contraseñas no coinciden');
        return;
      }

      if (newPassword.length < 6) {
        setConfigError('La contraseña debe tener al menos 6 caracteres');
        return;
      }

      const { error } = await supabase.auth.updateUser({ password: newPassword });

      if (error) throw error;

      setConfigMessage('Contraseña actualizada correctamente');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: unknown) {
      console.error('Error changing password:', err);
      setConfigError(getErrorMessage(err, 'Error al cambiar la contraseña'));
    }
  };

  const handleChangePin = async () => {
    try {
      setConfigMessage('');
      setConfigError('');

      if (!newPin) {
        setConfigError('Ingresa el nuevo PIN');
        return;
      }

      if (newPin !== confirmPin) {
        setConfigError('Los PINs no coinciden');
        return;
      }

      if (newPin.length !== 4 || !/^\d{4}$/.test(newPin)) {
        setConfigError('El PIN debe tener exactamente 4 dígitos');
        return;
      }

      const { data: config } = await supabase.from('admin_config').select('id').single();

      if (!config) {
        setConfigError('No se encontró la configuración del administrador');
        return;
      }

      const { error } = await supabase
        .from('admin_config')
        .update({ admin_pin: newPin, updated_at: new Date().toISOString() })
        .eq('id', config.id);

      if (error) throw error;

      setConfigMessage('PIN actualizado correctamente');
      setCurrentPin(newPin);
      setNewPin('');
      setConfirmPin('');
    } catch (err: unknown) {
      console.error('Error changing PIN:', err);
      setConfigError(getErrorMessage(err, 'Error al cambiar el PIN'));
    }
  };

  const fetchUsersStats = useCallback(async () => {
    const { data: groups } = await supabase
      .from('groups')
      .select('user_auth_id, created_at');

    const uniqueUsers = new Set<string>();
    groups?.forEach((g) => {
      if (g.user_auth_id) {
        uniqueUsers.add(g.user_auth_id);
      }
    });

    const totalUsers = uniqueUsers.size;

    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const newThisWeek = groups?.filter((g) => {
      const createdAt = new Date(g.created_at);
      return createdAt >= oneWeekAgo;
    }).length || 0;

    const newThisMonth = groups?.filter((g) => {
      const createdAt = new Date(g.created_at);
      return createdAt >= oneMonthAgo;
    }).length || 0;

    return {
      total: totalUsers,
      active7Days: totalUsers,
      active30Days: totalUsers,
      newThisWeek,
      newThisMonth,
    };
  }, []);

  const fetchGroupsStats = useCallback(async () => {
    const { data: groups } = await supabase
      .from('groups')
      .select('id, name');

    const total = groups?.length || 0;

    const { data: rounds } = await supabase
      .from('golf_rounds')
      .select('group_id');

    const { data: archivedRounds } = await supabase
      .from('archived_rounds')
      .select('group_id');

    const roundsByGroup: Record<string, number> = {};
    rounds?.forEach((r) => {
      if (r.group_id) {
        roundsByGroup[r.group_id] = (roundsByGroup[r.group_id] || 0) + 1;
      }
    });
    archivedRounds?.forEach((r) => {
      if (r.group_id) {
        roundsByGroup[r.group_id] = (roundsByGroup[r.group_id] || 0) + 1;
      }
    });

    const groupsWithRounds = groups?.map((g) => ({
      name: g.name,
      roundsCount: roundsByGroup[g.id] || 0,
    })) || [];

    const active = groupsWithRounds.filter((g) => g.roundsCount > 0).length;
    const inactive = total - active;

    const { data: allPlayers } = await supabase
      .from('players')
      .select('group_id');

    const playersByGroup: Record<string, number> = {};
    allPlayers?.forEach((p) => {
      if (p.group_id) {
        playersByGroup[p.group_id] = (playersByGroup[p.group_id] || 0) + 1;
      }
    });

    const avgPlayersPerGroup = total > 0
      ? Object.values(playersByGroup).reduce((sum, count) => sum + count, 0) / total
      : 0;

    const topGroups = groupsWithRounds
      .sort((a, b) => b.roundsCount - a.roundsCount)
      .slice(0, 5);

    return {
      total,
      active,
      inactive,
      avgPlayersPerGroup: Math.round(avgPlayersPerGroup * 10) / 10,
      topGroups,
    };
  }, []);

  const fetchRoundsStats = useCallback(async () => {
    const { data: activeRounds } = await supabase
      .from('golf_rounds')
      .select('*')
      .neq('status', 'cancelled');

    const { data: archivedRounds } = await supabase
      .from('archived_rounds')
      .select('*');

    const { data: completedRounds } = await supabase
      .from('golf_rounds')
      .select('*')
      .not('completed_at', 'is', null);

    const allRounds = [...(activeRounds || [])];

    const totalQuick = activeRounds?.filter((r) => !r.group_id).length || 0;
    const totalMultipartida = activeRounds?.filter((r) => r.group_id).length || 0;
    const totalArchived = archivedRounds?.length || 0;

    const totalQuickCompleted = completedRounds?.filter((r) => !r.group_id).length || 0;
    const totalMultipartidaCompleted = completedRounds?.filter((r) => r.group_id).length || 0;

    const total9Holes = allRounds.filter((r) => r.holes_range === '1-9' || r.holes_range === '10-18').length;
    const total18Holes = allRounds.filter((r) => !r.holes_range || r.holes_range === '1-18').length;

    const slopeEnabled = allRounds.filter((r) => r.use_slope).length;
    const slopeDisabled = allRounds.filter((r) => !r.use_slope).length;

    return {
      totalQuick,
      totalMultipartida,
      totalArchived,
      totalQuickCompleted,
      totalMultipartidaCompleted,
      total9Holes,
      total18Holes,
      slopeEnabled,
      slopeDisabled,
    };
  }, []);

  const fetchCoursesStats = useCallback(async () => {
    const { data: rounds } = await supabase
      .from('golf_rounds')
      .select('course_id, golf_courses!inner(name)');

    const courseCount: Record<string, { name: string; count: number }> = {};

    rounds?.forEach((r) => {
      const courseName = (r.golf_courses as { name?: string } | null)?.name || 'Unknown';
      if (!courseCount[courseName]) {
        courseCount[courseName] = { name: courseName, count: 0 };
      }
      courseCount[courseName].count++;
    });

    const mostPlayed = Object.values(courseCount)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return { mostPlayed };
  }, []);

  const fetchActivityStats = useCallback(async () => {
    const { data: rounds } = await supabase
      .from('golf_rounds')
      .select('created_at')
      .order('created_at', { ascending: true });

    const roundsByDay: Record<string, number> = {};

    rounds?.forEach((r) => {
      const date = new Date(r.created_at).toISOString().split('T')[0];
      roundsByDay[date] = (roundsByDay[date] || 0) + 1;
    });

    const last30Days = Object.entries(roundsByDay)
      .slice(-30)
      .map(([date, count]) => ({ date, count }));

    return { roundsByDay: last30Days };
  }, []);

  const loadAdminStats = useCallback(async () => {
    try {
      setLoading(true);
      setError('');

      const [usersStats, groupsStats, roundsStats, coursesStats, activityStats] = await Promise.all([
        fetchUsersStats(),
        fetchGroupsStats(),
        fetchRoundsStats(),
        fetchCoursesStats(),
        fetchActivityStats(),
      ]);

      setStats({
        users: usersStats,
        groups: groupsStats,
        rounds: roundsStats,
        courses: coursesStats,
        activity: activityStats,
      });
    } catch (err: unknown) {
      console.error('Error loading admin stats:', err);
      setError('Error al cargar las estadísticas de administrador');
    } finally {
      setLoading(false);
    }
  }, [fetchUsersStats, fetchGroupsStats, fetchRoundsStats, fetchCoursesStats, fetchActivityStats]);

  useEffect(() => {
    void loadAdminStats();
    void loadAdminConfig();
  }, [loadAdminStats, loadAdminConfig]);

  if (loading) {
    return (
      <div className="min-h-screen bg-app p-4 flex items-center justify-center">
        <div className="text-center">
          <Activity className="w-12 h-12 text-ink-3 animate-spin mx-auto mb-4" />
          <p className="text-ink-2 text-lg">Cargando estadísticas...</p>
        </div>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="min-h-screen bg-app p-4 flex items-center justify-center">
        <div className="bg-red-50 border border-red-200 text-red-700 px-6 py-4 rounded-xl flex items-start gap-3 max-w-md">
          <AlertCircle size={24} className="flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold mb-1">Error</p>
            <p>{error || 'No se pudieron cargar las estadísticas'}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-app p-4">
      <div className="max-w-7xl mx-auto">
        <div className="bg-card rounded-2xl shadow-card p-6 mb-6">
          <NavigationButton destination="home"
            onClick={onBack}
            className="flex items-center gap-2 text-ink-3 hover:text-ink mb-4 transition-colors"
          />

          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 bg-card-2 rounded-xl">
              <Activity className="w-8 h-8 text-ink-2" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-ink">Panel de Administración</h1>
              <p className="text-ink-3">Estadísticas y configuración del sistema</p>
            </div>
          </div>

          <div className="flex gap-4 border-b border-slate-200">
            <button
              onClick={() => setActiveTab('stats')}
              className={`pb-3 px-4 font-semibold transition-colors ${
                activeTab === 'stats'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-ink-3 hover:text-ink-2'
              }`}
            >
              <div className="flex items-center gap-2">
                <Activity size={18} />
                Estadísticas
              </div>
            </button>
            <button
              onClick={() => setActiveTab('config')}
              className={`pb-3 px-4 font-semibold transition-colors ${
                activeTab === 'config'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-ink-3 hover:text-ink-2'
              }`}
            >
              <div className="flex items-center gap-2">
                <Settings size={18} />
                Configuración
              </div>
            </button>
          </div>
        </div>

        {activeTab === 'config' && (
          <div className="bg-card rounded-2xl shadow-card p-6 mb-6">
            <div className="max-w-2xl mx-auto">
              <h2 className="text-2xl font-bold text-ink mb-6">Configuración de Administrador</h2>

              {configMessage && (
                <div className="mb-6 p-4 bg-accent-soft border border-accent-ring text-accent-ink rounded-xl">
                  {configMessage}
                </div>
              )}

              {configError && (
                <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl">
                  {configError}
                </div>
              )}

              <div className="space-y-8">
                <div className="border-b border-slate-200 pb-8">
                  <h3 className="text-lg font-semibold text-ink mb-4">Cambiar Correo Electrónico</h3>
                  <p className="text-sm text-ink-3 mb-4">Correo actual: {currentEmail}</p>
                  <div className="space-y-3">
                    <input
                      type="email"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      placeholder="Nuevo correo electrónico"
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      onClick={handleChangeEmail}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      <Save size={18} />
                      Actualizar Correo
                    </button>
                  </div>
                </div>

                <div className="border-b border-slate-200 pb-8">
                  <h3 className="text-lg font-semibold text-ink mb-4">Cambiar Contraseña</h3>
                  <div className="space-y-3">
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Nueva contraseña"
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <button
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-4 hover:text-ink-3"
                      >
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Confirmar nueva contraseña"
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      onClick={handleChangePassword}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      <Save size={18} />
                      Actualizar Contraseña
                    </button>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-ink mb-4">Cambiar PIN de Acceso</h3>
                  <p className="text-sm text-ink-3 mb-4">PIN actual: {showPin ? currentPin : '••••'}</p>
                  <button
                    onClick={() => setShowPin(!showPin)}
                    className="text-sm text-blue-600 hover:text-blue-700 mb-4"
                  >
                    {showPin ? 'Ocultar PIN' : 'Mostrar PIN'}
                  </button>
                  <div className="space-y-3">
                    <input
                      type={showPin ? 'text' : 'password'}
                      value={newPin}
                      onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      placeholder="Nuevo PIN (4 dígitos)"
                      maxLength={4}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <input
                      type={showPin ? 'text' : 'password'}
                      value={confirmPin}
                      onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      placeholder="Confirmar nuevo PIN"
                      maxLength={4}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      onClick={handleChangePin}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      <Save size={18} />
                      Actualizar PIN
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'stats' && (
          <>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
          <div className="bg-card rounded-xl shadow-card p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Users className="w-6 h-6 text-blue-600" />
              </div>
              <h2 className="text-xl font-bold text-ink">Usuarios</h2>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-ink-3">Total registrados</span>
                <span className="text-2xl font-bold text-ink">{stats.users.total}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-ink-3">Activos (7 días)</span>
                <span className="font-semibold text-ink-2">{stats.users.active7Days}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-ink-3">Activos (30 días)</span>
                <span className="font-semibold text-ink-2">{stats.users.active30Days}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-ink-3">Nuevos esta semana</span>
                <span className="font-semibold text-accent-ink">{stats.users.newThisWeek}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-ink-3">Nuevos este mes</span>
                <span className="font-semibold text-accent-ink">{stats.users.newThisMonth}</span>
              </div>
            </div>
          </div>

          <div className="bg-card rounded-xl shadow-card p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-accent-soft rounded-lg">
                <Target className="w-6 h-6 text-accent-ink" />
              </div>
              <h2 className="text-xl font-bold text-ink">Grupos</h2>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-ink-3">Total de grupos</span>
                <span className="text-2xl font-bold text-ink">{stats.groups.total}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-ink-3">Grupos activos</span>
                <span className="font-semibold text-accent-ink">{stats.groups.active}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-ink-3">Grupos inactivos</span>
                <span className="font-semibold text-ink-4">{stats.groups.inactive}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-ink-3">Promedio jugadores</span>
                <span className="font-semibold text-ink-2">{stats.groups.avgPlayersPerGroup}</span>
              </div>
            </div>
          </div>

          <div className="bg-card rounded-xl shadow-card p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-amber-100 rounded-lg">
                <Calendar className="w-6 h-6 text-amber-700" />
              </div>
              <h2 className="text-xl font-bold text-ink">Partidas</h2>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-ink-3">Partidas rápidas activas</span>
                <span className="text-2xl font-bold text-ink">{stats.rounds.totalQuick}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-ink-3">Rápidas completadas</span>
                <span className="font-semibold text-accent-ink">{stats.rounds.totalQuickCompleted}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-ink-3">Multipartidetas activas</span>
                <span className="font-semibold text-ink-2">{stats.rounds.totalMultipartida}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-ink-3">Multipartidetas completadas</span>
                <span className="font-semibold text-accent-ink">{stats.rounds.totalMultipartidaCompleted}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-ink-3">Archivadas</span>
                <span className="font-semibold text-ink-4">{stats.rounds.totalArchived}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-ink-3">9 hoyos</span>
                <span className="font-semibold text-blue-600">{stats.rounds.total9Holes}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-ink-3">18 hoyos</span>
                <span className="font-semibold text-blue-600">{stats.rounds.total18Holes}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <div className="bg-card rounded-xl shadow-card p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-purple-100 rounded-lg">
                <TrendingUp className="w-6 h-6 text-purple-600" />
              </div>
              <h2 className="text-xl font-bold text-ink">Uso de Slope</h2>
            </div>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-ink-3">Con Slope</span>
                  <span className="font-bold text-accent-ink">{stats.rounds.slopeEnabled}</span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-3">
                  <div
                    className="bg-accent h-3 rounded-full transition-all"
                    style={{
                      width: `${
                        (stats.rounds.slopeEnabled /
                          (stats.rounds.slopeEnabled + stats.rounds.slopeDisabled)) *
                        100
                      }%`,
                    }}
                  />
                </div>
              </div>
              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-ink-3">Sin Slope</span>
                  <span className="font-bold text-ink-4">{stats.rounds.slopeDisabled}</span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-3">
                  <div
                    className="bg-ink-4 h-3 rounded-full transition-all"
                    style={{
                      width: `${
                        (stats.rounds.slopeDisabled /
                          (stats.rounds.slopeEnabled + stats.rounds.slopeDisabled)) *
                        100
                      }%`,
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="bg-card rounded-xl shadow-card p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-rose-100 rounded-lg">
                <MapPin className="w-6 h-6 text-rose-600" />
              </div>
              <h2 className="text-xl font-bold text-ink">Campos Más Jugados</h2>
            </div>
            <div className="space-y-3">
              {stats.courses.mostPlayed.length > 0 ? (
                stats.courses.mostPlayed.map((course, index) => (
                  <div key={index} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-bold text-ink-4">#{index + 1}</span>
                      <span className="text-ink-2">{course.name}</span>
                    </div>
                    <span className="font-bold text-ink">{course.count}</span>
                  </div>
                ))
              ) : (
                <p className="text-ink-3 text-center py-4">No hay datos disponibles</p>
              )}
            </div>
          </div>
        </div>

        <div className="bg-card rounded-xl shadow-card p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-cyan-100 rounded-lg">
              <Target className="w-6 h-6 text-cyan-600" />
            </div>
            <h2 className="text-xl font-bold text-ink">Top 5 Grupos Más Activos</h2>
          </div>
          <div className="space-y-3">
            {stats.groups.topGroups.length > 0 ? (
              stats.groups.topGroups.map((group, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-card-2 rounded-lg">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl font-bold text-ink-4">#{index + 1}</span>
                    <span className="text-ink font-semibold">{group.name}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-2xl font-bold text-cyan-600">{group.roundsCount}</span>
                    <span className="text-ink-3 text-sm ml-1">partidas</span>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-ink-3 text-center py-4">No hay grupos con partidas</p>
            )}
          </div>
        </div>

        {stats.activity.roundsByDay.length > 0 && (
          <div className="bg-card rounded-xl shadow-card p-6 mt-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-indigo-100 rounded-lg">
                <TrendingUp className="w-6 h-6 text-indigo-600" />
              </div>
              <h2 className="text-xl font-bold text-ink">Actividad Reciente (Últimos 30 días)</h2>
            </div>
            <div className="h-64 flex items-end justify-between gap-1">
              {stats.activity.roundsByDay.map((day, index) => {
                const maxCount = Math.max(...stats.activity.roundsByDay.map((d) => d.count));
                const height = (day.count / maxCount) * 100;
                return (
                  <div key={index} className="flex-1 flex flex-col items-center gap-1">
                    <div
                      className="w-full bg-indigo-500 rounded-t hover:bg-indigo-600 transition-colors cursor-pointer"
                      style={{ height: `${height}%`, minHeight: day.count > 0 ? '4px' : '0' }}
                      title={`${day.date}: ${day.count} partidas`}
                    />
                    {index % 5 === 0 && (
                      <span className="text-xs text-ink-3 -rotate-45 origin-top-left mt-2">
                        {new Date(day.date).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' })}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
          </>
        )}
      </div>
    </div>
  );
}
