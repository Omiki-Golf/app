import { WriteButton } from '../context/ReadOnlyContext';
import { NavigationButton } from './NavigationButton';
import React, { useState, useEffect } from 'react';
//import { Users, LogIn, Plus, Zap, User, Flag, UserCheck, RefreshCw, Mail, Lock, Eye, EyeOff, AlertCircle } from 'lucide-react';
// 1. Añade Share2 al import de lucide-react
import { Users, LogIn, Plus, Zap, User, Flag, UserCheck, RefreshCw, Mail, Lock, Eye, EyeOff, AlertCircle, Share2} from 'lucide-react';
import { Group, UserTier } from '../types';
import { supabase } from '../services/supabaseClient';
import ComingSoonModal from './ComingSoonModal';
import CreateGroupComingSoonModal from './CreateGroupComingSoonModal';
import ShareModal from './ShareModal';

interface GroupSetupProps {
  onGroupCreated: (group: Group) => void;
  onGroupJoined: (group: Group) => void;
  onQuickPlay: () => void;
  onJoinQuickPlay: () => void;
  onShowAuth?: () => void;
  onJoinRound?: (roundId: string) => void;
  authUser?: any;
  onLogout?: () => void;
}

const generateRandomCode = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

export default function GroupSetup({ onGroupCreated, onGroupJoined, onQuickPlay, onJoinQuickPlay, onShowAuth, onJoinRound, authUser, onLogout }: GroupSetupProps) {
  const [mode, setMode] = useState<'choose' | 'create' | 'join'>('choose');
  const [groupName, setGroupName] = useState('');
  const [autoCode, setAutoCode] = useState(generateRandomCode());
  const [customCode, setCustomCode] = useState('');
  const [useCustomCode, setUseCustomCode] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [wantsAccount, setWantsAccount] = useState(false);
  const [showComingSoonModal, setShowComingSoonModal] = useState(false);
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showProfileDetails, setShowProfileDetails] = useState(false);
  const userTier = ((authUser?.user_metadata?.user_tier || authUser?.user_metadata?.tier || 'Express') as UserTier) || 'Express';

  useEffect(() => {
    if (mode === 'create') {
      setAutoCode(generateRandomCode());
      setGroupName('');
      setCustomCode('');
      setUseCustomCode(false);
      setError('');
    }
  }, [mode]);

  const handleCreateGroup = async () => {
    if (!groupName.trim()) {
      setError('El nombre del grupo es obligatorio');
      return;
    }

    if (useCustomCode && customCode.length < 6) {
      setError('El código personalizado debe tener al menos 6 caracteres');
      return;
    }

    if (wantsAccount) {
      if (!email || !password) {
        setError('Por favor ingresa email y contraseña para crear una cuenta');
        return;
      }

      if (password !== confirmPassword) {
        setError('Las contraseñas no coinciden');
        return;
      }

      if (password.length < 6) {
        setError('La contraseña debe tener al menos 6 caracteres');
        return;
      }
    }

    setLoading(true);
    setError('');
    try {
      if (wantsAccount) {
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email,
          password,
        });

        if (authError) throw authError;

        if (!authData.user) {
          throw new Error('Error al crear la cuenta');
        }
      }

      const { golfService } = await import('../services/golfService');
      const codeToUse = useCustomCode ? customCode : autoCode;
      const group = await golfService.createGroup(groupName.trim(), codeToUse);
      onGroupCreated(group);
    } catch (err: any) {
      if (err.message?.includes('duplicate') || err.message?.includes('already exists')) {
        setError('Este código ya está en uso. Por favor elige otro.');
      } else if (err.message?.includes('User already registered')) {
        setError('Este email ya está registrado. Inicia sesión en su lugar.');
      } else {
        setError(err.message || 'Error al crear el grupo');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateNewCode = () => {
    setAutoCode(generateRandomCode());
  };

  const handleJoinGroup = async () => {
    if (joinCode.length < 4 || joinCode.length > 20) {
      setError('El código debe tener entre 4 y 20 caracteres');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const { golfService } = await import('../services/golfService');
      const { accessCodeStorage } = await import('../utils/accessCode');

      try {
        const group = await golfService.joinGroup(joinCode);
        onGroupJoined(group);
        return;
      } catch (groupErr: any) {
        console.log('No se encontró grupo, buscando partida...');
      }

      const round = await golfService.getRoundByAccessCode(joinCode, null, true);

      if (round) {
        if (!round.group_id) {
          setError('Esta partida no pertenece a ningún grupo');
          return;
        }

        const { data: groupData } = await supabase
          .from('groups')
          .select('*')
          .eq('id', round.group_id)
          .maybeSingle();

        if (!groupData) {
          setError('No se encontró el grupo asociado a esta partida');
          return;
        }

        accessCodeStorage.saveAccessCode(round.id, round.access_code);

        // Mark as limited access since they joined with a round code, not group code
        const { storageUtils } = await import('../utils/storage');
        storageUtils.saveCurrentGroup(groupData.id, groupData.group_code, false, true);

        onGroupJoined(groupData);

        if (onJoinRound) {
          setTimeout(() => {
            onJoinRound(round.id);
          }, 100);
        }
        return;
      }

      setError('Código no válido. No se encontró ningún grupo o partida.');
    } catch (err: any) {
      setError(err.message || 'Error al buscar el código');
    } finally {
      setLoading(false);
    }
  };

  if (mode === 'choose') {
    return (
      <div className="min-h-screen bg-app p-4 flex items-center justify-center">
        <div className="max-w-md w-full bg-card rounded-2xl shadow-card p-8">

          {/* Header con login/logout button */}
          <div className="flex items-center justify-between mb-6 min-h-10">
            <div></div>
            {authUser ? (
              <div className="relative">
                {/* Avatar Button */}
                <button
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className="flex items-center justify-center w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 text-white font-bold hover:shadow-lg transition-shadow cursor-pointer"
                  title={authUser.email}
                >
                  {authUser.email?.charAt(0).toUpperCase() || 'U'}
                </button>

                {/* Dropdown Menu */}
                {showUserMenu && (
                  <div className="absolute right-0 mt-2 w-48 bg-card rounded-lg shadow-card border border-line z-50">
                    {/* Email Header */}
                    <div className="px-4 py-3 border-b border-line">
                      <p className="text-xs text-ink-3 font-medium">CUENTA</p>
                      <p className="text-sm text-ink font-medium truncate">{authUser.email}</p>
                    </div>

                    {/* Menu Items */}
                    <button
                      onClick={() => {
                        setShowUserMenu(false);
                        if (typeof window !== 'undefined') {
                          const event = new CustomEvent('open-profile-screen');
                          window.dispatchEvent(event);
                        }
                      }}
                      className="w-full px-4 py-3 text-left text-sm text-ink-2 hover:bg-card-2 transition-colors flex items-center gap-2"
                    >
                      <UserCheck size={16} />
                      Mis Datos
                    </button>

                    {showProfileDetails && (
                      <div className="border-t border-line bg-card-2 px-4 py-3">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-3">Perfil</p>
                        <p className="mt-1 text-sm text-ink font-medium truncate">{authUser.email}</p>
                        <div className="mt-2 inline-flex items-center rounded-full bg-accent-soft px-2.5 py-1 text-xs font-semibold text-accent-ink">
                          Tier: {userTier}
                        </div>
                      </div>
                    )}

                    {/* Separator */}
                    <div className="border-t border-line"></div>

                    {/* Logout */}
                    <NavigationButton destination="logout"
                      onClick={() => {
                      setShowUserMenu(false);
                      onLogout?.();
                      }}
                      className=" px-3 py-3 text-left text-sm text-red-600 hover:bg-red-50 transition-colors flex items-center gap-2 font-medium"
                    />
                  </div>
                )}
              </div>
            ) : (
              <button
                onClick={onShowAuth}
                className="flex items-center gap-2 text-blue-600 hover:text-blue-700 hover:bg-blue-50 px-4 py-2 rounded-lg transition-colors text-sm font-medium border border-blue-600"
                title="Inicia sesión"
              >
                <UserCheck size={18} />
                Entrar
              </button>
            )}
          </div>

          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-accent-soft rounded-full mb-4">
              <Flag className="w-8 h-8 text-accent-ink" />
            </div>
            <h1 className="text-3xl font-bold text-ink mb-2">Omiki Golf</h1>
            <p className="text-ink-3">Tu compañero de golf</p>
          </div>

          <div className="space-y-3">
            <WriteButton
              onClick={onQuickPlay}
              className="w-full flex items-center justify-center gap-3 bg-accent text-on-accent px-6 py-3 rounded-xl hover:bg-accent-hover transition-colors font-semibold shadow-card"
            >
              <Zap className="w-6 h-6" />
              Crear Partideta Rápida
            </WriteButton>

            <WriteButton
              onClick={onJoinQuickPlay}
              className="w-full flex items-center justify-center gap-3 bg-card text-accent-ink border-2 border-accent px-6 py-3 rounded-xl hover:bg-accent-soft transition-colors font-semibold"
            >
              <LogIn className="w-6 h-6" />
              Unirse a Partideta Rápida
            </WriteButton>

            <WriteButton
              onClick={() => setShowCreateGroupModal(true)}
              className="w-full flex items-center justify-center gap-3 bg-accent text-on-accent px-6 py-3 rounded-xl hover:bg-accent-hover transition-colors font-semibold shadow-card"
            >
              <Plus className="w-6 h-6" />
              Crear Multipartideta
            </WriteButton>

            <button
              onClick={() => setMode('join')}
              className="w-full flex items-center justify-center gap-3 bg-card text-accent-ink border-2 border-accent px-6 py-3 rounded-xl hover:bg-accent-soft transition-colors font-semibold"
            >
              <LogIn className="w-6 h-6" />
              Unirse a Multipartideta
            </button>

            <button
              onClick={() => setShowShareModal(true)}
              className="w-full flex items-center justify-center gap-3 bg-slate-800 text-white px-6 py-3 rounded-xl hover:bg-slate-900 transition-colors font-semibold shadow"
            >
              <Share2 className="w-5 h-5" />
              Compartir App / Código QR
            </button>
          </div>
          {showComingSoonModal && (
            <ComingSoonModal onClose={() => setShowComingSoonModal(false)} />
          )}
          {showCreateGroupModal && (
            <CreateGroupComingSoonModal onClose={() => setShowCreateGroupModal(false)} />
          )}
          {showShareModal && (
            <ShareModal onClose={() => setShowShareModal(false)} />
          )}
        </div>
      </div>
    );
  }

  if (mode === 'create') {
    return (
      <div className="min-h-screen bg-app p-4 flex items-center justify-center">
        <div className="max-w-md w-full bg-card rounded-2xl shadow-card p-8">
          <NavigationButton destination="back"
            onClick={() => setMode('choose')}
            disabled={loading}
            className="mb-4 px-3 py-3 border-2 border-line-2 text-ink-2 rounded-xl hover:bg-card-2 transition-colors font-semibold disabled:opacity-50"
          />
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-accent-soft rounded-full mb-4">
              <Plus className="w-8 h-8 text-accent-ink" />
            </div>
            <h2 className="text-3xl font-bold text-ink mb-2">Crear Multipartideta</h2>
            <p className="text-ink-3">Configura tu grupo</p>
          </div>

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-ink-2 mb-2">
                Nombre del Grupo <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="Ej: Amigos del Golf"
                className="w-full px-4 py-3 border border-line-2 rounded-xl focus:ring-2 focus:ring-accent focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-ink-2 mb-2">
                Código de Acceso
              </label>

              {!useCustomCode ? (
                <div className="space-y-3">
                  <div className="bg-card-2 border-2 border-line-2 rounded-xl py-4 px-6 text-center">
                    <div className="text-3xl font-bold text-accent-ink tracking-widest font-mono">
                      {autoCode}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleGenerateNewCode}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm text-accent-ink hover:text-accent-ink hover:bg-accent-soft rounded-lg transition-colors"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Generar otro código
                  </button>
                </div>
              ) : (
                <input
                  type="text"
                  value={customCode}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value.length <= 20) {
                      setCustomCode(value);
                    }
                  }}
                  placeholder="Mínimo 6 caracteres"
                  className="w-full px-4 py-3 border border-line-2 rounded-xl focus:ring-2 focus:ring-accent focus:border-transparent text-center text-xl font-mono tracking-wider"
                />
              )}

              <label className="flex items-center gap-2 mt-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useCustomCode}
                  onChange={(e) => setUseCustomCode(e.target.checked)}
                  className="w-4 h-4 text-accent-ink border-line-2 rounded focus:ring-accent"
                />
                <span className="text-sm text-ink-2">Personalizar código</span>
              </label>
            </div>

            <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={wantsAccount}
                  onChange={(e) => setWantsAccount(e.target.checked)}
                  className="w-4 h-4 text-blue-600 border-line-2 rounded focus:ring-blue-500 mt-1"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <UserCheck className="w-5 h-5 text-blue-600" />
                    <h3 className="font-semibold text-ink">
                      Crear cuenta para guardar mis grupos
                    </h3>
                  </div>
                  <p className="text-sm text-ink-3">
                    Accede desde cualquier dispositivo, gestiona todos tus grupos y revisa todas las estadisticas
                  </p>
                </div>
              </label>

              {wantsAccount && (
                <div className="mt-4 space-y-4 pt-4 border-t border-blue-200">
                  <div>
                    <label className="block text-sm font-medium text-ink-2 mb-2">
                      Correo Electrónico
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-3.5 text-ink-4" size={20} />
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="tu@email.com"
                        className="w-full pl-10 pr-4 py-3 border border-line-2 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-ink-2 mb-2">
                      Contraseña
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3.5 text-ink-4" size={20} />
                      <input
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Mínimo 6 caracteres"
                        className="w-full pl-10 pr-12 py-3 border border-line-2 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-3.5 text-ink-4 hover:text-ink-3 transition-colors"
                      >
                        {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-ink-2 mb-2">
                      Confirmar Contraseña
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3.5 text-ink-4" size={20} />
                      <input
                        type={showConfirmPassword ? "text" : "password"}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Repite tu contraseña"
                        className="w-full pl-10 pr-12 py-3 border border-line-2 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-3 top-3.5 text-ink-4 hover:text-ink-3 transition-colors"
                      >
                        {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                      </button>
                    </div>
                  </div>

                  <p className="text-xs text-ink-3">
                    Si ya tienes cuenta,{' '}
                    <button
                      type="button"
                      onClick={onShowAuth}
                      className="text-blue-600 hover:text-blue-700 font-medium underline"
                    >
                      inicia sesión aquí
                    </button>
                  </p>
                </div>
              )}
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl">
                {error}
              </div>
            )}

            <div className="flex gap-3">

              <WriteButton
                onClick={handleCreateGroup}
                disabled={loading || !groupName.trim() || (useCustomCode && customCode.length < 6)}
                className="flex-1 bg-accent text-on-accent px-6 py-3 rounded-xl hover:bg-accent-hover transition-colors font-semibold shadow-card disabled:opacity-50"
              >
                {loading ? 'Creando...' : 'Crear Grupo'}
              </WriteButton>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-app p-4 flex items-center justify-center">
      <div className="max-w-md w-full bg-card rounded-2xl shadow-card p-8">
        <NavigationButton destination="back"
          onClick={() => setMode('choose')}
          disabled={loading}
          className="mb-4 px-3 py-3 border-2 border-line-2 text-ink-2 rounded-xl hover:bg-card-2 transition-colors font-semibold disabled:opacity-50"
        />
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-accent-soft rounded-full mb-4">
            <LogIn className="w-8 h-8 text-accent-ink" />
          </div>
          <h2 className="text-3xl font-bold text-ink mb-2">Unirse a Multipartideta</h2>
          <p className="text-ink-3">Ingresa el código del grupo o de una partida</p>
        </div>

        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-ink-2 mb-2">
              Código de Grupo o Partida
            </label>
            <input
              type="text"
              value={joinCode}
              onChange={(e) => {
                const value = e.target.value;
                if (value.length <= 20) {
                  setJoinCode(value);
                }
              }}
              placeholder="Código"
              maxLength={20}
              className="w-full px-4 py-3 border border-line-2 rounded-xl focus:ring-2 focus:ring-accent focus:border-transparent text-center text-2xl font-mono tracking-wider"
            />
            <p className="text-xs text-ink-3 mt-2 text-center">
              Puedes ingresar el código de un grupo o el código de una partida activa
            </p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl">
              {error}
            </div>
          )}

          <div className="flex gap-3">

            <WriteButton
              onClick={handleJoinGroup}
              disabled={loading || joinCode.length < 4}
              className="flex-1 bg-accent text-on-accent px-6 py-3 rounded-xl hover:bg-accent-hover transition-colors font-semibold shadow-card disabled:opacity-50"
            >
              {loading ? 'Uniéndose...' : 'Unirse'}
            </WriteButton>
          </div>
        </div>
      </div>
    </div>
  );
}
